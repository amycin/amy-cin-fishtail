#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

const ROOT = path.resolve(__dirname, "..");
const APP_PATH = path.join(ROOT, "src", "app.js");
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
    const velocityOk = piece.events.every((event) => Number.isInteger(event.velocity) && event.velocity >= 90 && event.velocity <= 127);
    const velocityReportOk = piece.report.includes("Velocity curve:");
    const velocityManifestOk = piece.manifest.velocity_curve?.low_velocity === 127 && piece.manifest.velocity_curve?.high_velocity === 90;
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
        velocityOk ? [] : ["Generated note velocities are outside the expected 90-127 pitch-feel range."],
        velocityReportOk ? [] : ["Generation report is missing the velocity curve note."],
        velocityManifestOk ? [] : ["Manifest is missing the expected 127-to-90 velocity curve block."],
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
    && indexHtml.includes('id="tempoDivisorLabel">n = 432</span>')
    && indexHtml.includes('id="tempoDivisorInput" type="range" min="118" max="864" step="1" value="432"')
    && stylesCss.includes("#tempoDivisorInput")
    && stylesCss.includes("direction: rtl");
  const variedLabelOk = indexHtml.includes("Varied") && !indexHtml.includes("Strange");
  const notesClosedOk = indexHtml.includes('<button id="toggleNotesButton" type="button">Show Notes</button>')
    && indexHtml.includes('<section class="panel output-panel" id="notesPanel" hidden>');
  const context = makeAppContext();
  const results = vm.runInContext(`
    (() => {
      function dubUiDefault() {
        els.dubModeInput = { checked: true };
        els.styleInput = { value: "counterpoint" };
        els.statusLabel = { textContent: "Ready" };
        document.body = { classList: { toggle() {} } };
        updateDubModeUi();
        return els.styleInput.value === "fishtail_fugue" && els.statusLabel.textContent === "DUB armed";
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

  let ok = styleOptionOk && tempoDefaultOk && variedLabelOk && notesClosedOk;
  console.log(`${styleOptionOk ? "ok" : "failed"} fugue style option`);
  console.log(`${tempoDefaultOk ? "ok" : "failed"} tempo default and direction`);
  console.log(`${variedLabelOk ? "ok" : "failed"} varied label`);
  console.log(`${notesClosedOk ? "ok" : "failed"} notes default closed`);
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
  vm.runInContext(fs.readFileSync(APP_PATH, "utf8"), context, { filename: APP_PATH });
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
