"use strict";

(function exposeTempoLattice(global) {
  const DEFAULT_PPQ = 480;
  const DEFAULT_LAW = "balanced_random_midpoint_v1";
  const NATURAL_SPREAD_LAW = "natural_spread_v2";
  const DEFAULT_SAFE_LAW = NATURAL_SPREAD_LAW;
  const DRIFT_LAW = "seeded_living_drift_v1";
  const IRRATIONAL_FEEL_MODES = Object.freeze({
    LATTICE_SAFE: "lattice_safe",
    HYBRID_DRIFT: "hybrid_drift",
    LIVING_DRIFT: "living_drift",
  });
  const DEFAULT_IRRATIONAL_FEEL_MODE = IRRATIONAL_FEEL_MODES.LIVING_DRIFT;
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
  const DRIFT_MIN_WEIGHT = 0.05;
  const DRIFT_MAX_RAW_WEIGHT = 2.5;

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

  function normalizeTempoLatticeLaw(value) {
    const law = String(value || DEFAULT_SAFE_LAW).trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (law === "balanced" || law === "random_midpoint" || law === DEFAULT_LAW) return DEFAULT_LAW;
    if (law === "natural" || law === "natural_spread" || law === NATURAL_SPREAD_LAW) return NATURAL_SPREAD_LAW;
    return DEFAULT_SAFE_LAW;
  }

  function balancedRandomMidpointOffsets({ length, amount, seed, sectionIndex, barIndex, groupIndex }) {
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

  function naturalSpreadOffsets({ length, amount, seed, sectionIndex, barIndex, groupIndex }) {
    const safeLength = Math.max(1, Math.round(length) || 1);
    const safeAmount = clamp(Number(amount) || 0, 0, 1);
    if (safeLength <= 1 || !safeAmount) return Array.from({ length: safeLength }, () => 0);
    const depth = safeAmount * (0.08 + 0.24 * hashUnit(seed || "fishtail", "tempo-lattice-depth", sectionIndex, barIndex, groupIndex));
    const raw = Array.from({ length: safeLength }, (_, pulseOffset) => (
      hashUnit(seed || "fishtail", "tempo-lattice-stumble", sectionIndex, barIndex, groupIndex, pulseOffset) * 2 - 1
    ));
    const mean = raw.reduce((sum, value) => sum + value, 0) / safeLength;
    return raw.map((value) => (value - mean) * depth * 0.5);
  }

  function irrationalGroupOffsets({ length, amount, seed, sectionIndex, barIndex, groupIndex, law }) {
    return normalizeTempoLatticeLaw(law) === DEFAULT_LAW
      ? balancedRandomMidpointOffsets({ length, amount, seed, sectionIndex, barIndex, groupIndex })
      : naturalSpreadOffsets({ length, amount, seed, sectionIndex, barIndex, groupIndex });
  }

  function swingGroupWeights({ length, rationalAmount, irrationalAmount, seed, sectionIndex, barIndex, groupIndex, law }) {
    const rational = rationalSwingAmount(rationalAmount);
    const irrational = clamp(Number(irrationalAmount) || 0, 0, 1);
    const baseWeights = rationalGroupWeights(length, rational);
    const offsets = irrationalGroupOffsets({ length, amount: irrational, seed, sectionIndex, barIndex, groupIndex, law });
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

  function normalizeIrrationalFeelMode(value) {
    const mode = String(value || DEFAULT_IRRATIONAL_FEEL_MODE).trim().toLowerCase().replace(/[\s-]+/g, "_");
    if (mode === "hybrid" || mode === IRRATIONAL_FEEL_MODES.HYBRID_DRIFT) return IRRATIONAL_FEEL_MODES.HYBRID_DRIFT;
    if (mode === "living" || mode === IRRATIONAL_FEEL_MODES.LIVING_DRIFT) return IRRATIONAL_FEEL_MODES.LIVING_DRIFT;
    return IRRATIONAL_FEEL_MODES.LATTICE_SAFE;
  }

  function barBasePulseWeights(meter, numerator, rationalAmount) {
    const groups = meterAccentGroups({ ...meter, numerator });
    const rational = rationalSwingAmount(rationalAmount);
    const weights = Array.from({ length: numerator }, () => 1);
    const groupForPulse = Array.from({ length: numerator }, () => null);
    groups.forEach((group, groupIndex) => {
      const base = rationalGroupWeights(group.length, rational);
      base.forEach((weight, offset) => {
        const pulseIndex = group.start + offset;
        if (pulseIndex >= numerator) return;
        weights[pulseIndex] = weight;
        groupForPulse[pulseIndex] = { ...group, groupIndex };
      });
    });
    return { weights, groups, groupForPulse, rationalSwing: rational };
  }

  function driftPulseJitter({ amount, seed, sectionIndex, barIndex, pulseIndex, mode }) {
    const irrational = clamp(Number(amount) || 0, 0, 1);
    if (!irrational) return 0;
    const jitterAmt = 0.5 * irrational;
    return (hashUnit(seed || "fishtail", "living-drift-jitter", mode, sectionIndex, barIndex, pulseIndex) * 2 - 1) * jitterAmt;
  }

  function rawDriftBarPlan({ meter, numerator, rationalAmount, irrationalAmount, seed, sectionIndex, barIndex, mode }) {
    const base = barBasePulseWeights(meter, numerator, rationalAmount);
    const weights = base.weights.map((weight, pulseIndex) => clamp(
      weight + driftPulseJitter({ amount: irrationalAmount, seed, sectionIndex, barIndex, pulseIndex, mode }),
      DRIFT_MIN_WEIGHT,
      DRIFT_MAX_RAW_WEIGHT
    ));
    return {
      weights,
      baseWeights: base.weights,
      groups: base.groups,
      groupForPulse: base.groupForPulse,
      rationalSwing: base.rationalSwing,
    };
  }

  function distributeEndpointCorrection(weights, targetSum, options = {}) {
    const corrected = weights.map((weight) => Math.max(DRIFT_MIN_WEIGHT, Number(weight) || DRIFT_MIN_WEIGHT));
    const initialSum = corrected.reduce((sum, weight) => sum + weight, 0);
    let remaining = targetSum - initialSum;
    if (Math.abs(remaining) < 1e-10) {
      return { weights: corrected, correctionAmount: 0, residual: 0 };
    }

    const window = Math.max(1, Math.min(corrected.length, Math.round(options.window || corrected.length)));
    const indexes = Array.from({ length: window }, (_, index) => corrected.length - window + index);
    const spreadAcross = (candidateIndexes, passes = 8) => {
      for (let pass = 0; pass < passes && Math.abs(remaining) > 1e-9; pass += 1) {
        const available = candidateIndexes.filter((index) => remaining > 0 || corrected[index] > DRIFT_MIN_WEIGHT + 1e-9);
        if (!available.length) break;
        const shapes = available.map((_, index) => (index + 1) ** 1.35);
        const shapeTotal = shapes.reduce((sum, value) => sum + value, 0) || 1;
        available.forEach((index, order) => {
          const ideal = remaining * (shapes[order] / shapeTotal);
          const delta = remaining < 0 ? Math.max(ideal, DRIFT_MIN_WEIGHT - corrected[index]) : ideal;
          corrected[index] += delta;
        });
        const nextRemaining = targetSum - corrected.reduce((sum, weight) => sum + weight, 0);
        if (Math.abs(nextRemaining - remaining) < 1e-12) break;
        remaining = nextRemaining;
      }
    };
    spreadAcross(indexes);

    if (Math.abs(remaining) > 1e-9 && remaining < 0) {
      spreadAcross(Array.from({ length: corrected.length }, (_, index) => index), 12);
    }

    if (Math.abs(remaining) > 1e-9) {
      const fallback = remaining < 0
        ? Array.from({ length: corrected.length }, (_, index) => index).reverse().find((index) => corrected[index] > DRIFT_MIN_WEIGHT + 1e-9)
        : indexes[indexes.length - 1];
      if (fallback != null) {
        const delta = remaining < 0 ? Math.max(remaining, DRIFT_MIN_WEIGHT - corrected[fallback]) : remaining;
        corrected[fallback] += delta;
      }
    }

    const residual = targetSum - corrected.reduce((sum, weight) => sum + weight, 0);
    return {
      weights: corrected,
      correctionAmount: Math.abs(targetSum - initialSum),
      residual,
    };
  }

  function buildDriftBarPlans({ mode, bars, meter, numerator, rationalAmount, irrationalAmount, seed, sectionIndex }) {
    const plans = Array.from({ length: bars }, (_, barIndex) => rawDriftBarPlan({
      meter,
      numerator,
      rationalAmount,
      irrationalAmount,
      seed,
      sectionIndex,
      barIndex,
      mode,
    }));
    let endpointCorrectionAmount = 0;
    if (mode === IRRATIONAL_FEEL_MODES.HYBRID_DRIFT) {
      const window = Math.min(numerator, Math.max(2, Math.ceil(numerator * 0.5)));
      plans.forEach((plan) => {
        const corrected = distributeEndpointCorrection(plan.weights, numerator, { window });
        plan.weights = corrected.weights;
        endpointCorrectionAmount += corrected.correctionAmount;
      });
      return { plans, endpointCorrectionAmount };
    }

    const phraseBars = Math.max(1, Math.min(4, bars));
    for (let phraseStart = 0; phraseStart < plans.length; phraseStart += phraseBars) {
      const phrase = plans.slice(phraseStart, phraseStart + phraseBars);
      const flat = phrase.flatMap((plan) => plan.weights);
      const target = flat.length;
      const window = Math.min(flat.length, Math.max(numerator, Math.ceil(flat.length * 0.35)));
      const corrected = distributeEndpointCorrection(flat, target, { window });
      endpointCorrectionAmount += corrected.correctionAmount;
      let offset = 0;
      phrase.forEach((plan) => {
        plan.weights = corrected.weights.slice(offset, offset + numerator);
        offset += numerator;
      });
    }
    return { plans, endpointCorrectionAmount };
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
    const feelMode = enabled ? normalizeIrrationalFeelMode(settings.irrationalFeelMode) : IRRATIONAL_FEEL_MODES.LATTICE_SAFE;
    const safeLaw = enabled ? normalizeTempoLatticeLaw(settings.tempoLatticeLaw || settings.irrationalLaw) : DEFAULT_LAW;
    const law = feelMode === IRRATIONAL_FEEL_MODES.LATTICE_SAFE ? safeLaw : DRIFT_LAW;
    const baseMpq = baseMicrosecondsPerQuarter(settings);
    const segments = [];
    const tempoEvents = [];
    const tickerEvents = [];
    const barPeakOffsetMap = new Map();
    let totalSeconds = 0;
    let minInstantaneousBpm = Infinity;
    let maxInstantaneousBpm = 0;
    let lastTempoTick = null;
    let lastTempoValue = null;
    let barEndpointsPreserved = true;
    let endpointsPreserved = true;
    let maxLocalDrift = 0;
    let endpointCorrectionAmount = 0;

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
      let sectionWeightTotal = 0;
      let sectionExpectedWeight = 0;
      let sectionRunningWeight = 0;
      let sectionRunningPulses = 0;

      const pushSegment = ({ barIndex, pulseIndex, weight, rationalMidpoint, irrationalOffset }) => {
        const tick = sectionStartTick + barIndex * barTicks + pulseIndex * pulseTicks;
        const durationSeconds = basePulseSeconds * weight;
        const microsecondsPerQuarter = microsecondsForSegment(durationSeconds, pulseTicks, ppq);
        const instantaneousBpm = 60000000 / microsecondsPerQuarter;
        const barPeakKey = `${sectionIndex}:${barIndex}`;
        const peakOffset = Math.abs(Number(irrationalOffset) || 0);
        barPeakOffsetMap.set(barPeakKey, Math.max(barPeakOffsetMap.get(barPeakKey) || 0, peakOffset));
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
        sectionRunningWeight += weight;
        sectionRunningPulses += 1;
        maxLocalDrift = Math.max(maxLocalDrift, Math.abs(sectionRunningWeight - sectionRunningPulses));
        segments.push({
          tick,
          tickLength: pulseTicks,
          microsecondsPerQuarter: enabled ? microsecondsPerQuarter : baseMpq,
          durationSeconds,
          sectionIndex,
          barIndex,
          pulseIndex,
          accentLevel: accentLevelForPulse(meter, pulseIndex),
          rationalMidpoint,
          irrationalOffset,
          irrationalFeelMode: feelMode,
          law,
          durationWeight: weight,
        });
        totalSeconds += durationSeconds;
        sectionWeightTotal += weight;
        sectionExpectedWeight += 1;
      };

      if (feelMode === IRRATIONAL_FEEL_MODES.LATTICE_SAFE) {
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
              law: safeLaw,
            });
            shaped.weights.forEach((weight, offset) => {
              const pulseIndex = group.start + offset;
              if (pulseIndex >= numerator) return;
              pushSegment({
                barIndex,
                pulseIndex,
                weight,
                rationalMidpoint: shaped.rationalMidpoint,
                irrationalOffset: shaped.rawWeights[offset] - rationalGroupWeights(group.length, shaped.rationalSwing)[offset],
              });
              barWeightTotal += weight;
            });
          });
          if (Math.abs(barWeightTotal - numerator) > 0.00001) barEndpointsPreserved = false;
        }
      } else {
        const drift = buildDriftBarPlans({
          mode: feelMode,
          bars,
          meter,
          numerator,
          rationalAmount,
          irrationalAmount,
          seed: settings.seed,
          sectionIndex,
        });
        endpointCorrectionAmount += drift.endpointCorrectionAmount;
        drift.plans.forEach((plan, barIndex) => {
          let barWeightTotal = 0;
          plan.weights.forEach((weight, pulseIndex) => {
            const group = plan.groupForPulse[pulseIndex] || { start: pulseIndex, length: 1 };
            const groupEnd = Math.min(numerator, group.start + group.length);
            const groupWeights = plan.weights.slice(group.start, groupEnd);
            const groupSum = groupWeights.reduce((sum, value) => sum + value, 0) || 1;
            const rationalMidpoint = group.length > 1 ? (plan.weights[group.start] || 1) / groupSum : 1;
            pushSegment({
              barIndex,
              pulseIndex,
              weight,
              rationalMidpoint,
              irrationalOffset: weight - (plan.baseWeights[pulseIndex] || 1),
            });
            barWeightTotal += weight;
          });
          if (Math.abs(barWeightTotal - numerator) > 0.00001) barEndpointsPreserved = false;
        });
      }
      if (Math.abs(sectionWeightTotal - sectionExpectedWeight) > 0.00001) endpointsPreserved = false;
    });

    if (!tempoEvents.length) tempoEvents.push({ tick: 0, microsecondsPerQuarter: baseMpq });
    return {
      enabled,
      law,
      irrationalFeelMode: feelMode,
      segments,
      tempoEvents,
      tickerEvents,
      barPeakOffsets: [...barPeakOffsetMap.entries()].map(([key, peakOffset]) => {
        const [sectionIndex, barIndex] = key.split(":").map(Number);
        return { sectionIndex, barIndex, peakOffset };
      }),
      totalSeconds,
      minInstantaneousBpm: Number.isFinite(minInstantaneousBpm) ? minInstantaneousBpm : 60000000 / baseMpq,
      maxInstantaneousBpm: maxInstantaneousBpm || 60000000 / baseMpq,
      baseMicrosecondsPerQuarter: baseMpq,
      maxLocalDrift,
      endpointCorrectionAmount,
      endpointsPreserved,
      barEndpointsPreserved,
    };
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

  function secondsToTick(seconds, timeline) {
    const indexed = timeline?.indexed ? timeline : indexTempoTimeline(timeline);
    const segments = indexed.segments || [];
    if (!segments.length) return 0;
    const safeSeconds = clamp(Number(seconds) || 0, 0, indexed.totalSeconds);
    let lo = 0;
    let hi = segments.length - 1;
    let index = segments.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segments[mid].endSeconds < safeSeconds) {
        lo = mid + 1;
      } else {
        index = mid;
        hi = mid - 1;
      }
    }
    const segment = segments[index];
    if (!segment || segment.durationSeconds <= 0) return segment?.startTick || 0;
    const local = clamp((safeSeconds - segment.startSeconds) / segment.durationSeconds, 0, 1);
    return segment.startTick + local * segment.tickLength;
  }

  function shiftTickBySeconds(tick, deltaSeconds, timeline) {
    const indexed = timeline?.indexed ? timeline : indexTempoTimeline(timeline);
    return secondsToTick(tickToSeconds(tick, indexed) + (Number(deltaSeconds) || 0), indexed);
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
    NATURAL_SPREAD_LAW,
    DEFAULT_SAFE_LAW,
    DRIFT_LAW,
    IRRATIONAL_FEEL_MODES,
    DEFAULT_IRRATIONAL_FEEL_MODE,
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
    normalizeTempoLatticeLaw,
    normalizeIrrationalFeelMode,
    meterAccentGroups,
    accentLevelForPulse,
    buildTempoTimeline,
    indexTempoTimeline,
    tickToSeconds,
    secondsToTick,
    shiftTickBySeconds,
    buildTeardropVoiceTable,
    teardropLowpassHz,
    tickerCenterHz,
    hashUnit,
    clamp,
  };
})(typeof globalThis !== "undefined" ? globalThis : window);
