"use strict";

(function exposeAudioEngine(global) {
  const LOOKAHEAD_SECONDS = 0.12;
  const SCHEDULER_MS = 25;
  const EPSILON_GAIN = 0.0001;
  const PROBE_MAX_GAIN = 0.42;
  const METRONOME_MAX_GAIN = 3.4;
  const LIVE_TEMPO_GLIDE_PULSES = 4;
  const LIVE_SWING_GLIDE_PULSES = 6;
  const LIVE_CONTROL_GLIDE_MIN_SECONDS = 1.1;
  const LIVE_CONTROL_GLIDE_MAX_SECONDS = 5.2;
  const LIVE_REFERENCE_GLIDE_SECONDS = 1;
  const LIVE_CONTROL_SNAP_EPSILON = 0.0001;

  function clamp(value, min, max) {
    return global.FishtailTempoLattice?.clamp
      ? global.FishtailTempoLattice.clamp(value, min, max)
      : Math.min(max, Math.max(min, value));
  }

  function levelToGain(level, maxGain) {
    const amount = clamp(Number(level) || 0, 0, 1);
    if (amount <= 0) return 0;
    const db = -42 + amount * 42;
    return maxGain * (10 ** (db / 20));
  }

  function cancelAndHold(param, time) {
    if (!param) return;
    if (typeof param.cancelAndHoldAtTime === "function") {
      param.cancelAndHoldAtTime(time);
    } else {
      const value = typeof param.value === "number" ? param.value : EPSILON_GAIN;
      param.cancelScheduledValues(time);
      param.setValueAtTime(value, time);
    }
  }

  function controlNumber(value, fallback, min, max) {
    const numeric = Number(value);
    return clamp(Number.isFinite(numeric) ? numeric : fallback, min, max);
  }

  function liveControlSnapshot(settings = {}) {
    return {
      tempo: controlNumber(settings.tempo, 60, 1, 999),
      rationalSwing: controlNumber(settings.rationalSwing, 0, 0, 1),
      irrationalSwing: controlNumber(settings.irrationalSwing, 0, 0, 1),
      referenceHz: controlNumber(settings.referenceHz, 216, 20, 2000),
    };
  }

  function pulseGlideSeconds(tempo, pulses) {
    const secondsPerPulse = 60 / Math.max(1, controlNumber(tempo, 60, 1, 999));
    return clamp(secondsPerPulse * pulses, LIVE_CONTROL_GLIDE_MIN_SECONDS, LIVE_CONTROL_GLIDE_MAX_SECONDS);
  }

  function glideValue(current, target, elapsedSeconds, glideSeconds) {
    if (!Number.isFinite(current)) return target;
    if (!Number.isFinite(target)) return current;
    if (elapsedSeconds <= 0 || glideSeconds <= 0) return current;
    const alpha = 1 - Math.exp(-elapsedSeconds / glideSeconds);
    const next = current + (target - current) * clamp(alpha, 0, 1);
    return Math.abs(next - target) <= LIVE_CONTROL_SNAP_EPSILON ? target : next;
  }

  function makeLiveControlState(settings, now = 0) {
    const snapshot = liveControlSnapshot(settings);
    const time = Math.max(0, Number(now) || 0);
    return {
      current: { ...snapshot },
      target: { ...snapshot },
      updatedAt: time,
    };
  }

  function advanceLiveControlState(control, now = 0) {
    if (!control) return null;
    const time = Math.max(0, Number(now) || 0);
    const elapsed = Math.max(0, time - (Number(control.updatedAt) || 0));
    const tempoGlide = pulseGlideSeconds(control.target.tempo, LIVE_TEMPO_GLIDE_PULSES);
    const swingGlide = pulseGlideSeconds(control.target.tempo, LIVE_SWING_GLIDE_PULSES);
    control.current.tempo = glideValue(control.current.tempo, control.target.tempo, elapsed, tempoGlide);
    control.current.rationalSwing = glideValue(control.current.rationalSwing, control.target.rationalSwing, elapsed, swingGlide);
    control.current.irrationalSwing = glideValue(control.current.irrationalSwing, control.target.irrationalSwing, elapsed, swingGlide);
    control.current.referenceHz = glideValue(control.current.referenceHz, control.target.referenceHz, elapsed, LIVE_REFERENCE_GLIDE_SECONDS);
    control.updatedAt = time;
    return control.current;
  }

  function updateLiveControlTarget(control, settings, now = 0) {
    const state = control || makeLiveControlState(settings, now);
    advanceLiveControlState(state, now);
    state.target = liveControlSnapshot(settings);
    state.updatedAt = Math.max(0, Number(now) || 0);
    return state;
  }

  function smoothedMetronomeSettings(settings, control, now = 0) {
    const current = advanceLiveControlState(control, now);
    if (!current) return { ...settings };
    return {
      ...settings,
      tempo: current.tempo,
      rationalSwing: current.rationalSwing,
      irrationalSwing: current.irrationalSwing,
      referenceHz: current.referenceHz,
    };
  }

  function ensureAudioState(audio, context) {
    if (!audio || !context) return null;
    audio.context = context;
    if (audio.safetyBus) return audio.safetyBus;
    const safetyBus = context.createGain();
    safetyBus.gain.setValueAtTime(0.86, context.currentTime);
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-8, context.currentTime);
    limiter.knee.setValueAtTime(12, context.currentTime);
    limiter.ratio.setValueAtTime(8, context.currentTime);
    limiter.attack.setValueAtTime(0.003, context.currentTime);
    limiter.release.setValueAtTime(0.18, context.currentTime);
    safetyBus.connect(limiter).connect(context.destination);
    audio.safetyBus = safetyBus;
    audio.limiter = limiter;
    return safetyBus;
  }

  function makePinkNoiseBuffer(context, seconds = 2) {
    const frames = Math.max(1, Math.floor(context.sampleRate * seconds));
    const buffer = context.createBuffer(1, frames, context.sampleRate);
    const data = buffer.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    let b3 = 0;
    let b4 = 0;
    let b5 = 0;
    let b6 = 0;
    let peak = 0.0001;
    for (let i = 0; i < frames; i += 1) {
      const white = (global.FishtailTempoLattice.hashUnit("pink", i, frames) * 2) - 1;
      b0 = 0.99886 * b0 + white * 0.0555179;
      b1 = 0.99332 * b1 + white * 0.0750759;
      b2 = 0.96900 * b2 + white * 0.1538520;
      b3 = 0.86650 * b3 + white * 0.3104856;
      b4 = 0.55000 * b4 + white * 0.5329522;
      b5 = -0.7616 * b5 - white * 0.0168980;
      const sample = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
      b6 = white * 0.115926;
      data[i] = sample;
      peak = Math.max(peak, Math.abs(sample));
    }
    const scale = 0.42 / peak;
    for (let i = 0; i < frames; i += 1) data[i] *= scale;
    return buffer;
  }

  function ensurePinkNoiseBuffer(audio, context) {
    if (!audio.pinkNoiseBuffer || audio.pinkNoiseBuffer.sampleRate !== context.sampleRate) {
      audio.pinkNoiseBuffer = makePinkNoiseBuffer(context);
    }
    return audio.pinkNoiseBuffer;
  }

  function startProbe(audio, context, settings) {
    if (!context || settings.probeMuted) return null;
    ensureAudioState(audio, context);
    if (audio.probe && !audio.probe.released) {
      updateProbe(audio, context, settings);
      return audio.probe;
    }
    if (audio.probe?.released) audio.probe = null;
    const now = context.currentTime;
    const table = global.FishtailTempoLattice.buildTeardropVoiceTable(settings.referenceHz, 12);
    const mix = context.createGain();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    const oscillators = [];
    const gains = [];
    mix.gain.setValueAtTime(levelToGain(settings.probeLevel, PROBE_MAX_GAIN), now);
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(global.FishtailTempoLattice.teardropLowpassHz(settings.referenceHz), now);
    filter.Q.setValueAtTime(0.45, now);
    envelope.gain.setValueAtTime(EPSILON_GAIN, now);
    envelope.gain.exponentialRampToValueAtTime(1, now + global.FishtailTempoLattice.TEARDROP_ATTACK_SECONDS);
    table.forEach((voice) => {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(voice.frequency, now);
      gain.gain.setValueAtTime(voice.weight, now);
      osc.connect(gain).connect(mix);
      osc.start(now);
      oscillators.push(osc);
      gains.push(gain);
    });
    mix.connect(filter).connect(envelope).connect(audio.safetyBus);
    audio.probe = { oscillators, gains, mix, filter, envelope, released: false };
    return audio.probe;
  }

  function updateProbe(audio, context, settings) {
    const probe = audio?.probe;
    if (!probe || !context) return;
    if (settings.probeMuted) {
      stopProbe(audio, context);
      return;
    }
    const now = context.currentTime;
    const table = global.FishtailTempoLattice.buildTeardropVoiceTable(settings.referenceHz, 12);
    probe.oscillators.forEach((osc, index) => {
      const voice = table[index];
      if (!voice) return;
      cancelAndHold(osc.frequency, now);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, voice.frequency), now + global.FishtailTempoLattice.TEARDROP_GLIDE_SECONDS);
      const gain = probe.gains[index];
      if (gain) {
        cancelAndHold(gain.gain, now);
        gain.gain.linearRampToValueAtTime(voice.weight, now + 0.12);
      }
    });
    cancelAndHold(probe.filter.frequency, now);
    probe.filter.frequency.exponentialRampToValueAtTime(global.FishtailTempoLattice.teardropLowpassHz(settings.referenceHz), now + global.FishtailTempoLattice.TEARDROP_GLIDE_SECONDS);
    cancelAndHold(probe.mix.gain, now);
    probe.mix.gain.linearRampToValueAtTime(levelToGain(settings.probeLevel, PROBE_MAX_GAIN), now + 0.04);
  }

  function stopProbe(audio, context) {
    const probe = audio?.probe;
    if (!probe || !context || probe.released) return;
    const now = context.currentTime;
    probe.released = true;
    if (audio.probe === probe) audio.probe = null;
    cancelAndHold(probe.envelope.gain, now);
    probe.envelope.gain.exponentialRampToValueAtTime(EPSILON_GAIN, now + global.FishtailTempoLattice.TEARDROP_RELEASE_SECONDS);
    probe.oscillators.forEach((osc) => {
      try {
        osc.stop(now + global.FishtailTempoLattice.TEARDROP_RELEASE_SECONDS + 0.08);
      } catch (error) {
        // The node may already be stopped by a browser after a cancel/release race.
      }
    });
    setTimeout(() => {
      try {
        probe.oscillators.forEach((osc) => osc.disconnect());
        probe.gains.forEach((gain) => gain.disconnect());
        probe.mix.disconnect();
        probe.filter.disconnect();
        probe.envelope.disconnect();
      } catch (error) {
        // Disconnect cleanup is best-effort across browser audio implementations.
      }
      if (audio.probe === probe) audio.probe = null;
    }, (global.FishtailTempoLattice.TEARDROP_RELEASE_SECONDS + 0.2) * 1000);
  }

  function buildMetronomePattern(settings) {
    const meter = settings.meters?.[settings.metronomeMeter] || settings.meters?.["4/4"];
    const pulse = meter?.pulse || 480;
    const numerator = meter?.numerator || 4;
    const section = {
      bars: 16,
      meter: settings.metronomeMeter || "4/4",
      startTick: 0,
      barTicks: numerator * pulse,
      numerator,
      denominator: meter?.denominator || 4,
    };
    return global.FishtailTempoLattice.buildTempoTimeline([section], {
      seed: settings.seed || "live-metronome",
      tempo: settings.tempo || 60,
      tempoLatticeEnabled: Boolean(settings.tempoLatticeEnabled),
      rationalSwing: settings.rationalSwing,
      irrationalSwing: settings.irrationalSwing,
      irrationalFeelMode: settings.irrationalFeelMode,
    }, { ppq: settings.ppq || 480, meters: settings.meters }).segments;
  }

  function scheduleMetronomeTick(metronome, context, time, segment, settings) {
    const gain = levelToGain(settings.metronomeLevel, METRONOME_MAX_GAIN) * clamp(segment.accentLevel || 0.25, 0.05, 1.2);
    const filterHz = global.FishtailTempoLattice.tickerCenterHz(settings.referenceHz);
    cancelAndHold(metronome.filter.frequency, time);
    metronome.filter.frequency.exponentialRampToValueAtTime(filterHz, time + global.FishtailTempoLattice.TICKER_FILTER_GLIDE_SECONDS);
    metronome.tickGain.gain.setValueAtTime(EPSILON_GAIN, time);
    metronome.tickGain.gain.linearRampToValueAtTime(Math.max(EPSILON_GAIN, gain), time + global.FishtailTempoLattice.TICKER_ATTACK_SECONDS);
    metronome.tickGain.gain.exponentialRampToValueAtTime(EPSILON_GAIN, time + global.FishtailTempoLattice.TICKER_DECAY_SECONDS);
  }

  function schedulerStep(audio, revision) {
    const metronome = audio?.metronome;
    const context = audio?.context;
    if (!metronome || !context || audio.schedulerRevision !== revision) return;
    const settings = smoothedMetronomeSettings(metronome.settings, metronome.control, context.currentTime);
    const pattern = buildMetronomePattern(settings);
    metronome.pattern = pattern;
    while (metronome.nextTickTime < context.currentTime + LOOKAHEAD_SECONDS) {
      const segment = pattern[metronome.patternIndex % pattern.length];
      scheduleMetronomeTick(metronome, context, metronome.nextTickTime, segment, settings);
      const duration = Number(segment.durationSeconds);
      if (!Number.isFinite(duration) || duration <= 0) break;
      metronome.nextTickTime += duration;
      metronome.patternIndex += 1;
    }
    audio.schedulerTimer = setTimeout(() => schedulerStep(audio, revision), SCHEDULER_MS);
  }

  function startMetronome(audio, context, settings) {
    if (!context || !settings.metronomeEnabled) return null;
    ensureAudioState(audio, context);
    if (audio.metronome) {
      updateMetronome(audio, context, settings);
      return audio.metronome;
    }
    const now = context.currentTime;
    const source = context.createBufferSource();
    source.buffer = ensurePinkNoiseBuffer(audio, context);
    source.loop = true;
    const filter = context.createBiquadFilter();
    filter.type = "bandpass";
    filter.frequency.setValueAtTime(global.FishtailTempoLattice.tickerCenterHz(settings.referenceHz), now);
    filter.Q.setValueAtTime(global.FishtailTempoLattice.TICKER_WEB_AUDIO_Q, now);
    const tickGain = context.createGain();
    tickGain.gain.setValueAtTime(EPSILON_GAIN, now);
    source.connect(filter).connect(tickGain).connect(audio.safetyBus);
    source.start(now);
    audio.schedulerRevision = (audio.schedulerRevision || 0) + 1;
    audio.metronome = {
      source,
      filter,
      tickGain,
      settings: { ...settings },
      control: makeLiveControlState(settings, now),
      pattern: buildMetronomePattern(settings),
      patternIndex: 0,
      nextTickTime: now + 0.05,
    };
    clearTimeout(audio.schedulerTimer);
    schedulerStep(audio, audio.schedulerRevision);
    return audio.metronome;
  }

  function updateMetronome(audio, context, settings) {
    const metronome = audio?.metronome;
    if (!metronome || !context) return;
    if (!settings.metronomeEnabled) {
      stopMetronome(audio);
      return;
    }
    const now = context.currentTime;
    metronome.control = updateLiveControlTarget(metronome.control, settings, now);
    metronome.settings = { ...settings };
    const smoothed = smoothedMetronomeSettings(metronome.settings, metronome.control, now);
    metronome.pattern = buildMetronomePattern(smoothed);
    cancelAndHold(metronome.filter.frequency, now);
    metronome.filter.frequency.exponentialRampToValueAtTime(global.FishtailTempoLattice.tickerCenterHz(smoothed.referenceHz), now + global.FishtailTempoLattice.TICKER_FILTER_GLIDE_SECONDS);
  }

  function stopMetronome(audio) {
    const metronome = audio?.metronome;
    if (!metronome) return;
    audio.schedulerRevision = (audio.schedulerRevision || 0) + 1;
    clearTimeout(audio.schedulerTimer);
    audio.schedulerTimer = null;
    try {
      metronome.source.stop();
      metronome.source.disconnect();
      metronome.filter.disconnect();
      metronome.tickGain.disconnect();
    } catch (error) {
      // Metronome cleanup is best-effort if a browser has already torn down nodes.
    }
    audio.metronome = null;
  }

  function stopAll(audio, context) {
    stopMetronome(audio);
    stopProbe(audio, context || audio?.context);
  }

  global.FishtailAudioEngine = {
    PROBE_MAX_GAIN,
    METRONOME_MAX_GAIN,
    LIVE_TEMPO_GLIDE_PULSES,
    LIVE_SWING_GLIDE_PULSES,
    LIVE_CONTROL_GLIDE_MIN_SECONDS,
    LIVE_CONTROL_GLIDE_MAX_SECONDS,
    LIVE_REFERENCE_GLIDE_SECONDS,
    ensureAudioState,
    ensurePinkNoiseBuffer,
    makePinkNoiseBuffer,
    makeLiveControlState,
    updateLiveControlTarget,
    smoothedMetronomeSettings,
    startProbe,
    updateProbe,
    stopProbe,
    buildMetronomePattern,
    startMetronome,
    updateMetronome,
    stopMetronome,
    stopAll,
    levelToGain,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
