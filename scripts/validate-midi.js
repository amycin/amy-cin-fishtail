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
  path.join(ROOT, "src", "random-router.js"),
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
    failed = !runRandomStreamTests() || failed;
    failed = !runPhaseLockedTimingTests() || failed;
    failed = !runRhythmTests() || failed;
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
          noBadGlitch: typeof visualGlitchEnvelope === "undefined"
            && !Object.prototype.hasOwnProperty.call(state, "visualGlitchUntil"),
          delay: currentCoreFrameDelay(now + 120),
          dpr: currentVisualPixelRatio(now + 120),
        };
      })();

      const highRefreshVisual = (() => {
        const now = Date.now() + 20000;
        state.visualEcoUntil = 0;
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

      const visualColorGlideAudit = (() => {
        function colorDistance(a, b) {
          return Math.hypot(...a.map((channel, index) => channel - b[index]));
        }
        els.referenceFreqInput = { value: "216.00" };
        els.outputModeInput = { value: "equal" };
        els.dubModeInput = { checked: false };
        state.referenceExactHz = null;
        state.visualLightPalette = null;
        state.visualLightLastUpdatedAt = 0;
        state.visualLightGlideUntil = 0;

        const start = updateVisualLightPalette(false, { now: 1000 });
        els.referenceFreqInput.value = "243.00";
        state.referenceExactHz = null;
        const target = buildVisualLightPalette(false);
        beginVisualLightGlide(1016);
        const immediate = updateVisualLightPalette(false, { now: 1016 });
        let mid = immediate;
        for (let now = 1116; now <= 1516; now += 100) mid = updateVisualLightPalette(false, { now });
        let late = mid;
        for (let now = 1616; now <= 2516; now += 100) late = updateVisualLightPalette(false, { now });

        const startDistance = colorDistance(start.colors.torus, target.colors.torus);
        const immediateDistance = colorDistance(immediate.colors.torus, target.colors.torus);
        const midDistance = colorDistance(mid.colors.torus, target.colors.torus);
        const lateDistance = colorDistance(late.colors.torus, target.colors.torus);
        return {
          constants: VISUAL_LIGHT_PITCH_GLIDE_MS === 1500
            && VISUAL_LIGHT_IDLE_GLIDE_MS === 820
            && VISUAL_LIGHT_MAX_FRAME_MS === 120,
          targetMoved: startDistance > 0.01,
          immediateInterpolates: immediateDistance > 0.003 && immediateDistance < startDistance,
          monotonicGlide: lateDistance < midDistance && midDistance < immediateDistance,
          stillGlidingAfterImmediate: state.visualLightGlideUntil >= 2516,
        };
      })();

      const generationDelayRemoved = typeof generationRitualMinimumMs === "undefined"
        && typeof generationRitualStatus === "undefined"
        && typeof GENERATE_MIN_MS === "undefined"
        && typeof GENERATE_RITUAL_COMFORT_MS === "undefined"
        && typeof GENERATE_RITUAL_FAST_MS === "undefined"
        && typeof GENERATE_RITUAL_MAX_MS === "undefined";

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
        function timelineSignature(timeline) {
          return JSON.stringify(timeline.segments.map((segment) => Number(segment.durationWeight.toFixed(9))));
        }
        function tempoSignature(timeline) {
          return JSON.stringify(timeline.segments.map((segment) => segment.microsecondsPerQuarter));
        }
        function validMidiTempos(timeline) {
          return timeline.tempoEvents.length > 0
            && timeline.tempoEvents.every((event, index) => (
              Number.isInteger(event.tick)
              && event.tick >= 0
              && Number.isInteger(event.microsecondsPerQuarter)
              && event.microsecondsPerQuarter >= 1
              && event.microsecondsPerQuarter <= 0xffffff
              && (index === 0 || event.tick > timeline.tempoEvents[index - 1].tick)
            ));
        }
        function barSums(timeline) {
          const sums = new Map();
          timeline.segments.forEach((segment) => {
            const key = \`\${segment.sectionIndex}:\${segment.barIndex}\`;
            sums.set(key, (sums.get(key) || 0) + segment.durationWeight);
          });
          return [...sums.values()];
        }
        const settings = baseSettings({
          tempoLatticeEnabled: true,
          rationalSwing: 1,
          irrationalSwing: 0.6,
          irrationalFeelMode: "lattice_safe",
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
            && validMidiTempos(timeline);
        });
        const section = [{ bars: 2, meter: "7/8", startTick: 0, barTicks: METERS["7/8"].numerator * METERS["7/8"].pulse, numerator: 7, denominator: 8 }];
        const one = FishtailTempoLattice.buildTempoTimeline(section, settings, { ppq: PPQ, meters: METERS });
        const same = FishtailTempoLattice.buildTempoTimeline(section, settings, { ppq: PPQ, meters: METERS });
        const other = FishtailTempoLattice.buildTempoTimeline(section, { ...settings, seed: "timeline-other" }, { ppq: PPQ, meters: METERS });
        const straight = FishtailTempoLattice.buildTempoTimeline(section, { ...settings, tempoLatticeEnabled: false }, { ppq: PPQ, meters: METERS });
        const stumble = FishtailTempoLattice.buildTempoTimeline([{ bars: 1, meter: "4/4", startTick: 0, barTicks: METERS["4/4"].numerator * METERS["4/4"].pulse, numerator: 4, denominator: 4 }], {
          ...settings,
          rationalSwing: 0,
          irrationalSwing: 0.6,
          seed: "stumble-audit",
        }, { ppq: PPQ, meters: METERS });
        const stumbleWeights = stumble.segments.map((segment) => segment.durationWeight);
        const stumbleSpread = Math.max(...stumbleWeights) - Math.min(...stumbleWeights);
        const fingerprintSections = [
          { bars: 1, meter: "4/4", startTick: 0, barTicks: METERS["4/4"].numerator * METERS["4/4"].pulse, numerator: 4, denominator: 4 },
          { bars: 1, meter: "7/8", startTick: METERS["4/4"].numerator * METERS["4/4"].pulse, barTicks: METERS["7/8"].numerator * METERS["7/8"].pulse, numerator: 7, denominator: 8 },
        ];
        const safeFingerprint = FishtailTempoLattice.buildTempoTimeline(fingerprintSections, {
          tempo: 72,
          tempoLatticeEnabled: true,
          rationalSwing: 0.5,
          irrationalSwing: 0.6,
          irrationalFeelMode: "lattice_safe",
          tempoLatticeLaw: FishtailTempoLattice.DEFAULT_LAW,
          seed: "safe-fingerprint",
        }, { ppq: PPQ, meters: METERS });
        const expectedSafeWeights = [1.037808007, 0.962191993, 1.224455468, 0.775544532, 1.19715982, 0.80284018, 1.057496119, 0.942503881, 1.256424819, 0.849362831, 0.89421235];
        const expectedSafeTempos = [864840, 801826, 1020379, 646287, 997633, 669033, 881246, 785420, 1047020, 707802, 745177];
        const twoPulseSection = [{ bars: 5, meter: "2/2", startTick: 0, barTicks: METERS["2/2"].numerator * METERS["2/2"].pulse, numerator: 2, denominator: 2 }];
        const twoPulseNatural = FishtailTempoLattice.buildTempoTimeline(twoPulseSection, {
          tempo: 72,
          tempoLatticeEnabled: true,
          rationalSwing: 0,
          irrationalSwing: 1,
          irrationalFeelMode: "lattice_safe",
          tempoLatticeLaw: FishtailTempoLattice.NATURAL_SPREAD_LAW,
          seed: "two-pulse-natural",
        }, { ppq: PPQ, meters: METERS });
        const twoPulseLegacy = FishtailTempoLattice.buildTempoTimeline(twoPulseSection, {
          tempo: 72,
          tempoLatticeEnabled: true,
          rationalSwing: 0,
          irrationalSwing: 1,
          irrationalFeelMode: "lattice_safe",
          tempoLatticeLaw: FishtailTempoLattice.DEFAULT_LAW,
          seed: "two-pulse-natural",
        }, { ppq: PPQ, meters: METERS });
        const naturalPeaks = twoPulseNatural.barPeakOffsets.map((entry) => entry.peakOffset);
        const legacyPeaks = twoPulseLegacy.barPeakOffsets.map((entry) => entry.peakOffset);
        const driftSection = [{ bars: 4, meter: "4/4", startTick: 0, barTicks: METERS["4/4"].numerator * METERS["4/4"].pulse, numerator: 4, denominator: 4 }];
        const driftBase = {
          tempo: 72,
          tempoLatticeEnabled: true,
          rationalSwing: 0.5,
          irrationalSwing: 0.8,
          seed: "drift-deterministic",
        };
        const latticeSafe = FishtailTempoLattice.buildTempoTimeline(driftSection, { ...driftBase, irrationalFeelMode: "lattice_safe" }, { ppq: PPQ, meters: METERS });
        const hybrid = FishtailTempoLattice.buildTempoTimeline(driftSection, { ...driftBase, irrationalFeelMode: "hybrid_drift" }, { ppq: PPQ, meters: METERS });
        const living = FishtailTempoLattice.buildTempoTimeline(driftSection, { ...driftBase, irrationalFeelMode: "living_drift" }, { ppq: PPQ, meters: METERS });
        const livingSame = FishtailTempoLattice.buildTempoTimeline(driftSection, { ...driftBase, irrationalFeelMode: "living_drift" }, { ppq: PPQ, meters: METERS });
        const livingOther = FishtailTempoLattice.buildTempoTimeline(driftSection, { ...driftBase, seed: "drift-other", irrationalFeelMode: "living_drift" }, { ppq: PPQ, meters: METERS });
        const livingBarSums = barSums(living);
        const allModeTimelines = [latticeSafe, hybrid, living, safeFingerprint];
        return {
          perMeter,
          deterministic: timelineSignature(one) === timelineSignature(same),
          seedChanges: timelineSignature(one) !== timelineSignature(other),
          straight: straight.tempoEvents.length === 1 && straight.segments.every((segment) => segment.microsecondsPerQuarter === straight.baseMicrosecondsPerQuarter),
          irrationalMoves: stumbleSpread > 0 && stumbleSpread < 0.1 && stumble.barEndpointsPreserved,
          existingModeOutputUnchanged: safeFingerprint.irrationalFeelMode === "lattice_safe"
            && safeFingerprint.law === FishtailTempoLattice.DEFAULT_LAW
            && JSON.stringify(safeFingerprint.segments.map((segment) => Number(segment.durationWeight.toFixed(9)))) === JSON.stringify(expectedSafeWeights)
            && tempoSignature(safeFingerprint) === JSON.stringify(expectedSafeTempos),
          naturalSpreadDefault: latticeSafe.law === FishtailTempoLattice.NATURAL_SPREAD_LAW
            && twoPulseNatural.law === FishtailTempoLattice.NATURAL_SPREAD_LAW
            && twoPulseNatural.barEndpointsPreserved
            && naturalPeaks.every((peak) => peak <= 0.160001)
            && legacyPeaks.some((peak, index) => peak > (naturalPeaks[index] || 0) * 1.8),
          sameSeedSameDrift: timelineSignature(living) === timelineSignature(livingSame)
            && tempoSignature(living) === tempoSignature(livingSame)
            && timelineSignature(living) !== timelineSignature(livingOther),
          positivePulseDurations: allModeTimelines.every((timeline) => timeline.segments.every((segment) => segment.durationSeconds > 0 && segment.durationWeight > 0)),
          hybridAndSafeEndpoints: latticeSafe.endpointsPreserved
            && latticeSafe.barEndpointsPreserved
            && hybrid.endpointsPreserved
            && hybrid.barEndpointsPreserved,
          livingEndpointsWithWanderingBars: living.endpointsPreserved
            && !living.barEndpointsPreserved
            && livingBarSums.some((sum) => Math.abs(sum - 4) > 0.0001),
          tempoEventsValid: allModeTimelines.every(validMidiTempos),
          driftMetricsPresent: living.maxLocalDrift > 0
            && living.endpointCorrectionAmount > 0
            && living.minInstantaneousBpm > 0
            && living.maxInstantaneousBpm >= living.minInstantaneousBpm,
        };
      })();

      const liveMetronomeAudit = (() => {
        const base = {
          seed: "live-clock",
          tempo: 220,
          ppq: PPQ,
          meters: METERS,
          metronomeMeter: "7/8",
          rationalSwing: 1,
          irrationalSwing: 0.9,
          irrationalFeelMode: "living_drift",
        };
        const straight = FishtailAudioEngine.buildMetronomePattern({ ...base, tempoLatticeEnabled: false });
        const lattice = FishtailAudioEngine.buildMetronomePattern({ ...base, tempoLatticeEnabled: true });
        const straightSum = straight.reduce((sum, segment) => sum + segment.durationSeconds, 0);
        const latticeSum = lattice.reduce((sum, segment) => sum + segment.durationSeconds, 0);
        return {
          switchOffStraight: straight.every((segment) => segment.microsecondsPerQuarter === straight[0].microsecondsPerQuarter),
          switchOnMoves: new Set(lattice.map((segment) => segment.microsecondsPerQuarter)).size > 1,
          endpointsMatch: Math.abs(straightSum - latticeSum) < 1e-9,
        };
      })();

      const liveControlGlideAudit = (() => {
        const start = {
          seed: "live-glide",
          tempo: 60,
          referenceHz: 216,
          tempoLatticeEnabled: true,
          rationalSwing: 0,
          irrationalSwing: 0,
          irrationalFeelMode: "lattice_safe",
          ppq: PPQ,
          meters: METERS,
          metronomeMeter: "4/4",
          metronomeLevel: 0.8,
        };
        const target = {
          ...start,
          tempo: 132,
          referenceHz: 432,
          rationalSwing: 1,
          irrationalSwing: 0.8,
          irrationalFeelMode: "living_drift",
        };
        const control = FishtailAudioEngine.makeLiveControlState(start, 0);
        FishtailAudioEngine.updateLiveControlTarget(control, target, 0);
        const immediate = FishtailAudioEngine.smoothedMetronomeSettings(target, control, 0);
        const mid = FishtailAudioEngine.smoothedMetronomeSettings(target, control, 1.2);
        const later = FishtailAudioEngine.smoothedMetronomeSettings(target, control, 30);
        const immediatePattern = FishtailAudioEngine.buildMetronomePattern(immediate);
        const targetPattern = FishtailAudioEngine.buildMetronomePattern(target);
        const midPattern = FishtailAudioEngine.buildMetronomePattern(mid);
        return {
          constants: FishtailAudioEngine.LIVE_TEMPO_GLIDE_PULSES === 4
            && FishtailAudioEngine.LIVE_SWING_GLIDE_PULSES === 6
            && FishtailAudioEngine.LIVE_REFERENCE_GLIDE_SECONDS === 1,
          immediateHolds: immediate.tempo === start.tempo
            && immediate.rationalSwing === start.rationalSwing
            && immediate.irrationalSwing === start.irrationalSwing
            && immediate.referenceHz === start.referenceHz
            && immediate.irrationalFeelMode === target.irrationalFeelMode,
          gradualMove: mid.tempo > start.tempo
            && mid.tempo < target.tempo
            && mid.rationalSwing > start.rationalSwing
            && mid.rationalSwing < target.rationalSwing
            && mid.irrationalSwing > start.irrationalSwing
            && mid.irrationalSwing < target.irrationalSwing
            && mid.referenceHz > start.referenceHz
            && mid.referenceHz < target.referenceHz,
          eventualTarget: Math.abs(later.tempo - target.tempo) < 0.01
            && Math.abs(later.rationalSwing - target.rationalSwing) < 0.01
            && Math.abs(later.irrationalSwing - target.irrationalSwing) < 0.01
            && Math.abs(later.referenceHz - target.referenceHz) < 0.01,
          patternGlides: immediatePattern[0].durationSeconds > targetPattern[0].durationSeconds
            && midPattern[0].durationSeconds < immediatePattern[0].durationSeconds
            && midPattern[0].durationSeconds > targetPattern[0].durationSeconds,
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
          irrationalFeelMode: "hybrid_drift",
        };
        const straightPiece = buildPiece({ ...base, sections: structuredClone(DEFAULT_SECTIONS) }, FishtailRandom.createRouter(base.seed));
        const latticePiece = buildPiece({ ...lattice, sections: structuredClone(DEFAULT_SECTIONS) }, FishtailRandom.createRouter(lattice.seed));
        return {
          noteStable: noteSignature(straightPiece) === noteSignature(latticePiece),
          straightTempos: countTempoMeta(straightPiece.midiBytes),
          latticeTempos: countTempoMeta(latticePiece.midiBytes),
          manifestOk: latticePiece.manifest.tempo_lattice.enabled
            && latticePiece.manifest.tempo_lattice.tempo_event_count === latticePiece.tempoTimeline.tempoEvents.length
            && latticePiece.manifest.tempo_lattice.irrationalFeelMode === "hybrid_drift"
            && latticePiece.manifest.tempo_lattice.endpointsPreserved === true
            && latticePiece.manifest.tempo_lattice.maxLocalDrift > 0
            && latticePiece.manifest.tempo_lattice.endpointCorrectionAmount > 0
            && latticePiece.manifest.tempo_lattice.minInstantaneousBpm > 0
            && latticePiece.manifest.tempo_lattice.maxInstantaneousBpm >= latticePiece.manifest.tempo_lattice.minInstantaneousBpm
            && latticePiece.report.includes("Tempo lattice: on")
            && latticePiece.report.includes("Irrational feel: Hybrid Drift"),
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
        const wav16 = FishtailWavExport.encodePcm16Mono(new Float32Array([0, 1, -1, 2, -2, NaN]), 48000);
        const wav24 = FishtailWavExport.encodePcm24Mono(new Float32Array([0, 1, -1, 2, -2, NaN]), 48000);
        const text = (bytes, start, end) => String.fromCharCode(...bytes.slice(start, end));
        const dataBytes16 = wav16[40] | (wav16[41] << 8) | (wav16[42] << 16) | (wav16[43] << 24);
        const dataBytes24 = wav24[40] | (wav24[41] << 8) | (wav24[42] << 16) | (wav24[43] << 24);
        const tickerSamples = new Float32Array([0, 0.1, -0.25, 0.05]);
        const normalization = FishtailWavExport.normalizePeak(tickerSamples, -6);
        const normalizedPeak = FishtailWavExport.peakAbs(tickerSamples);
        const targetPeak = FishtailWavExport.dbfsToGain(-6);
        const cvZip = FishtailWavExport.makeZip([{ name: "hello.txt", data: new Uint8Array([65, 66]) }]);
        const cvTimeline = {
          totalSeconds: 2,
          segments: [
            { tick: 0, tickLength: 480, durationSeconds: 1, pulseIndex: 0 },
            { tick: 480, tickLength: 480, durationSeconds: 1, pulseIndex: 1 },
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
        const cvRetriggerVoice = FishtailWavExport.renderCvVoiceSamples({
          settings: { outputMode: "equal", cvRetriggerMs: 2 },
          events: cvPiece.events,
        }, "bass", cvTimeline, { sampleRate: 1000, frames: 2000 });
        const indexedTimeline = FishtailWavExport.indexTempoTimeline(cvTimeline);
        const cvBarClock = FishtailWavExport.clockEventsForTimeline(indexedTimeline, { cvClockMode: "bar" }, 480);
        const cvPpqnClock = FishtailWavExport.clockEventsForTimeline(indexedTimeline, { cvClockMode: "ppqn24" }, 480);
        const tickerSchedule = FishtailWavExport.tickerRenderSchedule(cvTimeline, 48000);
        const cvCalibration = FishtailWavExport.renderCvCalibrationStaircase({ sampleRate: 10 }, { cvFullScaleVolts: 5 });
        const probeSeconds = FishtailWavExport.probeExportPieceSeconds(cvTimeline);
        const standardPlan = FishtailWavExport.chooseRenderPlan(2);
        const cvPlan = FishtailWavExport.chooseCvRenderPlan(2, 3);
        const renderEstimate = FishtailWavExport.estimateRenderBytes(10, 48000);
        return {
          riff: text(wav16, 0, 4) === "RIFF" && text(wav24, 0, 4) === "RIFF",
          wave: text(wav16, 8, 12) === "WAVE" && text(wav24, 8, 12) === "WAVE",
          pcm: wav16[20] === 1 && wav16[21] === 0 && wav24[20] === 1 && wav24[21] === 0,
          mono: wav16[22] === 1 && wav16[23] === 0 && wav24[22] === 1 && wav24[23] === 0,
          rate: (wav16[24] | (wav16[25] << 8) | (wav16[26] << 16) | (wav16[27] << 24)) === 48000
            && (wav24[24] | (wav24[25] << 8) | (wav24[26] << 16) | (wav24[27] << 24)) === 48000,
          bits: wav16[34] === 16 && wav16[35] === 0 && wav24[34] === 24 && wav24[35] === 0,
          dataLength: dataBytes16 === 12 && wav16.length === 56 && dataBytes24 === 18 && wav24.length === 62,
          standardDownloads: FishtailWavExport.STANDARD_WAV_SAMPLE_RATE === 48000
            && FishtailWavExport.STANDARD_WAV_BIT_DEPTH === 24
            && standardPlan.sampleRate === 48000
            && standardPlan.estimate.wavBytes === (2 * 48000 * 3) + 44,
          tickerNormalizes: Math.abs(normalizedPeak - targetPeak) < 1e-6
            && normalization.targetDbfs === -6
            && Math.abs(normalization.afterDbfs + 6) < 0.0001,
          tickerPreRoll: FishtailWavExport.TICKER_EXPORT_PREROLL_SECONDS === 0.05
            && tickerSchedule.preRollFrames === 2400
            && tickerSchedule.events[0].scheduledFrame === 2400
            && tickerSchedule.events[0].croppedFrame === 0
            && tickerSchedule.events[0].croppedPeakFrame === Math.round(FishtailTempoLattice.TICKER_ATTACK_SECONDS * 48000)
            && tickerSchedule.events[1].croppedFrame - tickerSchedule.events[0].croppedFrame === 48000
            && tickerSchedule.events[1].croppedPeakFrame - tickerSchedule.events[0].croppedPeakFrame === 48000
            && tickerSchedule.internalFrames - tickerSchedule.preRollFrames === tickerSchedule.finalFrames,
          cvZip: cvZip[0] === 0x50 && cvZip[1] === 0x4b && cvZip[2] === 0x03 && cvZip[3] === 0x04,
          cvMath: Math.abs(FishtailWavExport.eventCvVolts({ midi: 72 }, { outputMode: "equal" }) - 1) < 1e-9
            && Math.abs(FishtailWavExport.eventCvVolts({ tunedFrequency: 864 }, { outputMode: "bend", rootMidi: 69, rootFreq: 432 }) - 1.75) < 1e-9
            && Math.abs(FishtailWavExport.eventCvSample({ midi: 72 }, { outputMode: "equal" }) - 0.2) < 1e-9,
          cvDefaults: FishtailWavExport.cvSettings({}).durationMode === "first60"
            && FishtailWavExport.cvSettings({ cvDurationMode: "full" }).durationMode === "full",
          cvVoice: cvVoice.pitch[0] === 0
            && Math.abs(cvVoice.pitch[10] - 0.2) < 1e-6
            && cvVoice.gate[0] === 1
            && cvVoice.gate[19] === 1
            && cvVoice.eventCount === 2,
          cvHardening: cvPlan.sampleRate === 48000
            && cvPlan.stemCount === 3
            && cvPlan.estimate.wavBytes === 288044
            && cvPlan.estimate.totalBytes > cvPlan.estimate.retainedWavBytes
            && cvPlan.byteLimit === FishtailWavExport.renderByteLimit()
            && Math.abs(FishtailWavExport.tickToSeconds(720, indexedTimeline) - 1.5) < 1e-9
            && cvBarClock.length === 1
            && cvPpqnClock.length === 49
            && cvRetriggerVoice.gate[997] === 1
            && cvRetriggerVoice.gate[998] === 0
            && cvRetriggerVoice.gate[1000] === 1
            && cvCalibration.length === 50
            && Math.abs(cvCalibration[0] + 0.4) < 1e-6
            && Math.abs(cvCalibration[20]) < 1e-6
            && FishtailWavExport.CV_MAX_RENDER_SECONDS === 60,
          probeShortExport: probeSeconds === FishtailTempoLattice.TEARDROP_MIN_SUSTAIN_SECONDS
            && FishtailTempoLattice.TEARDROP_MIN_SUSTAIN_SECONDS === 4
            && FishtailWavExport.PROBE_EXPORT_BARS === 2,
          zeroLevels: FishtailWavExport.levelSetting(0, 0.25) === 0
            && FishtailWavExport.levelSetting(undefined, 0.25) === 0.25,
          conservativeMemory: renderEstimate.offlineBytes > 0
            && renderEstimate.totalBytes === renderEstimate.floatBytes + renderEstimate.wavBytes + renderEstimate.offlineBytes
            && FishtailWavExport.MAX_MOBILE_RENDER_BYTES < FishtailWavExport.MAX_RENDER_BYTES,
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
          name: "visual adaptive eco lowers render load without bad glitch",
          ok: adaptiveVisual.active
            && adaptiveVisual.noBadGlitch
            && adaptiveVisual.delay === CORE_ECO_IDLE_FRAME_MS
            && adaptiveVisual.dpr === 1,
        },
        {
          name: "visual high refresh display can use native active frames",
          ok: highRefreshVisual.activeDelay === 0
            && highRefreshVisual.idleDelay === CORE_HIGH_REFRESH_IDLE_FRAME_MS,
        },
        {
          name: "visual pitch colours glide instead of snapping",
          ok: visualColorGlideAudit.constants
            && visualColorGlideAudit.targetMoved
            && visualColorGlideAudit.immediateInterpolates
            && visualColorGlideAudit.monotonicGlide
            && visualColorGlideAudit.stillGlidingAfterImmediate,
        },
        {
          name: "generation flow has no artificial ritual delay",
          ok: generationDelayRemoved,
        },
        {
          name: "tempo lattice is meter-safe deterministic and straight-safe",
          ok: timelineAudit.perMeter
            && timelineAudit.deterministic
            && timelineAudit.seedChanges
            && timelineAudit.straight
            && timelineAudit.irrationalMoves
            && timelineAudit.existingModeOutputUnchanged
            && timelineAudit.naturalSpreadDefault
            && timelineAudit.sameSeedSameDrift
            && timelineAudit.positivePulseDurations
            && timelineAudit.hybridAndSafeEndpoints
            && timelineAudit.livingEndpointsWithWanderingBars
            && timelineAudit.tempoEventsValid
            && timelineAudit.driftMetricsPresent,
        },
        {
          name: "tempo lattice conductor does not move note events",
          ok: latticeMidiAudit.noteStable
            && latticeMidiAudit.straightTempos === 1
            && latticeMidiAudit.latticeTempos > 1
            && latticeMidiAudit.manifestOk,
        },
        {
          name: "live metronome follows tempo lattice switch and shared durations",
          ok: liveMetronomeAudit.switchOffStraight
            && liveMetronomeAudit.switchOnMoves
            && liveMetronomeAudit.endpointsMatch,
        },
        {
          name: "live tempo and swing controls glide toward targets",
          ok: liveControlGlideAudit.constants
            && liveControlGlideAudit.immediateHolds
            && liveControlGlideAudit.gradualMove
            && liveControlGlideAudit.eventualTarget
            && liveControlGlideAudit.patternGlides,
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
          name: "wav encoders write mono pcm headers",
          ok: wavAudit.riff && wavAudit.wave && wavAudit.pcm && wavAudit.mono && wavAudit.rate && wavAudit.bits && wavAudit.dataLength && wavAudit.standardDownloads,
        },
        {
          name: "ticker wav normalizer targets -6 dBFS",
          ok: wavAudit.tickerNormalizes
            && wavAudit.tickerPreRoll
            && FishtailWavExport.TICKER_NORMALIZE_DBFS === -6
            && FishtailAudioEngine.METRONOME_MAX_GAIN >= 3.4,
        },
        {
          name: "wav export keeps zero levels and conservative memory estimates",
          ok: wavAudit.zeroLevels && wavAudit.conservativeMemory && wavAudit.probeShortExport,
        },
        {
          name: "analogue cv zip uses 1v octave pitch and gates",
          ok: wavAudit.cvZip
            && wavAudit.cvMath
            && wavAudit.cvDefaults
            && wavAudit.cvVoice
            && wavAudit.cvHardening
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

function runRandomStreamTests() {
  const context = makeAppContext();
  const results = vm.runInContext(`
    (() => {
      function randomSettings(overrides = {}) {
        return {
          seed: "random-streams",
          sections: structuredClone(DEFAULT_SECTIONS),
          voices: 4,
          tempo: 60,
          includeTempoMap: true,
          tempoLatticeEnabled: false,
          rationalSwing: 0,
          irrationalSwing: 0,
          irrationalFeelMode: FishtailTempoLattice.DEFAULT_IRRATIONAL_FEEL_MODE,
          referenceNote: "A4",
          referenceMidi: 69,
          referenceHz: 432,
          referenceAnchorA4Hz: 432,
          tempoDivisor: 432,
          breathing: 0.52,
          density: 0.48,
          rhythmMotion: DEFAULT_RHYTHM_MOTION,
          strangeness: 0.16,
          generationStyle: "counterpoint",
          resolution: "literal",
          outputMode: "equal",
          velocityProfile: "auto",
          dubMode: false,
          pedalVoices: { bass: false, tenor: false, alto: false, soprano: false },
          rootPc: 9,
          rootNote: "A4",
          rootMidi: 69,
          rootFreq: 432,
          ...overrides,
        };
      }

      function build(overrides = {}, beforeBuild = null) {
        const settings = randomSettings(overrides);
        const random = FishtailRandom.createRouter(settings.seed);
        if (beforeBuild) beforeBuild(random);
        return buildPiece(settings, random);
      }

      function noteSignature(piece) {
        return JSON.stringify(piece.events.map((event) => [
          event.voice,
          event.tick,
          event.duration,
          event.gridTick,
          event.gridDuration,
          event.midi,
          event.carrierMidi,
          event.symbolicOffset,
          event.bend,
          event.grooveOffsetTicks,
          event.grooveRole,
          event.phraseRole,
          event.structuralRhythm,
          event.rhythmTransform,
          event.rhythmLocalIndex,
          event.velocity,
        ]));
      }

      function pitchFormSignature(piece) {
        return JSON.stringify({
          sections: piece.manifest.sections.map((section) => ({
            bars: section.bars,
            key: section.key,
            mode: section.mode,
            meter: section.meter,
            cadence: section.cadence,
            role: section.role,
            treatment: section.treatment,
            phrasePlan: section.phrasePlan,
          })),
          subject: piece.manifest.subject,
          events: piece.events.map((event) => [
            event.voice,
            event.tick,
            event.duration,
            event.gridTick,
            event.gridDuration,
            event.midi,
            event.carrierMidi,
            event.symbolicOffset,
            event.bend,
            event.grooveOffsetTicks,
            event.grooveRole,
            event.phraseRole,
            event.structuralRhythm,
            event.rhythmTransform,
            event.rhythmLocalIndex,
          ]),
        });
      }

      const replayA = build();
      const replayB = build();
      const visualDraw = build({}, (random) => {
        random.stream("visual")();
        random.unit("visual", "fixed-flourish", 0);
      });
      const reportDraw = build({}, (random) => {
        random.stream("report")();
        random.unit("report", "sentence", 0);
      });
      const velocityAuto = build({ seed: "random-velocity", velocityProfile: "auto" });
      const velocityFlat = build({ seed: "random-velocity", velocityProfile: "flat" });
      const restProbeA = FishtailRandom.createRouter("random-streams");
      const restProbeB = FishtailRandom.createRouter("random-streams");
      restProbeB.stream("section", 0, "voice", "bass", "pitch-choice")();
      const sopranoRestA = Array.from({ length: 24 }, () => restProbeA.stream("section", 0, "voice", "soprano", "rest")());
      const sopranoRestB = Array.from({ length: 24 }, () => restProbeB.stream("section", 0, "voice", "soprano", "rest")());

      const typed = FishtailRandom.createRouter("typed-paths");
      const typedString = typed.stream("1")();
      const typedNumber = typed.stream(1)();
      const boundaryA = FishtailRandom.createRouter("typed-boundary").stream("ab", "c")();
      const boundaryB = FishtailRandom.createRouter("typed-boundary").stream("a", "bc")();
      const unitBefore = typed.unit("section", 0, "voice", "bass", "pitch-choice", 3);
      typed.stream("visual")();
      typed.stream("section", 0, "voice", "bass", "pitch-choice")();
      const unitAfter = typed.unit("section", 0, "voice", "bass", "pitch-choice", 3);

      return [
        {
          name: "same seed settings and model replay identical midi",
          ok: noteSignature(replayA) === noteSignature(replayB)
            && JSON.stringify(Array.from(replayA.midiBytes)) === JSON.stringify(Array.from(replayB.midiBytes)),
        },
        {
          name: "manifest records named random model",
          ok: replayA.manifest.randomness?.model === "named_sfc32_v1"
            && replayA.manifest.randomness?.master_seed_bits === 128
            && randomModelFromManifest({}) === "legacy_single_stream_v0"
            && randomModelFromManifest(replayA.manifest) === "named_sfc32_v1",
        },
        {
          name: "visual stream draw changes no music",
          ok: noteSignature(replayA) === noteSignature(visualDraw),
        },
        {
          name: "report stream draw changes no music",
          ok: noteSignature(replayA) === noteSignature(reportDraw),
        },
        {
          name: "bass pitch draw does not alter soprano rest stream",
          ok: JSON.stringify(sopranoRestA) === JSON.stringify(sopranoRestB),
        },
        {
          name: "velocity changes do not alter form or pitch",
          ok: pitchFormSignature(velocityAuto) === pitchFormSignature(velocityFlat)
            && JSON.stringify(velocityAuto.events.map((event) => event.velocity)) !== JSON.stringify(velocityFlat.events.map((event) => event.velocity)),
        },
        {
          name: "typed stream paths are collision safe and unit stable",
          ok: typedString !== typedNumber
            && boundaryA !== boundaryB
            && unitBefore === unitAfter,
        },
      ];
    })()
  `, context);

  const sourcePaths = [
    path.join(ROOT, "src", "app.js"),
    path.join(ROOT, "src", "random-router.js"),
    path.join(ROOT, "src", "tempo-lattice.js"),
    path.join(ROOT, "src", "audio-engine.js"),
    path.join(ROOT, "src", "wav-export.js"),
    path.join(ROOT, "src", "pitch-input.js"),
  ];
  const ambientRandomToken = ["Math", "random"].join(".");
  results.push({
    name: "source avoids ambient random API",
    ok: sourcePaths.every((sourcePath) => !fs.readFileSync(sourcePath, "utf8").includes(ambientRandomToken)),
  });

  let ok = true;
  for (const result of results) {
    const status = result.ok ? "ok" : "failed";
    console.log(`${status} random ${result.name}`);
    if (!result.ok) ok = false;
  }
  return ok;
}

function runPhaseLockedTimingTests() {
  const context = makeAppContext();
  const results = vm.runInContext(`
    (() => {
      function timingSettings(overrides = {}) {
        return {
          seed: "phase-lock",
          sections: [
            { bars: 4, key: "G", mode: "mixolydian", meter: "4/4", cadence: "dub_suspension", role: "refrain", treatment: "dubby" },
            { bars: 3, key: "C", mode: "dorian", meter: "4/4", cadence: "plagal", role: "development", treatment: "dubby" },
          ],
          voices: 4,
          tempo: 60,
          includeTempoMap: true,
          tempoLatticeEnabled: true,
          rationalSwing: 1,
          irrationalSwing: 0,
          irrationalFeelMode: FishtailTempoLattice.DEFAULT_IRRATIONAL_FEEL_MODE,
          referenceNote: "A3",
          referenceMidi: 57,
          referenceHz: 216,
          referenceAnchorA4Hz: 432,
          tempoDivisor: 216,
          breathing: 0.48,
          density: 0.5,
          rhythmMotion: 0.35,
          strangeness: 0.16,
          generationStyle: "fishtail_fugue",
          resolution: "nearest-ratio",
          outputMode: "retuner",
          velocityProfile: "auto",
          dubMode: true,
          pedalVoices: { bass: true, tenor: false, alto: false, soprano: false },
          rootPc: 7,
          rootNote: "G3",
          rootMidi: 55,
          rootFreq: 192.4314,
          ...overrides,
        };
      }

      function build(overrides = {}) {
        const settings = timingSettings(overrides);
        return buildPiece(settings, FishtailRandom.createRouter(settings.seed));
      }

      function timingSignature(piece) {
        return JSON.stringify(piece.events.map((event) => [
          event.voice,
          event.gridTick,
          event.gridDuration,
          event.tick,
          event.duration,
          event.grooveRole,
          Number((event.grooveOffsetMsRequested || 0).toFixed(4)),
          Number((event.grooveOffsetMsRealized || 0).toFixed(4)),
          event.grooveOffsetTicks,
          event.velocity,
        ]));
      }

      function totalTicks(piece) {
        return piece.sectionMeta.reduce((sum, section) => sum + section.bars * section.barTicks, 0);
      }

      function noOverlap(piece) {
        return activeVoiceLayout(piece.settings.voices).every((voice) => {
          const events = piece.events.filter((event) => event.voice === voice).sort((a, b) => a.tick - b.tick || b.duration - a.duration);
          for (let index = 1; index < events.length; index += 1) {
            if (events[index].tick < events[index - 1].tick + events[index - 1].duration) return false;
          }
          return true;
        });
      }

      function eventsInside(piece) {
        return piece.events.every((event) => {
          const section = piece.sectionMeta.find((candidate) => {
            const end = candidate.startTick + candidate.bars * candidate.barTicks;
            return event.gridTick >= candidate.startTick && event.gridTick < end;
          });
          return section
            && event.tick >= section.startTick
            && event.tick + event.duration <= section.startTick + section.bars * section.barTicks
            && event.tick >= 0
            && event.duration > 0;
        });
      }

      function structuralAuditSignature(audit) {
        const summary = audit.summary;
        return JSON.stringify({
          gridChecks: summary.gridChecks,
          strongBeatChecks: summary.strongBeatChecks,
          parallelPerfects: summary.parallelPerfects,
          cadenceChecks: summary.cadenceChecks,
          tendencyChecks: summary.tendencyChecks,
          suspensionChecks: summary.suspensionChecks,
          suspensionsDetected: summary.suspensionsDetected,
          suspensionsResolved: summary.suspensionsResolved,
          overlongSuspensions: summary.overlongSuspensions,
          pedalHolds: summary.pedalHolds,
        });
      }

      function localHalfTickMs(tick, timeline) {
        const indexed = FishtailTempoLattice.indexTempoTimeline(timeline);
        const here = FishtailTempoLattice.tickToSeconds(tick, indexed);
        const next = FishtailTempoLattice.tickToSeconds(tick + 1, indexed);
        const prev = FishtailTempoLattice.tickToSeconds(Math.max(0, tick - 1), indexed);
        const tickSeconds = Math.max(Math.abs(next - here), Math.abs(here - prev), 1e-9);
        return tickSeconds * 500;
      }

      function phaseShiftMs(gridTick, requestedMs, timeline) {
        const indexed = FishtailTempoLattice.indexTempoTimeline(timeline);
        const gridSeconds = FishtailTempoLattice.tickToSeconds(gridTick, indexed);
        const performedTick = Math.round(FishtailTempoLattice.secondsToTick(gridSeconds + requestedMs / 1000, indexed));
        const realizedMs = 1000 * (FishtailTempoLattice.tickToSeconds(performedTick, indexed) - gridSeconds);
        return { performedTick, realizedMs };
      }

      const sectionMeta = [{ bars: 1, key: "C", mode: "major", meter: "4/4", startTick: 0, barTicks: 1920, numerator: 4, denominator: 4 }];
      const latticeTimeline = FishtailTempoLattice.buildTempoTimeline(sectionMeta, timingSettings({ sections: [{ bars: 1, key: "C", mode: "major", meter: "4/4", cadence: "authentic", role: "normal", treatment: "straight" }] }), { ppq: PPQ, meters: METERS });
      const indexed = FishtailTempoLattice.indexTempoTimeline(latticeTimeline);
      const sampleTicks = [0, 120, 480, 719, 960, 1440, 1920];
      const tickRoundTrip = sampleTicks.every((tick) => Math.abs(FishtailTempoLattice.secondsToTick(FishtailTempoLattice.tickToSeconds(tick, indexed), indexed) - tick) < 1e-7);
      const secondSamples = [0, 0.02, 0.5, 1.38, 1.4, 1.42, 2.0, Math.max(0, latticeTimeline.totalSeconds - 0.001)];
      const secondsRoundTrip = secondSamples.every((seconds) => {
        const tick = Math.round(FishtailTempoLattice.secondsToTick(seconds, indexed));
        const realized = FishtailTempoLattice.tickToSeconds(tick, indexed);
        return Math.abs(realized - seconds) * 1000 <= localHalfTickMs(tick, indexed) + 0.0001;
      });
      const stretched = phaseShiftMs(120, 20, indexed);
      const compressed = phaseShiftMs(600, 20, indexed);
      const crossing = phaseShiftMs(480, -20, indexed);

      const replayA = build({ seed: "phase-lock-replay" });
      const replayB = build({ seed: "phase-lock-replay" });
      const directTimeline = FishtailTempoLattice.buildTempoTimeline(replayA.sectionMeta, replayA.settings, { ppq: PPQ, meters: METERS });
      const scoreEvents = replayA.events.map((event) => ({
        ...event,
        tick: event.gridTick,
        duration: event.gridDuration,
        grooveOffsetTicks: 0,
        grooveOffsetMsRealized: 0,
      }));
      const scoreAudit = checkGeneratedPiece(replayA.settings, replayA.sectionMeta, scoreEvents, replayA.midiBytes, totalTicks(replayA), []);
      const flatPiece = build({ seed: "phase-lock-flat", tempoLatticeEnabled: false, rationalSwing: 0, irrationalSwing: 0 });
      const suspendedPiece = build({ seed: "phase-lock-suspended", includeTempoMap: false, tempoLatticeEnabled: true, rationalSwing: 1, irrationalSwing: 0.2 });

      const generatedQuantized = replayA.events
        .filter((event) => event.grooveRole && Math.abs(event.grooveOffsetMsRequested || 0) > 0)
        .every((event) => Math.abs(event.grooveOffsetMsRealized - event.grooveOffsetMsRequested) <= localHalfTickMs(event.tick, replayA.tempoTimeline) + 0.0001);

      const flatCompatible = flatPiece.events
        .filter((event) => event.grooveRole)
        .every((event) => {
          const requested = Number(event.grooveOffsetMsRequested) || 0;
          const expected = requested === 0 ? 0 : Math.sign(requested) * msToTicks(Math.abs(requested), flatPiece.settings);
          return Math.abs(event.grooveOffsetTicks - expected) <= 1;
        });

      const cvMidiClockShared = replayA.events
        .filter((event) => event.grooveRole)
        .slice(0, 20)
        .every((event) => Math.abs(
          FishtailTempoLattice.tickToSeconds(event.tick, replayA.tempoTimeline)
          - FishtailWavExport.tickToSeconds(event.tick, replayA.tempoTimeline)
        ) < 1e-12);

      return [
        {
          name: "tempo clock conversions are invertible within quantization",
          ok: tickRoundTrip && secondsRoundTrip,
        },
        {
          name: "requested milliseconds survive stretched and compressed segments",
          ok: Math.abs(stretched.realizedMs - 20) <= localHalfTickMs(stretched.performedTick, indexed) + 0.0001
            && Math.abs(compressed.realizedMs - 20) <= localHalfTickMs(compressed.performedTick, indexed) + 0.0001,
        },
        {
          name: "early offsets can cross into preceding segment",
          ok: crossing.performedTick < 480
            && Math.abs(crossing.realizedMs + 20) <= localHalfTickMs(crossing.performedTick, indexed) + 0.0001,
        },
        {
          name: "same seed and settings replay phase-locked timing",
          ok: timingSignature(replayA) === timingSignature(replayB)
            && JSON.stringify(Array.from(replayA.midiBytes)) === JSON.stringify(Array.from(replayB.midiBytes))
            && replayA.manifest.timing_model?.version === "phase_locked_seconds_v1",
        },
        {
          name: "generated DUB offsets are nearest-tick real milliseconds",
          ok: generatedQuantized
            && replayA.events.some((event) => event.grooveRole && event.grooveOffsetMsRequested !== 0 && event.gridTick !== event.tick)
            && replayA.manifest.dub_groove.max_offset_ms_requested > 0
            && replayA.manifest.dub_groove.max_quantization_error_ms >= 0,
        },
        {
          name: "bar endpoints and conductor events are unchanged",
          ok: JSON.stringify(replayA.tempoTimeline.tempoEvents) === JSON.stringify(directTimeline.tempoEvents)
            && replayA.tempoTimeline.barEndpointsPreserved === directTimeline.barEndpointsPreserved
            && replayA.tempoTimeline.endpointsPreserved === directTimeline.endpointsPreserved,
        },
        {
          name: "performance timing keeps output events valid",
          ok: eventsInside(replayA)
            && noOverlap(replayA)
            && replayA.audit.issues.length === 0,
        },
        {
          name: "MIDI and CV use the same onset clock",
          ok: cvMidiClockShared,
        },
        {
          name: "structural audit is stable under performance timing",
          ok: structuralAuditSignature(replayA.audit) === structuralAuditSignature(scoreAudit),
        },
        {
          name: "lattice disabled matches legacy flat millisecond conversion",
          ok: flatCompatible,
        },
        {
          name: "tempo map off suspends lattice for phase lock",
          ok: suspendedPiece.tempoTimeline.enabled === false
            && suspendedPiece.manifest.tempo_lattice.requested === true
            && suspendedPiece.manifest.tempo_lattice.enabled === false
            && suspendedPiece.manifest.tempo_lattice.suspended_for_midi_phase_lock === true
            && suspendedPiece.manifest.timing_model.cross_format_phase_locked === true
            && suspendedPiece.report.includes("suspended for flat MIDI clock"),
        },
      ];
    })()
  `, context);

  let ok = true;
  for (const result of results) {
    const status = result.ok ? "ok" : "failed";
    console.log(`${status} phase-lock ${result.name}`);
    if (!result.ok) ok = false;
  }
  return ok;
}

function runRhythmTests() {
  const context = makeAppContext();
  const results = vm.runInContext(`
    (() => {
      function rhythmSettings(overrides = {}) {
        return {
          seed: "rhythm-fixture",
          voices: 4,
          tempo: 60,
          includeTempoMap: true,
          tempoLatticeEnabled: true,
          rationalSwing: 0,
          irrationalSwing: 0,
          referenceNote: "A3",
          referenceMidi: 57,
          referenceHz: 216,
          referenceAnchorA4Hz: 432,
          tempoDivisor: 216,
          breathing: 0.48,
          density: 0.42,
          rhythmMotion: 0.42,
          strangeness: 0.16,
          generationStyle: "invention",
          resolution: "literal",
          outputMode: "equal",
          dubMode: false,
          pedalVoices: { bass: false, tenor: false, alto: false, soprano: false },
          rootPc: 0,
          rootNote: "C4",
          rootMidi: 60,
          rootFreq: 261.6256,
          sections: [
            { bars: 4, key: "C", mode: "major", meter: "4/4", cadence: "authentic", role: "normal", treatment: "straight" },
            { bars: 4, key: "G", mode: "mixolydian", meter: "4/4", cadence: "plagal", role: "normal", treatment: "straight" },
          ],
          ...overrides,
        };
      }

      function build(overrides = {}) {
        const settings = rhythmSettings(overrides);
        return buildPiece(settings, FishtailRandom.createRouter(settings.seed));
      }

      function eventSignature(piece) {
        return JSON.stringify(piece.events.map((event) => ({
          voice: event.voice,
          tick: event.tick,
          gridTick: event.gridTick,
          duration: event.duration,
          gridDuration: event.gridDuration,
          midi: event.midi,
          rhythm: event.structuralRhythm,
          transform: event.rhythmTransform,
        })));
      }

      function sectionForEvent(piece, event) {
        return piece.sectionMeta.find((section) => event.tick >= section.startTick && event.tick < section.startTick + section.bars * section.barTicks);
      }

      function noOverlap(piece) {
        return activeVoiceLayout(piece.settings.voices).every((voice) => {
          const events = piece.events.filter((event) => event.voice === voice).sort((a, b) => a.tick - b.tick || b.duration - a.duration);
          for (let index = 1; index < events.length; index += 1) {
            if (events[index].tick < events[index - 1].tick + events[index - 1].duration) return false;
          }
          return true;
        });
      }

      function endpointsExact(piece) {
        const total = piece.sectionMeta.reduce((sum, section) => sum + section.bars * section.barTicks, 0);
        return total === piece.sectionMeta[piece.sectionMeta.length - 1].startTick + piece.sectionMeta[piece.sectionMeta.length - 1].bars * piece.sectionMeta[piece.sectionMeta.length - 1].barTicks
          && piece.manifest.rhythm.bar_section_endpoints_preserved === true;
      }

      function allEventsInsideSections(piece) {
        return piece.events.every((event) => {
          const section = sectionForEvent(piece, event);
          return section && event.tick + event.duration <= section.startTick + section.bars * section.barTicks;
        });
      }

      function allIntegerDurations(piece) {
        return piece.events.every((event) => Number.isInteger(event.tick) && event.tick >= 0 && Number.isInteger(event.duration) && event.duration > 0);
      }

      function legacyAligned(piece) {
        return piece.events.every((event) => {
          const section = sectionForEvent(piece, event);
          if (!section) return false;
          const pulse = section.barTicks / section.numerator;
          return event.gridTick % pulse === 0 && event.gridDuration % pulse === 0 && event.structuralRhythm === false;
        });
      }

      const sameA = build({ seed: "rhythm-same", rhythmMotion: 0.44 });
      const sameB = build({ seed: "rhythm-same", rhythmMotion: 0.44 });
      const legacy = build({ seed: "rhythm-legacy", rhythmMotion: 0 });
      const moderatePieces = ["rhythm-flow-a", "rhythm-flow-b", "rhythm-flow-c", "rhythm-flow-d"].map((seed) => build({ seed, rhythmMotion: 0.46 }));
      const dubPiece = build({
        seed: "rhythm-dub-after",
        rhythmMotion: 0.46,
        generationStyle: "fishtail_fugue",
        dubMode: true,
        outputMode: "retuner",
        resolution: "nearest-ratio",
        pedalVoices: { bass: true, tenor: false, alto: false, soprano: false },
      });
      const meters = ["2/2", "3/4", "4/4", "6/8", "7/8", "9/8"].map((meter) => build({
        seed: \`rhythm-meter-\${meter}\`,
        rhythmMotion: 0.38,
        sections: [
          { bars: meter === "2/2" ? 5 : 4, key: "C", mode: "major", meter, cadence: "authentic", role: "normal", treatment: "straight" },
          { bars: 3, key: "F", mode: "dorian", meter, cadence: "plagal", role: "normal", treatment: "straight" },
        ],
      }));
      const source = sameA.manifest.rhythm.source_cell;

      return [
        {
          name: "same seed gives identical rhythm events",
          ok: JSON.stringify(sameA.manifest.rhythm.source_cell) === JSON.stringify(sameB.manifest.rhythm.source_cell)
            && eventSignature(sameA) === eventSignature(sameB),
        },
        {
          name: "source cell sums to declared span",
          ok: source.durations.reduce((sum, duration) => sum + duration, 0) === source.totalUnits
            && source.totalUnits === source.spanPulses * source.subdivisionsPerPulse,
        },
        {
          name: "ticks and durations are positive integers",
          ok: allIntegerDurations(sameA) && allIntegerDurations(dubPiece) && meters.every(allIntegerDurations),
        },
        {
          name: "events stay inside section boundaries",
          ok: allEventsInsideSections(sameA) && allEventsInsideSections(dubPiece) && meters.every(allEventsInsideSections),
        },
        {
          name: "same voice events do not overlap",
          ok: noOverlap(sameA) && noOverlap(dubPiece) && meters.every(noOverlap),
        },
        {
          name: "bar and section endpoints remain exact",
          ok: endpointsExact(sameA) && endpointsExact(dubPiece) && meters.every(endpointsExact),
        },
        {
          name: "rhythm motion zero keeps legacy grid",
          ok: legacy.manifest.rhythm.enabled === false
            && legacy.manifest.rhythm.off_pulse_attacks === 0
            && legacyAligned(legacy),
        },
        {
          name: "moderate rhythm motion produces off-pulse attacks",
          ok: moderatePieces.some((piece) => piece.manifest.rhythm.off_pulse_attacks > 0)
            && moderatePieces.some((piece) => piece.events.some((event) => event.structuralRhythm && event.gridTick % PPQ !== 0)),
        },
        {
          name: "dub groove is after structural rhythm",
          ok: dubPiece.manifest.rhythm.dub_microtiming_layer === "applied_after_structural_rhythm"
            && dubPiece.events.some((event) => event.structuralRhythm)
            && dubPiece.events.some((event) => event.grooveRole && event.gridTick !== event.tick),
        },
        {
          name: "representative meters validate without fatal rhythm issues",
          ok: meters.every((piece) => piece.audit.issues.length === 0 && piece.manifest.rhythm.bar_section_endpoints_preserved),
        },
      ];
    })()
  `, context);

  let ok = true;
  for (const result of results) {
    const status = result.ok ? "ok" : "failed";
    console.log(`${status} rhythm ${result.name}`);
    if (!result.ok) ok = false;
  }
  return ok;
}

function runVelocityTests() {
  const context = makeAppContext();
  context.validateMidiBytes = (bytes, options) => validateMidiBytes(Buffer.from(bytes), options);
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
        return buildPiece(settings, FishtailRandom.createRouter(settings.seed));
      }

      function buildWithSettings(settings) {
        return buildPiece(settings, FishtailRandom.createRouter(settings.seed));
      }

      function stubProjectEls() {
        Object.assign(els, {
          formStateNameInput: { value: "Expression Test" },
          tempoDivisorInput: { value: "220" },
          tempoInput: { value: "60.0000" },
          tempoLatticeInput: { checked: true },
          rationalSwingInput: { value: "0" },
          irrationalSwingInput: { value: "0" },
          irrationalFeelInput: { value: "living_drift" },
          referenceNoteInput: { value: "A3" },
          referenceFreqInput: { value: "220.00" },
          styleInput: { value: "counterpoint" },
          voicesInput: { value: "4" },
          pedalBassInput: { checked: false },
          pedalTenorInput: { checked: false },
          pedalAltoInput: { checked: false },
          pedalSopranoInput: { checked: false },
          velocityModeInput: { checked: true },
          dubModeInput: { checked: false },
          breathingInput: { value: "74" },
          densityInput: { value: "26" },
          rhythmMotionInput: { value: "18" },
          strangenessInput: { value: "16" },
          resolutionInput: { value: "literal" },
          outputModeInput: { value: "equal" },
          rootNoteInput: { value: "A" },
          rootFreqInput: { value: "440" },
          linkRootInput: { checked: true },
        });
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

      function structuralNonVelocitySignature(piece) {
        return JSON.stringify(piece.events.filter((event) => !event.bloomLane && !event.nonStructural).map((event) => ({
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
      const defaultExpression = normalizeSection({ bars: 4, key: "C", mode: "major", meter: "4/4", cadence: "authentic", role: "development", treatment: "dubby" }, 1).expression;

      stubProjectEls();
      state.sections = [
        normalizeSection({
          bars: 2,
          key: "C",
          mode: "major",
          meter: "4/4",
          cadence: "authentic",
          role: "normal",
          treatment: "straight",
          expression: {
            velocityContour: "arch",
            registerSpread: 0.82,
            voicingLift: 0.35,
            pressureDensity: 0.68,
            keyboardBloom: true,
          },
        }, 0),
      ];
      state.selectedSectionIndex = 0;
      const savedExpressionSnapshot = formStateSnapshot("Expression Test");
      const loadedExpression = loadedFormSections(savedExpressionSnapshot).map((section, index) => normalizeSection(section, index))[0].expression;
      const legacyBloomExpression = normalizeSectionExpression({ wholeKeyboardSam: true });
      const directBloomExpression = normalizeSectionExpression({ keyboardBloom: true });
      const oldProjectExpression = loadedFormSections({ form: { sections: [{ bars: 2, key: "C", mode: "major", meter: "4/4", cadence: "authentic", role: "normal", treatment: "straight" }] } })
        .map((section, index) => normalizeSection(section, index))[0].expression;

      const naturalSettings = velocitySettings("auto", "velocity-expression");
      naturalSettings.sections = structuredClone(DEFAULT_SECTIONS).slice(0, 3);
      const expressionSettings = velocitySettings("auto", "velocity-expression");
      expressionSettings.sections = structuredClone(DEFAULT_SECTIONS).slice(0, 3).map((section, index) => ({
        ...section,
        expression: index === 0
          ? { ...SECTION_EXPRESSION_DEFAULTS, velocityContour: "rise" }
          : { ...SECTION_EXPRESSION_DEFAULTS },
      }));
      const naturalExpressionPiece = buildWithSettings(naturalSettings);
      const contourExpressionPiece = buildWithSettings(expressionSettings);
      const pressureNullSettings = velocitySettings("auto", "velocity-expression");
      pressureNullSettings.sections = structuredClone(DEFAULT_SECTIONS).slice(0, 3).map((section) => ({
        ...section,
        expression: { ...SECTION_EXPRESSION_DEFAULTS, pressureDensity: null },
      }));
      const pressureNullPiece = buildWithSettings(pressureNullSettings);
      const bloomOffSettings = velocitySettings("auto", "velocity-expression");
      bloomOffSettings.sections = structuredClone(DEFAULT_SECTIONS).slice(0, 3).map((section) => ({
        ...section,
        expression: { ...SECTION_EXPRESSION_DEFAULTS, keyboardBloom: false },
      }));
      const bloomOffPiece = buildWithSettings(bloomOffSettings);
      const bloomLowPressureSettings = velocitySettings("auto", "velocity-expression");
      bloomLowPressureSettings.sections = structuredClone(DEFAULT_SECTIONS).slice(0, 3).map((section, index) => ({
        ...section,
        expression: index === 0
          ? { ...SECTION_EXPRESSION_DEFAULTS, pressureDensity: 0.6, registerSpread: 0.86, voicingLift: 0.28, keyboardBloom: true }
          : { ...SECTION_EXPRESSION_DEFAULTS },
      }));
      const bloomLowPressurePiece = buildWithSettings(bloomLowPressureSettings);
      const bloomOnSettings = velocitySettings("auto", "velocity-expression");
      bloomOnSettings.sections = structuredClone(DEFAULT_SECTIONS).slice(0, 3).map((section, index) => ({
        ...section,
        expression: index === 0
          ? { ...SECTION_EXPRESSION_DEFAULTS, pressureDensity: 0.92, registerSpread: 0.86, voicingLift: 0.28, keyboardBloom: true }
          : { ...SECTION_EXPRESSION_DEFAULTS },
      }));
      const bloomOnPiece = buildWithSettings(bloomOnSettings);
      const bloomOnMidi = validateMidiBytes(bloomOnPiece.midiBytes, {
        expectedTracks: 1 + activeVoiceLayout(bloomOnPiece.settings.voices).length + Object.values(bloomOnPiece.manifest.section_expression?.events_by_lane || {}).filter(Boolean).length,
        allowBendEvents: false,
      });

      const cMajorSection = { bars: 1, key: "C", mode: "major", meter: "4/4", cadence: "authentic" };
      const rootPosition = classifyVerticalSonority([
        { midi: 48, symbolicOffset: 0, voice: "bass" },
        { midi: 52, symbolicOffset: 4, voice: "tenor" },
        { midi: 55, symbolicOffset: 7, voice: "alto" },
      ], cMajorSection, "major");
      const firstInversion = classifyVerticalSonority([
        { midi: 52, symbolicOffset: 4, voice: "bass" },
        { midi: 55, symbolicOffset: 7, voice: "tenor" },
        { midi: 60, symbolicOffset: 0, voice: "alto" },
      ], cMajorSection, "major");
      const secondInversion = classifyVerticalSonority([
        { midi: 43, symbolicOffset: 7, voice: "bass" },
        { midi: 48, symbolicOffset: 0, voice: "tenor" },
        { midi: 52, symbolicOffset: 4, voice: "alto" },
      ], cMajorSection, "major");
      const firstInversionRootSupport = evaluateSupportBloomCandidate({ midi: 72, symbolicOffset: 0, functionRole: "root" }, firstInversion, cMajorSection, "major");
      const leadingToneBass = classifyVerticalSonority([
        { midi: 47, symbolicOffset: 11, voice: "bass" },
        { midi: 50, symbolicOffset: 2, voice: "tenor" },
        { midi: 55, symbolicOffset: 7, voice: "alto" },
      ], cMajorSection, "major");
      const leadingToneDoubling = evaluateSupportBloomCandidate({ midi: 59, symbolicOffset: 11 }, leadingToneBass, cMajorSection, "major");
      const secondInversionBassSupport = evaluateSupportBloomCandidate({ midi: 55, symbolicOffset: 7, functionRole: "fifth" }, secondInversion, cMajorSection, "major");
      const secondInversionFourth = evaluateSupportBloomCandidate({ midi: 60, symbolicOffset: 0, functionRole: "root" }, secondInversion, cMajorSection, "major");
      const fourthOutsideContext = evaluateSupportBloomCandidate({ midi: 65, symbolicOffset: 5 }, rootPosition, cMajorSection, "major");
      const friendlySixth = evaluateSupportBloomCandidate({ midi: 69, symbolicOffset: 9 }, rootPosition, cMajorSection, "major");
      const friendlySixthInfo = classifyCandidateFunction({ midi: 69, symbolicOffset: 9 }, rootPosition, cMajorSection, "major");
      const seventhSonority = classifyVerticalSonority([
        { midi: 48, symbolicOffset: 0, voice: "bass" },
        { midi: 52, symbolicOffset: 4, voice: "tenor" },
        { midi: 55, symbolicOffset: 7, voice: "alto" },
        { midi: 58, symbolicOffset: 10, voice: "soprano" },
      ], cMajorSection, "major");
      const seventhDoubling = evaluateSupportBloomCandidate({ midi: 70, symbolicOffset: 10, functionRole: "seventh" }, seventhSonority, cMajorSection, "major");
      const leadingToneSupport = evaluateSupportBloomCandidate({ midi: 71, symbolicOffset: 11 }, rootPosition, cMajorSection, "major");
      const lowThird = evaluateSupportBloomCandidate({ midi: 40, symbolicOffset: 4, functionRole: "third" }, rootPosition, cMajorSection, "major");
      const octaveTrackingRejected = wouldCreateParallelPerfect(
        { midi: 74, symbolicOffset: 2, lane: "bloom_octave_echo" },
        { midi: 72, symbolicOffset: 0, lane: "bloom_octave_echo" },
        { midi: 60, symbolicOffset: 0, voice: "soprano" },
        { midi: 62, symbolicOffset: 2, voice: "soprano" },
      );
      const acceptedObliqueSupport = evaluateSupportBloomCandidate(
        { midi: 69, symbolicOffset: 9 },
        rootPosition,
        cMajorSection,
        "major",
        {
          lanePrevious: { midi: 67, symbolicOffset: 7 },
          structuralPreviousSnapshot: [{ midi: 48, symbolicOffset: 0 }],
          structuralCurrentSnapshot: [{ midi: 48, symbolicOffset: 0 }],
        },
      );

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
        {
          name: "expression defaults",
          ok: defaultExpression.velocityContour === "natural"
            && defaultExpression.registerSpread === 0.5
            && defaultExpression.voicingLift === 0
            && defaultExpression.pressureDensity === null
            && defaultExpression.keyboardBloom === false,
        },
        {
          name: "save/load expression JSON",
          ok: savedExpressionSnapshot.form.sections[0].expression.velocityContour === "arch"
            && savedExpressionSnapshot.form.sections[0].expression.keyboardBloom === true
            && !("wholeKeyboardSam" in savedExpressionSnapshot.form.sections[0].expression)
            && loadedExpression.velocityContour === "arch"
            && loadedExpression.registerSpread === 0.82
            && loadedExpression.voicingLift === 0.35
            && loadedExpression.pressureDensity === 0.68
            && loadedExpression.keyboardBloom === true,
        },
        {
          name: "legacy bloom expression compatibility",
          ok: legacyBloomExpression.keyboardBloom === true
            && directBloomExpression.keyboardBloom === true,
        },
        {
          name: "old project expression compatibility",
          ok: oldProjectExpression.velocityContour === "natural"
            && oldProjectExpression.registerSpread === 0.5
            && oldProjectExpression.voicingLift === 0
            && oldProjectExpression.pressureDensity === null
            && oldProjectExpression.keyboardBloom === false,
        },
        {
          name: "velocity contour output stays MIDI safe",
          ok: contourExpressionPiece.audit.issues.length === 0
            && contourExpressionPiece.events.every((event) => Number.isInteger(event.velocity) && event.velocity >= 1 && event.velocity <= 127)
            && nonVelocitySignature(contourExpressionPiece) === nonVelocitySignature(naturalExpressionPiece)
            && JSON.stringify(contourExpressionPiece.events.map((event) => event.velocity)) !== JSON.stringify(naturalExpressionPiece.events.map((event) => event.velocity))
            && contourExpressionPiece.manifest.section_expression?.active_sections === 1
            && contourExpressionPiece.manifest.section_expression?.velocity_events_shaped > 0
            && contourExpressionPiece.report.includes("Section Expression:"),
        },
        {
          name: "pressure null preserves prior non-velocity signature",
          ok: nonVelocitySignature(pressureNullPiece) === nonVelocitySignature(naturalExpressionPiece)
            && pressureNullPiece.manifest.section_expression?.pressure_events_affected === 0,
        },
        {
          name: "energy contour changes velocity only",
          ok: nonVelocitySignature(contourExpressionPiece) === nonVelocitySignature(naturalExpressionPiece)
            && contourExpressionPiece.manifest.section_expression?.energy_contours?.rise === 1,
        },
        {
          name: "first inversion allows safe root-as-sixth support",
          ok: firstInversion.inversion === "first_inversion"
            && firstInversionRootSupport.ok
            && firstInversionRootSupport.functionInfo.firstInversionRootAsSixth,
        },
        {
          name: "first inversion does not double leading-tone bass",
          ok: leadingToneDoubling.ok === false
            && leadingToneDoubling.reason === "leading_tone_doubling",
        },
        {
          name: "second inversion prefers bass support and rejects fourth-above-bass Bloom",
          ok: secondInversion.inversion === "second_inversion"
            && secondInversionBassSupport.ok
            && secondInversionFourth.ok === false
            && secondInversionFourth.counters.fourth_above_bass_drops === 1,
        },
        {
          name: "fourth-above-bass candidate is rejected outside suspension context",
          ok: fourthOutsideContext.ok === false
            && fourthOutsideContext.reason === "fourth_above_bass_without_context",
        },
        {
          name: "sixth consonance can be allowed without automatic doubling",
          ok: friendlySixth.ok
            && friendlySixthInfo.sixthAboveBass
            && friendlySixthInfo.function === "modal_colour",
        },
        {
          name: "seventh chord candidate does not double seventh",
          ok: seventhDoubling.ok === false
            && seventhDoubling.reason === "chordal_seventh_doubling",
        },
        {
          name: "leading tone is never doubled by Bloom",
          ok: leadingToneSupport.ok === false
            && leadingToneSupport.reason === "leading_tone_doubling",
        },
        {
          name: "low third below MIDI 48 is rejected",
          ok: lowThird.ok === false
            && lowThird.reason === "low_third_below_48",
        },
        {
          name: "continuous octave echo tracking is rejected",
          ok: octaveTrackingRejected === true,
        },
        {
          name: "no accepted Bloom event creates consecutive fifths or octaves with structural voices",
          ok: acceptedObliqueSupport.ok
            && acceptedObliqueSupport.counters.parallel_gate_drops === 0,
        },
        {
          name: "Keyboard Bloom off adds no Bloom events",
          ok: bloomOffPiece.manifest.section_expression?.keyboard_bloom_status === "off"
            && bloomOffPiece.manifest.section_expression?.support_events_added === 0
            && nonVelocitySignature(bloomOffPiece) === nonVelocitySignature(naturalExpressionPiece),
        },
        {
          name: "Keyboard Bloom below threshold adds no Bloom events",
          ok: bloomLowPressurePiece.manifest.section_expression?.keyboard_bloom_status === KEYBOARD_BLOOM_STATUS_NO_SAFE_CANDIDATES
            && bloomLowPressurePiece.manifest.section_expression?.support_events_added === 0
            && bloomLowPressurePiece.manifest.section_expression?.pressure_events_affected === 0
            && !bloomLowPressurePiece.events.some((event) => event.bloomLane)
            && structuralNonVelocitySignature(bloomLowPressurePiece) === structuralNonVelocitySignature(naturalExpressionPiece),
        },
        {
          name: "Keyboard Bloom on adds guarded non-structural support events",
          ok: bloomOnPiece.manifest.section_expression?.keyboard_bloom_status === KEYBOARD_BLOOM_STATUS_ACTIVE
            && bloomOnPiece.manifest.section_expression?.keyboard_bloom_sections?.includes(1)
            && bloomOnPiece.manifest.section_expression?.support_events_added > 0
            && bloomOnPiece.manifest.section_expression?.pressure_events_affected > 0
            && bloomOnPiece.manifest.section_expression?.parallel_gate_drops >= 0
            && bloomOnPiece.events.some((event) => event.bloomLane && event.nonStructural)
            && bloomOnPiece.events.every((event) => !event.bloomLane || event.velocity < 80)
            && structuralNonVelocitySignature(bloomOnPiece) === structuralNonVelocitySignature(naturalExpressionPiece)
            && bloomOnPiece.report.includes("Keyboard Bloom added")
            && bloomOnMidi.ok
            && nonVelocitySignature(bloomOnPiece) !== nonVelocitySignature(naturalExpressionPiece),
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
    const rate = options.sampleRate || sampleRate;
    const length = options.frameLength || frameLength;
    const frame = new Float32Array(length);
    const amp = options.amp ?? 0.55;
    const harmonics = options.harmonics || [[1, 1]];
    const vibratoCents = options.vibratoCents || 0;
    const vibratoHz = options.vibratoHz || 5;
    const attackFrames = options.attackFrames || 0;
    const dc = options.dc || 0;
    for (let i = 0; i < frame.length; i += 1) {
      const t = i / rate;
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

  const fftAudit = [
    [44100, 8192],
    [48000, 8192],
    [88200, 16384],
    [96000, 16384],
    [192000, 32768],
  ].every(([rate, expected]) => pitch.chooseInputFftSize(rate) === expected);
  results.push({ name: "sizes analyser window for high sample rates", ok: fftAudit });

  [
    [88200, 55],
    [96000, 30],
    [96000, 55],
    [192000, 30],
    [192000, 55],
  ].forEach(([rate, freq]) => {
    const length = pitch.chooseInputFftSize(rate);
    const highRateScratch = pitch.makeScratch();
    const result = pitch.detectPitch(frameFor(freq, { sampleRate: rate, frameLength: length }), rate, { range: "bass" }, highRateScratch);
    results.push({
      name: `detects ${freq} Hz at ${rate / 1000} kHz`,
      ok: result.ok && centsError(result.frequency, freq) < (freq <= 30 ? 30 : 18),
    });
  });

  const short96k = pitch.detectPitch(frameFor(55, { sampleRate: 96000, frameLength: 8192 }), 96000, { range: "bass" }, pitch.makeScratch());
  results.push({
    name: "short high-rate input does not clamp final sample",
    ok: short96k.ok && short96k.detectorSampleRate > pitch.DETECTOR_SAMPLE_RATE && centsError(short96k.frequency, 55) < 24,
  });

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

  const oneFrameStats = pitch.pitchStats([{ at: now, ok: true, frequency: 216, confidence: 0.99 }], now);
  const shortSpanStats = pitch.pitchStats(history.slice(-5).map((entry, index) => ({ ...entry, at: now - (4 - index) * 40 })), now);
  results.push({
    name: "requires enough reliable pitch history before capture",
    ok: !oneFrameStats.ok
      && oneFrameStats.reason === "collecting-reliable-history"
      && !shortSpanStats.ok
      && shortSpanStats.reason === "collecting-reliable-history",
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
        return buildPiece(settings, FishtailRandom.createRouter(settings.seed));
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
  const appJs = fs.readFileSync(path.join(ROOT, "src", "app.js"), "utf8");
  const audioEngineJs = fs.readFileSync(path.join(ROOT, "src", "audio-engine.js"), "utf8");
  const wavExportJs = fs.readFileSync(path.join(ROOT, "src", "wav-export.js"), "utf8");
  const pitchInputJs = fs.readFileSync(path.join(ROOT, "src", "pitch-input.js"), "utf8");
  const readmeMd = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  const styleOptionOk = indexHtml.includes('<option value="fishtail_fugue">Fishtail Fugue</option>');
  const tempoDefaultOk = indexHtml.includes('id="tempoInput" type="text" value="60.0000"')
    && indexHtml.includes('id="tempoDivisorLabel">n = 220</span>')
    && indexHtml.includes('id="tempoDivisorInput" type="range" min="60" max="440" step="1" value="220"')
    && indexHtml.includes('meter 5/4 from form 1')
    && indexHtml.includes('first share 0.333')
    && indexHtml.includes('id="referenceFreqInput" type="number" min="20" max="2000" step="any" inputmode="decimal" value="220.00" readonly')
    && stylesCss.includes("#tempoDivisorInput")
    && stylesCss.includes("direction: rtl")
    && appJs.includes("const DEFAULT_A4_HZ = 440")
    && appJs.includes("const DEFAULT_REFERENCE_HZ = 220")
    && appJs.includes("const DEFAULT_TEMPO_DIVISOR = 220");
  const variedLabelOk = indexHtml.includes("Varied") && !indexHtml.includes("Strange");
  const notesClosedOk = indexHtml.includes('class="toolbar-icon-button notes-toggle-button" id="toggleNotesButton" type="button" title="Show generation notes" aria-label="Show generation notes"')
    && indexHtml.includes('<section class="panel output-panel" id="notesPanel" hidden>');
  const velocitySwitchOk = indexHtml.includes('id="velocityModeInput" type="checkbox" checked')
    && indexHtml.includes("Gravity velocity");
  const settingsMenuOk = indexHtml.includes("<title>Fishtail MIDI Generator</title>")
    && indexHtml.includes('<h1 class="brand-title">Fishtail MIDI Generator</h1>')
    && indexHtml.includes("settings-app-menu")
    && indexHtml.includes("amy_cin Fishtail generator")
    && indexHtml.indexOf('id="settingsModal"') < indexHtml.indexOf('id="helpButton"')
    && indexHtml.indexOf('id="settingsModal"') < indexHtml.indexOf('id="creditsButton"')
    && indexHtml.indexOf('id="settingsModal"') < indexHtml.indexOf('id="dubModeInput"')
    && indexHtml.includes('id="guideButton" type="button">Guide</button>')
    && indexHtml.includes('id="guideModal" hidden aria-labelledby="guideTitle"')
    && indexHtml.includes('id="closeGuideButton" type="button" title="Close guide" aria-label="Close guide"')
    && indexHtml.includes('class="guide-frame" src="docs/FISHTAIL_USER_GUIDE.html"')
    && indexHtml.includes("settings-dub-switch")
    && indexHtml.includes("<span>DUB</span>")
    && !indexHtml.slice(indexHtml.indexOf('<header class="topbar"'), indexHtml.indexOf('<section class="control-grid app-surface-shell">')).includes('id="dubModeInput"')
    && !indexHtml.slice(indexHtml.indexOf('<header class="topbar"'), indexHtml.indexOf('<section class="control-grid app-surface-shell">')).includes('id="helpButton"')
    && !indexHtml.slice(indexHtml.indexOf('<header class="topbar"'), indexHtml.indexOf('<section class="control-grid app-surface-shell">')).includes('id="creditsButton"')
    && !indexHtml.slice(indexHtml.indexOf('<div class="floating-menu"'), indexHtml.indexOf('<section class="instrument"')).includes('id="dubModeInput"')
    && !indexHtml.slice(indexHtml.indexOf('<div class="floating-menu"'), indexHtml.indexOf('<section class="instrument"')).includes('id="tempoDivisorLabel"')
    && stylesCss.includes(".settings-dub-switch .switch-track {\n  display: none;")
    && stylesCss.includes(".settings-app-menu")
    && stylesCss.includes(".guide-card")
    && appJs.includes("function focusVisibleControl(")
    && appJs.includes("function restoreSettingsAfterChildModal(")
    && appJs.includes("function openGuide(");
  const surfaceShellOk = indexHtml.includes('class="app-surface-tab is-active" id="logicSurfaceTab" type="button" role="tab" aria-selected="true" aria-controls="logicSurface"')
    && indexHtml.includes('class="app-surface-tab" id="feelSurfaceTab" type="button" role="tab" aria-selected="false" aria-controls="feelSurface" tabindex="-1"')
    && indexHtml.includes('class="app-surface logic-surface is-active" id="logicSurface" role="tabpanel" aria-labelledby="logicSurfaceTab"')
    && indexHtml.includes('class="app-surface feel-surface" id="feelSurface" role="tabpanel" aria-labelledby="feelSurfaceTab" hidden')
    && indexHtml.includes('class="panel action-panel visual-panel resonance-aperture"')
    && indexHtml.includes("<h2>Pitch and Tempi</h2>")
    && indexHtml.indexOf('id="notesPanel"') > indexHtml.indexOf('id="logicSurface"')
    && indexHtml.indexOf("<h3>Pitch Behaviour</h3>") > indexHtml.indexOf('id="settingsModal"')
    && stylesCss.includes(".app-surface-tabs")
    && stylesCss.includes(".app-surface[hidden]")
    && stylesCss.includes(".logic-surface")
    && stylesCss.includes(".feel-surface")
    && stylesCss.includes(".feel-surface .visual-pitch-stack {\n  grid-column: 2;\n  grid-row: 1;")
    && stylesCss.includes(".feel-surface .sound-time-panel {\n  grid-column: 1;\n  grid-row: 1;")
    && stylesCss.includes(".resonance-aperture")
    && stylesCss.includes("@media (prefers-reduced-motion: reduce)")
    && stylesCss.includes("@media (max-width: 980px)")
    && stylesCss.includes("padding-top: 14px;")
    && stylesCss.includes(".visual-panel .generator-core {\n  height: clamp(260px, 31vw, 480px);")
    && appJs.includes("function bindSurfaceTabs()")
    && appJs.includes("function setAppSurface(")
    && appJs.includes('setAppSurface("logic")')
    && appJs.includes('if (next.name === "feel")')
    && !indexHtml.includes('class="panel pitch-panel pitch-drawer"');
  const timelineRendererSnippet = appJs.slice(
    appJs.indexOf("function timelineSectionLabel("),
    appJs.indexOf("function updateTimelineActions()")
  );
  const timelineUiOk = indexHtml.includes('class="form-timeline-shell"')
    && indexHtml.includes('id="sectionTimeline" role="list"')
    && !indexHtml.includes('id="timelineStatus"')
    && indexHtml.includes('id="undoFormButton"')
    && indexHtml.includes('id="redoFormButton"')
    && indexHtml.includes('id="moveSectionLeftButton"')
    && indexHtml.includes('id="copySectionButton"')
    && indexHtml.includes('id="duplicateSectionButton"')
    && indexHtml.includes('id="pasteSectionButton"')
    && indexHtml.includes('id="saveFormStateToolbarButton" type="button" title="Save project state (not MIDI)" aria-label="Save project state"')
    && indexHtml.includes('class="toolbar-menu project-load-menu" id="projectLoadMenu"')
    && indexHtml.includes('id="projectLoadMenuButton" type="button" title="Load project or preset" aria-label="Load project or preset" aria-haspopup="menu" aria-expanded="false" aria-controls="projectLoadMenuPanel"')
    && indexHtml.includes('class="toolbar-menu-panel" id="projectLoadMenuPanel" role="menu" aria-label="Load project source" hidden')
    && indexHtml.includes('class="toolbar-menu-item" id="loadFormStateToolbarButton" type="button" role="menuitem">Load project file</button>')
    && indexHtml.includes('Memory presets')
    && indexHtml.includes('Presets will live here')
    && indexHtml.includes('id="saveFormStateButton"')
    && indexHtml.includes('id="loadFormStateButton"')
    && indexHtml.includes('id="clearFormStateButton"')
    && indexHtml.includes('id="clearFormStateToolbarButton" type="button" title="New blank project / clear form" aria-label="New blank project / clear form"')
    && indexHtml.includes('class="toolbar-icon-button" id="undoFormButton" type="button" title="Undo" aria-label="Undo"')
    && indexHtml.includes('class="toolbar-icon-button" id="saveFormStateButton" type="button" title="Save project" aria-label="Save project"')
    && indexHtml.includes('<details class="export-drawer" id="exportDrawer">')
    && indexHtml.includes("Project, MIDI, WAV, CV, notes")
    && indexHtml.includes('<span class="toolbar-icon-label">MIDI</span>')
    && indexHtml.includes("What Export MIDI delivers")
    && indexHtml.includes("Equal Temperament MIDI follows the receiving synth tuning, usually A4 = 440")
    && indexHtml.includes("Fishtail now defaults to A3 220 Hz")
    && indexHtml.includes("If you change the reference, the receiving synth must be tuned to match")
    && indexHtml.includes("Amy Dub Intonation needs Entonal or a similar retuner")
    && indexHtml.includes("Bend MIDI needs separate mono channels or instruments")
    && !indexHtml.includes("Bend MIDI / Amy Dub Intonation for tuning-aware playback")
    && indexHtml.includes('id="formStateNameInput" type="text" value="Fishtail project"')
    && indexHtml.includes('id="generateButton" type="button">Generate MIDI</button>')
    && indexHtml.includes('class="generate-feedback" id="generateFeedbackLabel" aria-live="polite"')
    && indexHtml.includes('class="export-assets-summary" id="exportAssetsSummary" aria-live="polite"')
    && !indexHtml.includes("Generate + Save MIDI")
    && stylesCss.includes(".toolbar-icon-button")
    && stylesCss.includes(".toolbar-icon-label")
    && stylesCss.includes(".midi-export-button")
    && stylesCss.includes(".toolbar-menu-panel")
    && stylesCss.includes(".toolbar-menu-item")
    && stylesCss.includes("body.dub-mode .toolbar-menu-panel")
    && stylesCss.includes(".generate-strip")
    && stylesCss.includes(".generate-feedback")
    && stylesCss.includes('body.dub-mode .generate-feedback[data-state="ready"]')
    && stylesCss.includes(".export-drawer-body")
    && stylesCss.includes(".export-assets-summary")
    && stylesCss.includes(".export-assets-list")
    && stylesCss.includes(".export-asset-meta")
    && stylesCss.includes("body.dub-mode .export-assets-summary")
    && stylesCss.includes(".project-name-field")
    && stylesCss.includes(".midi-export-note")
    && stylesCss.includes(".section-timeline")
    && stylesCss.includes("flex-wrap: wrap")
    && stylesCss.includes("overflow: visible")
    && stylesCss.includes(".timeline-drag-handle")
    && stylesCss.includes(".timeline-resize-handle")
    && stylesCss.includes(".timeline-popover")
    && stylesCss.includes(".timeline-block-kicker")
    && stylesCss.includes(".timeline-block-title")
    && stylesCss.includes(".timeline-block-meta")
    && stylesCss.includes(".selected-section-inspector")
    && stylesCss.includes(".section-expression")
    && stylesCss.includes(".section-expression:not([open])")
    && stylesCss.includes(".section-expression-grid")
    && stylesCss.includes(".expression-piano-icon")
    && stylesCss.includes(".expression-bloom-check")
    && stylesCss.includes(".expression-map")
    && stylesCss.includes(".expression-threshold-note")
    && stylesCss.includes(".expression-scope-note")
    && stylesCss.includes("body.dub-mode .section-expression")
    && stylesCss.includes(".timeline-item.is-detail-open .timeline-popover")
    && stylesCss.includes(".timeline-item.is-action-pressing .timeline-block")
    && !stylesCss.includes(".timeline-item:hover .timeline-resize-handle")
    && stylesCss.includes(".section-empty-state")
    && stylesCss.includes("--section-editor-rgb")
    && stylesCss.includes("min-height: min(100svh, 780px)")
    && stylesCss.includes("touch-action: none")
    && stylesCss.includes("--timeline-rgb")
    && stylesCss.includes("--timeline-graph-rgb")
    && appJs.includes("TIMELINE_LONG_PRESS_ACTION_MS")
    && appJs.includes("function openTimelineActions(")
    && appJs.includes("function toggleProjectLoadMenu(")
    && appJs.includes("function closeProjectLoadMenu(")
    && appJs.includes("saveFormStateToolbarButton")
    && appJs.includes("loadFormStateToolbarButton")
    && appJs.includes("projectLoadMenuButton")
    && appJs.includes('block.addEventListener("dblclick"')
    && appJs.includes('event.key !== "ContextMenu"')
    && appJs.includes('block.title = "Select section. Long press, right-click, or double-click for actions.";')
    && !appJs.includes("TIMELINE_HOVER_DETAIL_MS")
    && !appJs.includes("scheduleTimelinePopover(")
    && !appJs.includes('item.addEventListener("focusin", () => showTimelinePopover')
    && !timelineRendererSnippet.includes("sectionDirectionLabel")
    && !timelineRendererSnippet.includes("Retrograde")
    && !timelineRendererSnippet.includes("Forward")
    && appJs.includes("timeline-popover-delete")
    && appJs.includes("function timelineBlockHtml(")
    && appJs.includes('aria-label="Remove selected section"')
    && appJs.includes("selected-section-inspector warm-lattice-control")
    && appJs.includes("const SECTION_EXPRESSION_VERSION")
    && appJs.includes("function normalizeSectionExpression(")
    && appJs.includes("function sectionExpressionControlsHtml(")
    && appJs.includes("Section expression controls")
    && appJs.includes("Expression ·")
    && appJs.includes("Energy contour")
    && appJs.includes("Register span")
    && appJs.includes("Register lift")
    && appJs.includes("Bloom Pressure")
    && appJs.includes("data-expression-field=\"velocityContour\"")
    && appJs.includes("data-expression-field=\"keyboardBloom\"")
    && appJs.includes("May add guarded support tracks at high Bloom Pressure.")
    && appJs.includes("Bloom Pressure is neutral at 50 percent")
    && appJs.includes("Neutral")
    && appJs.includes("Bloom wakes above 65%.")
    && appJs.includes("Full bloom begins around 85%.")
    && appJs.includes("Energy contour shapes MIDI dynamics")
    && !appJs.includes("Velocity contour")
    && !appJs.includes("Register width")
    && !appJs.includes("Voicing lift")
    && !appJs.includes("Pressure / Density")
    && !appJs.includes("Dynamics ·")
    && !appJs.includes("data-expression-field=\"pressureAuto\"")
    && !appJs.includes("expression-auto-toggle")
    && appJs.includes("function applySectionExpressionBloom(")
    && appJs.includes("active_guarded_arranger")
    && !appJs.includes("Expression Keyboard")
    && appJs.includes("function classifyVerticalSonority(")
    && appJs.includes("function evaluateSupportBloomCandidate(")
    && appJs.includes("function wouldCreateParallelPerfect(")
    && appJs.includes("keyboard_bloom_sections")
    && appJs.includes("function sectionExpressionVelocityOffset(")
    && appJs.includes("section_expression")
    && readmeMd.includes("Per-section Expression drawer")
    && readmeMd.includes("Energy contour")
    && readmeMd.includes("Register span")
    && readmeMd.includes("Bloom Pressure")
    && readmeMd.includes("Keyboard Bloom")
    && !indexHtml.includes("Whole Keyboard Sam")
    && !readmeMd.includes("Whole Keyboard Sam")
    && !appJs.includes("Whole Keyboard Sam")
    && appJs.includes("timeline-resize-handle")
    && appJs.includes("timelineDetailIndex")
    && appJs.includes("function timelineGraphRgb()")
    && appJs.includes('els.sectionTimeline.style.setProperty("--timeline-graph-rgb"')
    && appJs.includes("const DEFAULT_FORM_TEMPLATE_C = [")
    && appJs.includes("mode: \"ionian\", meter: \"5/4\"")
    && appJs.includes("function defaultSectionsForReferencePc(")
    && appJs.includes("formFollowsReference")
    && appJs.includes("syncDefaultFormToReference()")
    && appJs.includes("function moveSection(")
    && appJs.includes("function pasteAfterSelectedSection()")
    && appJs.includes("function saveFormState()")
    && appJs.includes('"generateFeedbackLabel"')
    && appJs.includes('"exportDrawer"')
    && appJs.includes('"exportAssetsSummary"')
    && appJs.includes("function setGenerateFeedback(")
    && appJs.includes("function openExportDrawer()")
    && appJs.includes("function updateExportAssetsSummary(")
    && appJs.includes("function exportAssetRows(")
    && appJs.includes("Exports are open; MIDI is ready to save")
    && appJs.includes('const DEFAULT_FORM_STATE_NAME = "Fishtail project"')
    && appJs.includes("Project save requested")
    && !appJs.includes("showSaveFilePicker")
    && appJs.includes("function clearFormState()")
    && appJs.includes("function requestDeleteSection(")
    && appJs.includes("function beginTimelineResize(")
    && appJs.includes("function resetRangeControl(")
    && appJs.includes("const FORM_HISTORY_LIMIT = 256")
    && appJs.includes("function undoFormEdit()")
    && appJs.includes("function redoFormEdit()")
    && appJs.includes("function handleFormHistoryShortcut(")
    && appJs.includes("const RANGE_RESET_DOUBLE_CLICK_MS = 360")
    && appJs.includes("rangeResetSuppressUntil")
    && appJs.includes("const SECTION_MAX_ABS_BARS = 64")
    && appJs.includes("function sectionGenerationShape(")
    && appJs.includes("function retrogradeSectionEvents(")
    && appJs.includes("negative_time")
    && appJs.includes("negativeTimeLine(")
    && appJs.includes("const VISUAL_LIGHT_PITCH_GLIDE_MS = 1500")
    && appJs.includes("function beginVisualLightGlide(")
    && appJs.includes("function visualLightGlideAlpha(")
    && appJs.includes("renderTorusFrame(width, height, phase, visualPalette)")
    && stylesCss.includes(".timeline-item.is-backward")
    && appJs.includes("function maryPaletteRgbForSpectral(")
    && appJs.includes("function pastelizeSpectralRgb(")
    && appJs.includes("function updateSelectedSectionEditorColor(")
    && stylesCss.includes("body.dub-mode .section-timeline")
    && appJs.includes("version: \"form_state_v1\"")
    && appJs.includes("function sectionVisualRgb(")
    && appJs.includes("visualTeardropRgbForWavelength(foldedLightWavelengthNm(frequency))")
    && appJs.includes("renderSectionTimeline();\n  updateSelectedSectionEditorColor();\n  requestCoreFrame(true);")
    && appJs.includes("const normalized = state.sections[index];")
    && appJs.includes("state.sections.splice(index + 1")
    && appJs.includes("currentSectionMetaForTimeline()");
  const probePitchSliderOk = indexHtml.includes('id="probePitchInput" type="range" min="0" max="83" step="1" value="45"')
    && indexHtml.includes('href="styles.css?v=92"')
    && indexHtml.includes('src/tempo-lattice.js?v=6')
    && indexHtml.includes('id="probeFineInput" type="range" min="-100" max="100" step="0.1" value="0"')
    && indexHtml.includes('id="tempoLatticeInput" type="checkbox" checked')
    && indexHtml.includes('id="rationalSwingInput" type="range" min="0" max="100" value="0"')
    && indexHtml.includes('id="irrationalSwingInput" type="range" min="0" max="100" value="0"')
    && indexHtml.includes('id="irrationalFeelInput"')
    && indexHtml.includes('<option value="lattice_safe">Lattice Safe</option>')
    && indexHtml.includes('<option value="hybrid_drift">Hybrid Drift</option>')
    && indexHtml.includes('<option value="living_drift" selected>Living Drift</option>')
    && indexHtml.includes("Stroll to swagger")
    && indexHtml.includes("Stumble")
    && indexHtml.includes('id="metronomeLevelInput" type="range" min="0" max="100" value="88"')
    && indexHtml.includes('src/audio-engine.js?v=8')
    && indexHtml.includes('src/wav-export.js?v=8')
    && indexHtml.includes('src/pitch-input.js?v=3')
    && indexHtml.includes('src/app.js?v=131')
    && indexHtml.includes("Listen for pitch")
    && indexHtml.includes("Use stable pitch")
    && indexHtml.includes("Capture anyway")
    && indexHtml.includes("Audio is analysed on this device. It is not recorded or uploaded.")
    && indexHtml.includes("Living Reference Input, pink-noise ticker")
    && indexHtml.includes("optional MediaDevices audio input")
    && indexHtml.includes("ticker WAV stays whole-piece and peak-normalized to -6 dBFS")
    && indexHtml.includes("Pulse Pitch")
    && indexHtml.includes('aria-label="Living Reference microphone input"')
    && indexHtml.includes('class="mic-icon"')
    && indexHtml.includes("Pulse sound")
    && indexHtml.includes('id="prepareProbeWavInput" type="checkbox" hidden')
    && indexHtml.includes('id="prepareTickerWavInput" type="checkbox" hidden')
    && indexHtml.includes("Export Pulse WAV")
    && indexHtml.includes("Fishtail's default reference is A3 = 220 Hz, which implies A4 = 440 Hz")
    && indexHtml.includes("it does not retune the instrument")
    && indexHtml.includes("matching the usual synth default")
    && indexHtml.includes("the retuner has to receive and interpret that key")
    && indexHtml.includes("with pitch-bend messages for compatible synth setups")
    && indexHtml.includes("mono 48 kHz / 24-bit stems")
    && indexHtml.includes("Pulse WAV is a short first-two-bars reference tone")
    && indexHtml.includes("Audio and CV exports render")
    && indexHtml.includes("may show a size estimate")
    && indexHtml.includes("Browser CV export defaults to one voice and the first 60 seconds")
    && indexHtml.includes("meter 5/4 from form 1")
    && indexHtml.includes("feel Living Drift")
    && indexHtml.includes("first share 0.333")
    && stylesCss.includes(".probe-pitch-field")
    && stylesCss.includes(".pulse-label-with-input")
    && stylesCss.includes(".mic-icon")
    && stylesCss.includes(".living-reference")
    && appJs.includes("referenceInputDisplayStatus")
    && appJs.includes("Stable pitch found")
    && stylesCss.includes("position: absolute")
    && stylesCss.includes("isolation: isolate")
    && stylesCss.includes("contain: layout paint")
    && stylesCss.includes(".torus-host > canvas")
    && stylesCss.includes("pointer-events: none");
  const cvExportOk = indexHtml.includes('id="prepareCvWavInput" type="checkbox"')
    && indexHtml.includes("Prepare analogue CV ZIP")
    && indexHtml.includes('id="cvVoiceModeInput"')
    && indexHtml.includes('<option value="bass" selected>Bass</option>')
    && indexHtml.includes('id="cvDurationInput"')
    && indexHtml.includes('<option value="first60" selected>First 60 seconds</option>')
    && indexHtml.includes('id="cvClockModeInput"')
    && indexHtml.includes('id="cvFullScaleInput"')
    && indexHtml.includes('id="cvRetriggerMsInput"')
    && indexHtml.includes('id="downloadCvWavButton" type="button" disabled title="Export CV ZIP" aria-label="Export CV ZIP"')
    && indexHtml.includes("1V/oct pitch, gate, and calibration WAV files")
    && indexHtml.includes("Browser CV export defaults to one voice and the first 60 seconds")
    && indexHtml.includes("DC-coupled interface")
    && indexHtml.includes("analogue CV export direction");
  const inputRaceOk = appJs.includes("requestRevision")
    && appJs.includes("staleRequest")
    && appJs.includes("hiddenPage")
    && appJs.includes("state.inputReference.starting")
    && appJs.includes("resetReferenceNoiseFloor")
    && appJs.includes("staleAfterDeviceList")
    && appJs.includes("captureLivingReferencePitch(true)")
    && appJs.includes("chooseInputFftSize(context.sampleRate)")
    && pitchInputJs.includes("CAPTURE_MIN_RELIABLE_FRAMES")
    && pitchInputJs.includes("CAPTURE_MIN_SPAN_MS");
  const audioHardeningOk = audioEngineJs.includes("audio.probe?.released")
    && audioEngineJs.includes("if (audio.probe === probe) audio.probe = null;")
    && audioEngineJs.includes("tempoLatticeEnabled: Boolean(settings.tempoLatticeEnabled)")
    && audioEngineJs.includes("LIVE_TEMPO_GLIDE_PULSES")
    && audioEngineJs.includes("smoothedMetronomeSettings")
    && audioEngineJs.includes("metronome.control")
    && audioEngineJs.includes("metronome.nextTickTime += duration;")
    && !audioEngineJs.includes("Math.max(0.025");
  const wavHardeningOk = wavExportJs.includes("levelSetting(settings.probeLevel")
    && wavExportJs.includes("levelSetting(settings.metronomeLevel")
    && wavExportJs.includes("STANDARD_WAV_SAMPLE_RATE")
    && wavExportJs.includes("STANDARD_WAV_BIT_DEPTH")
    && wavExportJs.includes("encodePcm24Mono")
    && wavExportJs.includes("MAX_MOBILE_RENDER_BYTES")
    && wavExportJs.includes("MAX_CONFIRMED_RENDER_BYTES")
    && wavExportJs.includes("PROBE_EXPORT_BARS")
    && wavExportJs.includes("probeExportPieceSeconds")
    && wavExportJs.includes("OFFLINE_RENDER_BUFFER_MULTIPLIER")
    && wavExportJs.includes("CV_MAX_RENDER_SECONDS")
    && wavExportJs.includes("duration_mode: cv.durationMode")
    && wavExportJs.includes("first${Math.round(pieceSeconds)}s")
    && wavExportJs.includes("estimateCvRenderBytes")
    && wavExportJs.includes("indexTempoTimeline")
    && wavExportJs.includes("calibration/cv-calibration-one-octave.wav");
  const audioSaveOk = appJs.includes('readyText: "Export Pulse WAV"')
    && appJs.includes('renderText: "Export Pulse WAV"')
    && appJs.includes('readyText: "Export Ticker WAV"')
    && appJs.includes('renderText: "Export Ticker WAV"')
    && appJs.includes("Render CV ZIP")
    && appJs.includes("confirmAudioExportEstimate")
    && appJs.includes("Audio export estimate")
    && appJs.includes('estimateAudioExportPlans(["probe", "ticker", "cv"]')
    && appJs.includes("renders on export")
    && appJs.includes("first 2 bars")
    && appJs.includes("whole piece")
    && appJs.includes("Cancel = generate the piece only")
    && appJs.includes("estimateAudioExportPlans")
    && appJs.includes("saveBlobFromButton")
    && appJs.includes("nav?.share")
    && appJs.includes("iPadLikeBrowser")
    && appJs.includes("await renderAudioExport(kind, state.lastPiece)")
    && appJs.includes("updateAudioExportButtons();\n  }\n}\n\nfunction readSettings");
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
        els.referenceFreqInput = { value: "220.00" };
        const a3Index = REFERENCE_NOTE_NAMES.indexOf("A3");
        els.probePitchInput = { value: String(a3Index), min: "0", max: String(REFERENCE_NOTE_NAMES.length - 1) };
        els.probePitchLabel = { textContent: "" };
        els.probeFineInput = { value: "25.0", min: "-100", max: "100" };
        els.probeFineLabel = { textContent: "" };
        els.tempoDivisorInput = { value: "220", min: "", max: "" };
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
        return buildPiece(settings, FishtailRandom.createRouter(settings.seed));
      }

      function buildNegativeTimePiece() {
        const settings = {
          seed: "validation-negative-time",
          voices: 4,
          tempo: 60,
          includeTempoMap: true,
          tempoLatticeEnabled: true,
          rationalSwing: 0.28,
          irrationalSwing: 0.06,
          irrationalFeelMode: FishtailTempoLattice.IRRATIONAL_FEEL_MODES.LIVING_DRIFT,
          referenceNote: "A3",
          referenceMidi: 57,
          referenceHz: 216,
          referenceAnchorA4Hz: 432,
          tempoDivisor: 216,
          breathing: 0.58,
          density: 0.32,
          rhythmMotion: 0.34,
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
            { bars: -2, key: "C", mode: "mixolydian", meter: "4/4", cadence: "dub_suspension", role: "normal", treatment: "straight" },
            { bars: 1, key: "F", mode: "dorian", meter: "4/4", cadence: "plagal", role: "normal", treatment: "straight" },
          ],
        };
        return buildPiece(settings, FishtailRandom.createRouter(settings.seed));
      }

      function eventsInsideSections(piece) {
        return piece.events.every((event) => {
          const section = piece.sectionMeta.find((candidate) => event.gridTick >= candidate.startTick && event.gridTick < candidate.startTick + candidate.bars * candidate.barTicks);
          return section
            && event.tick >= section.startTick
            && event.tick + event.duration <= section.startTick + section.bars * section.barTicks
            && event.gridTick >= section.startTick
            && event.gridTick + event.gridDuration <= section.startTick + section.bars * section.barTicks;
        });
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
      const negativeTimePiece = buildNegativeTimePiece();
      const retroSection = negativeTimePiece.sectionMeta[0];
      const retroSectionEnd = retroSection.startTick + retroSection.bars * retroSection.barTicks;
      const retroEvents = negativeTimePiece.events.filter((event) => event.gridTick >= retroSection.startTick && event.gridTick < retroSectionEnd);

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
        {
          name: "negative bars create positive MIDI retrograde sections",
          ok: retroSection.bars === 2
            && retroSection.signedBars === -2
            && retroSection.direction === -1
            && retroSection.retrograde === true
            && retroEvents.length > 0
            && retroEvents.some((event) => event.retrogradeSection && event.sectionDirection === -1)
            && eventsInsideSections(negativeTimePiece)
            && negativeTimePiece.manifest.negative_time.enabled === true
            && negativeTimePiece.manifest.negative_time.sections[0].signed_bars === -2
            && negativeTimePiece.report.includes("negative-time")
            && negativeTimePiece.report.includes("Gemma says:"),
        },
      ];
    })()
  `, context);

  let ok = styleOptionOk && tempoDefaultOk && variedLabelOk && notesClosedOk && velocitySwitchOk && settingsMenuOk && surfaceShellOk && timelineUiOk && probePitchSliderOk && cvExportOk && inputRaceOk && audioHardeningOk && wavHardeningOk && audioSaveOk;
  console.log(`${styleOptionOk ? "ok" : "failed"} fugue style option`);
  console.log(`${tempoDefaultOk ? "ok" : "failed"} tempo default and direction`);
  console.log(`${variedLabelOk ? "ok" : "failed"} varied label`);
  console.log(`${notesClosedOk ? "ok" : "failed"} notes default closed`);
  console.log(`${velocitySwitchOk ? "ok" : "failed"} velocity switch default`);
  console.log(`${settingsMenuOk ? "ok" : "failed"} app menu lives in settings`);
  console.log(`${surfaceShellOk ? "ok" : "failed"} two-surface app shell`);
  console.log(`${timelineUiOk ? "ok" : "failed"} form timeline copy paste and drag affordance`);
  console.log(`${probePitchSliderOk ? "ok" : "failed"} probe pitch sliders and metronome boost`);
  console.log(`${cvExportOk ? "ok" : "failed"} analogue CV export controls`);
  console.log(`${inputRaceOk ? "ok" : "failed"} living reference race guards`);
  console.log(`${audioHardeningOk ? "ok" : "failed"} audio engine timing and probe guards`);
  console.log(`${wavHardeningOk ? "ok" : "failed"} wav zero-level and memory guards`);
  console.log(`${audioSaveOk ? "ok" : "failed"} audio stem render-on-demand saves`);
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
      return buildPiece(settings, FishtailRandom.createRouter(settings.seed));
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
      return buildPiece(settings, FishtailRandom.createRouter(settings.seed));
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
