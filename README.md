# amy_cin fishtail generator

A local, browser-based MIDI invention and counterpoint generator for Amy's Fishtail gravity-counterpoint idea.

The first build is a static web app. It generates ordinary `.mid` files plus a JSON manifest and text report. It does not need live MIDI, and generated pieces/settings are created in the browser. The WebGL torus visual loads Three.js from a public CDN unless that dependency is vendored locally later.

## Run

Open `index.html` directly in a browser, or serve the folder locally:

```bash
python3 -m http.server 8787
```

Then open `http://localhost:8787`.

Live demo target after publishing: `https://amycin.github.io/amy-cin-fishtail/`.

For web hosting, ownership notes, and optional custom entropy-server wiring, see `PUBLISHING.md`.

## Validation

Run the built-in MIDI export smoke checks:

```bash
node scripts/validate-midi.js --smoke
```

Validate downloaded MIDI files:

```bash
node scripts/validate-midi.js ~/Downloads/amy-cin-fishtail-*.mid
```

Use `--strict-note-voices` for Equal Temperament and Amy Dub Intonation exports when you want voice tracks to contain only note on/off events. Bend MIDI should be validated without that flag because pitch-bend and controller setup data are expected there.

## Current Features

- Weighted random form generation with D4 and D20-style dice controls.
- Section controls for bars, key, mode, time signature, and cadence.
- Style switch for Imitation + Invention or Counterpoint generation.
- Reference-pitch menu and Fishtail tempo slider using `BPM = 60 * referenceHz / n`, displayed to four decimal places. The default is A4 = 432 Hz and `n = 864`, giving 30.0000 BPM.
- Major, harmonic minor, standard modal scales, and a gravity melodic minor field.
- Original counterpoint search with voice ranges, tendency-tone debts, basic consonance checks, and parallel perfect rejection.
- Optional Dub Gravity switch for steadier root/fifth bass, offbeat middle-voice skank gestures, more breathing room, black/green terminal visuals, and rare deliberate rule bends that are still reported by the checker.
- Whole-section refrain roles with straight/dubby returns and gentle/dubby developments.
- Suspension gravity with per-voice pedal controls, stepwise resolution pressure, and checker reporting for overlong held notes.
- Slower staged generation pass with a final output checker for timing, range, cadence, tendency-tone, overlap, and parallel-perfect warnings.
- Clean Equal Temperament and Amy Dub Intonation MIDI exports: one track per generated voice, no program changes, no controller setup, and no track-name clutter. When Tempo map is on, a separate conductor track writes BPM and time signatures for DAWs that read them. The selected BPM is also included in the downloaded filename, JSON manifest, and generation notes.
- Multiple single-voice Bend MIDI output for pitch-bend experiments.
- Deterministic pitch-based velocity feel: 127 at the generator bass floor down to 90 at the soprano ceiling, shaped with a gentle 3 dB/octave tilt.
- Ocular Debris artwork overlay used as a visual circuit-map substrate.
- Three.js wireframe torus visualisation with a canvas gravity-wave lattice.
- Slow torus-to-wormhole phase animation with aperture focus zoom, lens-field overlay, and optional device tilt/motion response where the browser permits it.
- Button feedback using a generated click/whirr sound and optional device vibration where the browser permits it.
- Show/hide generation notes panel.
- System entropy seed from `crypto.getRandomValues`, logged in the manifest, with an optional advanced endpoint hook for custom hardware entropy.

## Tuning Modes

- `Amy Dub Intonation`: writes carrier MIDI notes intended for Entonal or another retuner. The important tuning information is in the Amy Dub ratios below; the visible MIDI note numbers are carriers. The voice tracks are note-only.
- `Equal temperament`: writes ordinary MIDI notes for normal synth playback. The voice tracks are note-only. Use the Tempo map switch to add a conductor track with BPM and time signatures, or turn it off for strict note-only MIDI.
- `Bend MIDI`: writes multiple single-voice tracks, one voice per track/channel, with per-voice pitch bend for approximate Dub-ratio playback. Use separate mono instruments or separate mono channels. If these parts are merged into one polyphonic instrument, pitch bends for one note can retune the other notes and the result will not work properly.

## Gravity Counterpoint Rules And Amy Dub Ratios

The counterpoint generator treats notes as musical functions first, then maps them to either ordinary equal-temperament MIDI, Amy Dub carrier notes for a retuner, or Bend MIDI pitch-bend output.

Rule ideas currently represented in the prototype:

- Palestrina-style voice leading: prefer stepwise motion, control leaps, avoid voice crossing, reject many parallel perfect fifth/octave candidates, and check the output afterward.
- Cadence gravity: each section has a key, mode, meter, cadence type, opening/final sonority goal, and checker warnings for final sonorities that do not land cleanly.
- Harmonic minor gravity: the raised leading tone resolves upward to tonic.
- Gravity melodic minor: raised sixth tends upward, leading tone rises to tonic, flat seventh falls, and flat sixth falls to fifth.
- Breath/rest gravity: the voices are allowed to leave space so another voice can answer.
- Dub gravity: when the DUB switch is on, the bass favors grounded repeated roots and fifths, inner voices can answer with offbeat skank-like chords, and the generator may occasionally allow a parallel perfect motion while still logging it as a checker warning.

Amy Dub ratio slots, chromatic from the selected root:

| Slot | Ratio | Role |
| --- | --- | --- |
| 0 | 1/1 | home |
| 1 | 16/15 | upper bite |
| 2 | 9/8 | motion |
| 3 | 8/7 | blue low |
| 4 | 7/6 | minor soul |
| 5 | 5/4 | sweet light |
| 6 | 4/3 | plagal |
| 7 | 11/8 | shimmer |
| 8 | 3/2 | pillar |
| 9 | 8/5 | pivot |
| 10 | 13/8 | tender lift |
| 11 | 7/4 | dub crown |

## Status

This is v0: a playable prototype and design foundation. The next pass should improve the counterpoint solver, motif imitation, cadence grammar, and ratio-function resolver.

## Ownership

Copyright (c) 2026 Amy McBride. All rights reserved.

Artwork by Ocular Debris.

See `CREDITS.md` for acknowledgements and `LICENSE.md` for use restrictions.
