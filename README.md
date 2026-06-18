# amy_cin fishtail generator

A local, browser-based MIDI fugue generator for Amy's Fishtail gravity-counterpoint idea.

The first build is a static web app. It generates ordinary `.mid` files plus a JSON manifest and text report. It does not need live MIDI and does not send anything to a server.

## Run

Open `index.html` directly in a browser, or serve the folder locally:

```bash
python3 -m http.server 8787
```

Then open `http://localhost:8787`.

Live demo target after publishing: `https://amycin.github.io/amy-cin-fishtail/`.

For web hosting, ownership notes, and optional custom entropy-server wiring, see `PUBLISHING.md`.

## Current Features

- Weighted random form generation with D4 and D20-style dice controls.
- Section controls for bars, key, mode, time signature, and cadence.
- Style switch for Fugue or Imitation + Invention generation.
- Reference-pitch menu and Fishtail tempo slider using `BPM = 60 * referenceHz / n`, displayed to four decimal places.
- Major, harmonic minor, standard modal scales, and a gravity melodic minor field.
- Original counterpoint search with voice ranges, tendency-tone debts, basic consonance checks, and parallel perfect rejection.
- Slower staged generation pass with a final output checker for timing, range, cadence, tendency-tone, overlap, and parallel-perfect warnings.
- Note-only Equal Temperament and Amy Dub Intonation MIDI exports: one track per generated voice, no program changes, no controller setup, no conductor track, and no tempo or text meta events beyond required MIDI track endings. The selected BPM is included in the downloaded filename, JSON manifest, and generation notes.
- Multiple single-voice Bend MIDI output for pitch-bend experiments.
- Ocular Debris artwork overlay used as a visual circuit-map substrate.
- Three.js wireframe torus visualisation with a canvas gravity-wave lattice.
- Slow torus-to-wormhole phase animation with aperture focus zoom, lens-field overlay, and optional device tilt/motion response where the browser permits it.
- Button feedback using a generated click/whirr sound and optional device vibration where the browser permits it.
- Show/hide generation notes panel.
- System entropy seed from `crypto.getRandomValues`, logged in the manifest, with an optional advanced endpoint hook for custom hardware entropy.

## Tuning Modes

- `Amy Dub Intonation`: writes carrier MIDI notes intended for Entonal or another retuner. The important tuning information is in the Amy Dub ratios below; the visible MIDI note numbers are carriers. The export is note-only.
- `Equal temperament`: writes ordinary MIDI notes for normal synth playback. The export is note-only, with BPM carried in the filename instead of the MIDI track data.
- `Bend MIDI`: writes multiple single-voice tracks, one voice per track/channel, with per-voice pitch bend for approximate Dub-ratio playback. Use separate mono instruments or separate mono channels. If these parts are merged into one polyphonic instrument, pitch bends for one note can retune the other notes and the result will not work properly.

## Gravity Counterpoint Rules And Amy Dub Ratios

The counterpoint generator treats notes as musical functions first, then maps them to either ordinary equal-temperament MIDI, Amy Dub carrier notes for a retuner, or Bend MIDI pitch-bend output.

Rule ideas currently represented in the prototype:

- Palestrina-style voice leading: prefer stepwise motion, control leaps, avoid voice crossing, reject many parallel perfect fifth/octave candidates, and check the output afterward.
- Cadence gravity: each section has a key, mode, meter, cadence type, opening/final sonority goal, and checker warnings for final sonorities that do not land cleanly.
- Harmonic minor gravity: the raised leading tone resolves upward to tonic.
- Gravity melodic minor: raised sixth tends upward, leading tone rises to tonic, flat seventh falls, and flat sixth falls to fifth.
- Breath/rest gravity: the voices are allowed to leave space so another voice can answer.

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
