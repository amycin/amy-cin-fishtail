"use strict";

(function exposeTempoLattice(global) {
  const DEFAULT_PPQ = 480;
  const DEFAULT_LAW = "balanced_random_midpoint_v1";
  const TEARDROP_MODEL = "teardrop_v1";
  const TICKER_MODEL = "pink_bpf_v1";
  const TEARDROP_DELTA = 1 / (12 * 12);
  const TEARDROP_Q = 2;
  const TEARDROP_P = 2;
  const TEARDROP_GLIDE_SECONDS = 1;
  const TEARDROP_ATTACK_SECONDS = 0.35;
  const TEARDROP_RELEASE_SECONDS = 1.2;
  const TICKER_RQ = 0.18;
  const TICKER_WEB_AUDIO_Q = 1 / TICKER_RQ;
  const TICKER_ATTACK_SECONDS = 0.0001;
  const TICKER_DECAY_SECONDS = 0.03;
  const TICKER_FILTER_GLIDE_SECONDS = 0.03;

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function hashUnit(...parts) {
    const text = parts.map((part) => String(part)).join(":");
    let hash = 2166136261;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    hash ^= hash >>> 16;
    hash = Math.imul(hash, 2246822507);
    hash ^= hash >>> 13;
    hash = Math.imul(hash, 3266489909);
    hash ^= hash >>> 16;
    return (hash >>> 0) / 0x100000000;
  }

  function rationalSwingAmount(value) {
    const gentle = 0.12;
    const feral = 0.4;
    const x = clamp(Number(value) || 0, 0, 1);
    return x <= 0.5
      ? x * (gentle / 0.5)
      : gentle + (x - 0.5) * ((feral - gentle) / 0.5);
  }

  function meterAccentGroups(meter) {
    const numerator = Math.max(1, Math.round(meter?.numerator || 4));
    const rawAccents = Array.isArray(meter?.accents) ? meter.accents : [0];
    const accents = [...new Set(rawAccents.map((value) => Math.round(value)).filter((value) => value >= 0 && value < numerator))].sort((a, b) => a - b);
    if (!accents.includes(0)) accents.unshift(0);
    const groups = [];
    for (let i = 0; i < accents.length; i += 1) {
      const start = accents[i];
      const end = accents[i + 1] == null ? numerator : accents[i + 1];
      const length = Math.max(1, end - start);
      groups.push({ start, length, accent: start });
    }
    return groups;
  }

  function accentLevelForPulse(meter, pulseIndex) {
    const accents = Array.isArray(meter?.accents) ? meter.accents : [0];
    if (pulseIndex === 0) return 1;
    return accents.includes(pulseIndex) ? 0.5 : 0.25;
  }

  function rationalGroupWeights(length, swingAmount) {
    if (length <= 1) return [1];
    if (length === 2) return [1 + swingAmount, 1 - swingAmount];
    if (length === 3) return [1 + swingAmount, 1, 1 - swingAmount];
    const centre = (length - 1) / 2;
    return Array.from({ length }, (_, index) => 1 + swingAmount * ((centre - index) / Math.max(1, centre)));
  }

  function irrationalGroupOffsets({ length, amount, seed, sectionIndex, barIndex, groupIndex }) {
    const safeLength = Math.max(1, Math.round(length) || 1);
    const safeAmount = clamp(Number(amount) || 0, 0, 1);
    if (safeLength <= 1 || !safeAmount) return Array.from({ length: safeLength }, () => 0);
    const depth = safeAmount * (0.08 + 0.24 * hashUnit(seed || "fishtail", "tempo-lattice-depth", sectionIndex, barIndex, groupIndex));
    if (safeLength === 2) {
      const direction = hashUnit(seed || "fishtail", "tempo-lattice-direction", sectionIndex, barIndex, groupIndex) < 0.5 ? -1 : 1;
      return [direction * depth, -direction * depth];
    }
    const raw = Array.from({ length: safeLength }, (_, pulseOffset) => (
      hashUnit(seed || "fishtail", "tempo-lattice-stumble", sectionIndex, barIndex, groupIndex, pulseOffset) * 2 - 1
    ));
    const mean = raw.reduce((sum, value) => sum + value, 0) / safeLength;
    const centred = raw.map((value) => value - mean);
    const maxAbs = centred.reduce((max, value) => Math.max(max, Math.abs(value)), 0);
    if (maxAbs < 1e-9) {
      return centred.map((_, index) => (index % 2 === 0 ? depth : -depth));
    }
    return centred.map((value) => value * depth / maxAbs);
  }

  function swingGroupWeights({ length, rationalAmount, irrationalAmount, seed, sectionIndex, barIndex, groupIndex }) {
    const rational = rationalSwingAmount(rationalAmount);
    const irrational = clamp(Number(irrationalAmount) || 0, 0, 1);
    const baseWeights = rationalGroupWeights(length, rational);
    const offsets = irrationalGroupOffsets({ length, amount: irrational, seed, sectionIndex, barIndex, groupIndex });
    const rawWeights = baseWeights.map((weight, pulseOffset) => weight + (offsets[pulseOffset] || 0));
    const minWeight = 0.08;
    const positive = rawWeights.map((weight) => Math.max(minWeight, weight));
    const targetSum = length;
    const sum = positive.reduce((total, weight) => total + weight, 0) || targetSum;
    const normalized = positive.map((weight) => weight * targetSum / sum);
    const firstWeight = normalized[0] || 1;
    const midpoint = length > 1 ? firstWeight / Math.max(0.0001, normalized.reduce((total, weight) => total + weight, 0)) : 1;
    return {
      weights: normalized,
      rawWeights,
      rationalSwing: rational,
      rationalMidpoint: midpoint,
    };
  }

  function baseMicrosecondsPerQuarter(settings) {
    const bpm = clamp(Number(settings?.tempo) || 60, 1, 999);
    return clamp(Math.round(60000000 / bpm), 1, 0xffffff);
  }

  function microsecondsForSegment(durationSeconds, tickLength, ppq) {
    return clamp(Math.round(durationSeconds * 1000000 * ppq / Math.max(1, tickLength)), 1, 0xffffff);
  }

  function buildTempoTimeline(sectionMeta, settings = {}, options = {}) {
    const ppq = Math.max(1, Math.round(options.ppq || settings.ppq || DEFAULT_PPQ));
    const meters = options.meters || {};
    const enabled = Boolean(settings.tempoLatticeEnabled);
    const rationalAmount = enabled ? clamp(Number(settings.rationalSwing) || 0, 0, 1) : 0;
    const irrationalAmount = enabled ? clamp(Number(settings.irrationalSwing) || 0, 0, 1) : 0;
    const baseMpq = baseMicrosecondsPerQuarter(settings);
    const segments = [];
    const tempoEvents = [];
    const tickerEvents = [];
    let totalSeconds = 0;
    let minInstantaneousBpm = Infinity;
    let maxInstantaneousBpm = 0;
    let lastTempoTick = null;
    let lastTempoValue = null;
    let endpointsPreserved = true;

    const pushTempoEvent = (tick, microsecondsPerQuarter) => {
      const safeTick = Math.max(0, Math.round(tick));
      const safeTempo = clamp(Math.round(microsecondsPerQuarter), 1, 0xffffff);
      if (safeTick === lastTempoTick) {
        if (tempoEvents.length) tempoEvents[tempoEvents.length - 1].microsecondsPerQuarter = safeTempo;
        lastTempoValue = safeTempo;
        return;
      }
      if (safeTempo === lastTempoValue) return;
      tempoEvents.push({ tick: safeTick, microsecondsPerQuarter: safeTempo });
      lastTempoTick = safeTick;
      lastTempoValue = safeTempo;
    };

    (sectionMeta || []).forEach((section, sectionIndex) => {
      const meter = meters[section.meter] || {
        numerator: section.numerator || 4,
        denominator: section.denominator || 4,
        pulse: section.barTicks ? section.barTicks / Math.max(1, section.numerator || 4) : ppq,
        accents: [0],
      };
      const numerator = Math.max(1, Math.round(section.numerator || meter.numerator || 4));
      const pulseTicks = Math.max(1, Math.round(meter.pulse || (section.barTicks / numerator) || ppq));
      const barTicks = Math.max(pulseTicks, Math.round(section.barTicks || numerator * pulseTicks));
      const bars = Math.max(1, Math.round(section.bars || 1));
      const sectionStartTick = Math.max(0, Math.round(section.startTick || 0));
      const basePulseSeconds = (baseMpq / 1000000) * (pulseTicks / ppq);
      const groups = meterAccentGroups({ ...meter, numerator });

      for (let barIndex = 0; barIndex < bars; barIndex += 1) {
        let barWeightTotal = 0;
        groups.forEach((group, groupIndex) => {
          const shaped = swingGroupWeights({
            length: group.length,
            rationalAmount,
            irrationalAmount,
            seed: settings.seed,
            sectionIndex,
            barIndex,
            groupIndex,
          });
          shaped.weights.forEach((weight, offset) => {
            const pulseIndex = group.start + offset;
            if (pulseIndex >= numerator) return;
            const tick = sectionStartTick + barIndex * barTicks + pulseIndex * pulseTicks;
            const durationSeconds = basePulseSeconds * weight;
            const microsecondsPerQuarter = microsecondsForSegment(durationSeconds, pulseTicks, ppq);
            const instantaneousBpm = 60000000 / microsecondsPerQuarter;
            minInstantaneousBpm = Math.min(minInstantaneousBpm, instantaneousBpm);
            maxInstantaneousBpm = Math.max(maxInstantaneousBpm, instantaneousBpm);
            pushTempoEvent(tick, enabled ? microsecondsPerQuarter : baseMpq);
            tickerEvents.push({
              timeSeconds: totalSeconds,
              accentLevel: accentLevelForPulse(meter, pulseIndex),
              sectionIndex,
              barIndex,
              pulseIndex,
            });
            segments.push({
              tick,
              tickLength: pulseTicks,
              microsecondsPerQuarter: enabled ? microsecondsPerQuarter : baseMpq,
              durationSeconds,
              sectionIndex,
              barIndex,
              pulseIndex,
              accentLevel: accentLevelForPulse(meter, pulseIndex),
              rationalMidpoint: shaped.rationalMidpoint,
              irrationalOffset: shaped.rawWeights[offset] - rationalGroupWeights(group.length, shaped.rationalSwing)[offset],
              durationWeight: weight,
            });
            totalSeconds += durationSeconds;
            barWeightTotal += weight;
          });
        });
        if (Math.abs(barWeightTotal - numerator) > 0.00001) endpointsPreserved = false;
      }
    });

    if (!tempoEvents.length) tempoEvents.push({ tick: 0, microsecondsPerQuarter: baseMpq });
    return {
      enabled,
      law: DEFAULT_LAW,
      segments,
      tempoEvents,
      tickerEvents,
      totalSeconds,
      minInstantaneousBpm: Number.isFinite(minInstantaneousBpm) ? minInstantaneousBpm : 60000000 / baseMpq,
      maxInstantaneousBpm: maxInstantaneousBpm || 60000000 / baseMpq,
      baseMicrosecondsPerQuarter: baseMpq,
      barEndpointsPreserved: endpointsPreserved,
    };
  }

  function buildTeardropVoiceTable(f0, budget = 12) {
    const safeF0 = Math.max(1, Math.abs(Number(f0) || 1));
    const maxVoices = Math.max(1, Math.floor(budget || 12));
    const pairCount = Math.max(0, Math.floor((maxVoices - 1) / 2));
    const positions = [];
    for (let i = -pairCount; i <= pairCount; i += 1) {
      positions.push(pairCount ? i / (pairCount + 1) : 0);
    }
    const raw = positions.map((x) => {
      const frequencyFactor = 2 ** (x * TEARDROP_DELTA);
      const weight = Math.max(0, 1 - Math.abs(x) ** TEARDROP_Q) ** TEARDROP_P;
      return {
        x,
        frequency: safeF0 * frequencyFactor,
        frequencyFactor,
        weight,
      };
    });
    const weightSum = raw.reduce((sum, voice) => sum + voice.weight, 0) || 1;
    return raw.map((voice, index) => ({
      ...voice,
      index,
      weight: voice.weight / weightSum,
    }));
  }

  function teardropLowpassHz(f0) {
    return clamp(Math.abs(Number(f0) || 0) * 12, 800, 14000);
  }

  function tickerCenterHz(f0) {
    return clamp(Math.abs(Number(f0) || 0) * 8, 400, 8000);
  }

  global.FishtailTempoLattice = {
    DEFAULT_LAW,
    TEARDROP_MODEL,
    TICKER_MODEL,
    TEARDROP_DELTA,
    TEARDROP_Q,
    TEARDROP_P,
    TEARDROP_GLIDE_SECONDS,
    TEARDROP_ATTACK_SECONDS,
    TEARDROP_RELEASE_SECONDS,
    TICKER_RQ,
    TICKER_WEB_AUDIO_Q,
    TICKER_ATTACK_SECONDS,
    TICKER_DECAY_SECONDS,
    TICKER_FILTER_GLIDE_SECONDS,
    rationalSwingAmount,
    meterAccentGroups,
    accentLevelForPulse,
    buildTempoTimeline,
    buildTeardropVoiceTable,
    teardropLowpassHz,
    tickerCenterHz,
    hashUnit,
    clamp,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
