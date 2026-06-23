"use strict";

(function exposeWavExport(global) {
  const BIT_DEPTH = 24;
  const CHANNELS = 1;
  const MAX_RENDER_BYTES = 220 * 1024 * 1024;
  const MAX_MOBILE_RENDER_BYTES = 96 * 1024 * 1024;
  const OFFLINE_RENDER_BUFFER_MULTIPLIER = 3;
  const EPSILON_GAIN = 0.0001;
  const TICKER_NORMALIZE_DBFS = -6;
  const CV_SAMPLE_RATE = 48000;
  const CV_FULL_SCALE_VOLTS = 5;
  const CV_REFERENCE_MIDI = 60;
  const CV_CLOCK_PULSE_SECONDS = 0.02;
  const CV_PPQN_PULSE_SECONDS = 0.005;
  const CV_TAIL_SECONDS = 0.12;
  const CV_MAX_RENDER_SECONDS = 60;
  const CV_VOICE_ORDER = ["bass", "tenor", "alto", "soprano"];
  const CV_CALIBRATION_FILES = 3;
  const CV_CALIBRATION_SECONDS = 10;

  function clamp(value, min, max) {
    return global.FishtailTempoLattice?.clamp
      ? global.FishtailTempoLattice.clamp(value, min, max)
      : Math.min(max, Math.max(min, value));
  }

  function ascii(view, offset, text) {
    for (let i = 0; i < text.length; i += 1) view.setUint8(offset + i, text.charCodeAt(i));
  }

  function encodePcm24Mono(samples, sampleRate) {
    const safeRate = Math.max(1, Math.round(sampleRate || 48000));
    const frameCount = samples?.length || 0;
    const dataBytes = frameCount * 3;
    const buffer = new ArrayBuffer(44 + dataBytes);
    const view = new DataView(buffer);
    ascii(view, 0, "RIFF");
    view.setUint32(4, 36 + dataBytes, true);
    ascii(view, 8, "WAVE");
    ascii(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, CHANNELS, true);
    view.setUint32(24, safeRate, true);
    view.setUint32(28, safeRate * CHANNELS * 3, true);
    view.setUint16(32, CHANNELS * 3, true);
    view.setUint16(34, BIT_DEPTH, true);
    ascii(view, 36, "data");
    view.setUint32(40, dataBytes, true);
    let offset = 44;
    for (let i = 0; i < frameCount; i += 1) {
      const sample = Number.isFinite(samples[i]) ? clamp(samples[i], -1, 1) : 0;
      let value = sample < 0 ? Math.round(sample * 8388608) : Math.round(sample * 8388607);
      value = clamp(value, -8388608, 8388607);
      if (value < 0) value += 0x1000000;
      view.setUint8(offset, value & 0xff);
      view.setUint8(offset + 1, (value >>> 8) & 0xff);
      view.setUint8(offset + 2, (value >>> 16) & 0xff);
      offset += 3;
    }
    return new Uint8Array(buffer);
  }

  function estimateRenderBytes(durationSeconds, sampleRate) {
    const frames = Math.ceil(Math.max(0, durationSeconds) * sampleRate);
    const floatBytes = frames * CHANNELS * 4;
    const wavBytes = frames * CHANNELS * 3 + 44;
    const offlineBytes = floatBytes * OFFLINE_RENDER_BUFFER_MULTIPLIER;
    return {
      frames,
      floatBytes,
      wavBytes,
      offlineBytes,
      totalBytes: floatBytes + wavBytes + offlineBytes,
    };
  }

  function mobileRenderLikely() {
    const nav = global.navigator;
    const ua = String(nav?.userAgent || "");
    const touchPoints = Number(nav?.maxTouchPoints) || 0;
    return /iPad|iPhone|iPod|Android|Mobile/i.test(ua) || (touchPoints > 1 && /Macintosh/i.test(ua));
  }

  function renderByteLimit() {
    return mobileRenderLikely() ? MAX_MOBILE_RENDER_BYTES : MAX_RENDER_BYTES;
  }

  function chooseRenderPlan(durationSeconds) {
    const preferred = durationSeconds < 60 ? 96000 : 48000;
    let sampleRate = preferred;
    let estimate = estimateRenderBytes(durationSeconds, sampleRate);
    const byteLimit = renderByteLimit();
    let fallback = false;
    if (estimate.totalBytes > byteLimit && sampleRate > 48000) {
      sampleRate = 48000;
      estimate = estimateRenderBytes(durationSeconds, sampleRate);
      fallback = true;
    }
    if (estimate.totalBytes > byteLimit) {
      throw new Error("Audio stem too long for safe browser rendering");
    }
    return { sampleRate, estimate, fallback };
  }

  function offlineContext(frameCount, sampleRate) {
    const OfflineAudioContextClass = global.OfflineAudioContext || global.webkitOfflineAudioContext;
    if (!OfflineAudioContextClass) throw new Error("OfflineAudioContext is not available in this browser");
    return new OfflineAudioContextClass(CHANNELS, frameCount, sampleRate);
  }

  function filenameNumber(value, places = 4) {
    return Number(value || 0).toFixed(places).replace(".", "p");
  }

  function wavBlob(bytes) {
    return typeof Blob === "function" ? new Blob([bytes], { type: "audio/wav" }) : null;
  }

  function dbfsToGain(dbfs) {
    return 10 ** (clamp(Number(dbfs) || 0, -96, 0) / 20);
  }

  function levelSetting(value, fallback) {
    const number = Number(value);
    return clamp(Number.isFinite(number) ? number : fallback, 0, 1);
  }

  function peakAbs(samples) {
    let peak = 0;
    for (let i = 0; i < (samples?.length || 0); i += 1) {
      const sample = Number.isFinite(samples[i]) ? Math.abs(samples[i]) : 0;
      if (sample > peak) peak = sample;
    }
    return peak;
  }

  function gainToDbfs(gain) {
    return gain > 0 ? 20 * Math.log10(gain) : -Infinity;
  }

  function normalizePeak(samples, targetDbfs = TICKER_NORMALIZE_DBFS) {
    const targetPeak = dbfsToGain(targetDbfs);
    const beforePeak = peakAbs(samples);
    const scale = beforePeak > 1e-9 ? targetPeak / beforePeak : 1;
    if (beforePeak > 1e-9 && Number.isFinite(scale)) {
      for (let i = 0; i < samples.length; i += 1) {
        samples[i] = Number.isFinite(samples[i]) ? samples[i] * scale : 0;
      }
    }
    const afterPeak = peakAbs(samples);
    return {
      targetDbfs,
      targetPeak,
      gain: scale,
      beforePeak,
      afterPeak,
      beforeDbfs: gainToDbfs(beforePeak),
      afterDbfs: gainToDbfs(afterPeak),
    };
  }

  function safeFilenamePart(value) {
    return String(value || "fishtail")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      || "fishtail";
  }

  function stringBytes(text) {
    if (typeof TextEncoder === "function") return new TextEncoder().encode(text);
    return Uint8Array.from(String(text).split("").map((char) => char.charCodeAt(0) & 0xff));
  }

  function crc32(bytes) {
    let crc = 0xffffffff;
    for (let i = 0; i < bytes.length; i += 1) {
      crc ^= bytes[i];
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  function setUint16(view, offset, value) {
    view.setUint16(offset, value, true);
  }

  function setUint32(view, offset, value) {
    view.setUint32(offset, value >>> 0, true);
  }

  function makeZip(files) {
    const entries = files.map((file) => {
      const data = file.data instanceof Uint8Array ? file.data : stringBytes(file.data || "");
      return {
        name: String(file.name || "file"),
        nameBytes: stringBytes(file.name || "file"),
        data,
        crc: crc32(data),
      };
    });
    const localSize = entries.reduce((sum, entry) => sum + 30 + entry.nameBytes.length + entry.data.length, 0);
    const centralSize = entries.reduce((sum, entry) => sum + 46 + entry.nameBytes.length, 0);
    const totalSize = localSize + centralSize + 22;
    const out = new Uint8Array(totalSize);
    const view = new DataView(out.buffer);
    let offset = 0;
    const centralRecords = [];

    entries.forEach((entry) => {
      const localOffset = offset;
      setUint32(view, offset, 0x04034b50); offset += 4;
      setUint16(view, offset, 20); offset += 2;
      setUint16(view, offset, 0); offset += 2;
      setUint16(view, offset, 0); offset += 2;
      setUint16(view, offset, 0); offset += 2;
      setUint16(view, offset, 0); offset += 2;
      setUint32(view, offset, entry.crc); offset += 4;
      setUint32(view, offset, entry.data.length); offset += 4;
      setUint32(view, offset, entry.data.length); offset += 4;
      setUint16(view, offset, entry.nameBytes.length); offset += 2;
      setUint16(view, offset, 0); offset += 2;
      out.set(entry.nameBytes, offset); offset += entry.nameBytes.length;
      out.set(entry.data, offset); offset += entry.data.length;
      centralRecords.push({ ...entry, localOffset });
    });

    const centralOffset = offset;
    centralRecords.forEach((entry) => {
      setUint32(view, offset, 0x02014b50); offset += 4;
      setUint16(view, offset, 20); offset += 2;
      setUint16(view, offset, 20); offset += 2;
      setUint16(view, offset, 0); offset += 2;
      setUint16(view, offset, 0); offset += 2;
      setUint16(view, offset, 0); offset += 2;
      setUint16(view, offset, 0); offset += 2;
      setUint32(view, offset, entry.crc); offset += 4;
      setUint32(view, offset, entry.data.length); offset += 4;
      setUint32(view, offset, entry.data.length); offset += 4;
      setUint16(view, offset, entry.nameBytes.length); offset += 2;
      setUint16(view, offset, 0); offset += 2;
      setUint16(view, offset, 0); offset += 2;
      setUint16(view, offset, 0); offset += 2;
      setUint16(view, offset, 0); offset += 2;
      setUint32(view, offset, 0); offset += 4;
      setUint32(view, offset, entry.localOffset); offset += 4;
      out.set(entry.nameBytes, offset); offset += entry.nameBytes.length;
    });

    const centralDirectorySize = offset - centralOffset;
    setUint32(view, offset, 0x06054b50); offset += 4;
    setUint16(view, offset, 0); offset += 2;
    setUint16(view, offset, 0); offset += 2;
    setUint16(view, offset, centralRecords.length); offset += 2;
    setUint16(view, offset, centralRecords.length); offset += 2;
    setUint32(view, offset, centralDirectorySize); offset += 4;
    setUint32(view, offset, centralOffset); offset += 4;
    setUint16(view, offset, 0);
    return out;
  }

  function zipBlob(bytes) {
    return typeof Blob === "function" ? new Blob([bytes], { type: "application/zip" }) : null;
  }

  function midiFrequency(midi, a4 = 440) {
    const safeMidi = Number.isFinite(Number(midi)) ? Number(midi) : 69;
    const safeA4 = Number.isFinite(Number(a4)) ? Number(a4) : 440;
    return safeA4 * (2 ** ((safeMidi - 69) / 12));
  }

  function eventMidi(event) {
    const midi = Number(event?.midi);
    return Number.isFinite(midi) ? midi : CV_REFERENCE_MIDI;
  }

  function eventCvVolts(event, settings = {}) {
    if (settings.outputMode === "equal") {
      return (eventMidi(event) - CV_REFERENCE_MIDI) / 12;
    }
    const tunedHz = Number(event?.tunedFrequency || event?.hz || event?.conceptualRatioFrequency || event?.exportedMidiFrequency);
    const rootMidi = Number(settings.rootMidi) || 69;
    const rootFreq = Number(settings.rootFreq) || midiFrequency(rootMidi, settings.referenceAnchorA4Hz || 440);
    if (!Number.isFinite(tunedHz) || tunedHz <= 0 || !Number.isFinite(rootFreq) || rootFreq <= 0) {
      return (eventMidi(event) - CV_REFERENCE_MIDI) / 12;
    }
    return Math.log2(tunedHz / rootFreq) + ((rootMidi - CV_REFERENCE_MIDI) / 12);
  }

  function cvSettings(settings = {}) {
    const fullScale = Number(settings.cvFullScaleVolts ?? settings.fullScaleVolts);
    const zeroOffset = Number(settings.cvZeroOffsetVolts ?? settings.zeroOffsetVolts);
    const gateVolts = Number(settings.cvGateVolts ?? settings.gateVolts);
    const retriggerMs = Number(settings.cvRetriggerMs ?? settings.retriggerMs);
    const requestedClockMode = settings.cvClockMode ?? settings.clockMode;
    const requestedGatePolarity = settings.cvGatePolarity ?? settings.gatePolarity;
    const clockMode = ["pulse", "bar", "ppqn24"].includes(requestedClockMode) ? requestedClockMode : "pulse";
    const gatePolarity = requestedGatePolarity === "inverted" ? "inverted" : "positive";
    return {
      fullScaleVolts: clamp(Number.isFinite(fullScale) ? fullScale : CV_FULL_SCALE_VOLTS, 1, 10),
      zeroOffsetVolts: clamp(Number.isFinite(zeroOffset) ? zeroOffset : 0, -5, 5),
      gateVolts: clamp(Number.isFinite(gateVolts) ? gateVolts : 5, 0.5, 10),
      gatePolarity,
      retriggerMs: clamp(Number.isFinite(retriggerMs) ? retriggerMs : 2, 0, 5),
      clockMode,
    };
  }

  function cvSampleForVolts(volts, settings = {}, options = {}) {
    const cv = settings.fullScaleVolts ? settings : cvSettings(settings);
    const offset = options.applyZeroOffset === false ? 0 : cv.zeroOffsetVolts;
    return clamp((Number(volts || 0) + offset) / cv.fullScaleVolts, -1, 1);
  }

  function eventCvSample(event, settings = {}) {
    return cvSampleForVolts(eventCvVolts(event, settings), settings);
  }

  function indexTempoTimeline(timeline) {
    const rawSegments = [...(timeline?.segments || [])].sort((a, b) => (Number(a.tick) || 0) - (Number(b.tick) || 0));
    const segments = [];
    let elapsed = 0;
    rawSegments.forEach((segment) => {
      const startTick = Math.max(0, Number(segment.tick) || 0);
      const tickLength = Math.max(1, Number(segment.tickLength) || 1);
      const durationSeconds = Math.max(0, Number(segment.durationSeconds) || 0);
      segments.push({
        ...segment,
        tick: startTick,
        startTick,
        tickLength,
        endTick: startTick + tickLength,
        durationSeconds,
        startSeconds: elapsed,
        endSeconds: elapsed + durationSeconds,
      });
      elapsed += durationSeconds;
    });
    return {
      indexed: true,
      source: timeline,
      segments,
      tickerEvents: timeline?.tickerEvents || [],
      totalSeconds: Number.isFinite(Number(timeline?.totalSeconds)) ? Number(timeline.totalSeconds) : elapsed,
      endTick: segments.length ? segments[segments.length - 1].endTick : 0,
    };
  }

  function tickToSeconds(tick, timeline) {
    const safeTick = Math.max(0, Number(tick) || 0);
    const indexed = timeline?.indexed ? timeline : indexTempoTimeline(timeline);
    const segments = indexed.segments || [];
    if (!segments.length) return 0;
    if (safeTick < segments[0].startTick) return 0;
    let lo = 0;
    let hi = segments.length - 1;
    let index = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segments[mid].startTick <= safeTick) {
        index = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    const segment = segments[index];
    if (safeTick <= segment.endTick) {
      const local = clamp((safeTick - segment.startTick) / segment.tickLength, 0, 1);
      return segment.startSeconds + segment.durationSeconds * local;
    }
    return Math.min(indexed.totalSeconds, segment.endSeconds);
  }

  function estimateCvRenderBytes(durationSeconds, stemCount, options = {}) {
    const sampleRate = CV_SAMPLE_RATE;
    const frames = Math.ceil(Math.max(0, durationSeconds) * sampleRate);
    const safeStemCount = Math.max(1, Math.round(stemCount || 1));
    const calibrationFileCount = Math.max(0, Math.round(options.calibrationFileCount ?? CV_CALIBRATION_FILES));
    const calibrationSeconds = Math.max(0, Number(options.calibrationSeconds ?? CV_CALIBRATION_SECONDS) || 0);
    const perStemBytes = frames * CHANNELS * 3 + 44;
    const retainedWavBytes = perStemBytes * safeStemCount;
    const zipDuplicateBytes = retainedWavBytes;
    const workingFloatBytes = frames * CHANNELS * 4 * 2;
    const calibrationFrames = Math.ceil(calibrationSeconds * sampleRate);
    const calibrationWavBytes = calibrationFrames * CHANNELS * 3 + 44 * calibrationFileCount;
    const calibrationWorkingBytes = calibrationFrames * CHANNELS * 4;
    const calibrationZipDuplicateBytes = calibrationWavBytes;
    const totalBytes = retainedWavBytes
      + zipDuplicateBytes
      + workingFloatBytes
      + calibrationWavBytes
      + calibrationZipDuplicateBytes
      + calibrationWorkingBytes;
    return {
      frames,
      wavBytes: perStemBytes,
      retainedWavBytes,
      zipDuplicateBytes,
      workingFloatBytes,
      calibrationWavBytes,
      calibrationZipDuplicateBytes,
      calibrationWorkingBytes,
      totalBytes,
    };
  }

  function chooseCvRenderPlan(durationSeconds, stemCount, options = {}) {
    const sampleRate = CV_SAMPLE_RATE;
    const renderSeconds = Math.max(0, Number(durationSeconds) || 0);
    const estimate = estimateCvRenderBytes(renderSeconds, stemCount, options);
    const byteLimit = renderByteLimit();
    if (estimate.totalBytes > byteLimit) {
      throw new Error("Analogue CV package too long for safe browser rendering");
    }
    return {
      sampleRate,
      frames: estimate.frames,
      stemCount: Math.max(1, Math.round(stemCount || 1)),
      estimate,
      byteLimit,
      fallback: false,
    };
  }

  function frameAt(timeSeconds, sampleRate, frameCount) {
    return clamp(Math.round(Math.max(0, Number(timeSeconds) || 0) * sampleRate), 0, frameCount);
  }

  function voiceNamesForPiece(piece) {
    const voices = [...new Set((piece?.events || []).map((event) => event.voice).filter(Boolean))];
    return voices.sort((a, b) => {
      const ai = CV_VOICE_ORDER.indexOf(a);
      const bi = CV_VOICE_ORDER.indexOf(b);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi) || a.localeCompare(b);
    });
  }

  function cvVoiceNamesForPiece(piece, settings = {}) {
    const voices = voiceNamesForPiece(piece);
    const requested = settings.cvVoiceMode || "all";
    if (!requested || requested === "all") return voices;
    if (!voices.includes(requested)) throw new Error(`Selected CV voice has no generated events: ${requested}`);
    return [requested];
  }

  function clockEventsForTimeline(timeline, settings = {}, ppq = 480) {
    const indexed = timeline?.indexed ? timeline : indexTempoTimeline(timeline);
    const cv = cvSettings(settings);
    if (cv.clockMode === "bar") {
      return (indexed.segments || [])
        .filter((segment) => Number(segment.pulseIndex || 0) === 0)
        .map((segment) => ({ timeSeconds: segment.startSeconds, accentLevel: 1 }));
    }
    if (cv.clockMode === "ppqn24") {
      const stepTicks = Math.max(1, (Number(ppq) || 480) / 24);
      const events = [];
      for (let tick = 0; tick <= indexed.endTick; tick += stepTicks) {
        events.push({ timeSeconds: tickToSeconds(tick, indexed), accentLevel: tick === 0 ? 1 : 0.25 });
      }
      return events;
    }
    return (indexed.tickerEvents || []).map((event) => ({
      timeSeconds: Number(event.timeSeconds) || 0,
      accentLevel: Number(event.accentLevel) || 0.25,
    }));
  }

  function gateSamplesForSettings(settings = {}) {
    const cv = cvSettings(settings);
    const high = cvSampleForVolts(cv.gateVolts, cv, { applyZeroOffset: false });
    const low = cvSampleForVolts(0, cv, { applyZeroOffset: false });
    return cv.gatePolarity === "inverted" ? { on: low, off: high, high, low } : { on: high, off: low, high, low };
  }

  function renderCvClockSamples(timeline, plan, settings = {}, ppq = 480) {
    const samples = new Float32Array(plan.frames);
    const cv = cvSettings(settings);
    const gate = gateSamplesForSettings(cv);
    samples.fill(gate.off);
    const pulseSeconds = cv.clockMode === "ppqn24" ? CV_PPQN_PULSE_SECONDS : CV_CLOCK_PULSE_SECONDS;
    const pulseFrames = Math.max(1, Math.round(pulseSeconds * plan.sampleRate));
    clockEventsForTimeline(timeline, cv, ppq).forEach((event) => {
      const start = frameAt(event.timeSeconds || 0, plan.sampleRate, samples.length);
      const end = Math.min(samples.length, start + pulseFrames);
      if (end > start) samples.fill(gate.on, start, end);
    });
    return samples;
  }

  function renderCvVoiceSamples(piece, voice, timeline, plan) {
    const pitch = new Float32Array(plan.frames);
    const gate = new Float32Array(plan.frames);
    const settings = piece.settings || {};
    const cv = cvSettings(settings);
    const gateLevels = gateSamplesForSettings(cv);
    const retriggerFrames = Math.round((cv.retriggerMs / 1000) * plan.sampleRate);
    const events = (piece?.events || [])
      .filter((event) => event.voice === voice)
      .sort((a, b) => a.tick - b.tick || b.duration - a.duration);
    const indexed = timeline?.indexed ? timeline : indexTempoTimeline(timeline);
    const firstValue = events.length ? eventCvSample(events[0], settings) : cvSampleForVolts(0, cv);
    pitch.fill(firstValue);
    gate.fill(gateLevels.off);
    let lastValue = firstValue;
    let cursor = 0;

    events.forEach((event) => {
      const start = frameAt(tickToSeconds(event.tick, indexed), plan.sampleRate, plan.frames);
      const end = frameAt(tickToSeconds((event.tick || 0) + Math.max(1, event.duration || 1), indexed), plan.sampleRate, plan.frames);
      const value = eventCvSample(event, settings);
      if (start > cursor) pitch.fill(lastValue, cursor, start);
      if (end > start) {
        pitch.fill(value, start, end);
        const gateEnd = retriggerFrames > 0 ? Math.max(start + 1, end - retriggerFrames) : end;
        gate.fill(gateLevels.on, start, gateEnd);
        lastValue = value;
        cursor = end;
      }
    });
    if (cursor < plan.frames) pitch.fill(lastValue, cursor);
    return { pitch, gate, eventCount: events.length };
  }

  function renderCvCalibrationStaircase(plan, settings = {}) {
    const samples = new Float32Array(Math.max(1, Math.round(5 * plan.sampleRate)));
    const cv = cvSettings(settings);
    const steps = [-2, -1, 0, 1, 2];
    const stepFrames = Math.max(1, Math.floor(samples.length / steps.length));
    steps.forEach((volts, index) => {
      const start = index * stepFrames;
      const end = index === steps.length - 1 ? samples.length : Math.min(samples.length, start + stepFrames);
      samples.fill(cvSampleForVolts(volts, cv), start, end);
    });
    return samples;
  }

  function renderCvOneOctaveTest(plan, settings = {}) {
    const samples = new Float32Array(Math.max(1, Math.round(3 * plan.sampleRate)));
    const cv = cvSettings(settings);
    const half = Math.floor(samples.length / 2);
    samples.fill(cvSampleForVolts(0, cv), 0, half);
    samples.fill(cvSampleForVolts(1, cv), half);
    return samples;
  }

  function renderCvGateTest(plan, settings = {}) {
    const samples = new Float32Array(Math.max(1, Math.round(2 * plan.sampleRate)));
    const levels = gateSamplesForSettings(settings);
    samples.fill(levels.off);
    const pulseFrames = Math.max(1, Math.round(0.25 * plan.sampleRate));
    for (let start = 0; start < samples.length; start += pulseFrames * 2) {
      samples.fill(levels.on, start, Math.min(samples.length, start + pulseFrames));
    }
    return samples;
  }

  function timelineForPiece(piece) {
    if (piece?.tempoTimeline) return piece.tempoTimeline;
    if (global.FishtailTempoLattice && piece?.sectionMeta) {
      return global.FishtailTempoLattice.buildTempoTimeline(piece.sectionMeta, piece.settings, {
        ppq: piece.ppq || 480,
        meters: piece.meters || {},
      });
    }
    throw new Error("Tempo timeline is missing");
  }

  async function renderProbeWav(piece) {
    const timeline = timelineForPiece(piece);
    const settings = piece.settings || {};
    const pieceSeconds = timeline.totalSeconds || 0;
    const renderSeconds = pieceSeconds + global.FishtailTempoLattice.TEARDROP_RELEASE_SECONDS + 0.08;
    const plan = chooseRenderPlan(renderSeconds);
    const context = offlineContext(plan.estimate.frames, plan.sampleRate);
    const table = global.FishtailTempoLattice.buildTeardropVoiceTable(settings.referenceHz || 216, 12);
    const mix = context.createGain();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const outputGain = context.createGain();
    const level = levelSetting(settings.probeLevel, 0.2);
    const gain = global.FishtailAudioEngine?.levelToGain
      ? global.FishtailAudioEngine.levelToGain(level, 0.42)
      : level * 0.14;
    mix.gain.setValueAtTime(gain, 0);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(global.FishtailTempoLattice.teardropLowpassHz(settings.referenceHz || 216), 0);
    filter.Q.setValueAtTime(0.45, 0);
    envelope.gain.setValueAtTime(EPSILON_GAIN, 0);
    envelope.gain.exponentialRampToValueAtTime(1, global.FishtailTempoLattice.TEARDROP_ATTACK_SECONDS);
    envelope.gain.setValueAtTime(1, Math.max(global.FishtailTempoLattice.TEARDROP_ATTACK_SECONDS, pieceSeconds));
    envelope.gain.exponentialRampToValueAtTime(EPSILON_GAIN, pieceSeconds + global.FishtailTempoLattice.TEARDROP_RELEASE_SECONDS);
    outputGain.gain.setValueAtTime(0.9, 0);
    table.forEach((voice) => {
      const osc = context.createOscillator();
      const voiceGain = context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(voice.frequency, 0);
      voiceGain.gain.setValueAtTime(voice.weight, 0);
      osc.connect(voiceGain).connect(mix);
      osc.start(0);
      osc.stop(renderSeconds);
    });
    mix.connect(filter).connect(envelope).connect(outputGain).connect(context.destination);
    const buffer = await context.startRendering();
    const bytes = encodePcm24Mono(buffer.getChannelData(0), plan.sampleRate);
    const seed = String(settings.seed || "seed").slice(0, 8);
    const filename = `amy-cin-fishtail-probe-${filenameNumber(settings.referenceHz || 216)}hz-${seed}.wav`;
    return {
      kind: "probe",
      bytes,
      blob: wavBlob(bytes),
      filename,
      sampleRate: plan.sampleRate,
      bitDepth: BIT_DEPTH,
      durationSeconds: renderSeconds,
      pieceSeconds,
      fallbackSampleRate: plan.fallback,
    };
  }

  async function renderTickerWav(piece) {
    const timeline = timelineForPiece(piece);
    const settings = piece.settings || {};
    const pieceSeconds = timeline.totalSeconds || 0;
    const renderSeconds = pieceSeconds + 0.12;
    const plan = chooseRenderPlan(renderSeconds);
    const context = offlineContext(plan.estimate.frames, plan.sampleRate);
    const source = context.createBufferSource();
    source.buffer = global.FishtailAudioEngine.makePinkNoiseBuffer(context);
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(global.FishtailTempoLattice.tickerCenterHz(settings.referenceHz || 216), 0);
    filter.Q.setValueAtTime(global.FishtailTempoLattice.TICKER_WEB_AUDIO_Q, 0);
    const tickGain = context.createGain();
    const level = levelSetting(settings.metronomeLevel, 0.25);
    const gateFloor = level > 0 ? EPSILON_GAIN : 0;
    tickGain.gain.setValueAtTime(gateFloor, 0);
    source.connect(filter).connect(tickGain).connect(context.destination);
    const maxGain = global.FishtailAudioEngine?.METRONOME_MAX_GAIN || 3.4;
    const baseGain = global.FishtailAudioEngine?.levelToGain
      ? global.FishtailAudioEngine.levelToGain(level, maxGain)
      : level * maxGain;
    if (level > 0) {
      (timeline.tickerEvents || []).forEach((event) => {
        const time = Math.max(0, event.timeSeconds || 0);
        if (time >= renderSeconds) return;
        const gain = Math.max(EPSILON_GAIN, baseGain * clamp(event.accentLevel || 0.25, 0.05, 1.2));
        filter.frequency.setValueAtTime(global.FishtailTempoLattice.tickerCenterHz(settings.referenceHz || 216), time);
        tickGain.gain.setValueAtTime(EPSILON_GAIN, time);
        tickGain.gain.linearRampToValueAtTime(gain, time + global.FishtailTempoLattice.TICKER_ATTACK_SECONDS);
        tickGain.gain.exponentialRampToValueAtTime(EPSILON_GAIN, time + global.FishtailTempoLattice.TICKER_DECAY_SECONDS);
      });
    }
    source.start(0);
    source.stop(renderSeconds);
    const buffer = await context.startRendering();
    const samples = buffer.getChannelData(0);
    const normalization = normalizePeak(samples, TICKER_NORMALIZE_DBFS);
    const bytes = encodePcm24Mono(samples, plan.sampleRate);
    const seed = String(settings.seed || "seed").slice(0, 8);
    const filename = `amy-cin-fishtail-ticker-${filenameNumber(settings.tempo || 60)}bpm-${seed}.wav`;
    return {
      kind: "ticker",
      bytes,
      blob: wavBlob(bytes),
      filename,
      sampleRate: plan.sampleRate,
      bitDepth: BIT_DEPTH,
      durationSeconds: renderSeconds,
      pieceSeconds,
      fallbackSampleRate: plan.fallback,
      normalization,
    };
  }

  async function renderCvZip(piece) {
    const timeline = indexTempoTimeline(timelineForPiece(piece));
    const settings = piece.settings || {};
    const cv = cvSettings(settings);
    const voices = cvVoiceNamesForPiece(piece, settings);
    const pieceSeconds = timeline.totalSeconds || 0;
    if (pieceSeconds > CV_MAX_RENDER_SECONDS) {
      throw new Error(`Analogue CV export is capped at ${CV_MAX_RENDER_SECONDS} seconds for browser memory safety`);
    }
    const renderSeconds = pieceSeconds + CV_TAIL_SECONDS;
    const stemCount = 1 + voices.length * 2;
    const plan = chooseCvRenderPlan(renderSeconds, stemCount);
    const seed = safeFilenamePart(String(settings.seed || "seed").slice(0, 8));
    const tempo = filenameNumber(settings.tempo || 60);
    const files = [];
    const stemManifest = [];
    const clockFilename = `clock/amy-cin-fishtail-cv-clock-${tempo}bpm-${seed}.wav`;
    const clockSamples = renderCvClockSamples(timeline, plan, cv, piece.ppq || 480);
    files.push({ name: clockFilename, data: encodePcm24Mono(clockSamples, plan.sampleRate) });
    stemManifest.push({
      kind: "clock",
      voice: null,
      filename: clockFilename,
      mode: cv.clockMode,
      label: cv.clockMode === "pulse" ? "musical pulse clock" : cv.clockMode === "bar" ? "bar-start pulse clock" : "24 PPQN pulse clock",
      high_sample: gateSamplesForSettings(cv).high,
      low_sample: gateSamplesForSettings(cv).low,
      pulse_seconds: cv.clockMode === "ppqn24" ? CV_PPQN_PULSE_SECONDS : CV_CLOCK_PULSE_SECONDS,
    });

    voices.forEach((voice) => {
      const rendered = renderCvVoiceSamples(piece, voice, timeline, plan);
      const safeVoice = safeFilenamePart(voice);
      const pitchFilename = `pitch/${safeVoice}-pitch-1voct.wav`;
      const gateFilename = `gate/${safeVoice}-gate.wav`;
      files.push({ name: pitchFilename, data: encodePcm24Mono(rendered.pitch, plan.sampleRate) });
      files.push({ name: gateFilename, data: encodePcm24Mono(rendered.gate, plan.sampleRate) });
      stemManifest.push({
        kind: "pitch_1v_oct",
        voice,
        filename: pitchFilename,
        event_count: rendered.eventCount,
      });
      stemManifest.push({
        kind: "gate",
        voice,
        filename: gateFilename,
        event_count: rendered.eventCount,
        high_sample: gateSamplesForSettings(cv).high,
        low_sample: gateSamplesForSettings(cv).low,
        polarity: cv.gatePolarity,
        retrigger_gap_ms: cv.retriggerMs,
      });
    });

    const calibrationManifest = [
      {
        kind: "pitch_calibration_staircase",
        filename: "calibration/cv-calibration-staircase-1voct.wav",
        description: "-2V, -1V, 0V, +1V, +2V one-second steps for interface calibration.",
        samples: renderCvCalibrationStaircase(plan, cv),
      },
      {
        kind: "pitch_calibration_one_octave",
        filename: "calibration/cv-calibration-one-octave.wav",
        description: "0V then +1V for a one-octave oscillator calibration check.",
        samples: renderCvOneOctaveTest(plan, cv),
      },
      {
        kind: "gate_calibration_test",
        filename: "calibration/cv-gate-polarity-test.wav",
        description: "Alternating gate pulses using the selected gate voltage and polarity.",
        samples: renderCvGateTest(plan, cv),
      },
    ];
    calibrationManifest.forEach((calibration) => {
      files.push({ name: calibration.filename, data: encodePcm24Mono(calibration.samples, plan.sampleRate) });
      stemManifest.push({
        kind: calibration.kind,
        voice: null,
        filename: calibration.filename,
        description: calibration.description,
      });
    });

    const manifest = {
      title: "amy_cin fishtail analogue CV package",
      seed: settings.seed,
      generated_at: new Date().toISOString(),
      sample_rate_hz: plan.sampleRate,
      bit_depth: BIT_DEPTH,
      channels_per_file: CHANNELS,
      piece_seconds: Number(pieceSeconds.toFixed(4)),
      duration_seconds: Number(renderSeconds.toFixed(4)),
      max_duration_seconds: CV_MAX_RENDER_SECONDS,
      memory_estimate_bytes: plan.estimate,
      byte_limit: plan.byteLimit,
      clock: {
        source: cv.clockMode === "pulse"
          ? "musical pulse events from the same tempo lattice used by MIDI conductor timing"
          : cv.clockMode === "bar"
            ? "bar-start pulses derived from the tempo lattice"
            : "24 PPQN pulses derived from the tempo lattice",
        mode: cv.clockMode,
        pulse_seconds: cv.clockMode === "ppqn24" ? CV_PPQN_PULSE_SECONDS : CV_CLOCK_PULSE_SECONDS,
        high_sample: gateSamplesForSettings(cv).high,
        low_sample: gateSamplesForSettings(cv).low,
        note: cv.clockMode === "pulse" ? "This is a musical pulse clock, not a 24 PPQN transport clock." : "Use the mode field to distinguish musical pulse, bar-start, and 24 PPQN clocks.",
      },
      pitch_cv: {
        standard: "1V/oct CV-style audio",
        reference: "C4 = 0V",
        full_scale: `+/-${cv.fullScaleVolts}V maps to +/-1.0 sample`,
        zero_offset_volts: cv.zeroOffsetVolts,
        note: "Use a DC-coupled interface or DAW CV utility; ordinary headphone outputs are usually AC-coupled and will not pass pitch CV correctly.",
      },
      gate_cv: {
        gate_volts: cv.gateVolts,
        polarity: cv.gatePolarity,
        retrigger_gap_ms: cv.retriggerMs,
      },
      calibration: calibrationManifest.map(({ kind, filename, description }) => ({ kind, filename, description })),
      stems: stemManifest,
    };
    files.push({ name: "manifest.json", data: stringBytes(JSON.stringify(manifest, null, 2)) });
    files.push({
      name: "README.txt",
      data: stringBytes([
        "amy_cin fishtail analogue CV package",
        "",
        "This ZIP contains mono 24-bit WAV files for modular / analogue workflows:",
        "- clock/*.wav: the selected pulse clock derived from the same tempo lattice used by the MIDI conductor map.",
        "- pitch/*.wav: 1V/oct CV-style pitch tracks, C4 = 0V, one octave = one volt.",
        "- gate/*.wav: gates that follow each written voice note, with the selected voltage, polarity and retrigger gap.",
        "- calibration/*.wav: staircase, one-octave and gate test files for interface calibration.",
        "",
        `Clock mode: ${cv.clockMode}. Musical pulses are performance pulse events, not conventional MIDI 24 PPQN clock.`,
        `Pitch scale: +/-${cv.fullScaleVolts}V maps to +/-1.0 sample; zero offset is ${cv.zeroOffsetVolts}V.`,
        `Gate: ${cv.gateVolts}V ${cv.gatePolarity}; retrigger gap ${cv.retriggerMs} ms.`,
        "",
        "Important: WAV files do not guarantee real-world volts by themselves.",
        "Use a DC-coupled audio interface, modular audio-to-CV tool, or DAW CV utility and calibrate your oscillator.",
        "Ordinary phone, tablet, and headphone outputs are usually AC-coupled; they may pass the clock pulse but will not preserve pitch CV.",
        "",
        "Pitch tracks are derived from Fishtail's generated event frequencies.",
        "Equal Temperament follows written MIDI note numbers; Bend MIDI and Amy Dub Intonation follow the intended tuned event frequency.",
      ].join("\n")),
    });

    const bytes = makeZip(files);
    const filename = `amy-cin-fishtail-analogue-cv-${tempo}bpm-${seed}.zip`;
    return {
      kind: "cv",
      label: "analogue CV ZIP",
      format: "zip",
      bytes,
      blob: zipBlob(bytes),
      filename,
      sampleRate: plan.sampleRate,
      bitDepth: BIT_DEPTH,
      durationSeconds: renderSeconds,
      pieceSeconds,
      fallbackSampleRate: false,
      channels: CHANNELS,
      stemCount,
      voiceCount: voices.length,
      files: files.map((file) => file.name),
      cv: manifest.pitch_cv,
    };
  }

  global.FishtailWavExport = {
    BIT_DEPTH,
    CHANNELS,
    MAX_RENDER_BYTES,
    MAX_MOBILE_RENDER_BYTES,
    OFFLINE_RENDER_BUFFER_MULTIPLIER,
    TICKER_NORMALIZE_DBFS,
    CV_SAMPLE_RATE,
    CV_FULL_SCALE_VOLTS,
    CV_REFERENCE_MIDI,
    CV_CLOCK_PULSE_SECONDS,
    CV_PPQN_PULSE_SECONDS,
    CV_MAX_RENDER_SECONDS,
    dbfsToGain,
    levelSetting,
    peakAbs,
    normalizePeak,
    encodePcm24Mono,
    renderByteLimit,
    makeZip,
    cvSettings,
    cvSampleForVolts,
    indexTempoTimeline,
    tickToSeconds,
    estimateCvRenderBytes,
    eventCvVolts,
    eventCvSample,
    chooseCvRenderPlan,
    clockEventsForTimeline,
    renderCvVoiceSamples,
    renderCvClockSamples,
    renderCvCalibrationStaircase,
    renderCvOneOctaveTest,
    renderCvGateTest,
    estimateRenderBytes,
    chooseRenderPlan,
    renderProbeWav,
    renderTickerWav,
    renderCvZip,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
