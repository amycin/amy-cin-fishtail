# Fishtail: What It Is And How It Works

Fishtail is a local browser-based music generator for Amy McBride's gravity-counterpoint idea. It creates structured MIDI pieces from form rows, voice-leading rules, weighted deterministic randomness, tuning choices, tempo-lattice timing, and optional Dub Gravity performance feel. It also writes a JSON manifest, a text report, and optional WAV/CV export packages.

The app is intentionally local. Generation happens in the browser, exported files are created on the user's machine, and the optional Living Reference Input analyses microphone or line input on-device without uploading or storing the audio.

## What Fishtail Produces

The main output is a Standard MIDI file with one generated voice per track. Depending on settings, it can also include a conductor track containing tempo and time-signature metadata. Alongside the MIDI, Fishtail produces:

- a JSON manifest describing the seed, settings, form, events, tuning, timing model, audit results, and ownership metadata;
- a human-readable generation report;
- optional pulse and ticker WAV reference stems;
- an optional analogue CV ZIP containing clock, pitch, gate, and calibration WAV files.

The generated music is deterministic for a given seed, settings, and random model. Newer pieces record the named random-stream model in the manifest so older single-stream seeds are not silently treated as if they used the newer routing system.

## The Musical Idea

Fishtail treats notes as musical forces rather than as isolated random choices. A note may want to resolve, a bass may create gravity, a cadence may pull voices toward a landing, and a rest may give another voice room to answer. The generator applies that idea across form, counterpoint, fugue planning, rhythm, tuning, velocity, and DUB behavior.

The main musical layers are:

- **Form:** sections with bars, key, mode, meter, cadence, role, and treatment.
- **Subject material:** seed-derived melodic material used directly or transformed by invention/fugue logic.
- **Counterpoint:** voice ranges, tendency-tone debts, consonance checks, spacing checks, and parallel-perfect rejection.
- **Rhythm motion:** deterministic motif rhythm cells that can add restrained sub-pulse attacks, ties, rotations, retrogrades, and displacement.
- **DUB performance feel:** optional grounded bass behavior, offbeat skank gestures, breathier upper voices, and phase-locked real-millisecond microtiming.
- **Audit:** a final checker that reports timing, overlap, range, cadence, tendency, suspension, rhythm, and parallel-perfect concerns.

## Generation Flow

At a high level, a generated piece moves through these stages:

1. **Read settings and seed.** Fishtail collects the current form rows, voice count, tuning mode, tempo controls, rhythm amount, Dub Gravity state, and export preferences.
2. **Create named random streams.** Random decisions are routed through named streams such as form, subject, phrase, section/voice/rest, pitch-choice, report, and visual. This keeps unrelated changes from disturbing the generated music.
3. **Plan form and subject material.** Dice controls or manual rows define the section map; subject and answer material are prepared for invention, counterpoint, or fugue.
4. **Choose voice events on the score grid.** Each voice is generated step by step against the current harmony, cadence stage, neighboring voices, held notes, rests, and fallback safety rules.
5. **Convert grid notes to score events.** Notes become events with `gridTick` and `gridDuration`, preserving their structural musical identity.
6. **Annotate performance intent.** DUB timing records requested real-millisecond offsets without moving the score-grid identity.
7. **Build the tempo timeline.** The tempo lattice creates the clock that maps ticks to real seconds.
8. **Apply performance timing.** DUB offsets are converted through the actual clock, rounded to the nearest MIDI tick, and recorded as requested and realized timing.
9. **Apply velocity.** Gravity velocity is calculated after performance timing while still using grid location where musical identity matters.
10. **Audit and export.** Fishtail validates the event stream, writes MIDI, builds the manifest and report, and prepares optional WAV/CV exports.

## Time: Score Grid Versus Performance Clock

Fishtail keeps two timing identities:

- **Score time:** `gridTick` and `gridDuration`. This is the compositional grid used for harmony, cadence, counterpoint, suspension, rhythm identity, and structural audit.
- **Performance time:** `tick` and `duration`. This is the performed timing used for MIDI playback, DUB offsets, CV gates, rendered audio timing, overlap checks, and output boundaries.

This distinction matters because a deliberately late bass note should still count as a bass note placed on the theoretical beat. The score grid preserves what was composed; the performance clock describes how it is played back.

## Tempo And The Tempo Lattice

Fishtail tempo is based on:

```text
BPM = 60 * referenceHz / n
```

The default reference is A3 = 216 Hz with A4 anchored at 432 Hz and `n = 216`, producing 60.0000 BPM.

When the tempo lattice is enabled, the app can reshape pulse durations while preserving bar or phrase endpoints depending on the selected feel mode. DAWs that read the MIDI conductor track hear the same tick positions through a warped tick-to-seconds timeline. The lattice supports:

