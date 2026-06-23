"use strict";

(function exposePitchInput(global) {
  const ALGORITHM = "fishtail_yin_lite_v1";
  const INPUT_FFT_SIZE = 8192;
  const INPUT_FFT_SIZE_MAX = 32768;
  const DETECTOR_SAMPLE_RATE = 12000;
  const DETECTOR_FRAME_SIZE = 2048;
  const ANALYSIS_FPS = 10;
  const SLOW_ANALYSIS_FPS = 6;
  const YIN_THRESHOLD = 0.15;
  const MIN_RMS_DBFS = -64;
  const MIN_CONFIDENCE = 0.8;
  const CAPTURE_HISTORY_MS = 800;
  const CAPTURE_MIN_RELIABLE_FRAMES = 5;
  const CAPTURE_MIN_SPAN_MS = 360;
  const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
  const PITCH_RANGES = {
    general: { label: "General", minHz: 40, maxHz: 1500 },
    bass: { label: "Bass", minHz: 25, maxHz: 400 },
    voice: { label: "Voice", minHz: 55, maxHz: 1000 },
    high: { label: "High", minHz: 100, maxHz: 2000 },
  };

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function centsForHz(hz) {
    return 1200 * Math.log2(Math.max(1e-12, Number(hz) || 1e-12));
  }

  function hzForCents(cents) {
    return 2 ** (Number(cents) / 1200);
  }

  function median(sortedValues) {
    if (!sortedValues.length) return null;
    const middle = Math.floor(sortedValues.length / 2);
    return sortedValues.length % 2
      ? sortedValues[middle]
      : (sortedValues[middle - 1] + sortedValues[middle]) / 2;
  }

  function midiNoteName(midi) {
    const rounded = Math.round(Number(midi) || 0);
    const pc = ((rounded % 12) + 12) % 12;
    const octave = Math.floor(rounded / 12) - 1;
    return `${NOTE_NAMES[pc]}${octave}`;
  }

  function noteNameToMidi(noteName) {
    const match = String(noteName || "").match(/^([A-G])([b#]?)(-?\d+)$/);
    if (!match) return 69;
    const natural = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[match[1]];
    const accidental = match[2] === "#" ? 1 : match[2] === "b" ? -1 : 0;
    return (parseInt(match[3], 10) + 1) * 12 + natural + accidental;
  }

  function makeScratch(frameSize = DETECTOR_FRAME_SIZE) {
    return {
      detectorFrame: new Float32Array(frameSize),
      difference: new Float32Array(frameSize),
      cmnd: new Float32Array(frameSize),
    };
  }

  function requiredInputFrameSize(sampleRate, options = {}) {
    const detectorRate = Math.max(1000, Math.round(options.detectorSampleRate || DETECTOR_SAMPLE_RATE));
    const frameSize = Math.max(32, Math.round(options.detectorFrameSize || DETECTOR_FRAME_SIZE));
    const rate = Math.max(1, Number(sampleRate) || detectorRate);
    return Math.ceil((frameSize * rate) / detectorRate);
  }

  function nextPowerOfTwo(value) {
    const target = Math.max(1, Math.ceil(Number(value) || 1));
    let size = 1;
    while (size < target) size *= 2;
    return size;
  }

  function chooseInputFftSize(sampleRate, options = {}) {
    const minSize = Math.max(32, Math.round(options.minSize || INPUT_FFT_SIZE));
    const maxSize = Math.max(minSize, Math.round(options.maxSize || INPUT_FFT_SIZE_MAX));
    return clamp(nextPowerOfTwo(requiredInputFrameSize(sampleRate, options)), minSize, maxSize);
  }

  function downsampleToDetector(input, sampleRate, scratch, options = {}) {
    const detectorRate = Math.max(1000, Math.round(options.detectorSampleRate || DETECTOR_SAMPLE_RATE));
    const frameSize = Math.min(scratch.detectorFrame.length, Math.round(options.detectorFrameSize || DETECTOR_FRAME_SIZE));
    const targetSourceStep = sampleRate / detectorRate;
    const neededSourceFrames = frameSize * targetSourceStep;
    const hasFullWindow = input.length >= neededSourceFrames;
    const sourceStep = hasFullWindow ? targetSourceStep : Math.max(1, input.length / Math.max(1, frameSize));
    const effectiveDetectorRate = hasFullWindow ? detectorRate : sampleRate / sourceStep;
    const sourceStart = hasFullWindow ? Math.max(0, input.length - neededSourceFrames) : 0;
    let sum = 0;
    for (let i = 0; i < frameSize; i += 1) {
      const sourceIndex = sourceStart + i * sourceStep;
      const left = Math.min(input.length - 1, Math.max(0, Math.floor(sourceIndex)));
      const right = Math.min(input.length - 1, left + 1);
      const frac = sourceIndex - left;
      const sample = input[left] + (input[right] - input[left]) * frac;
      scratch.detectorFrame[i] = sample;
      sum += sample;
    }
    const mean = sum / Math.max(1, frameSize);
    let energy = 0;
    for (let i = 0; i < frameSize; i += 1) {
      const sample = scratch.detectorFrame[i] - mean;
      scratch.detectorFrame[i] = sample;
      energy += sample * sample;
    }
    return {
      detectorRate: effectiveDetectorRate,
      frameSize,
      rms: Math.sqrt(energy / Math.max(1, frameSize)),
      sourceFrames: input.length,
      requiredSourceFrames: Math.ceil(neededSourceFrames),
      fullWindow: hasFullWindow,
    };
  }

  function parabolicMinimum(values, tau) {
    const left = values[tau - 1];
    const centre = values[tau];
    const right = values[tau + 1];
    const denominator = left - 2 * centre + right;
    if (!Number.isFinite(denominator) || Math.abs(denominator) < 1e-12) return tau;
    return tau + (left - right) / (2 * denominator);
  }

  function detectPitch(input, sampleRate, options = {}, scratch = makeScratch(options.detectorFrameSize || DETECTOR_FRAME_SIZE)) {
    if (!input || !input.length || !Number.isFinite(sampleRate) || sampleRate <= 0) {
      return { ok: false, reason: "no-input", confidence: 0, rms: 0, rmsDb: -Infinity };
    }
    const range = PITCH_RANGES[options.range] || options.range || PITCH_RANGES.general;
    const minHz = clamp(Number(options.minHz || range.minHz || PITCH_RANGES.general.minHz), 1, 2000);
    const maxHz = clamp(Number(options.maxHz || range.maxHz || PITCH_RANGES.general.maxHz), minHz + 1, 3000);
    const prepared = downsampleToDetector(input, sampleRate, scratch, options);
    const rmsDb = prepared.rms > 0 ? 20 * Math.log10(prepared.rms) : -Infinity;
    const minRmsDb = Number.isFinite(options.minRmsDb) ? options.minRmsDb : MIN_RMS_DBFS;
    if (rmsDb < minRmsDb) {
      return { ok: false, reason: "too-quiet", confidence: 0, rms: prepared.rms, rmsDb };
    }

    const frame = scratch.detectorFrame;
    const difference = scratch.difference;
    const cmnd = scratch.cmnd;
    const tauMin = Math.max(2, Math.floor(prepared.detectorRate / maxHz));
    const tauMax = Math.min(prepared.frameSize - 2, Math.ceil(prepared.detectorRate / minHz));
    if (tauMin >= tauMax) return { ok: false, reason: "range-too-small", confidence: 0, rms: prepared.rms, rmsDb };

    difference[0] = 0;
    for (let tau = 1; tau <= tauMax; tau += 1) {
      let sum = 0;
      const limit = prepared.frameSize - tau;
      for (let i = 0; i < limit; i += 1) {
        const delta = frame[i] - frame[i + tau];
        sum += delta * delta;
      }
      difference[tau] = sum;
    }

    cmnd[0] = 1;
    let running = 0;
    for (let tau = 1; tau <= tauMax; tau += 1) {
      running += difference[tau];
      cmnd[tau] = running > 0 ? difference[tau] * tau / running : 1;
    }

    const threshold = Number.isFinite(options.yinThreshold) ? options.yinThreshold : YIN_THRESHOLD;
    let bestTau = -1;
    for (let tau = tauMin; tau <= tauMax; tau += 1) {
      if (cmnd[tau] < threshold) {
        while (tau + 1 <= tauMax && cmnd[tau + 1] < cmnd[tau]) tau += 1;
        bestTau = tau;
        break;
      }
    }
    if (bestTau < 0) {
      let bestValue = Infinity;
      for (let tau = tauMin; tau <= tauMax; tau += 1) {
        if (cmnd[tau] < bestValue) {
          bestValue = cmnd[tau];
          bestTau = tau;
        }
      }
      if (bestValue > threshold * 1.8) {
        return { ok: false, reason: "no-stable-fundamental", confidence: Math.max(0, 1 - bestValue), rms: prepared.rms, rmsDb };
      }
    }

    const refinedTau = clamp(parabolicMinimum(cmnd, bestTau), tauMin, tauMax);
    const frequency = prepared.detectorRate / refinedTau;
    const confidence = clamp(1 - cmnd[bestTau], 0, 1);
    if (!Number.isFinite(frequency) || frequency < minHz || frequency > maxHz) {
      return { ok: false, reason: "out-of-range", confidence, rms: prepared.rms, rmsDb };
    }
    return {
      ok: confidence >= (Number.isFinite(options.minConfidence) ? options.minConfidence : MIN_CONFIDENCE),
      reason: confidence >= (Number.isFinite(options.minConfidence) ? options.minConfidence : MIN_CONFIDENCE) ? "pitch" : "low-confidence",
      frequency,
      confidence,
      rms: prepared.rms,
      rmsDb,
      period: refinedTau,
      detectorSampleRate: prepared.detectorRate,
      range: { minHz, maxHz },
      algorithm: ALGORITHM,
    };
  }

  function pitchStats(history, now = Date.now(), options = {}) {
    const maxAgeMs = Number.isFinite(options.historyMs) ? options.historyMs : CAPTURE_HISTORY_MS;
    const minConfidence = Number.isFinite(options.minConfidence) ? options.minConfidence : MIN_CONFIDENCE;
    const minCount = Number.isFinite(options.minCount) ? options.minCount : CAPTURE_MIN_RELIABLE_FRAMES;
    const minSpanMs = Number.isFinite(options.minSpanMs) ? options.minSpanMs : CAPTURE_MIN_SPAN_MS;
    const cutoff = now - maxAgeMs;
    const usable = (history || []).filter((entry) => entry
      && entry.ok !== false
      && entry.at >= cutoff
      && entry.confidence >= minConfidence
      && Number.isFinite(entry.frequency)
      && entry.frequency > 0);
    if (!usable.length) return { ok: false, reason: "no-reliable-history", count: 0 };
    const times = usable.map((entry) => Number(entry.at) || now).sort((a, b) => a - b);
    const spanMs = times[times.length - 1] - times[0];
    if (usable.length < minCount || spanMs < minSpanMs) {
      return {
        ok: false,
        reason: "collecting-reliable-history",
        count: usable.length,
        spanMs,
        neededCount: minCount,
        neededSpanMs: minSpanMs,
      };
    }
    const cents = usable.map((entry) => centsForHz(entry.frequency)).sort((a, b) => a - b);
    const centreCents = median(cents);
    const deviations = cents.map((value) => Math.abs(value - centreCents)).sort((a, b) => a - b);
    const spreadCents = median(deviations) * 1.4826;
    const confidence = usable.reduce((sum, entry) => sum + entry.confidence, 0) / usable.length;
    return {
      ok: true,
      count: usable.length,
      spanMs,
      frequency: hzForCents(centreCents),
      centreCents,
      spreadCents,
      confidence: clamp(confidence, 0, 1),
      state: spreadCents <= 5 ? "stable" : "moving",
      algorithm: ALGORITHM,
    };
  }

  function hzToReference(capturedHz, a4Hz = 432, options = {}) {
    const hz = Number(capturedHz);
    const anchor = Number(a4Hz) || 432;
    if (!Number.isFinite(hz) || hz <= 0) return null;
    const midiFloat = 69 + 12 * Math.log2(hz / anchor);
    const minMidi = Number.isFinite(options.minMidi) ? options.minMidi : 0;
    const maxMidi = Number.isFinite(options.maxMidi) ? options.maxMidi : 95;
    const nearestMidi = clamp(Math.round(midiFloat), minMidi, maxMidi);
    const referenceNote = midiNoteName(nearestMidi);
    const deviationCents = 100 * (midiFloat - nearestMidi);
    const impliedA4Hz = hz / (2 ** ((nearestMidi - 69) / 12));
    return {
      capturedHz: hz,
      midiFloat,
      nearestMidi,
      referenceMidi: nearestMidi,
      referenceNote,
      deviationCents,
      impliedA4Hz,
      algorithm: ALGORITHM,
    };
  }

  global.FishtailPitchInput = {
    ALGORITHM,
    INPUT_FFT_SIZE,
    INPUT_FFT_SIZE_MAX,
    DETECTOR_SAMPLE_RATE,
    DETECTOR_FRAME_SIZE,
    ANALYSIS_FPS,
    SLOW_ANALYSIS_FPS,
    YIN_THRESHOLD,
    MIN_RMS_DBFS,
    MIN_CONFIDENCE,
    CAPTURE_HISTORY_MS,
    CAPTURE_MIN_RELIABLE_FRAMES,
    CAPTURE_MIN_SPAN_MS,
    PITCH_RANGES,
    makeScratch,
    requiredInputFrameSize,
    chooseInputFftSize,
    detectPitch,
    pitchStats,
    hzToReference,
    midiNoteName,
    noteNameToMidi,
    centsForHz,
    hzForCents,
  };
})(globalThis);
