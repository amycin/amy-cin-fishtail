# Credits And Acknowledgements

amy_cin fishtail generator v0 is original implementation code written for Amy McBride's Fishtail project in this repo.

Copyright (c) 2026 Amy McBride. All rights reserved.

No third-party counterpoint-generator source code has been copied into this project.

This version was vibe coded with Codex, collaborating as Lambda Echo.

## Artwork

- Artwork by Ocular Debris, provided for Fishtail graphic design use.

## Conceptual Inspirations

The implementation is informed by general music theory and algorithmic composition ideas, including:

- Fux-style species counterpoint and Palestrina-style voice-leading practice.
- Knud Jeppesen-style Palestrina counterpoint as a stylistic reference.
- Backtracking counterpoint generators that place notes, validate rules, and retry.
- Constraint-programming approaches such as FuxCP, used here only as a design reference for explicit hard rules.
- Markov/probabilistic Palestrina approaches such as Farbood and Schoner, used here only as inspiration for combining deterministic rules with weighted musical choices.
- Interactive rule-checking tools such as CounterPointer, used here only as inspiration for producing a human-readable report.

## Implementation Notes

- The MIDI writer in `src/app.js` is original code.
- The moving torus visualisation uses Three.js, an MIT-licensed open-source 3D library.
- The seeded random functions in `src/app.js` are small public-domain-style PRNG/hash patterns commonly circulated in JavaScript communities; they are included inline only for deterministic replay after the browser supplies a system entropy seed.
- Browser APIs used: Canvas, WebGL through Three.js, optional Device Motion/Orientation input, Web Audio, optional Vibration API feedback, Blob download, TextEncoder, and Web Crypto `crypto.getRandomValues`.
