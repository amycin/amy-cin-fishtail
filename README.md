# Fishtail MIDI Generator

A local, browser-based MIDI invention and counterpoint generator for Amy's Fishtail gravity-counterpoint idea. The project identity and original implementation lineage are credited as `amy_cin Fishtail generator`.

The current build is a static web app. It generates ordinary `.mid` files plus a JSON manifest and text report, and can optionally prepare browser-rendered WAV reference stems and analogue CV packages. It does not need live MIDI, and generated pieces/settings are created locally. The WebGL torus visual loads Three.js from a public CDN unless that dependency is vendored locally later.

## Run

For the smoothest Mac and iPad workflow, run the local Fishtail server:

```bash
node scripts/serve-fishtail.js
```

It prints a Mac URL and any available iPad/local-network URLs. Open the Mac URL on this computer. On iPad, use the printed local-network URL such as `http://192.168.x.x:8899/index.html`; `localhost` and `127.0.0.1` on the iPad point to the iPad, not the Mac.

You can also open `index.html` directly in a browser for Mac-only use.

Live demo target after publishing: `https://amycin.github.io/amy-cin-fishtail/`.

For web hosting, ownership notes, and optional custom entropy-server wiring, see `PUBLISHING.md`.

## Documentation

- [User guide](docs/FISHTAIL_USER_GUIDE.html): a browser-readable manual with quick-start notes, technical manual pages, timing notes, output explanations, and links back to the app.
- [How Fishtail works](docs/FISHTAIL_HOW_IT_WORKS.md): a system overview covering the musical model, generation flow, timing layers, tuning modes, exports, and validation.

## Design Pass

The interface now uses a two-surface shell: Logic for form, structure, generation, exports, and notes; Feel for Pitch and Tempi, Living Reference, Pulse sound, metronome, swing, and the resonance aperture visual. The current Mary pastel instrument style uses the local bubble-painting palette for warm mode, then shifts DUB mode into cooler blue, mint, and violet pitch colours for a tactile cross-platform instrument feel.

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
- Per-section Expression drawer with Energy contour, Register span, Register lift, Bloom Pressure, and Keyboard Bloom controls. Bloom Pressure rests at a neutral centre position; high Bloom Pressure with Keyboard Bloom armed now acts as a guarded post-counterpoint arranger layer that may add restrained bass anchors, octave echoes, and high shimmer after sonority, doubling, fourth-above-bass, low-mud, overlap, and parallel-perfect gates.
- Style switch for Imitation + Invention, Counterpoint, or Fishtail Fugue generation.
- Reference-pitch menu, Pulse pitch / Fine pitch ear-tuning sliders, and Fishtail tempo slider using `BPM = 60 * referenceHz / n`, displayed to four decimal places. The default is A3 = 220 Hz with A4 anchored at 440 Hz and `n = 220`, giving 60.0000 BPM.
- Living Reference Input for capture-and-freeze monophonic pitch: press Listen, sing or play one sustained note through a mic/line-in/USB input exposed by the browser, then press Use this pitch to set the exact Fishtail reference locally. Audio is analysed on-device only and is not recorded, uploaded, or saved with device identity.
- Switch-on Teardrop Pulse for the current reference frequency, with one shared browser `AudioContext`, silent-at-load safety, smooth one-second pitch glide, and an 11-oscillator symmetric Teardrop voice table under the 12-node budget.
- Louder live pink-noise metronome preview with existing meter accents, rational/irrational Fishtail swing controls, Lattice Safe / Hybrid Drift / Living Drift feel modes, live-only tempo/swing control glide, and a shared tempo-lattice timing model.
- Optional pulse-level tempo lattice in the existing MIDI conductor track. When enabled, note ticks remain on the formal grid while Set Tempo events warp tick-to-time playback for DAWs that honor tempo maps; Lattice Safe preserves the existing normalized behaviour, while the drift modes add seeded organic timing with endpoint correction.
- Optional generated WAV stems for a short Teardrop Pulse reference and pink-noise ticker, rendered sequentially as mono 48 kHz / 24-bit PCM with browser memory guards and explicit save buttons. Ticker WAV export is peak-normalized to -6 dBFS for DAW-friendly headroom.
- Optional analogue CV ZIP export for modular and old-school analogue workflows: a clean clock WAV plus 1V/oct pitch and gate WAV pairs for each generated voice. Pitch CV is a DC-coupled-interface feature; ordinary phone, tablet, and headphone outputs are usually AC-coupled and will not preserve pitch voltage.
- Major, harmonic minor, standard modal scales, and a gravity melodic minor field.
- Original counterpoint search with voice ranges, tendency-tone debts, basic consonance checks, and parallel perfect rejection.
- Fishtail Fugue mode with automatic three-section minimum form shaping, subject/answer/countersubject planning, exposition entries, episodes, middle entries, and final return. DUB off uses Formal Gravity; DUB on keeps the fugue map but gives the bass and offbeat answers more room.
- Rhythm motion control for motif-level rhythm cells: 0 restores legacy pulse-grid timing, while restrained higher values give subjects, answers, and invention fragments deterministic sub-pulse attacks, ties, rotations, reversals, and gentle displacement before DUB microtiming is applied.
- Optional Dub Gravity switch for steadier root/fifth bass, offbeat middle-voice skank gestures, more breathing room, black/green terminal visuals, and rare deliberate rule bends that are still reported by the checker.
- Whole-section refrain roles with clear/dubby returns and gentle/dubby developments.
- Suspension gravity with per-voice pedal controls, stepwise resolution pressure, and checker reporting for overlong held notes.
- Immediate generation pass with a final output checker for timing, rhythm cells, range, cadence, tendency-tone, overlap, and parallel-perfect warnings.
- Clean Equal Temperament and Amy Dub Intonation MIDI exports: one track per generated voice, no program changes, no controller setup, and no track-name clutter. When Tempo map is on, a separate conductor track writes BPM and time signatures for DAWs that read them. The selected BPM is also included in the downloaded filename, JSON manifest, and generation notes.
- Multiple single-voice Bend MIDI output for pitch-bend experiments.
- Deterministic pitch-based velocity feel: 127 at the generator bass floor down to 90 at the soprano ceiling, shaped with a gentle 3 dB/octave tilt.
- Ocular Debris artwork overlay used as a visual circuit-map substrate.
- Three.js wireframe torus visualisation with a canvas gravity-wave lattice.
- Slow torus-to-wormhole phase animation with aperture focus zoom, lens-field overlay, and optional device tilt/motion response where the browser permits it.
- Button feedback using a generated click/whirr sound and optional device vibration where the browser permits it.
- Show/hide generation notes panel.
- System entropy seed from `crypto.getRandomValues`, logged in the manifest, with an optional advanced endpoint hook for custom hardware entropy.

