#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const APP_SCRIPT_PATHS = [
  path.join(ROOT, "src", "tempo-lattice.js"),
  path.join(ROOT, "src", "audio-engine.js"),
  path.join(ROOT, "src", "wav-export.js"),
  path.join(ROOT, "src", "pitch-input.js"),
  path.join(ROOT, "src", "app.js"),
];
const TEMPO_30_BYTES = [0x1e, 0x84, 0x80];

function main() {
  const args = process.argv.slice(2);
  const strictNoteVoices = takeFlag(args, "--strict-note-voices");
  const batchCount = takeOptionInt(args, "--batch", 0);
  const smoke = takeFlag(args, "--smoke") || (args.length === 0 && batchCount === 0);

  let failed = false;
  if (smoke) {
    failed = !runSmokeTests();
    failed = !runStabilityTests() || failed;
    failed = !runVelocityTests() || failed;
    failed = !runPitchInputTests() || failed;
    failed = !runParallelRuleTests() || failed;
    failed = !runRefrainAndSuspensionTests() || failed;
    failed = !runFugueTests() || failed;
  }
  if (batchCount > 0) {
    failed = !runBatchFallbackSafety(batchCount) || failed;
  }

  for (const filePath of args) {
    failed = !validateMidiFile(filePath, { strictNoteVoices }) || failed;
  }

  if (failed) process.exit(1);
}

function takeFlag(args, flag) {
  const index = args.indexOf(flag);
  if (index === -1) return false;
  args.splice(index, 1);
  return true;
}

