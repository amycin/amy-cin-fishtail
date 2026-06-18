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
  const smoke = takeFlag(args, "--smoke") || args.length === 0;

  let failed = false;
  if (smoke) {
    failed = !runSmokeTests();
    failed = !runParallelRuleTests() || failed;
    failed = !runRefrainAndSuspensionTests() || failed;
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

function runSmokeTests() {
  const context = makeAppContext();
  const cases = [
    { name: "equal-tempo-on", outputMode: "equal", resolution: "literal", includeTempoMap: true, expectedTracks: 5, expectTempo30: true, allowBendEvents: false },
    { name: "equal-tempo-off", outputMode: "equal", resolution: "literal", includeTempoMap: false, expectedTracks: 4, expectTempo30: false, allowBendEvents: false },
    { name: "amy-dub-carriers", outputMode: "retuner", resolution: "nearest-ratio", includeTempoMap: true, expectedTracks: 5, expectTempo30: true, allowBendEvents: false },
    { name: "bend-midi", outputMode: "bend", resolution: "nearest-ratio", includeTempoMap: true, expectedTracks: 5, expectTempo30: true, allowBendEvents: true },
    { name: "dub-gravity", outputMode: "retuner", resolution: "nearest-ratio", includeTempoMap: true, dubMode: true, expectedTracks: 5, expectTempo30: true, allowBendEvents: false },
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
    const status = result.ok && piece.audit.issues.length === 0 && dubReportOk && velocityOk && velocityReportOk && velocityManifestOk && reassuranceOk && suspensionManifestOk && refrainManifestOk ? "ok" : "failed";
    console.log(`${status} ${test.name}: tracks=${result.trackCount}, notes=${result.notes}, tempos=${result.tempos}, warnings=${piece.audit.warnings.length}`);
    if (!result.ok || piece.audit.issues.length || !dubReportOk || !velocityOk || !velocityReportOk || !velocityManifestOk || !reassuranceOk || !suspensionManifestOk || !refrainManifestOk) {
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
      );
    }
  }
  return ok;
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

      return cases.map((test) => {
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
    })()
  `, context);

  let ok = true;
  for (const result of results) {
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
          generationStyle: "fugue",
          resolution: "literal",
          outputMode: "equal",
          dubMode: true,
          pedalVoices: { bass: true, tenor: false, alto: false, soprano: false },
          rootPc: 9,
          rootNote: "A4",
          rootMidi: 69,
          rootFreq: 432,
          sections: [
            { bars: 2, key: "C", mode: "major", meter: "4/4", cadence: "authentic", role: "refrain", treatment: "straight" },
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
            && piece.manifest.refrain.returns >= 1
            && piece.manifest.refrain.developments >= 2
            && piece.manifest.refrain.dubby_treatments >= 2
            && piece.manifest.pedal_voices.bass === true
            && piece.report.includes("Refrain development"),
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

function makeAppContext() {
  const context = {
    console,
    structuredClone,
    window: {},
    document: { addEventListener() {}, getElementById: () => null },
    navigator: {},
    localStorage: { getItem: () => null, setItem() {} },
    crypto: {
      getRandomValues: (array) => array.fill(17),
      subtle: { digest: async () => new ArrayBuffer(32) },
    },
    URL: { createObjectURL: () => "blob:test", revokeObjectURL() {} },
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
    generationStyle: "fugue",
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
