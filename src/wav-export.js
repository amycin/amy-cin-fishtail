"use strict";

(function exposeWavExport(global) {
  const BIT_DEPTH = 24;
  const CHANNELS = 1;
  const MAX_RENDER_BYTES = 220 * 1024 * 1024;
  const EPSILON_GAIN = 0.0001;
  const TICKER_NORMALIZE_DBFS = -6;
  const CV_SAMPLE_RATE = 48000;
  const CV_FULL_SCALE_VOLTS = 5;
  const CV_REFERENCE_MIDI = 60;
  const CV_GATE_HIGH = 1;
  const CV_CLOCK_PULSE_SECONDS = 0.02;
  const CV_TAIL_SECONDS = 0.12;
  const CV_VOICE_ORDER = ["bass", "tenor", "alto", "soprano"];

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
    return {
      frames,
      floatBytes: frames * CHANNELS * 4,
      wavBytes: frames * CHANNELS * 3 + 44,
      totalBytes: frames * CHANNELS * 7 + 44,
    };
  }

  function chooseRenderPlan(durationSeconds) {
    const preferred = durationSeconds < 60 ? 96000 : 48000;
    let sampleRate = preferred;
    let estimate = estimateRenderBytes(durationSeconds, sampleRate);
    let fallback = false;
    if (estimate.totalBytes > MAX_RENDER_BYTES && sampleRate > 48000) {
      sampleRate = 48000;
      estimate = estimateRenderBytes(durationSeconds, sampleRate);
      fallback = true;
    }
    if (estimate.totalBytes > MAX_RENDER_BYTES) {
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

  function eventCvSample(event, settings = {}) {
    return clamp(eventCvVolts(event, settings) / CV_FULL_SCALE_VOLTS, -1, 1);
  }

  function tickToSeconds(tick, timeline) {
    const safeTick = Math.max(0, Number(tick) || 0);
    const segments = [...(timeline?.segments || [])].sort((a, b) => a.tick - b.tick);
    if (!segments.length) return 0;
    let elapsed = 0;
    for (const segment of segments) {
      const startTick = Math.max(0, Number(segment.tick) || 0);
      const tickLength = Math.max(1, Number(segment.tickLength) || 1);
      const durationSeconds = Math.max(0, Number(segment.durationSeconds) || 0);
      const endTick = startTick + tickLength;
      if (safeTick < startTick) return elapsed;
      if (safeTick <= endTick) {
        const local = clamp((safeTick - startTick) / tickLength, 0, 1);
        return elapsed + durationSeconds * local;
      }
      elapsed += durationSeconds;
    }
    return Number.isFinite(Number(timeline?.totalSeconds)) ? Number(timeline.totalSeconds) : elapsed;
  }

  function chooseCvRenderPlan(durationSeconds, stemCount) {
    const sampleRate = CV_SAMPLE_RATE;
    const frames = Math.ceil(Math.max(0, durationSeconds) * sampleRate);
    const perStemBytes = frames * CHANNELS * 3 + 44;
    const totalBytes = perStemBytes * Math.max(1, stemCount);
    if (totalBytes > MAX_RENDER_BYTES) {
      throw new Error("Analogue CV package too long for safe browser rendering");
    }
    return {
      sampleRate,
      frames,
      stemCount,
      estimate: { frames, wavBytes: perStemBytes, totalBytes },
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

  function renderCvClockSamples(timeline, plan) {
    const samples = new Float32Array(plan.frames);
    const pulseFrames = Math.max(1, Math.round(CV_CLOCK_PULSE_SECONDS * plan.sampleRate));
    (timeline?.tickerEvents || []).forEach((event) => {
      const start = frameAt(event.timeSeconds || 0, plan.sampleRate, samples.length);
      const end = Math.min(samples.length, start + pulseFrames);
      if (end > start) samples.fill(CV_GATE_HIGH, start, end);
    });
    return samples;
  }

  function renderCvVoiceSamples(piece, voice, timeline, plan) {
    const pitch = new Float32Array(plan.frames);
    const gate = new Float32Array(plan.frames);
    const events = (piece?.events || [])
      .filter((event) => event.voice === voice)
      .sort((a, b) => a.tick - b.tick || b.duration - a.duration);
    const firstValue = events.length ? eventCvSample(events[0], piece.settings || {}) : 0;
    pitch.fill(firstValue);
    let lastValue = firstValue;
    let cursor = 0;

    events.forEach((event) => {
      const start = frameAt(tickToSeconds(event.tick, timeline), plan.sampleRate, plan.frames);
      const end = frameAt(tickToSeconds((event.tick || 0) + Math.max(1, event.duration || 1), timeline), plan.sampleRate, plan.frames);
      const value = eventCvSample(event, piece.settings || {});
      if (start > cursor) pitch.fill(lastValue, cursor, start);
      if (end > start) {
        pitch.fill(value, start, end);
        gate.fill(CV_GATE_HIGH, start, end);
        lastValue = value;
        cursor = end;
      }
    });
    if (cursor < plan.frames) pitch.fill(lastValue, cursor);
    return { pitch, gate, eventCount: events.length };
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
    const level = clamp(Number(settings.probeLevel) || 0.2, 0, 1);
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
    tickGain.gain.setValueAtTime(EPSILON_GAIN, 0);
    source.connect(filter).connect(tickGain).connect(context.destination);
    const level = clamp(Number(settings.metronomeLevel) || 0.25, 0, 1);
    const maxGain = global.FishtailAudioEngine?.METRONOME_MAX_GAIN || 3.4;
    const baseGain = global.FishtailAudioEngine?.levelToGain
      ? global.FishtailAudioEngine.levelToGain(level, maxGain)
      : level * maxGain;
    (timeline.tickerEvents || []).forEach((event) => {
      const time = Math.max(0, event.timeSeconds || 0);
      if (time >= renderSeconds) return;
      const gain = Math.max(EPSILON_GAIN, baseGain * clamp(event.accentLevel || 0.25, 0.05, 1.2));
      filter.frequency.setValueAtTime(global.FishtailTempoLattice.tickerCenterHz(settings.referenceHz || 216), time);
      tickGain.gain.setValueAtTime(EPSILON_GAIN, time);
      tickGain.gain.linearRampToValueAtTime(gain, time + global.FishtailTempoLattice.TICKER_ATTACK_SECONDS);
      tickGain.gain.exponentialRampToValueAtTime(EPSILON_GAIN, time + global.FishtailTempoLattice.TICKER_DECAY_SECONDS);
    });
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
    const timeline = timelineForPiece(piece);
    const settings = piece.settings || {};
    const voices = voiceNamesForPiece(piece);
    const pieceSeconds = timeline.totalSeconds || 0;
    const renderSeconds = pieceSeconds + CV_TAIL_SECONDS;
    const stemCount = 1 + voices.length * 2;
    const plan = chooseCvRenderPlan(renderSeconds, stemCount);
    const seed = safeFilenamePart(String(settings.seed || "seed").slice(0, 8));
    const tempo = filenameNumber(settings.tempo || 60);
    const files = [];
    const stemManifest = [];
    const clockFilename = `clock/amy-cin-fishtail-cv-clock-${tempo}bpm-${seed}.wav`;
    const clockSamples = renderCvClockSamples(timeline, plan);
    files.push({ name: clockFilename, data: encodePcm24Mono(clockSamples, plan.sampleRate) });
    stemManifest.push({
      kind: "clock",
      voice: null,
      filename: clockFilename,
      high_sample: CV_GATE_HIGH,
      pulse_seconds: CV_CLOCK_PULSE_SECONDS,
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
        high_sample: CV_GATE_HIGH,
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
      clock: {
        source: "same tempo lattice ticker events used by MIDI conductor timing",
        pulse_seconds: CV_CLOCK_PULSE_SECONDS,
        high_sample: CV_GATE_HIGH,
      },
      pitch_cv: {
        standard: "1V/oct CV-style audio",
        reference: "C4 = 0V",
        full_scale: `+/-${CV_FULL_SCALE_VOLTS}V maps to +/-1.0 sample`,
        note: "Use a DC-coupled interface or DAW CV utility; ordinary headphone outputs are usually AC-coupled and will not pass pitch CV correctly.",
      },
      stems: stemManifest,
    };
    files.push({ name: "manifest.json", data: stringBytes(JSON.stringify(manifest, null, 2)) });
    files.push({
      name: "README.txt",
      data: stringBytes([
        "amy_cin fishtail analogue CV package",
        "",
        "This ZIP contains mono 24-bit WAV files for modular / analogue workflows:",
        "- clock/*.wav: clean +5V-style clock pulses from the same tempo lattice used by the MIDI conductor map.",
        "- pitch/*.wav: 1V/oct CV-style pitch tracks, C4 = 0V, one octave = one volt.",
        "- gate/*.wav: +5V-style gates that follow each written voice note.",
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
      files: stemManifest.map((stem) => stem.filename),
      cv: manifest.pitch_cv,
    };
  }

  global.FishtailWavExport = {
    BIT_DEPTH,
    CHANNELS,
    MAX_RENDER_BYTES,
    TICKER_NORMALIZE_DBFS,
    CV_SAMPLE_RATE,
    CV_FULL_SCALE_VOLTS,
    CV_REFERENCE_MIDI,
    CV_CLOCK_PULSE_SECONDS,
    dbfsToGain,
    peakAbs,
    normalizePeak,
    encodePcm24Mono,
    makeZip,
    tickToSeconds,
    eventCvVolts,
    eventCvSample,
    chooseCvRenderPlan,
    renderCvVoiceSamples,
    estimateRenderBytes,
    chooseRenderPlan,
    renderProbeWav,
    renderTickerWav,
    renderCvZip,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