function takeOptionInt(args, flag, fallback) {
  const index = args.indexOf(flag);
  if (index === -1) return fallback;
  const raw = args[index + 1];
  args.splice(index, raw == null ? 1 : 2);
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function runSmokeTests() {
  const context = makeAppContext();
  const cases = [
    { name: "equal-tempo-on", outputMode: "equal", resolution: "literal", includeTempoMap: true, expectedTracks: 5, expectTempo30: true, allowBendEvents: false },
    { name: "equal-tempo-off", outputMode: "equal", resolution: "literal", includeTempoMap: false, expectedTracks: 4, expectTempo30: false, allowBendEvents: false },
    { name: "amy-dub-carriers", outputMode: "retuner", resolution: "nearest-ratio", includeTempoMap: true, expectedTracks: 5, expectTempo30: true, allowBendEvents: false },
    { name: "bend-midi", outputMode: "bend", resolution: "nearest-ratio", includeTempoMap: true, expectedTracks: 5, expectTempo30: true, allowBendEvents: true },
    { name: "dub-gravity", outputMode: "retuner", resolution: "nearest-ratio", includeTempoMap: true, dubMode: true, expectedTracks: 5, expectTempo30: true, allowBendEvents: false },
    { name: "fishtail-fugue", generationStyle: "fishtail_fugue", outputMode: "equal", resolution: "literal", includeTempoMap: true, expectedTracks: 5, expectTempo30: true, allowBendEvents: false },
  ];

  let ok = true;
  for (const test of cases) {
    const piece = buildSmokePiece(context, test);
    const result = validateMidiBytes(Buffer.from(piece.midiBytes), {
      allowBendEvents: test.allowBendEvents,
      expectedTracks: test.expectedTracks,
      expectTempo30: test.expectTempo30,
    });
    const dubReportOk = !test.dubMode || piece.report.includes("Dub checker:");
    const velocityOk = piece.events.every((event) => Number.isInteger(event.velocity) && event.velocity >= 1 && event.velocity <= 127);
    const velocityReportOk = piece.report.includes("Gravity Velocity:");
    const velocityManifestOk = piece.manifest.velocity_model?.version === "gravity_velocity_v1"
      && piece.manifest.velocity_model?.rng_isolated === true
      && Array.isArray(piece.manifest.velocity_model?.range);
    const reassuranceOk = piece.audit.issues.length + piece.audit.warnings.length === 0 || piece.report.includes("Gemma says:");
    const suspensionManifestOk = piece.manifest.suspension_control?.mode === "musical_gravity";
    const refrainManifestOk = piece.manifest.refrain && typeof piece.manifest.refrain.has_source === "boolean";
    const fallbackManifestOk = piece.manifest.fallback_safety?.mode === "validated_fallbacks_no_unchecked_parallel_perfects";
    const fugueManifestOk = test.generationStyle !== "fishtail_fugue" || (
      piece.manifest.fugue?.enabled
      && piece.manifest.fugue.formal_gravity_mode === "formal"
      && piece.report.includes("Fishtail Fugue map")
    );
    const status = result.ok && piece.audit.issues.length === 0 && dubReportOk && velocityOk && velocityReportOk && velocityManifestOk && reassuranceOk && suspensionManifestOk && refrainManifestOk && fallbackManifestOk && fugueManifestOk ? "ok" : "failed";
    console.log(`${status} ${test.name}: tracks=${result.trackCount}, notes=${result.notes}, tempos=${result.tempos}, warnings=${piece.audit.warnings.length}`);
    if (!result.ok || piece.audit.issues.length || !dubReportOk || !velocityOk || !velocityReportOk || !velocityManifestOk || !reassuranceOk || !suspensionManifestOk || !refrainManifestOk || !fallbackManifestOk || !fugueManifestOk) {
      ok = false;
      printMessages(
        result.issues,
        result.warnings,
        piece.audit.issues,
        dubReportOk ? [] : ["Dub Gravity report is missing the Dub checker note."],
        velocityOk ? [] : ["Generated note velocities are outside the valid MIDI range."],
        velocityReportOk ? [] : ["Generation report is missing the Gravity Velocity note."],
        velocityManifestOk ? [] : ["Manifest is missing Gravity Velocity metadata."],
        reassuranceOk ? [] : ["Generation report is missing Gemma reassurance after checker notes."],
        suspensionManifestOk ? [] : ["Manifest is missing suspension control metadata."],
        refrainManifestOk ? [] : ["Manifest is missing refrain metadata."],
        fallbackManifestOk ? [] : ["Manifest is missing fallback safety metadata."],
        fugueManifestOk ? [] : ["Fishtail Fugue manifest/report metadata is missing or incorrect."],
      );
    }
  }
  return ok;
}

function runStabilityTests() {
  const context = makeAppContext();
  const results = vm.runInContext(`
    (() => {
      function baseSettings(overrides = {}) {
        return {
          seed: "stability",
          voices: 4,
          tempo: 60,
          includeTempoMap: true,
          referenceNote: "A4",
          referenceMidi: 69,
          referenceHz: 432,
          referenceAnchorA4Hz: 432,
          tempoDivisor: 432,
          breathing: 0.5,
          density: 0.5,
          strangeness: 0.1,
          generationStyle: "counterpoint",
          resolution: "literal",
          outputMode: "equal",
          dubMode: false,
          pedalVoices: { bass: false, tenor: false, alto: false, soprano: false },
          rootPc: 9,
          rootNote: "A4",
          rootMidi: 69,
          rootFreq: 432,
          ...overrides,
        };
      }

      function fallbackContext(overrides = {}) {
        const settings = baseSettings({ outputMode: "equal", resolution: "literal", rootMidi: 60, ...overrides.settings });
        return {
          section: { key: "C", mode: "harmonic_minor", meter: "4/4", cadence: "authentic" },
          mode: MODES.harmonic_minor,
          meter: METERS["4/4"],
          step: 1,
          steps: 8,
          sectionIndex: 0,
          voice: "soprano",
          voiceIndex: 0,
          activeVoices: ["soprano"],
          chosen: {},
          previousPitches: { soprano: overrides.previous ?? 71 },
          lastPitches: { soprano: overrides.previous ?? 71 },
          lastLeaps: { soprano: 0 },
          lastOffsets: { soprano: overrides.lastOffset ?? 11 },
          debts: overrides.debts || {},
          strong: false,
          cadenceStage: null,
          holdStates: { soprano: makeHoldState() },
          resolvedBlocks: { soprano: null },
          settings,
          fallbackStats: makeFallbackStats(),
          suspensionStats: makeSuspensionStats(),
          rng: () => 0.5,
        };
      }

      const invalidTrack = { name: "bass", channel: 0, events: [{ tick: 0, duration: 480, midi: -9, velocity: 100, bend: 8192 }] };
      const invalidIssues = validateMidiSerializationInput({ bass: invalidTrack }, { outputMode: "bend" });
      let strictWriterThrows = false;
      try {
        makeVoiceTrack(invalidTrack, { outputMode: "bend" });
      } catch (error) {
        strictWriterThrows = /0-127/.test(error.message);
      }

      const debtContext = fallbackContext({
        debts: { soprano: { targets: [0], direction: "up", label: "leading tone rises" } },
      });
      const debtFallback = chooseFallbackVoiceEvent(debtContext, 0, false);

      const newDebtContext = fallbackContext({
        previous: 69,
        lastOffset: 11,
        debts: { soprano: null },
      });
      const newDebtFallback = chooseFallbackVoiceEvent(newDebtContext, 0, false);

      const equalEvent = makeNoteEvent(
        { midi: 69, literalPc: 9, symbolicOffset: 9, symbolicName: "A4", noteName: "A4", ratioName: "3/2" },
        "soprano",
        0,
        480,
        baseSettings({ outputMode: "equal", rootFreq: 999, rootMidi: 60 }),
      );

      const semanticGrid = [
        { midi: 60, literalPc: 0, symbolicOffset: 0, symbolicName: "C4", noteName: "C4", ratioName: "1/1" },
        { midi: 60, literalPc: 2, symbolicOffset: 2, symbolicName: "D4", noteName: "C4", ratioName: "9/8" },
      ];
      const semanticEvents = gridToEvents(
        semanticGrid,
        "soprano",
        0,
        480,
        baseSettings({ outputMode: "retuner", resolution: "nearest-ratio" }),
        { bars: 1, key: "C", mode: "major", meter: "4/4", cadence: "authentic" },
        null,
      );

      els.rootNoteInput = { value: "D" };
      els.referenceNoteInput = { value: "A4" };
      els.referenceFreqInput = { value: "432" };
      els.rootFreqInput = { value: "999" };
      els.linkRootInput = { checked: true };
      updateTuningRootReference(true);
      const linkedRootHz = Number(els.rootFreqInput.value);
      els.linkRootInput.checked = false;
      els.rootFreqInput.value = "123.45";
      updateTuningRootReference(true);
      const unlockedRootHz = Number(els.rootFreqInput.value);

      const entropyHttps = validatedEntropyUrl("https://example.com/random").protocol === "https:";
      const entropyLocal = validatedEntropyUrl("http://localhost:8787/random").hostname === "localhost";
      let entropyRejectsHttp = false;
      try {
        validatedEntropyUrl("http://example.com/random");
      } catch (error) {
        entropyRejectsHttp = /https|localhost/.test(error.message);
      }

      const visualLifecycle = (() => {
        const originalRequest = requestCoreFrame;
        let scheduled = 0;
        requestCoreFrame = () => {
          scheduled += 1;
        };
        const ctx = {
          setTransform() {},
          clearRect() {},
          fillRect() {},
          beginPath() {},
          moveTo() {},
          lineTo() {},
          stroke() {},
          ellipse() {},
          save() {},
          restore() {},
          translate() {},
          rotate() {},
          quadraticCurveTo() {},
          createRadialGradient() {
            return { addColorStop() {} };
          },
        };
        const canvas = {
          width: 0,
          height: 0,
          getContext: () => ctx,
          getBoundingClientRect: () => ({ width: 360, height: 220 }),
        };
        els.coreCanvas = canvas;
        window.devicePixelRatio = 3;
        state.pageVisible = true;
        state.visualVisible = true;
        state.reducedMotion = false;
        state.coreFrameId = null;
        state.coreFrameTimer = null;
        state.animationPhase = 0;
        state.animationVisualLevel = 0;
        torusCore.ready = false;
        drawCore(1000);
        requestCoreFrame = originalRequest;
        return {
          canvasWidth: canvas.width,
          canvasHeight: canvas.height,
          scheduled,
        };
      })();

      const disposeSummary = (() => {
        let geometryDisposed = 0;
        let materialDisposed = 0;
        let rendererDisposed = 0;
        let removed = 0;
        torusCore.scene = {
          traverse(callback) {
            callback({
              geometry: { dispose() { geometryDisposed += 1; } },
              material: [
                { dispose() { materialDisposed += 1; } },
                { dispose() { materialDisposed += 1; } },
              ],
            });
          },
        };
        torusCore.renderer = {
          domElement: { parentNode: { removeChild() { removed += 1; } } },
          dispose() { rendererDisposed += 1; },
        };
        torusCore.ready = true;
        torusCore.ratioMarkers = [{}];
        state.coreFrameId = null;
        state.coreFrameTimer = null;
        disposeTorusCore();
        return { geometryDisposed, materialDisposed, rendererDisposed, removed, ready: torusCore.ready, markers: torusCore.ratioMarkers.length };
      })();

      const adaptiveVisual = (() => {
        const now = Date.now() + 1000;
        state.visualEcoUntil = 0;
        state.visualGlitchUntil = 0;
        state.visualEcoCooldownUntil = 0;
        state.visualStressScore = 0;
        state.reducedMotion = false;
        state.animationActive = false;
        state.animationTailUntil = 0;
        state.bootGlitchUntil = 0;
        state.motionTiltX = 0;
        state.motionTiltY = 0;
        window.devicePixelRatio = 3;
        monitorVisualLoad(120, 34, now);
        monitorVisualLoad(118, 32, now + 80);
        return {
          active: visualEcoActive(now + 120),
          glitch: visualGlitchEnvelope(now + 120) > 0.1,
          delay: currentCoreFrameDelay(now + 120),
          dpr: currentVisualPixelRatio(now + 120),
        };
      })();

      const highRefreshVisual = (() => {
        const now = Date.now() + 20000;
        state.visualEcoUntil = 0;
        state.visualGlitchUntil = 0;
        state.visualEcoCooldownUntil = 0;
        state.visualHighRefreshCapable = true;
        state.reducedMotion = false;
        state.animationActive = true;
        state.animationTailUntil = 0;
        state.bootGlitchUntil = 0;
        state.motionTiltX = 0;
        state.motionTiltY = 0;
        const activeDelay = currentCoreFrameDelay(now);
        state.animationActive = false;
        const idleDelay = currentCoreFrameDelay(now);
        state.visualHighRefreshCapable = false;
        return { activeDelay, idleDelay };
      })();

      const generationRitual = (() => {
        const piece = {
          settings: baseSettings({ generationStyle: "counterpoint", dubMode: false }),
          manifest: { complexity: { level: "comfortable" } },
        };
        state.reducedMotion = false;
        state.visualEcoUntil = 0;
        state.visualStressScore = 0;
        state.visualHighRefreshCapable = false;
        const comfort = generationRitualMinimumMs(piece);
        state.visualHighRefreshCapable = true;
        const fast = generationRitualMinimumMs(piece);
        state.visualEcoUntil = Date.now() + 10000;
        const eco = generationRitualMinimumMs(piece);
        state.visualEcoUntil = 0;
        state.visualStressScore = 4;
        const stressed = generationRitualMinimumMs(piece);
        state.visualStressScore = 0;
        state.visualHighRefreshCapable = false;
        return { comfort, fast, eco, stressed };
      })();

      function countTempoMeta(bytes) {
        let count = 0;
        for (let index = 0; index < bytes.length - 2; index += 1) {
          if (bytes[index] === 0xff && bytes[index + 1] === 0x51 && bytes[index + 2] === 0x03) count += 1;
        }
        return count;
      }

      function noteSignature(piece) {
        return JSON.stringify(piece.events.map((event) => ({
          voice: event.voice,
          tick: event.tick,
          duration: event.duration,
          midi: event.midi,
          velocity: event.velocity,
        })));
      }

      const timelineAudit = (() => {
        const settings = baseSettings({
          tempoLatticeEnabled: true,
          rationalSwing: 1,
          irrationalSwing: 0.6,
          seed: "timeline-audit",
        });
        const perMeter = Object.entries(METERS).every(([meterId, meter]) => {
          const timeline = FishtailTempoLattice.buildTempoTimeline([{
            bars: 2,
            meter: meterId,
            startTick: 0,
            barTicks: meter.numerator * meter.pulse,
            numerator: meter.numerator,
            denominator: meter.denominator,
          }], settings, { ppq: PPQ, meters: METERS });
          const ticks = timeline.segments.map((segment) => segment.tick);
          return timeline.segments.length === meter.numerator * 2
            && timeline.barEndpointsPreserved
            && timeline.segments.every((segment) => segment.durationSeconds > 0 && segment.tickLength > 0 && segment.microsecondsPerQuarter >= 1 && segment.microsecondsPerQuarter <= 0xffffff)
            && ticks.every((tick, index) => index === 0 || tick > ticks[index - 1])
            && timeline.tickerEvents.length === timeline.segments.length
            && timeline.tempoEvents.every((event, index) => index === 0 || event.tick > timeline.tempoEvents[index - 1].tick);
        });
        const section = [{ bars: 2, meter: "7/8", startTick: 0, barTicks: METERS["7/8"].numerator * METERS["7/8"].pulse, numerator: 7, denominator: 8 }];
        const one = FishtailTempoLattice.buildTempoTimeline(section, settings, { ppq: PPQ, meters: METERS });
        const same = FishtailTempoLattice.buildTempoTimeline(section, settings, { ppq: PPQ, meters: METERS });
        const other = FishtailTempoLattice.buildTempoTimeline(section, { ...settings, seed: "timeline-other" }, { ppq: PPQ, meters: METERS });
        const straight = FishtailTempoLattice.buildTempoTimeline(section, { ...settings, tempoLatticeEnabled: false }, { ppq: PPQ, meters: METERS });
        return {
          perMeter,
          deterministic: JSON.stringify(one.segments.map((segment) => segment.durationWeight)) === JSON.stringify(same.segments.map((segment) => segment.durationWeight)),
          seedChanges: JSON.stringify(one.segments.map((segment) => segment.durationWeight)) !== JSON.stringify(other.segments.map((segment) => segment.durationWeight)),
          straight: straight.tempoEvents.length === 1 && straight.segments.every((segment) => segment.microsecondsPerQuarter === straight.baseMicrosecondsPerQuarter),
        };
      })();

      const latticeMidiAudit = (() => {
        const base = baseSettings({
          seed: "lattice-note-stability",
          includeTempoMap: true,
          tempoLatticeEnabled: false,
          sections: structuredClone(DEFAULT_SECTIONS),
        });
        const lattice = {
          ...base,
          tempoLatticeEnabled: true,
          rationalSwing: 0.8,
          irrationalSwing: 0.25,
        };
        const straightPiece = buildPiece({ ...base, sections: structuredClone(DEFAULT_SECTIONS) }, makeRng(base.seed));
        const latticePiece = buildPiece({ ...lattice, sections: structuredClone(DEFAULT_SECTIONS) }, makeRng(lattice.seed));
        return {
          noteStable: noteSignature(straightPiece) === noteSignature(latticePiece),
          straightTempos: countTempoMeta(straightPiece.midiBytes),
          latticeTempos: countTempoMeta(latticePiece.midiBytes),
          manifestOk: latticePiece.manifest.tempo_lattice.enabled
            && latticePiece.manifest.tempo_lattice.tempo_event_count === latticePiece.tempoTimeline.tempoEvents.length
            && latticePiece.report.includes("Tempo lattice: on"),
        };
      })();

      const teardropAudit = (() => {
        const table = FishtailTempoLattice.buildTeardropVoiceTable(216, 12);
        const centre = table.find((voice) => Math.abs(voice.frequencyFactor - 1) < 1e-12);
        const symmetric = table.every((voice, index) => {
          const opposite = table[table.length - 1 - index];
          return Math.abs(voice.weight - opposite.weight) < 1e-9
            && Math.abs((voice.frequencyFactor * opposite.frequencyFactor) - 1) < 1e-9;
        });
        const weightSum = table.reduce((sum, voice) => sum + voice.weight, 0);
        return {
          count: table.length,
          centre: Boolean(centre),
          finite: table.every((voice) => Number.isFinite(voice.frequency) && voice.frequency > 0 && Number.isFinite(voice.weight) && voice.weight >= 0),
          symmetric,
          normalized: Math.abs(weightSum - 1) < 1e-9,
          lowpass: FishtailTempoLattice.teardropLowpassHz(216) === 2592,
        };
      })();

      const wavAudit = (() => {
        const wav = FishtailWavExport.encodePcm24Mono(new Float32Array([0, 1, -1, 2, -2, NaN]), 48000);
        const text = (start, end) => String.fromCharCode(...wav.slice(start, end));
        const dataBytes = wav[40] | (wav[41] << 8) | (wav[42] << 16) | (wav[43] << 24);
        const tickerSamples = new Float32Array([0, 0.1, -0.25, 0.05]);
        const normalization = FishtailWavExport.normalizePeak(tickerSamples, -6);
        const normalizedPeak = FishtailWavExport.peakAbs(tickerSamples);
        const targetPeak = FishtailWavExport.dbfsToGain(-6);
        const cvZip = FishtailWavExport.makeZip([{ name: "hello.txt", data: new Uint8Array([65, 66]) }]);
        const cvTimeline = {
          totalSeconds: 2,
          segments: [
            { tick: 0, tickLength: 480, durationSeconds: 1 },
            { tick: 480, tickLength: 480, durationSeconds: 1 },
          ],
          tickerEvents: [{ timeSeconds: 0 }, { timeSeconds: 1 }],
        };
        const cvPiece = {
          settings: { outputMode: "equal" },
          events: [
            { voice: "bass", tick: 0, duration: 480, midi: 60, tunedFrequency: 261.6256 },
            { voice: "bass", tick: 480, duration: 480, midi: 72, tunedFrequency: 523.2511 },
          ],
        };
        const cvVoice = FishtailWavExport.renderCvVoiceSamples(cvPiece, "bass", cvTimeline, { sampleRate: 10, frames: 20 });
        const cvPlan = FishtailWavExport.chooseCvRenderPlan(2, 3);
        return {
          riff: text(0, 4) === "RIFF",
          wave: text(8, 12) === "WAVE",
          pcm: wav[20] === 1 && wav[21] === 0,
          mono: wav[22] === 1 && wav[23] === 0,
          rate: (wav[24] | (wav[25] << 8) | (wav[26] << 16) | (wav[27] << 24)) === 48000,
          bits: wav[34] === 24 && wav[35] === 0,
          dataLength: dataBytes === 18 && wav.length === 62,
          tickerNormalizes: Math.abs(normalizedPeak - targetPeak) < 1e-6
            && normalization.targetDbfs === -6
            && Math.abs(normalization.afterDbfs + 6) < 0.0001,
          cvZip: cvZip[0] === 0x50 && cvZip[1] === 0x4b && cvZip[2] === 0x03 && cvZip[3] === 0x04,
          cvMath: Math.abs(FishtailWavExport.eventCvVolts({ midi: 72 }, { outputMode: "equal" }) - 1) < 1e-9
            && Math.abs(FishtailWavExport.eventCvVolts({ tunedFrequency: 864 }, { outputMode: "bend", rootMidi: 69, rootFreq: 432 }) - 1.75) < 1e-9
            && Math.abs(FishtailWavExport.eventCvSample({ midi: 72 }, { outputMode: "equal" }) - 0.2) < 1e-9,
          cvVoice: cvVoice.pitch[0] === 0
            && Math.abs(cvVoice.pitch[10] - 0.2) < 1e-6
            && cvVoice.gate[0] === 1
            && cvVoice.gate[19] === 1
            && cvVoice.eventCount === 2,
          cvPlan: cvPlan.sampleRate === 48000 && cvPlan.stemCount === 3 && cvPlan.estimate.wavBytes === 288044,
        };
      })();

      return [
        {
          name: "explicit voice layouts include bass",
          ok: JSON.stringify(activeVoiceLayout(2)) === JSON.stringify(["bass", "soprano"])
            && JSON.stringify(activeVoiceLayout(3)) === JSON.stringify(["bass", "alto", "soprano"])
            && JSON.stringify(activeVoiceLayout(4)) === JSON.stringify(["bass", "tenor", "alto", "soprano"])
            && normalizePedalVoices({ bass: true, alto: true, soprano: true }, 2, true).bass === true,
        },
        {
          name: "strict MIDI serialization rejects invalid note",
          ok: invalidIssues.some((issue) => issue.includes("invalid MIDI note -9")) && strictWriterThrows,
        },
        {
          name: "fallback clears resolved tendency debt",
          ok: debtFallback.resolvedDebt === true && debtContext.debts.soprano === null,
        },
        {
          name: "fallback records new tendency debt",
          ok: newDebtFallback.symbolicOffset === 11 && newDebtContext.debts.soprano?.targets?.includes(0),
        },
        {
          name: "equal mode frequency metadata is exported ET",
          ok: Math.abs(equalEvent.tunedFrequency - midiFrequency(equalEvent.midi)) < 0.0001
            && Math.abs(equalEvent.conceptualRatioFrequency - equalEvent.tunedFrequency) > 0.1,
        },
        {
          name: "semantic carrier changes rearticulate",
          ok: semanticEvents.length === 2 && semanticEvents[0].symbolicOffset !== semanticEvents[1].symbolicOffset,
        },
        {
          name: "tuning root link follows reference and can unlock",
          ok: Math.abs(linkedRootHz - defaultRootHzForReference(62, 69, 432)) < 0.01
            && Math.abs(unlockedRootHz - 123.45) < 0.001,
        },
        {
          name: "entropy endpoint URL policy",
          ok: entropyHttps && entropyLocal && entropyRejectsHttp,
        },
        {
          name: "visual lifecycle caps canvas DPR",
          ok: visualLifecycle.canvasWidth === 720 && visualLifecycle.canvasHeight === 440 && visualLifecycle.scheduled === 1,
        },
        {
          name: "visual lifecycle disposes WebGL resources",
          ok: disposeSummary.geometryDisposed === 1
            && disposeSummary.materialDisposed === 2
            && disposeSummary.rendererDisposed === 1
            && disposeSummary.removed === 1
            && disposeSummary.ready === false
            && disposeSummary.markers === 0,
        },
        {
          name: "visual adaptive eco glitch lowers render load",
          ok: adaptiveVisual.active
            && adaptiveVisual.glitch
            && adaptiveVisual.delay === CORE_ECO_IDLE_FRAME_MS
            && adaptiveVisual.dpr === 1,
        },
        {
          name: "visual high refresh display can use native active frames",
          ok: highRefreshVisual.activeDelay === 0
            && highRefreshVisual.idleDelay === CORE_HIGH_REFRESH_IDLE_FRAME_MS,
        },
        {
          name: "generation ritual rewards fast machines and spares stressed ones",
          ok: generationRitual.comfort >= GENERATE_RITUAL_COMFORT_MS
            && generationRitual.fast >= GENERATE_RITUAL_FAST_MS
            && generationRitual.fast > generationRitual.comfort
            && generationRitual.eco === GENERATE_MIN_MS
            && generationRitual.stressed === GENERATE_MIN_MS,
        },
        {
          name: "tempo lattice is meter-safe deterministic and straight-safe",
          ok: timelineAudit.perMeter && timelineAudit.deterministic && timelineAudit.seedChanges && timelineAudit.straight,
        },
        {
          name: "tempo lattice conductor does not move note events",
          ok: latticeMidiAudit.noteStable
            && latticeMidiAudit.straightTempos === 1
            && latticeMidiAudit.latticeTempos > 1
            && latticeMidiAudit.manifestOk,
        },
        {
          name: "teardrop voice table preserves centre and symmetry",
          ok: teardropAudit.count <= 12
            && teardropAudit.count === 11
            && teardropAudit.centre
            && teardropAudit.finite
            && teardropAudit.symmetric
            && teardropAudit.normalized
            && teardropAudit.lowpass,
        },
        {
          name: "wav encoder writes mono 24-bit pcm headers",
          ok: wavAudit.riff && wavAudit.wave && wavAudit.pcm && wavAudit.mono && wavAudit.rate && wavAudit.bits && wavAudit.dataLength,
        },
        {
          name: "ticker wav normalizer targets -6 dBFS",
          ok: wavAudit.tickerNormalizes
            && FishtailWavExport.TICKER_NORMALIZE_DBFS === -6
            && FishtailAudioEngine.METRONOME_MAX_GAIN >= 3.4,
        },
        {
          name: "analogue cv zip uses 1v octave pitch and gates",
          ok: wavAudit.cvZip
            && wavAudit.cvMath
            && wavAudit.cvVoice
            && wavAudit.cvPlan
            && FishtailWavExport.CV_FULL_SCALE_VOLTS === 5,
        },
        {
          name: "audio runtime is silent at load",
          ok: state.audioContext === null
            && state.audio.context === null
            && state.audio.probe === null
            && state.audio.metronome === null,
        },
      ];
    })()
  `, context);

  let ok = true;
  for (const result of results) {
    const status = result.ok ? "ok" : "failed";
    console.log(`${status} stability ${result.name}`);
    if (!result.ok) ok = false;
  }
  return ok;
}

function runVelocityTests() {
  const context = makeAppContext();
  const results = vm.runInContext(`
    (() => {
      function velocitySettings(profile = "auto", seed = "velocity-test") {
        return {
          seed,
          voices: 4,
          tempo: 60,
          includeTempoMap: true,
          referenceNote: "A4",
          referenceMidi: 69,
          referenceHz: 432,
          referenceAnchorA4Hz: 432,
          tempoDivisor: 432,
          breathing: 0.5,
          density: 0.45,
          strangeness: 0.12,
          generationStyle: "counterpoint",
          resolution: "literal",
          outputMode: "equal",
          velocityProfile: profile,
          dubMode: false,
          pedalVoices: { bass: false, tenor: false, alto: false, soprano: false },
          rootPc: 9,
          rootNote: "A4",
          rootMidi: 69,
          rootFreq: 432,
          sections: structuredClone(DEFAULT_SECTIONS),
        };
      }

      function build(profile = "auto", seed = "velocity-test") {
        const settings = velocitySettings(profile, seed);
        return buildPiece(settings, makeRng(settings.seed));
      }

      function nonVelocitySignature(piece) {
        return JSON.stringify(piece.events.map((event) => ({
          tick: event.tick,
          duration: event.duration,
          voice: event.voice,
          midi: event.midi,
          carrierMidi: event.carrierMidi,
          symbolicOffset: event.symbolicOffset,
          grooveRole: event.grooveRole,
          grooveOffsetTicks: event.grooveOffsetTicks,
        })));
      }

      function maxAdjacentVelocityJump(piece) {
        let max = 0;
        for (const voice of activeVoiceLayout(piece.settings.voices)) {
          const events = piece.events.filter((event) => event.voice === voice).sort((a, b) => a.tick - b.tick);
          for (let i = 1; i < events.length; i += 1) {
            max = Math.max(max, Math.abs(events[i].velocity - events[i - 1].velocity));
          }
        }
        return max;
      }

      function syntheticTracks(eventsByVoice) {
        return Object.fromEntries(Object.entries(eventsByVoice).map(([voice, events]) => [voice, {
          name: voice,
          channel: 0,
          events: events.map((event) => ({
            duration: 480,
            carrierMidi: event.midi,
            symbolic: "test",
            resolved: "test",
            ratioName: "1/1",
            tunedFrequency: 440,
            conceptualRatioFrequency: 440,
            exportedMidiFrequency: 440,
            grooveOffsetTicks: 0,
            grooveRole: null,
            phraseRole: "field",
            velocity: 100,
            bend: null,
            ...event,
          })),
        }]));
      }

      const gravity = build("auto", "velocity-repeatable");
      const repeat = build("auto", "velocity-repeatable");
      const flat = build("flat", "velocity-repeatable");

      const sectionMeta = [{ ...DEFAULT_SECTIONS[0], bars: 2, meter: "4/4", startTick: 0, barTicks: 1920, numerator: 4, denominator: 4 }];
      const registerTracks = syntheticTracks({
        bass: [{ tick: 0, gridTick: 0, startStep: 0, midi: 36, symbolicOffset: 0, phraseRole: "lead" }],
        soprano: [{ tick: 0, gridTick: 0, startStep: 0, midi: 84, symbolicOffset: 0, phraseRole: "lead" }],
      });
      applyGravityVelocity(registerTracks, sectionMeta, velocitySettings("auto", "velocity-register"));
      const lowVelocity = registerTracks.bass.events[0].velocity;
      const highVelocity = registerTracks.soprano.events[0].velocity;

      const accentTracks = syntheticTracks({
        soprano: [
          { tick: 0, gridTick: 0, startStep: 0, midi: 72, symbolicOffset: 0, phraseRole: "lead" },
          { tick: 480, gridTick: 480, startStep: 1, midi: 72, symbolicOffset: 2, phraseRole: "field" },
          { tick: 3360, gridTick: 3360, startStep: 7, midi: 72, symbolicOffset: 0, phraseRole: "lead" },
        ],
      });
      applyGravityVelocity(accentTracks, sectionMeta, velocitySettings("auto", "velocity-accent"));
      const downbeatVelocity = accentTracks.soprano.events[0].velocity;
      const weakVelocity = accentTracks.soprano.events[1].velocity;
      const cadenceVelocity = accentTracks.soprano.events[2].velocity;

      return [
        {
          name: "model metadata and valid range",
          ok: gravity.manifest.velocity_model.version === "gravity_velocity_v1"
            && gravity.manifest.velocity_model.profile === "calm"
            && gravity.events.every((event) => Number.isInteger(event.velocity) && event.velocity >= 1 && event.velocity <= 127),
        },
        {
          name: "fixed velocity switch exports 100",
          ok: flat.manifest.velocity_model.profile === "flat"
            && flat.events.every((event) => event.velocity === 100)
            && flat.report.includes("fixed at 100"),
        },
        {
          name: "velocity is repeatable",
          ok: JSON.stringify(gravity.events.map((event) => event.velocity)) === JSON.stringify(repeat.events.map((event) => event.velocity)),
        },
        {
          name: "velocity setting does not change notes",
          ok: nonVelocitySignature(gravity) === nonVelocitySignature(flat),
        },
        {
          name: "higher register is slightly softer",
          ok: lowVelocity > highVelocity && lowVelocity - highVelocity <= 12,
        },
        {
          name: "meter and cadence shape gently",
          ok: downbeatVelocity > weakVelocity && cadenceVelocity >= downbeatVelocity,
        },
        {
          name: "adjacent velocity jumps are bounded",
          ok: maxAdjacentVelocityJump(gravity) <= 16,
        },
      ];
    })()
  `, context);

  let ok = true;
  for (const result of results) {
    const status = result.ok ? "ok" : "failed";
    console.log(`${status} velocity ${result.name}`);
    if (!result.ok) ok = false;
  }
  return ok;
}

function runPitchInputTests() {
  const context = makeAppContext();
  const pitch = context.FishtailPitchInput;
  const sampleRate = 48000;
  const frameLength = 8192;
  const scratch = pitch.makeScratch();

  function centsError(actual, expected) {
    return Math.abs(1200 * Math.log2(actual / expected));
  }

  function frameFor(freq, options = {}) {
    const frame = new Float32Array(frameLength);
    const amp = options.amp ?? 0.55;
    const harmonics = options.harmonics || [[1, 1]];
    const vibratoCents = options.vibratoCents || 0;
    const vibratoHz = options.vibratoHz || 5;
    const attackFrames = options.attackFrames || 0;
    const dc = options.dc || 0;
    for (let i = 0; i < frame.length; i += 1) {
      const t = i / sampleRate;
      const cents = vibratoCents ? Math.sin(2 * Math.PI * vibratoHz * t) * vibratoCents : 0;
      const instant = freq * (2 ** (cents / 1200));
      const env = attackFrames ? Math.min(1, i / attackFrames) : 1;
      let sample = 0;
      harmonics.forEach(([multiple, weight]) => {
        sample += Math.sin(2 * Math.PI * instant * multiple * t) * weight;
      });
      frame[i] = sample * amp * env + dc;
    }
    return frame;
  }

  function noiseFrame() {
    const frame = new Float32Array(frameLength);
    let seed = 2166136261;
    for (let i = 0; i < frame.length; i += 1) {
      seed ^= i + 17;
      seed = Math.imul(seed, 16777619);
      frame[i] = (((seed >>> 0) / 0xffffffff) * 2 - 1) * 0.2;
    }
    return frame;
  }

  const toneCases = [
    ["30 Hz", 30, "bass"],
    ["40 Hz", 40, "general"],
    ["55 Hz", 55, "voice"],
    ["110 Hz", 110, "voice"],
    ["216 Hz", 216, "general"],
    ["432 Hz", 432, "general"],
    ["880 Hz", 880, "high"],
    ["1500 Hz", 1500, "high"],
    ["2000 Hz", 2000, "high"],
  ];
  const results = toneCases.map(([name, freq, range]) => {
    const result = pitch.detectPitch(frameFor(freq), sampleRate, { range }, scratch);
    return {
      name: `detects ${name}`,
      ok: result.ok && centsError(result.frequency, freq) < (freq <= 40 ? 28 : 14),
    };
  });

  const harmonic = pitch.detectPitch(frameFor(216, {
    harmonics: [[1, 0.35], [2, 1], [3, 0.75], [4, 0.4]],
  }), sampleRate, { range: "general" }, scratch);
  results.push({
    name: "detects fundamental below stronger harmonics",
    ok: harmonic.ok && centsError(harmonic.frequency, 216) < 18,
  });

  const quietLine = pitch.detectPitch(frameFor(216, { amp: 0.002 }), sampleRate, { range: "general" }, scratch);
  results.push({ name: "detects quiet line-level tone", ok: quietLine.ok && centsError(quietLine.frequency, 216) < 18 });

  const tooQuiet = pitch.detectPitch(frameFor(216, { amp: 0.00025 }), sampleRate, { range: "general" }, scratch);
  results.push({ name: "rejects near-silence tone", ok: !tooQuiet.ok && tooQuiet.reason === "too-quiet" });

  const noise = pitch.detectPitch(noiseFrame(), sampleRate, { range: "general" }, scratch);
  results.push({ name: "rejects noise as stable pitch", ok: !noise.ok || noise.confidence < 0.8 });

  const silence = pitch.detectPitch(new Float32Array(frameLength), sampleRate, { range: "general" }, scratch);
  results.push({ name: "rejects silence", ok: !silence.ok && silence.reason === "too-quiet" });

  const dcOffset = pitch.detectPitch(frameFor(432, { dc: 0.2 }), sampleRate, { range: "general" }, scratch);
  results.push({ name: "removes DC offset", ok: dcOffset.ok && centsError(dcOffset.frequency, 432) < 14 });

  const now = 100000;
  const history = [];
  for (let i = 0; i < 9; i += 1) {
    const cents = Math.sin(i * Math.PI / 4) * 18;
    history.push({
      at: now - (8 - i) * 80,
      ok: true,
      frequency: 216 * (2 ** (cents / 1200)),
      confidence: 0.94,
    });
  }
  const stats = pitch.pitchStats(history, now);
  results.push({
    name: "captures vibrato centre in log frequency",
    ok: stats.ok && centsError(stats.frequency, 216) < 2.5 && stats.spreadCents > 4,
  });

  const ref216 = pitch.hzToReference(216, 432);
  const ref220 = pitch.hzToReference(220, 432);
  results.push({
    name: "maps 216 Hz to A3 at A4 432",
    ok: ref216.referenceNote === "A3" && Math.abs(ref216.impliedA4Hz - 432) < 0.0001,
  });
  results.push({
    name: "maps 220 Hz to exact A3 under A4 440",
    ok: ref220.referenceNote === "A3" && Math.abs(ref220.impliedA4Hz - 440) < 0.0001,
  });

  let ok = true;
  for (const result of results) {
    const status = result.ok ? "ok" : "failed";
    console.log(`${status} pitch-input ${result.name}`);
    if (!result.ok) ok = false;
  }
  return ok;
}

function runBatchFallbackSafety(count) {
  const context = makeAppContext();
  const profiles = [
    { name: "counterpoint", generationStyle: "counterpoint", outputMode: "equal", resolution: "literal", dubMode: false },
    { name: "invention", generationStyle: "invention", outputMode: "equal", resolution: "literal", dubMode: false },
    { name: "fugue", generationStyle: "fishtail_fugue", outputMode: "equal", resolution: "literal", dubMode: false },
    { name: "dub-fugue", generationStyle: "fishtail_fugue", outputMode: "retuner", resolution: "nearest-ratio", dubMode: true },
  ];
  const totals = Object.fromEntries(profiles.map((profile) => [profile.name, makeBatchTotals()]));
  let ok = true;

  for (let index = 0; index < count; index += 1) {
    const profile = profiles[index % profiles.length];
    const piece = buildBatchPiece(context, profile, index);
    const result = validateMidiBytes(Buffer.from(piece.midiBytes), {
      allowBendEvents: profile.outputMode === "bend",
      expectedTracks: 5,
      expectTempo30: true,
    });
    const fallback = piece.manifest.fallback_safety || {};
    const total = totals[profile.name];
    total.pieces += 1;
    total.notes += piece.events.length;
    total.warnings += piece.audit.warnings.length;
    total.parallelWarnings += piece.audit.summary.parallelPerfects || 0;
    total.validated += fallback.validated || 0;
    total.relationOnly += fallback.relationOnly || 0;
    total.verticalRelaxed += fallback.verticalRelaxed || 0;
    total.spacingRelaxed += fallback.spacingRelaxed || 0;
    total.noParallelOnly += fallback.noParallelOnly || 0;
    total.emergencyRests += fallback.emergencyRests || 0;
    total.parallelBlocked += fallback.parallelBlocked || 0;

    const pieceOk = result.ok && piece.audit.issues.length === 0 && fallback.mode === "validated_fallbacks_no_unchecked_parallel_perfects";
    if (!pieceOk) {
      ok = false;
      total.failed = true;
      printMessages([
        `Batch ${profile.name} seed ${index} failed structural validation.`,
        ...result.issues,
        ...piece.audit.issues,
      ]);
    }
  }

  let nonDubNotes = 0;
  let nonDubNoParallelOnly = 0;
  let nonDubEmergencyRests = 0;
  let nonDubCheckerParallels = 0;
  for (const profile of profiles.filter((item) => !item.dubMode)) {
    const total = totals[profile.name];
    nonDubNotes += total.notes;
    nonDubNoParallelOnly += total.noParallelOnly;
    nonDubEmergencyRests += total.emergencyRests;
    nonDubCheckerParallels += total.parallelWarnings;
  }
  const noParallelLimit = Math.max(3, Math.ceil(nonDubNotes * 0.0025));
  let nonDubThresholdFailed = false;
  if (nonDubEmergencyRests > 0 || nonDubNoParallelOnly > noParallelLimit || nonDubCheckerParallels > 0) {
    ok = false;
    nonDubThresholdFailed = true;
    printMessages([
      `Non-DUB fallback safety exceeded threshold: noParallelOnly=${nonDubNoParallelOnly}/${noParallelLimit}, emergencyRests=${nonDubEmergencyRests}, checkerParallels=${nonDubCheckerParallels}.`,
    ]);
  }

  Object.entries(totals).forEach(([name, total]) => {
    const profile = profiles.find((item) => item.name === name);
    const status = total.failed || (nonDubThresholdFailed && !profile.dubMode) ? "review" : "ok";
    console.log(`${status} batch ${name}: pieces=${total.pieces}, notes=${total.notes}, fallback validated=${total.validated}, relation=${total.relationOnly}, vertical=${total.verticalRelaxed}, spacing=${total.spacingRelaxed}, noParallel=${total.noParallelOnly}, rests=${total.emergencyRests}, blocked=${total.parallelBlocked}, checkerParallels=${total.parallelWarnings}`);
  });
  return ok;
}

function makeBatchTotals() {
  return {
    pieces: 0,
    failed: false,
    notes: 0,
    warnings: 0,
    parallelWarnings: 0,
    validated: 0,
    relationOnly: 0,
    verticalRelaxed: 0,
    spacingRelaxed: 0,
    noParallelOnly: 0,
    emergencyRests: 0,
    parallelBlocked: 0,
  };
}

function runParallelRuleTests() {
  const context = makeAppContext();
  const results = vm.runInContext(`
    (() => {
      const activeVoices = ["bass", "soprano"];
      const sectionMeta = [{ key: "C", mode: "major", bars: 1, startTick: 0, barTicks: 480, numerator: 1, denominator: 4 }];
      const settings = { tempo: 60 };

      function candidateResult({ previousLower, previousUpper, currentLower, currentUpper, strong, dubMode = false, rngValue = 0.99 }) {
        return validateCandidate(
          { midi: currentUpper, symbolicOffset: mod(currentUpper, 12) },
          {
            chosen: { bass: { midi: currentLower } },
            voiceIndex: 1,
            activeVoices,
            lastPitches: { bass: previousLower, soprano: previousUpper },
            lastLeaps: { bass: 0, soprano: 0 },
            debts: {},
            voice: "soprano",
            strong,
            cadenceStage: null,
            settings: { dubMode, strangeness: 0 },
            rng: () => rngValue,
          },
        );
      }

      function checkerWarnings({ previousLower, previousUpper, currentLower, currentUpper, strong }) {
        const summary = { parallelPerfects: 0 };
        const warnings = [];
        checkParallelSnapshot(
          [{ midi: previousLower }, { midi: previousUpper }],
          [{ midi: currentLower }, { midi: currentUpper }],
          activeVoices,
          0,
          480,
          strong,
          sectionMeta,
          settings,
          summary,
          (message) => warnings.push(message),
        );
        return { summary, warnings };
      }

      function fallbackResult({ previousLower, previousUpper, currentLower, temptingOffset, expectedTemptingMidi, dubMode = false, rngValue = 0.99 }) {
        const context = {
          section: { key: "C", mode: "major", meter: "4/4", cadence: "authentic" },
          mode: MODES.major,
          meter: METERS["4/4"],
          step: 1,
          voice: "tenor",
          voiceIndex: 1,
          activeVoices: ["bass", "tenor"],
          chosen: { bass: { midi: currentLower } },
          lastPitches: { bass: previousLower, tenor: previousUpper },
          lastLeaps: { bass: 0, tenor: 0 },
          lastOffsets: { tenor: temptingOffset },
          debts: {},
          strong: false,
          cadenceStage: null,
          settings: {
            dubMode,
            strangeness: 0,
            resolution: "literal",
            outputMode: "equal",
            rootMidi: 60,
          },
          fallbackStats: makeFallbackStats(),
          rng: () => rngValue,
        };
        const fallback = chooseFallbackVoiceEvent(context, 0, false);
        const forbidden = fallback.rest ? null : parallelPerfectAgainstChosen(fallback, context, { allowDubBend: false });
        return {
          fallback,
          stats: context.fallbackStats,
          forbidden,
          avoidedTemptingMidi: fallback.midi !== expectedTemptingMidi,
        };
      }

      const cases = [
        {
          name: "parallel fifth",
          args: { previousLower: 48, previousUpper: 55, currentLower: 50, currentUpper: 57, strong: false },
          expectViolation: true,
          expectedType: "parallel-perfect",
        },
        {
          name: "parallel octave",
          args: { previousLower: 48, previousUpper: 60, currentLower: 50, currentUpper: 62, strong: false },
          expectViolation: true,
          expectedType: "parallel-perfect",
        },
        {
          name: "direct strong perfect",
          args: { previousLower: 48, previousUpper: 52, currentLower: 50, currentUpper: 57, strong: true },
          expectViolation: true,
          expectedType: "direct-perfect",
        },
        {
          name: "dub allows a rare parallel fifth",
          args: { previousLower: 48, previousUpper: 55, currentLower: 50, currentUpper: 57, strong: false, dubMode: true, rngValue: 0 },
          expectViolation: true,
          expectCandidateReject: false,
          expectedType: "parallel-perfect",
        },
        {
          name: "contrary motion into fifth",
          args: { previousLower: 48, previousUpper: 59, currentLower: 50, currentUpper: 57, strong: true },
          expectViolation: false,
          expectedType: null,
        },
      ];

      const candidateResults = cases.map((test) => {
        const classified = classifyParallelPerfectMotion(test.args);
        const candidate = candidateResult(test.args);
        const checked = checkerWarnings(test.args);
        return {
          name: test.name,
          expectedType: test.expectedType,
          classifierType: classified?.type || null,
          candidateRejected: candidate.ok === false && Boolean(candidate.parallelReject),
          checkerWarned: checked.summary.parallelPerfects > 0 && checked.warnings.length > 0,
          expectViolation: test.expectViolation,
          expectCandidateReject: test.expectCandidateReject ?? test.expectViolation,
          warnings: checked.warnings,
        };
      });

      const fallbackFifth = fallbackResult({
        previousLower: 48,
        previousUpper: 55,
        currentLower: 50,
        temptingOffset: 9,
        expectedTemptingMidi: 57,
      });
      const fallbackOctave = fallbackResult({
        previousLower: 48,
        previousUpper: 60,
        currentLower: 50,
        temptingOffset: 2,
        expectedTemptingMidi: 62,
      });
      const dubFallback = fallbackResult({
        previousLower: 48,
        previousUpper: 55,
        currentLower: 50,
        temptingOffset: 9,
        expectedTemptingMidi: 57,
        dubMode: true,
        rngValue: 0,
      });

      return [
        ...candidateResults,
        {
          kind: "fallback",
          name: "fallback avoids parallel fifth",
          ok: fallbackFifth.avoidedTemptingMidi
            && !fallbackFifth.forbidden?.blocked
            && fallbackFifth.fallback.parallelRejects >= 1
            && fallbackFifth.stats.validated >= 1,
          details: fallbackFifth,
        },
        {
          kind: "fallback",
          name: "fallback avoids parallel octave",
          ok: fallbackOctave.avoidedTemptingMidi
            && !fallbackOctave.forbidden?.blocked
            && fallbackOctave.fallback.parallelRejects >= 1
            && fallbackOctave.stats.validated >= 1,
          details: fallbackOctave,
        },
        {
          kind: "fallback",
          name: "dub fallback can still allow rare bend",
          ok: dubFallback.fallback.midi === 57
            && dubFallback.stats.validated >= 1,
          details: dubFallback,
        },
      ];
    })()
  `, context);

  let ok = true;
  for (const result of results) {
    if (result.kind === "fallback") {
      const status = result.ok ? "ok" : "failed";
      console.log(`${status} parallel-rule ${result.name}`);
      if (!result.ok) {
        ok = false;
        printMessages([`Fallback details: ${JSON.stringify(result.details)}`]);
      }
      continue;
    }
    const classifierOk = result.classifierType === result.expectedType;
    const candidateOk = result.candidateRejected === result.expectCandidateReject;
    const checkerOk = result.checkerWarned === result.expectViolation;
    const status = classifierOk && candidateOk && checkerOk ? "ok" : "failed";
    console.log(`${status} parallel-rule ${result.name}: classifier=${result.classifierType || "none"}, candidateRejected=${result.candidateRejected}, checkerWarned=${result.checkerWarned}`);
    if (status !== "ok") {
      ok = false;
      printMessages([
        `Expected classifier ${result.expectedType || "none"}, candidateRejected ${result.expectCandidateReject}, checkerWarned ${result.expectViolation}.`,
        ...result.warnings,
      ]);
    }
  }
  return ok;
}

function runRefrainAndSuspensionTests() {
  const context = makeAppContext();
  const results = vm.runInContext(`
    (() => {
      function buildFeaturePiece() {
        const settings = {
          seed: "validation-refrain-features",
          voices: 4,
          tempo: 30,
          includeTempoMap: true,
          referenceNote: "A4",
          referenceMidi: 69,
          referenceHz: 432,
          referenceAnchorA4Hz: 432,
          tempoDivisor: 864,
          breathing: 0.74,
          density: 0.26,
          strangeness: 0.16,
          generationStyle: "counterpoint",
          resolution: "literal",
          outputMode: "equal",
          dubMode: true,
          pedalVoices: { bass: true, tenor: false, alto: false, soprano: false },
          rootPc: 9,
          rootNote: "A4",
          rootMidi: 69,
          rootFreq: 432,
          sections: [
            { bars: 2, key: "C", mode: "major", meter: "4/4", cadence: "authentic", role: "normal", treatment: "straight" },
            { bars: 2, key: "G", mode: "mixolydian", meter: "4/4", cadence: "dub_suspension", role: "refrain", treatment: "dubby" },
            { bars: 2, key: "A", mode: "gravity_melodic_minor", meter: "3/4", cadence: "minor_authentic", role: "development", treatment: "gentle" },
            { bars: 2, key: "F", mode: "mixolydian", meter: "3/4", cadence: "plagal", role: "development", treatment: "dubby" },
          ],
        };
        return buildPiece(settings, makeRng(settings.seed));
      }

      function suspensionSummary({ voice = "soprano", midi = 72, durationSteps = 16, pedal = false, split = null }) {
        const section = { bars: 4, key: "C", mode: "major", meter: "4/4", cadence: "authentic", startTick: 0, barTicks: 1920, numerator: 4, denominator: 4 };
        const settings = { tempo: 60, voices: 4, pedalVoices: { bass: pedal, tenor: false, alto: false, soprano: false } };
        const byVoice = { bass: [], tenor: [], alto: [], soprano: [] };
        if (split) {
          byVoice[voice] = split.map((event) => ({ ...event, voice }));
        } else {
          byVoice[voice] = [{ tick: 0, duration: durationSteps * 480, midi, carrierMidi: midi, voice }];
        }
        const summary = { suspensionChecks: 0, suspensionsDetected: 0, suspensionsResolved: 0, overlongSuspensions: 0, pedalHolds: 0 };
        const warnings = [];
        auditSuspensionTimeline(settings, [section], byVoice, [voice], summary, (message) => warnings.push(message));
        return { summary, warnings };
      }

      const piece = buildFeaturePiece();
      const phrasePlans = piece.manifest.sections.map((section) => section.phrasePlan);
      const directMemory = (() => {
        const memory = makeDubBassMemory();
        const section = { bars: 4, key: "G", mode: "mixolydian", meter: "4/4", cadence: "dub_suspension" };
        const first = makeDubBassMemoryCell(section, 0, METERS["4/4"], modePersonality("mixolydian"), () => 0.9, memory);
        const second = makeDubBassMemoryCell(section, 1, METERS["4/4"], modePersonality("mixolydian"), () => 0, memory);
        return { first, second, memory };
      })();
      const overlongSoprano = suspensionSummary({ voice: "soprano", midi: 72 });
      const bassPedal = suspensionSummary({ voice: "bass", midi: 48, pedal: true });
      const bassBadPedal = suspensionSummary({ voice: "bass", midi: 50, pedal: true });
      const resolved = suspensionSummary({
        voice: "soprano",
        split: [
          { tick: 0, duration: 12 * 480, midi: 72, carrierMidi: 72 },
          { tick: 12 * 480, duration: 4 * 480, midi: 74, carrierMidi: 74 },
        ],
      });

      return [
        {
          name: "refrain metadata",
          ok: piece.manifest.refrain.has_source
            && piece.manifest.refrain.source_section === 1
            && piece.manifest.refrain.returns >= 1
            && piece.manifest.refrain.developments >= 2
            && piece.manifest.refrain.dubby_treatments >= 2
            && piece.manifest.pedal_voices.bass === true
            && piece.report.includes("Refrain development"),
        },
        {
          name: "dub groove shapes note timing",
          ok: piece.manifest.dub_groove.enabled
            && piece.manifest.dub_groove.groove_events > 0
            && piece.manifest.dub_groove.skank_touches > 0
            && piece.manifest.dub_groove.bass_pulses > 0
            && piece.manifest.dub_groove.max_offset_ticks > 0
            && piece.events.some((event) => event.grooveRole === "skank-touch" && event.grooveOffsetTicks < 0)
            && piece.events.some((event) => event.grooveRole === "bass-pulse"),
        },
        {
          name: "mode personality and phrase arcs",
          ok: modePersonality("mixolydian").aura === "dub earth"
            && phrasePlans.some((plan) => plan?.aura === "dub earth")
            && phrasePlans.every((plan) => Array.isArray(plan?.lead_path) && plan.lead_path.length >= 1)
            && phrasePlans.at(-1).cadence_intensity > phrasePlans[0].cadence_intensity,
        },
        {
          name: "dub bass memory can reuse cells",
          ok: directMemory.first.length === directMemory.second.length
            && directMemory.memory.newCells >= 1
            && directMemory.memory.reused >= 1,
        },
        {
          name: "sweetness checker is affirming",
          ok: piece.manifest.sweetness?.affirming === true
            && Number.isInteger(piece.manifest.sweetness.score)
            && piece.manifest.sweetness.notes.some((note) => note.includes("Gemma says:"))
            && piece.report.includes("Sweetness check"),
        },
        {
          name: "overlong soprano suspension warns",
          ok: overlongSoprano.summary.suspensionsDetected >= 1 && overlongSoprano.summary.overlongSuspensions >= 1 && overlongSoprano.warnings.length >= 1,
        },
        {
          name: "bass tonic pedal allowed",
          ok: bassPedal.summary.pedalHolds >= 1 && bassPedal.summary.overlongSuspensions === 0 && bassPedal.warnings.length === 0,
        },
        {
          name: "bass non-pedal pitch warns",
          ok: bassBadPedal.summary.overlongSuspensions >= 1 && bassBadPedal.warnings.length >= 1,
        },
        {
          name: "stepwise suspension resolution counted",
          ok: resolved.summary.suspensionsDetected >= 1 && resolved.summary.suspensionsResolved >= 1,
        },
      ];
    })()
  `, context);

  let ok = true;
  for (const result of results) {
    const status = result.ok ? "ok" : "failed";
    console.log(`${status} feature ${result.name}`);
    if (!result.ok) ok = false;
  }
  return ok;
}

function runFugueTests() {
  const indexHtml = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  const stylesCss = fs.readFileSync(path.join(ROOT, "styles.css"), "utf8");
  const styleOptionOk = indexHtml.includes('<option value="fishtail_fugue">Fishtail Fugue</option>');
  const tempoDefaultOk = indexHtml.includes('id="tempoInput" type="text" value="60.0000"')
    && indexHtml.includes('id="tempoDivisorLabel">n = 216</span>')
    && indexHtml.includes('id="tempoDivisorInput" type="range" min="59" max="432" step="1" value="216"')
    && indexHtml.includes('id="referenceFreqInput" type="number" min="20" max="2000" step="0.01" value="216.00"')
    && stylesCss.includes("#tempoDivisorInput")
    && stylesCss.includes("direction: rtl");
  const variedLabelOk = indexHtml.includes("Varied") && !indexHtml.includes("Strange");
  const notesClosedOk = indexHtml.includes('<button id="toggleNotesButton" type="button">Show Notes</button>')
    && indexHtml.includes('<section class="panel output-panel" id="notesPanel" hidden>');
  const velocitySwitchOk = indexHtml.includes('id="velocityModeInput" type="checkbox" checked')
    && indexHtml.includes("Gravity velocity");
  const panelOrderOk = indexHtml.indexOf('class="panel sound-time-panel"') > indexHtml.indexOf('class="panel voices-panel"')
    && indexHtml.indexOf('class="panel pitch-panel"') > indexHtml.indexOf('class="panel sound-time-panel"')
    && stylesCss.includes(".pitch-panel {\n  grid-column: 2;\n  grid-row: 3;")
    && stylesCss.includes(".sound-time-panel {\n  grid-column: 2;\n  grid-row: 2;");
  const probePitchSliderOk = indexHtml.includes('id="probePitchInput" type="range" min="0" max="83" step="1" value="45"')
    && indexHtml.includes('href="styles.css?v=39"')
    && indexHtml.includes('id="probeFineInput" type="range" min="-100" max="100" step="0.1" value="0"')
    && indexHtml.includes('id="tempoLatticeInput" type="checkbox" checked')
    && indexHtml.includes('id="rationalSwingInput" type="range" min="0" max="100" value="0"')
    && indexHtml.includes('id="irrationalSwingInput" type="range" min="0" max="100" value="0"')
    && indexHtml.includes('id="metronomeLevelInput" type="range" min="0" max="100" value="88"')
    && indexHtml.includes('src/audio-engine.js?v=4')
    && indexHtml.includes('src/wav-export.js?v=3')
    && indexHtml.includes('src/pitch-input.js?v=2')
    && indexHtml.includes('src/app.js?v=72')
    && indexHtml.includes("Listen for pitch")
    && indexHtml.includes("Audio is analysed on this device. It is not recorded or uploaded.")
    && indexHtml.includes("Living Reference Input, pink-noise ticker")
    && indexHtml.includes("optional MediaDevices audio input")
    && indexHtml.includes("Ticker WAV export is peak-normalized to -6 dBFS")
    && indexHtml.includes("meter 4/4 from form 1")
    && stylesCss.includes(".probe-pitch-field")
    && stylesCss.includes(".living-reference")
    && stylesCss.includes("grid-column: 1 / -1")
    && stylesCss.includes("isolation: isolate")
    && stylesCss.includes("contain: layout paint")
    && stylesCss.includes(".torus-host > canvas")
    && stylesCss.includes("pointer-events: none");
  const cvExportOk = indexHtml.includes('id="prepareCvWavInput" type="checkbox"')
    && indexHtml.includes("Prepare analogue CV ZIP")
    && indexHtml.includes('id="downloadCvWavButton" type="button" disabled>Save CV ZIP</button>')
    && indexHtml.includes("1V/oct pitch and gate WAV pairs")
    && indexHtml.includes("DC-coupled interface")
    && indexHtml.includes("analogue CV export direction");
  const context = makeAppContext();
  const results = vm.runInContext(`
    (() => {
      function dubUiDefault() {
        els.dubModeInput = { checked: true };
        els.styleInput = { value: "counterpoint" };
        els.statusLabel = { textContent: "Ready" };
        els.rationalSwingInput = { value: "0" };
        els.irrationalSwingInput = { value: "0" };
        document.body = { classList: { toggle() {} } };
        updateDubModeUi();
        const dubOnOk = els.styleInput.value === "fishtail_fugue"
          && els.statusLabel.textContent === "DUB armed"
          && els.rationalSwingInput.value === "28"
          && els.irrationalSwingInput.value === "6";
        els.dubModeInput.checked = false;
        updateDubModeUi();
        return dubOnOk
          && els.rationalSwingInput.value === "0"
          && els.irrationalSwingInput.value === "0";
      }

      function dubDiceWeighting() {
        const sequenceRng = (values) => {
          let index = 0;
          return () => values[Math.min(index++, values.length - 1)];
        };
        const firstRole = chooseRandomSectionRoleTreatment(() => 0, 0, 5, true);
        const dubRole = chooseRandomSectionRoleTreatment(() => 0, 1, 5, true);
        const d4Role = chooseRandomSectionRoleTreatment(() => 0.5, 1, 5, false, "gentle");
        const d20Role = chooseRandomSectionRoleTreatment(sequenceRng([0, 0.9]), 1, 5, false, "wild");
        const normalizedFirst = normalizeSection({ bars: 4, key: "C", mode: "major", meter: "4/4", cadence: "authentic", role: "development", treatment: "dubby" }, 0);
        return firstRole.role === "normal"
          && firstRole.treatment === "straight"
          && normalizedFirst.role === "normal"
          && normalizedFirst.treatment === "straight"
          && dubRole.role === "development"
          && dubRole.treatment === "dubby"
          && d4Role.role === "refrain"
          && d4Role.treatment === "straight"
          && d20Role.role === "development"
          && d20Role.treatment === "dubby";
      }

      function probePitchControlsDriveReference() {
        const offSwitch = { getAttribute: () => "false" };
        els.referenceNoteInput = { value: "A3" };
        els.referenceFreqInput = { value: "216.00" };
        const a3Index = REFERENCE_NOTE_NAMES.indexOf("A3");
        els.probePitchInput = { value: String(a3Index), min: "0", max: String(REFERENCE_NOTE_NAMES.length - 1) };
        els.probePitchLabel = { textContent: "" };
        els.probeFineInput = { value: "25.0", min: "-100", max: "100" };
        els.probeFineLabel = { textContent: "" };
        els.tempoDivisorInput = { value: "216", min: "", max: "" };
        els.tempoInput = { value: "" };
        els.tempoDivisorLabel = { textContent: "" };
        els.tempoLatticeInput = { checked: false };
        els.tempoLatticeStatusLabel = { textContent: "" };
        els.tempoLatticeReadout = { textContent: "" };
        els.rationalSwingInput = { value: "50" };
        els.irrationalSwingInput = { value: "0" };
        els.metronomeMeterInput = { value: "section-1" };
        els.outputModeInput = { value: "equal" };
        els.probeInput = offSwitch;
        els.metronomeInput = offSwitch;
        els.probeLevelInput = { value: "45" };
        els.metronomeLevelInput = { value: "88" };

        els.probePitchInput.value = String(a3Index + 1);
        els.referenceNoteInput.value = REFERENCE_NOTE_NAMES[a3Index + 1];
        updateReferenceFrequencyFromFineCents(readProbeFineCents());
        applyReferencePitchChange();
        const coarseHz = Number(els.referenceFreqInput.value);
        const coarseOk = els.referenceNoteInput.value === REFERENCE_NOTE_NAMES[a3Index + 1]
          && Math.abs(coarseHz - (referenceBaseHzForMidi(selectedReferenceMidi()) * (2 ** (25 / 1200)))) < 0.02
          && els.probePitchLabel.textContent.includes(els.referenceNoteInput.value)
          && els.probeFineLabel.textContent === "+25.0 ct";

        els.probeFineInput.value = "10.0";
        updateReferenceFrequencyFromFineCents(readProbeFineCents());
        applyReferencePitchChange();
        const fineHz = Number(els.referenceFreqInput.value);
        return coarseOk
          && Math.abs(fineHz - (referenceBaseHzForMidi(selectedReferenceMidi()) * (2 ** (10 / 1200)))) < 0.02
          && fineHz !== coarseHz
          && els.tempoLatticeReadout.textContent.includes("meter")
          && els.tempoInput.value.length > 0;
      }

      function livingReferenceMetadataIsPrivate() {
        state.inputReference.captured = {
          mode: "live_input",
          captured_hz: 220,
          reference_note: "A3",
          reference_midi: 57,
          deviation_before_reanchor_cents: 15.67,
          implied_a4_hz: 440,
          confidence: 0.94,
          pitch_spread_cents: 3.2,
          algorithm: FishtailPitchInput.ALGORITHM,
          audio_recorded: false,
          audio_uploaded: false,
          selectedDeviceId: "must-not-leak",
          deviceLabel: "must-not-leak",
        };
        const metadata = referenceSourceMetadata();
        const text = JSON.stringify(metadata);
        const capturedOk = metadata.mode === "live_input"
          && metadata.captured_hz === 220
          && metadata.implied_a4_hz === 440
          && metadata.audio_recorded === false
          && metadata.audio_uploaded === false
          && !text.includes("must-not-leak")
          && REFERENCE_NOTE_NAMES[0] === "C0"
          && REFERENCE_NOTE_NAMES.includes("B6");
        els.referenceNoteInput = { value: "A3" };
        els.referenceFreqInput = { value: "221.0" };
        updateReferenceAnchorFromFrequency();
        return capturedOk && referenceSourceMetadata().mode === "manual";
      }

      function buildFuguePiece({ sections, dubMode = false, voices = 4, seed = "validation-fugue" }) {
        const settings = {
          seed,
          voices,
          tempo: 30,
          includeTempoMap: true,
          referenceNote: "A4",
          referenceMidi: 69,
          referenceHz: 432,
          referenceAnchorA4Hz: 432,
          tempoDivisor: 864,
          breathing: 0.58,
          density: 0.32,
          strangeness: 0.16,
          generationStyle: "fishtail_fugue",
          resolution: "literal",
          outputMode: "equal",
          dubMode,
          pedalVoices: { bass: dubMode, tenor: false, alto: false, soprano: false },
          rootPc: 9,
          rootNote: "A4",
          rootMidi: 69,
          rootFreq: 432,
          sections,
        };
        return buildPiece(settings, makeRng(settings.seed));
      }

      const oneSection = buildFuguePiece({
        sections: [{ bars: 2, key: "C", mode: "major", meter: "4/4", cadence: "authentic", role: "normal", treatment: "straight" }],
      });
      const twoSections = buildFuguePiece({
        sections: [
          { bars: 3, key: "C", mode: "major", meter: "4/4", cadence: "authentic", role: "normal", treatment: "straight" },
          { bars: 3, key: "G", mode: "mixolydian", meter: "4/4", cadence: "plagal", role: "normal", treatment: "straight" },
        ],
        seed: "validation-fugue-two",
      });
      const threeSections = buildFuguePiece({
        sections: [
          { bars: 8, key: "C", mode: "major", meter: "4/4", cadence: "authentic", role: "normal", treatment: "straight" },
          { bars: 6, key: "G", mode: "mixolydian", meter: "4/4", cadence: "plagal", role: "development", treatment: "gentle" },
          { bars: 6, key: "C", mode: "major", meter: "4/4", cadence: "authentic", role: "refrain", treatment: "straight" },
        ],
        seed: "validation-fugue-three",
      });
      const fourSections = buildFuguePiece({
        sections: [
          { bars: 8, key: "C", mode: "major", meter: "4/4", cadence: "authentic", role: "normal", treatment: "straight" },
          { bars: 5, key: "G", mode: "mixolydian", meter: "4/4", cadence: "plagal", role: "normal", treatment: "straight" },
          { bars: 5, key: "A", mode: "gravity_melodic_minor", meter: "3/4", cadence: "minor_authentic", role: "normal", treatment: "straight" },
          { bars: 6, key: "C", mode: "major", meter: "4/4", cadence: "authentic", role: "normal", treatment: "straight" },
        ],
        seed: "validation-fugue-four",
      });
      const dubFugue = buildFuguePiece({
        sections: structuredClone(threeSections.settings.sections),
        dubMode: true,
        seed: "validation-fugue-dub",
      });

      const expo = threeSections.manifest.fugue.exposition_entries;
      const expoVoices = new Set(expo.map((entry) => entry.voice));
      const alternating = expo.every((entry, index) => entry.kind === (index % 2 === 0 ? "subject" : "answer"));
      const fourRoles = fourSections.manifest.fugue.sections.map((section) => section.role);

      return [
        {
          name: "dub switch selects Fishtail Fugue",
          ok: dubUiDefault(),
        },
        {
          name: "dub dice weights role and treatment",
          ok: dubDiceWeighting(),
        },
        {
          name: "probe pitch controls drive reference Hz",
          ok: probePitchControlsDriveReference(),
        },
        {
          name: "living reference metadata is private",
          ok: livingReferenceMetadataIsPrivate(),
        },
        {
          name: "auto-repairs one section to three",
          ok: oneSection.manifest.fugue.repaired_form.final_sections === 3
            && oneSection.manifest.fugue.repaired_form.auto_repaired
            && oneSection.manifest.fugue.repaired_form.notes.some((note) => note.includes("Added")),
        },
        {
          name: "auto-repairs two sections to three",
          ok: twoSections.manifest.fugue.repaired_form.final_sections === 3
            && twoSections.manifest.fugue.repaired_form.notes.some((note) => note.includes("final return")),
        },
        {
          name: "preserves sufficient three-section form",
          ok: threeSections.manifest.fugue.repaired_form.original_sections === 3
            && threeSections.manifest.fugue.repaired_form.final_sections === 3
            && threeSections.manifest.fugue.repaired_form.notes.length === 0,
        },
        {
          name: "exposition schedules every voice once",
          ok: expo.length === threeSections.settings.voices && expoVoices.size === threeSections.settings.voices,
        },
        {
          name: "subject and answer alternate",
          ok: alternating,
        },
        {
          name: "middle sections alternate episode and entry",
          ok: fourRoles.includes("episode") && fourRoles.includes("middle_entry"),
        },
        {
          name: "formal gravity when dub is off",
          ok: threeSections.manifest.fugue.formal_gravity_mode === "formal"
            && threeSections.report.includes("Formal Gravity: formal"),
        },
        {
          name: "dub gravity keeps fugue metadata",
          ok: dubFugue.manifest.fugue.formal_gravity_mode === "dub"
            && dubFugue.manifest.fugue.exposition_entries.length === dubFugue.settings.voices
            && dubFugue.report.includes("Formal Gravity: dub"),
        },
        {
          name: "manifest includes fugue material",
          ok: Array.isArray(threeSections.manifest.fugue.subject)
            && Array.isArray(threeSections.manifest.fugue.answer)
            && Array.isArray(threeSections.manifest.fugue.countersubject)
            && threeSections.manifest.fugue.sections.at(-1).role === "final_return",
        },
      ];
    })()
  `, context);

  let ok = styleOptionOk && tempoDefaultOk && variedLabelOk && notesClosedOk && velocitySwitchOk && panelOrderOk && probePitchSliderOk && cvExportOk;
  console.log(`${styleOptionOk ? "ok" : "failed"} fugue style option`);
  console.log(`${tempoDefaultOk ? "ok" : "failed"} tempo default and direction`);
  console.log(`${variedLabelOk ? "ok" : "failed"} varied label`);
  console.log(`${notesClosedOk ? "ok" : "failed"} notes default closed`);
  console.log(`${velocitySwitchOk ? "ok" : "failed"} velocity switch default`);
  console.log(`${panelOrderOk ? "ok" : "failed"} panel order puts probe before pitch`);
  console.log(`${probePitchSliderOk ? "ok" : "failed"} probe pitch sliders and metronome boost`);
  console.log(`${cvExportOk ? "ok" : "failed"} analogue CV export controls`);
  for (const result of results) {
    const status = result.ok ? "ok" : "failed";
    console.log(`${status} fugue ${result.name}`);
    if (!result.ok) ok = false;
  }
  return ok;
}

function makeAppContext() {
  const TestURL = URL;
  TestURL.createObjectURL = () => "blob:test";
  TestURL.revokeObjectURL = () => {};
  const context = {
    console,
    structuredClone,
    window: { location: { href: "https://amycin.github.io/amy-cin-fishtail/" } },
    document: { addEventListener() {}, getElementById: () => null },
    navigator: {},
    localStorage: { getItem: () => null, setItem() {} },
    crypto: {
      getRandomValues: (array) => array.fill(17),
      subtle: { digest: async () => new ArrayBuffer(32) },
    },
    URL: TestURL,
    Blob,
    Uint8Array,
    ArrayBuffer,
    DataView,
    TextEncoder,
    setTimeout,
    clearTimeout,
    requestAnimationFrame: () => 0,
    THREE: undefined,
  };
  vm.createContext(context);
  APP_SCRIPT_PATHS.forEach((scriptPath) => {
    vm.runInContext(fs.readFileSync(scriptPath, "utf8"), context, { filename: scriptPath });
  });
  return context;
}

function buildSmokePiece(context, test) {
  context.__fishtailSmoke = {
    seed: `validation-${test.name}`,
    voices: 4,
    tempo: 30,
    includeTempoMap: test.includeTempoMap,
    referenceNote: "A4",
    referenceMidi: 69,
    referenceHz: 432,
    referenceAnchorA4Hz: 432,
    tempoDivisor: 864,
    breathing: 0.74,
    density: 0.26,
    strangeness: 0.16,
    generationStyle: test.generationStyle || "counterpoint",
    resolution: test.resolution,
    outputMode: test.outputMode,
    dubMode: Boolean(test.dubMode),
    pedalVoices: { bass: Boolean(test.dubMode), tenor: false, alto: false, soprano: false },
    rootPc: 9,
    rootNote: "A4",
    rootMidi: 69,
    rootFreq: 432,
  };
  return vm.runInContext(`
    (() => {
      const settings = {
        ...globalThis.__fishtailSmoke,
        sections: structuredClone(DEFAULT_SECTIONS),
      };
      return buildPiece(settings, makeRng(settings.seed));
    })()
  `, context);
}

function buildBatchPiece(context, profile, index) {
  context.__fishtailBatch = {
    seed: `batch-${profile.name}-${String(index).padStart(4, "0")}`,
    voices: 4,
    tempo: 30,
    includeTempoMap: true,
    referenceNote: "A4",
    referenceMidi: 69,
    referenceHz: 432,
    referenceAnchorA4Hz: 432,
    tempoDivisor: 864,
    breathing: 0.7,
    density: 0.3,
    strangeness: 0.18,
    generationStyle: profile.generationStyle,
    resolution: profile.resolution,
    outputMode: profile.outputMode,
    dubMode: Boolean(profile.dubMode),
    pedalVoices: { bass: Boolean(profile.dubMode), tenor: false, alto: false, soprano: false },
    rootPc: 9,
    rootNote: "A4",
    rootMidi: 69,
    rootFreq: 432,
  };
  return vm.runInContext(`
    (() => {
      const settings = {
        ...globalThis.__fishtailBatch,
        sections: structuredClone(DEFAULT_SECTIONS),
      };
      return buildPiece(settings, makeRng(settings.seed));
    })()
  `, context);
}

function validateMidiFile(filePath, options) {
  try {
    const bytes = fs.readFileSync(filePath);
    const result = validateMidiBytes(bytes, options);
    const status = result.ok ? "ok" : "failed";
    console.log(`${status} ${filePath}: format=${result.format}, tracks=${result.trackCount}, division=${result.division}, notes=${result.notes}, tempos=${result.tempos}`);
    printMessages(result.issues, result.warnings);
    return result.ok;
  } catch (error) {
    console.error(`failed ${filePath}: ${error.message}`);
    return false;
  }
}

function validateMidiBytes(bytes, options = {}) {
  const issues = [];
  const warnings = [];
  let parsed;
  try {
    parsed = parseMidi(bytes);
  } catch (error) {
    return {
      ok: false,
      issues: [error.message],
      warnings,
      format: "?",
      trackCount: "?",
      division: "?",
      notes: 0,
      tempos: 0,
    };
  }

  const conductorTrack = detectConductorTrack(parsed);
  let notes = 0;
  let tempos = 0;
  let programChanges = 0;
  let sysex = 0;

  if (parsed.format !== 1) issues.push(`Expected MIDI format 1, got ${parsed.format}.`);
  if (options.expectedTracks && parsed.trackCount !== options.expectedTracks) {
    issues.push(`Expected ${options.expectedTracks} tracks, got ${parsed.trackCount}.`);
  }

  parsed.tracks.forEach((track, index) => {
    const isConductor = index === conductorTrack;
    for (const event of track.events) {
      if (event.kind === "meta") {
        if (event.metaType === 0x51) tempos += 1;
        if (isConductor && [0x51, 0x58, 0x2f].includes(event.metaType)) continue;
        if (!isConductor && event.metaType === 0x2f) continue;
        issues.push(`Track ${index + 1} contains unexpected meta event 0x${event.metaType.toString(16)}.`);
        continue;
      }

      if (event.kind === "sysex") {
        sysex += 1;
        issues.push(`Track ${index + 1} contains SysEx data.`);
        continue;
      }

      if (isConductor) {
        issues.push(`Conductor track ${index + 1} contains MIDI event 0x${event.eventType.toString(16)}.`);
        continue;
      }

      if (event.eventType === 0x80 || event.eventType === 0x90) {
        if (event.eventType === 0x90 && event.data[1] !== 0) notes += 1;
        continue;
      }

      if (event.eventType === 0xc0) {
        programChanges += 1;
        issues.push(`Track ${index + 1} contains program change data.`);
        continue;
      }

      if (event.eventType === 0xb0 || event.eventType === 0xe0) {
        if (options.strictNoteVoices || options.allowBendEvents === false) {
          issues.push(`Track ${index + 1} contains ${event.eventType === 0xb0 ? "controller" : "pitch-bend"} data.`);
        } else {
          warnings.push(`Track ${index + 1} contains ${event.eventType === 0xb0 ? "controller" : "pitch-bend"} data; expected only for Bend MIDI.`);
        }
        continue;
      }

      issues.push(`Track ${index + 1} contains unsupported MIDI event 0x${event.eventType.toString(16)}.`);
    }
  });

  if (notes === 0) issues.push("No note-on events found.");
  if (options.expectTempo30 === true && !hasTempo30(parsed)) issues.push("Expected embedded 30 BPM tempo metadata.");
  if (options.expectTempo30 === false && hasTempo30(parsed)) issues.push("Found 30 BPM tempo metadata when tempo map should be off.");
  if (programChanges) issues.push(`${programChanges} program change event(s) found.`);
  if (sysex) issues.push(`${sysex} SysEx event(s) found.`);

  return {
    ok: issues.length === 0,
    issues,
    warnings,
    format: parsed.format,
    trackCount: parsed.trackCount,
    division: parsed.division,
    notes,
    tempos,
  };
}

function parseMidi(bytes) {
  if (bytes.length < 14) throw new Error("MIDI file is too small.");
  if (bytes.toString("ascii", 0, 4) !== "MThd") throw new Error("Missing MThd header.");
  const headerLength = readU32(bytes, 4);
  if (headerLength !== 6) throw new Error(`Expected MIDI header length 6, got ${headerLength}.`);
  const format = readU16(bytes, 8);
  const trackCount = readU16(bytes, 10);
  const division = readU16(bytes, 12);
  const tracks = [];
  let offset = 14;

  for (let trackIndex = 0; trackIndex < trackCount; trackIndex += 1) {
    if (offset + 8 > bytes.length) throw new Error(`Track ${trackIndex + 1} is truncated.`);
    if (bytes.toString("ascii", offset, offset + 4) !== "MTrk") throw new Error(`Track ${trackIndex + 1} is missing MTrk header.`);
    const trackLength = readU32(bytes, offset + 4);
    offset += 8;
    const end = offset + trackLength;
    if (end > bytes.length) throw new Error(`Track ${trackIndex + 1} length exceeds file size.`);
    tracks.push({ events: parseTrack(bytes, offset, end) });
    offset = end;
  }

  if (offset !== bytes.length) throw new Error("Unexpected trailing bytes after final track.");
  return { format, trackCount, division, tracks };
}

function parseTrack(bytes, start, end) {
  const events = [];
  let offset = start;
  let tick = 0;
  let runningStatus = null;
  while (offset < end) {
    const delta = readVarLen(bytes, offset);
    tick += delta.value;
    offset = delta.next;

    let status = bytes[offset];
    if (status < 0x80) {
      if (runningStatus == null) throw new Error("Running status used before a status byte.");
      status = runningStatus;
    } else {
      offset += 1;
      if (status < 0xf0) runningStatus = status;
    }

    if (status === 0xff) {
      const metaType = bytes[offset];
      offset += 1;
      const length = readVarLen(bytes, offset);
      const dataStart = length.next;
      offset = dataStart + length.value;
      events.push({ kind: "meta", tick, metaType, data: [...bytes.slice(dataStart, offset)] });
      continue;
    }

    if (status === 0xf0 || status === 0xf7) {
      const length = readVarLen(bytes, offset);
      offset = length.next + length.value;
      events.push({ kind: "sysex", tick });
      continue;
    }

    const eventType = status & 0xf0;
    const dataBytes = eventType === 0xc0 || eventType === 0xd0 ? 1 : 2;
    const data = [...bytes.slice(offset, offset + dataBytes)];
    offset += dataBytes;
    events.push({ kind: "midi", tick, eventType, channel: status & 0x0f, data });
  }
  return events;
}

function detectConductorTrack(parsed) {
  if (!parsed.tracks.length) return -1;
  const firstTrack = parsed.tracks[0];
  const nonEndEvents = firstTrack.events.filter((event) => !(event.kind === "meta" && event.metaType === 0x2f));
  if (!nonEndEvents.length) return -1;
  const conductorOnly = nonEndEvents.every((event) => event.kind === "meta" && (event.metaType === 0x51 || event.metaType === 0x58));
  return conductorOnly ? 0 : -1;
}

function hasTempo30(parsed) {
  return parsed.tracks.some((track) => track.events.some((event) => (
    event.kind === "meta"
    && event.metaType === 0x51
    && event.data.length === 3
    && event.data.every((byte, index) => byte === TEMPO_30_BYTES[index])
  )));
}

function printMessages(...groups) {
  groups.flat().filter(Boolean).forEach((message) => {
    console.error(`  - ${message}`);
  });
}

function readU16(bytes, offset) {
  return (bytes[offset] << 8) | bytes[offset + 1];
}

function readU32(bytes, offset) {
  return bytes[offset] * 0x1000000 + ((bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]);
}

function readVarLen(bytes, offset) {
  let value = 0;
  let next = offset;
  for (let i = 0; i < 4; i += 1) {
    const byte = bytes[next];
    if (byte == null) throw new Error("Unexpected end of variable-length value.");
    next += 1;
    value = (value << 7) | (byte & 0x7f);
    if ((byte & 0x80) === 0) return { value, next };
  }
  throw new Error("Variable-length value is too long.");
}

main();