## Dice Controls

- `D4`: a gentle weighted form roll. It usually creates 3-5 sections with moderate bar lengths, common meters, close key relationships, and a tasteful chance of Refrain or Gentle Development after the first section.
- `D20`: a wider weighted form roll. It usually creates 4-7 sections, allows broader bar lengths, and gives the Varied slider more influence over meters, modes, key movement, Refrain returns, Development rows, and occasional Dubby treatments.
- With `DUB` armed, both dice lean toward Fishtail Fugue, slightly larger forms, more Refrain/Development roles, and more Dubby treatments. The first section remains Fishtail/Source so later rows have source material to return to or develop.

## Tuning Modes

- `Amy Dub Intonation`: writes carrier MIDI notes intended for Entonal or a similar retuner that can define these ratios. This is Amy McBride's experimental ratio-based dub intonation system. The important tuning information is in the Amy Dub ratios below; the visible MIDI note numbers are carriers. The voice tracks are note-only.
- `Equal temperament`: writes ordinary MIDI notes for standard synth playback. The voice tracks are note-only. Use the Tempo map switch to add a conductor track with BPM and time signatures, or turn it off for strict note-only MIDI.
- `Bend MIDI`: writes multiple single-voice tracks, one voice per track/channel, with per-voice pitch bend for approximate Dub-ratio playback. Use separate mono instruments or separate mono channels. If these parts are merged into one polyphonic instrument, pitch bends for one note can retune the other notes and the result will not work properly.

## Gravity Counterpoint Rules And Amy Dub Ratios

The counterpoint generator treats notes as musical functions first, then maps them to either ordinary equal-temperament MIDI, Amy Dub carrier notes for a retuner, or Bend MIDI pitch-bend output.

Fishtail Gravity is Amy's composition idea for making complex theory behave like musical force. Notes are not only random choices; they have tendencies and weights. Leading tones pull upward, certain minor-key colours pull downward, cadences pull voices toward a landing, bass notes create gravity, and rests let another voice answer. The generator uses this idea across counterpoint, imitation, Fishtail Fugue form, breath, cadence, and DUB behavior.

Equal temperament divides the octave into twelve equal logarithmic steps. Amy Dub Intonation is different: it keeps the twelve chromatic slots as a practical MIDI map, but each slot points to a chosen ratio. Those ratios are Amy's dub-tuning experiment, so the generator can write familiar MIDI structures while a retuner or Bend MIDI output makes the pitch world lean toward ratios such as `1/1`, `9/8`, `5/4`, `4/3`, `3/2`, and `7/4`.

Rule ideas currently represented in the prototype:

- Palestrina-style voice leading: prefer stepwise motion, control leaps, avoid voice crossing, reject many parallel perfect fifth/octave candidates, and check the output afterward.
- Cadence gravity: each section has a key, mode, meter, cadence type, opening/final sonority goal, and checker warnings for final sonorities that do not land cleanly.
- Harmonic minor gravity: the raised leading tone resolves upward to tonic.
- Gravity melodic minor: raised sixth tends upward, leading tone rises to tonic, flat seventh falls, and flat sixth falls to fifth.
- Breath/rest gravity: the voices are allowed to leave space so another voice can answer.
- Fishtail fugue gravity: the form is shaped into exposition, episode or middle-entry space, and final return, using subject, answer, countersubject, and episode fragments derived from the invention source.
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