- **Lattice Safe:** normalized seeded pulse shaping with preserved endpoints;
- **Hybrid Drift:** organic drift corrected at bar scale;
- **Living Drift:** wider seeded drift corrected over longer spans.

If tempo data is turned off, the lattice is suspended for exported performance timing so the MIDI file and CV/audio exports remain phase-locked to the same flat clock.

## DUB Timing

Dub Gravity adds performance feel without changing the composed score identity. During note generation, Fishtail records DUB timing intent in milliseconds, such as an early skank touch or a late bass pulse. After the tempo timeline exists, it converts that requested real-time offset through the actual clock:

```text
grid tick -> grid seconds -> add requested ms -> nearest performance tick
```

The manifest stores both requested and realized DUB timing. The realized value can differ slightly because 480 PPQ MIDI ticks cannot represent every millisecond exactly, especially inside stretched or compressed tempo-lattice segments.

## Tuning Modes

Fishtail can write the same musical structure through several pitch-output models:

- **Equal Temperament:** ordinary MIDI notes for standard synth playback.
- **Amy Dub Intonation:** carrier MIDI notes intended for Entonal or a similar retuner using Amy's ratio map.
- **Bend MIDI:** one voice per channel with pitch bend for approximate ratio playback.

Amy Dub Intonation keeps practical chromatic slots, but each slot points to a ratio role such as home, plagal, pillar, pivot, shimmer, or dub crown. The manifest records both conceptual ratio frequencies and exported MIDI frequencies.

## Fishtail Fugue

Fishtail Fugue mode shapes the form into a fugue-like map. It prepares a subject, answer, countersubject, exposition entries, episodes, middle entries, and final returns. If the visible form is too short, the generator repairs it into a sufficient multi-section structure and explains that in the report.

With DUB off, fugue mode uses Formal Gravity. With DUB on, the fugue map remains intact while the bass and offbeat answers are given more space and DUB timing feel.

## Rhythm Motion

Rhythm motion controls deterministic motif-level rhythm cells. At zero, Fishtail returns to legacy pulse-grid timing. At restrained higher values, subject and invention material can use sub-pulse attacks, ties across metric accents, rotations, retrogrades, and gentle displacement. DUB microtiming happens after this structural rhythm layer.

## Velocity

The velocity model is deterministic and pitch-aware. Lower registers are generally stronger and higher registers slightly softer, with gentle shaping for meter, cadence, and musical context. A flat-velocity mode is also available. Velocity changes are isolated from form and pitch decisions.

## Audio And CV Exports

Optional audio exports are rendered in the browser as mono 48 kHz / 24-bit PCM WAV files:

- **Teardrop Pulse:** a short reference tone for the selected reference frequency.
- **Ticker WAV:** a pink-noise band-pass ticker aligned to the same clock as the MIDI conductor timing. Export uses a silent internal 50 ms pre-roll so the first tick reaches the filter in the same settled state as later ticks, then crops the pre-roll away so the WAV still starts at musical time zero.
- **Analogue CV ZIP:** clock, pitch, gate, and calibration WAV files for modular or CV-style workflows.

Pitch CV follows 1V/oct with C4 = 0V and requires a DC-coupled interface or a DAW CV utility. Ordinary headphone and phone outputs are usually AC-coupled and may pass clock pulses but will not preserve pitch voltage.

## Visual And Interaction Layer

The interface includes an Ocular Debris artwork substrate, a Three.js torus/wormhole visual, canvas overlays, button sound feedback, optional vibration, and DUB visual styling. Visual and report randomness use isolated random streams so adding a visual flourish or report sentence cannot alter the generated music.

## Validation And Safety

Fishtail includes a Node validator at `scripts/validate-midi.js`. The smoke suite checks MIDI structure, deterministic replay, random-stream isolation, tempo-lattice behavior, phase-locked DUB timing, rhythm integrity, velocity behavior, pitch input, counterpoint rules, feature metadata, and export controls.

Useful commands:

```bash
node scripts/validate-midi.js --smoke
node scripts/validate-midi.js --batch 4
node scripts/validate-midi.js ~/Downloads/amy-cin-fishtail-*.mid
```

The validator is part of the design: Fishtail is allowed to make strange music, but it should be explicit about what it did and should not silently produce malformed MIDI or incoherent timing.

## Current Status

Fishtail is a playable v0 prototype and design foundation. It already supports local generation, MIDI export, manifests, reports, tuning modes, tempo lattice, phase-locked DUB timing, rhythm motion, velocity shaping, WAV references, CV packages, and validation. The next meaningful improvements are musical rather than infrastructural: deeper counterpoint, richer cadence grammar, stronger motif imitation, and more refined ratio-function behavior.
