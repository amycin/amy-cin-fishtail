"use strict";

(function exposeWavExport(global) {
  const BIT_DEPTH = 24;
  const CHANNELS = 1;
  const MAX_RENDER_BYTES = 220 * 1024 * 1024;
  const EPSILON_GAIN = 0.0001;

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
    const baseGain = global.FishtailAudioEngine?.levelToGain
      ? global.FishtailAudioEngine.levelToGain(level, 0.32)
      : level * 0.12;
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
    const bytes = encodePcm24Mono(buffer.getChannelData(0), plan.sampleRate);
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
    };
  }

  global.FishtailWavExport = {
    BIT_DEPTH,
    CHANNELS,
    MAX_RENDER_BYTES,
    encodePcm24Mono,
    estimateRenderBytes,
    chooseRenderPlan,
    renderProbeWav,
    renderTickerWav,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
