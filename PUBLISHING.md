# Publishing amy_cin fishtail generator

This app is static: `index.html`, `styles.css`, `src/app.js`, helper scripts in `src/`, and assets. It does not need a backend server for the current MIDI generator, live pulse/metronome, or optional browser-rendered WAV stems.

Equal Temperament and Amy Dub Intonation exports keep voice tracks note-only: one track per generated voice, no program changes, no controller setup, and no track-name clutter. When the Tempo data switch is on, the app adds a conductor track with BPM and time-signature metadata for DAWs that read Standard MIDI tempo maps. If Tempo lattice is enabled, that same conductor track receives pulse-level Set Tempo events from the shared Fishtail timeline; the note tracks are not moved by conductor-only swing. The selected BPM is also included in the downloaded filename, JSON manifest, and generation notes. Bend MIDI is the exception because pitch-bend output necessarily writes pitch-bend and controller setup data.

The Teardrop Pulse and metronome are off at page load. Browser audio starts only after a user gesture, such as turning on Pulse sound or Metronome. Pulse and ticker WAV stems are rendered one at a time as mono 16-bit PCM for broad device compatibility, with a memory estimate before allocation; MIDI and JSON generation should remain usable even if a long WAV stem is skipped. Ticker WAV export is peak-normalized to -6 dBFS.

Living Reference Input also starts only after a user gesture. It analyses one monophonic input locally through Web Audio, does not use `MediaRecorder`, does not upload samples, and saves only derived pitch/reference metadata, never device identity.

## Randomness On The Web

The app cannot read `/dev/urandom` directly from a visitor's computer, because browser JavaScript is sandboxed. Instead it uses `crypto.getRandomValues`, the browser Web Crypto source for strong random bytes. The generated seed is saved into the JSON manifest so a generated piece can be studied or reproduced.

For everyday use, Web Crypto is the recommended default. A custom entropy server is optional and mostly interesting for hardware-random, installation, studio, or research builds.

## Optional Custom Entropy Server

Advanced users can provide their own entropy endpoint. Fishtail will not replace browser randomness with the endpoint; it will mix endpoint bytes with browser Web Crypto bytes using SHA-256, then use the digest as the seed. This is a safer pattern because the browser source still protects the generator if the custom endpoint fails or is biased.

The app looks for an endpoint in this order:

1. `window.FISHTAIL_ENTROPY_URL`
2. A page meta tag: `<meta name="fishtail-entropy-url" content="https://example.com/entropy">`
3. Browser local storage key: `fishtailEntropyUrl`

The endpoint may return any one of these:

```json
{ "hex": "f4c92d5e9a4b0c7718f034aa91be62d0" }
```

```json
{ "bytes": [244, 201, 45, 94, 154, 75, 12, 119, 24, 240, 52, 170, 145, 190, 98, 208] }
```

Or plain text containing at least 16 hexadecimal characters.

Important hosting notes:

- If the Fishtail page is hosted over HTTPS, the entropy endpoint should also be HTTPS or the browser may block it as mixed content.
- If the endpoint is on another domain, configure CORS for the Fishtail origin.
- Keep the endpoint simple: return fresh random bytes, no personal data, no authentication secrets in the public app, and no logging beyond what you actually need.
- Whitening means hashing or otherwise mixing raw entropy. The current app hashes browser entropy and endpoint entropy together with SHA-256.
- If the endpoint fails, returns too little data, or is blocked by the browser, Fishtail falls back to Web Crypto and continues generating music.

For local experiments, a hardware entropy device or another process can expose a tiny localhost endpoint such as `http://127.0.0.1:8788/entropy`, then you can enable it in the browser console:

```js
localStorage.setItem("fishtailEntropyUrl", "http://127.0.0.1:8788/entropy");
```

Clear it again with:

```js
localStorage.removeItem("fishtailEntropyUrl");
```

## Good Hosting Options

### GitHub Pages

Good for a public demo, portfolio page, and sharing with friends.

Basic flow:

1. Create a GitHub repository.
2. Add the project files.
3. Run `node scripts/validate-midi.js --smoke`.
4. Keep `.nojekyll` in the repository.
5. Go to repository Settings, then Pages.
6. Publish from the main branch root.
7. Open the generated `github.io` URL.

GitHub Pages can also use a custom domain. It is best treated as a showcase/demo host rather than a full commercial SaaS host.

### Netlify, Vercel, or Cloudflare Pages

Good for a more polished public site, custom domain, preview deployments, and future paid versions. These also host static files easily.

Typical setup:

1. Push the repository to GitHub.
2. Connect the repository to the hosting provider.
3. Set the publish directory to the repository root.
4. Leave the build command blank unless a later build system is added.

## If This Becomes Paid

For a paid version, keep the generator static if possible, and use a payment/licensing layer outside the app:

- Gumroad or Lemon Squeezy for simple paid downloads.
- Stripe for a more custom checkout.
- A private download link or account system if the project grows.

Do not put private license keys directly in the public JavaScript. Anything shipped to the browser should be considered visible.

## Ownership And Notices

Copyright normally exists when original work is fixed in a tangible form, but registration can matter if enforcement is needed. For legal certainty, ask an intellectual-property lawyer or use the official copyright registration process for your country.

Suggested notice text for the project:

```text
amy_cin fishtail generator
Copyright (c) 2026 Amy McBride. All rights reserved.

Artwork by Ocular Debris.
Three.js is MIT licensed and acknowledged in CREDITS.md.
```

Keep `CREDITS.md` and `LICENSE.md` with any published copy.
