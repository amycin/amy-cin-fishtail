# Fishtail Probe + Tempo Lattice
## Codex implementation specification for `amycin/amy-cin-fishtail`

**Status:** design brief, not yet implemented  
**Source references:** current `main` branch of `amycin/amy-cin-fishtail`, plus Amy’s `latticbreakdance(1).scd` and `Tempo Lock Start(1).scd` SuperCollider files.

---

## 1. Purpose

Extend the existing static Fishtail browser instrument with four linked capabilities:

1. A live **Teardrop Probe** that sounds the current reference frequency.
2. A live **pink-noise metronome** that previews the selected meter and Fishtail swing.
3. An optional **tempo-lattice conductor track** in the Standard MIDI File, so swing can live in the tick-to-time map rather than only in moved notes.
4. Optional, generated-with-the-piece **24-bit WAV stems**:
   - a full-length Teardrop reference drone;
   - a full-length pink-noise ticker following the exact generated tempo lattice.

The existing generator, note tracks, visual design, tuning modes, direct-file use, and current no-build static architecture must remain intact.

---

## 2. Important finding: Fishtail already has a conductor track

Do **not** add an unrelated second MIDI clock system.

The existing `makeConductorTrack()` already writes:

- one Set Tempo meta event at tick 0;
- a Time Signature meta event at every section start.

The change is to upgrade this existing conductor track so it can optionally contain pulse-level Set Tempo events derived from one shared Fishtail timeline.

The same timeline must drive:

- live metronome spacing;
- MIDI conductor tempo events;
- ticker WAV event times;
- reported duration and tempo-lattice metadata.

This “one timing model, several outputs” rule is the most important architectural safeguard.

---

## 3. Source-of-truth behaviour from `latticbreakdance(1).scd`

Treat the later `latticbreakdance(1).scd` version as the primary reference. `Tempo Lock Start(1).scd` is useful historical material but uses an earlier sine ticker and shorter Teardrop envelope.

### Teardrop source behaviour

The later SuperCollider SynthDef specifies:

- clustered sine oscillators around `f0`;
- `delta = 1 / (12 * 12)`;
- curve exponents `q = 2`, `p = 2`;
- frequency glide: `1.0` second;
- low-pass cutoff: `clip(f0 * 12, 800, 14000)`;
- attack: `0.35` seconds;
- release: `1.2` seconds;
- envelope curve approximately `-4`;
- mono signal duplicated to stereo.

The original frequency/weight equations are:

```text
x_i = (i - N/2) / (N/4)
frequency_i = f0 * 2 ** (x_i * delta)
weight_i = max(0, 1 - abs(x_i) ** q) ** p
```

### Very important 12-oscillator subtlety

Do **not** merely change `numPartials = 64` to `12`.

With the literal original sampling, much of the array lies outside the non-zero lobe of the amplitude curve. A 12-element literal translation would leave only a handful of meaningfully audible oscillators.

Instead:

1. Treat 12 as a **maximum live oscillator budget**.
2. Resample the non-zero Teardrop lobe directly.
3. Ensure the exact fundamental `f0` is present.
4. Prefer a symmetric bank around `f0`.
5. Normalise by energy or summed weight so level does not jump when voice count changes.
6. Keep the voice table as a pure function so Amy can audition 9, 11, 12, or 13 voices later without rewriting the engine.

A clean low-resource default is an exact centre oscillator plus five symmetric pairs: **11 active oscillators**, under the requested 12-node ceiling. Codex may use 12 audible voices only if it documents how it preserves the centre and symmetry.

### Ticker source behaviour

The later SuperCollider ticker specifies:

- pink noise source;
- band-pass filter;
- centre frequency `cf = clip(abs(f0) * 8, 400, 8000)`;
- reciprocal-Q parameter `rq = 0.18` in actual metronome calls;
- therefore Web Audio `BiquadFilterNode.Q` should be approximately `1 / 0.18 = 5.5556`, not `0.18`;
- filter-frequency glide: `0.03` seconds;
- envelope attack: `0.0001` seconds;
- envelope decay: `0.03` seconds in actual calls;
- accent pattern in the 4-beat reference version: `[1.0, 0.25, 0.5, 0.25]`.

Do not copy the SuperCollider internal `x4` boost literally. Use a normalised pink-noise source, a conservative output gain, and a safety ceiling.

### Swing source behaviour

The reference code has:

- rational amount `0..1`;
- irrational amount `0..1`;
- rational mapping:
  - slider `0..0.5` maps `0..0.12`;
  - slider `0.5..1` maps `0.12..0.40`;
- a long/short duration pattern;
- random symmetric jitter on top;
- minimum duration guard.

For the MIDI grid, implement this as a meter-aware, deterministic, positive-duration timing law. Preserve the musical idea, but do not permit negative segments, unsorted events, duplicated tempo events at one tick, or accidental bar corruption.

---

## 4. Defaults

Change the initial reference pitch to:

- Reference note: **A3**
- Reference frequency: **216.00 Hz**
- A4 anchor: **432.00 Hz**
- Tempo divisor: **n = 216**
- Resulting default BPM: **60.0000**

Do **not** change `DEFAULT_A4_HZ` from 432 to 216. A3 at this tuning is 216 Hz because it is one octave below A4 = 432 Hz.

Add separate constants, for example:

```js
const DEFAULT_A4_HZ = 432;
const DEFAULT_REFERENCE_NOTE = "A3";
const DEFAULT_REFERENCE_HZ = 216;
const DEFAULT_TEMPO_DIVISOR = 216;
```

The probe follows `settings.referenceHz`.

The tuning root remains governed by the existing root/link system. If the root is A4 and linked to A3 = 216 Hz, a root frequency of 432 Hz is correct.

---

## 5. Explicit non-goals for this change

Do not:

- add microphone permission or pitch detection yet;
- convert the project to React, TypeScript, npm, Vite, or another framework;
- replace the existing MIDI writer;
- replace the current counterpoint engine;
- remove baked Dub note groove;
- add a third-party audio library;
- auto-play sound on page load;
- create multiple live `AudioContext` objects;
- require a server for basic use;
- break opening `index.html` directly;
- make WAV export mandatory;
- auto-download several files in a way Safari may block;
- rewrite the visual design.

A future microphone tuner can feed `referenceHz`, but it is not part of this implementation.

---

## 6. Recommended code structure

The safest maintainable structure is three classic scripts loaded before `app.js`, without ES-module imports:

```text
src/tempo-lattice.js
src/audio-engine.js
src/wav-export.js
src/app.js
```

Each new file should be a side-effect-free IIFE or global factory that exposes a narrow namespace on `globalThis`, for example:

```js
globalThis.FishtailTempoLattice
globalThis.FishtailAudioEngine
globalThis.FishtailWavExport
```

Reasons:

- classic scripts still work from `file://`;
- no bundler is introduced;
- browser audio objects are not created at script load;
- pure timing functions can be loaded into the existing Node `vm` test context;
- the already-large `app.js` does not become even harder to review.

Update `scripts/validate-midi.js` so it loads pure dependency scripts before `app.js`.

If Codex judges the multi-script change too risky in the first pass, it may implement the pure tempo functions in `app.js`, but it must keep them isolated and named so they can be extracted later.

---

## 7. Shared tempo-lattice model

Create one pure function, conceptually:

```js
buildTempoTimeline(sectionMeta, settings)
```

Return:

```js
{
  segments: [
    {
      tick,
      tickLength,
      microsecondsPerQuarter,
      durationSeconds,
      sectionIndex,
      barIndex,
      pulseIndex,
      accentLevel,
      rationalMidpoint,
      irrationalOffset
    }
  ],
  tempoEvents: [{ tick, microsecondsPerQuarter }],
  tickerEvents: [{ timeSeconds, accentLevel, sectionIndex, barIndex, pulseIndex }],
  totalSeconds,
  minInstantaneousBpm,
  maxInstantaneousBpm
}
```

The returned object must be deterministic from:

- seed;
- form;
- BPM;
- rational amount;
- irrational amount;
- timing-law version.

### Base units

The app uses:

```js
const PPQ = 480;
```

For each section:

```text
pulseTicks = METERS[meter].pulse
barTicks = numerator * pulseTicks
baseMicrosecondsPerQuarter = round(60,000,000 / BPM)
nominalPulseSeconds =
  (baseMicrosecondsPerQuarter / 1,000,000) * (pulseTicks / PPQ)
```

### Meter accents and groups

Reuse `METERS`; never create a competing meter table.

Current meters are:

- 2/2
- 3/4
- 4/4
- 5/4
- 6/8
- 7/8
- 9/8

Use `meter.accents` to derive accent groups.

Examples:

```text
4/4 accents [0,2] => groups [2,2]
5/4 accents [0,3] => groups [3,2]
6/8 accents [0,3] => groups [3,3]
7/8 accents [0,2,4] => groups [2,2,3]
9/8 accents [0,3,6] => groups [3,3,3]
```

Accent levels should preserve the SuperCollider spirit:

- first pulse of bar: `1.0`;
- secondary accent: about `0.5`;
- ordinary pulse: about `0.25`.

### Rational swing

Port the existing piecewise amount mapping:

```js
function rationalSwingAmount(v) {
  const gentle = 0.12;
  const feral = 0.40;
  const x = clamp(v, 0, 1);
  return x <= 0.5
    ? x * (gentle / 0.5)
    : gentle + (x - 0.5) * ((feral - gentle) / 0.5);
}
```

Represent a two-pulse cell as:

```text
weights = [1 + s, 1 - s]
midpoint proportion = (1 + s) / 2
```

For three-pulse groups, start with a sum-preserving shape such as:

```text
weights = [1 + s, 1, 1 - s]
```

Keep the group-shaping function isolated so Amy can change the musical law later.

### Irrational/random-midpoint swing

Use the existing seeded/hash randomness rather than `Math.random()`.

Recommended safe method:

1. Add a deterministic centred perturbation to pulse weights or internal group boundaries.
2. Clamp every raw duration weight to a positive minimum.
3. Renormalise within each accent group so its total duration remains unchanged.
4. Preserve every section and bar endpoint in tick space.
5. Store both the raw and final values in diagnostic data.

This gives “random midpoint” movement without losing the formal grid.

If exact free-running SuperCollider-style drift is later desired, add it as an advanced mode. Do not make unbounded drift the initial default.

### MIDI conversion

For a segment of `tickLength` ticks and desired duration `segmentSeconds`:

```text
microsecondsPerQuarter =
  round(segmentSeconds * 1,000,000 * PPQ / tickLength)
```

Because each segment currently spans one meter pulse, this is also equivalent to:

```text
baseMicrosecondsPerQuarter * durationWeight
```

Add a direct writer:

```js
tempoMetaBytesFromMicroseconds(microsecondsPerQuarter)
```

Do not repeatedly convert segment tempo to BPM and back.

Constraints:

- integer range `1..0xFFFFFF`;
- monotonic event ticks;
- no duplicate Set Tempo events at the same tick;
- collapse adjacent identical tempo values;
- keep Time Signature events at section starts;
- preserve the current single-tempo output when tempo-lattice swing is disabled.

### Separation from baked note groove

Existing Dub groove moves note ticks with `msToTicks()`.

The new tempo lattice moves time underneath all ticks.

These are additive but conceptually separate:

```text
note groove = moved MIDI note positions
tempo lattice = warped tick-to-seconds map
```

Do not silently remove existing note groove.

Record both systems separately in the manifest and explain that enabling both layers creates a compounded feel.

---

## 8. MIDI conductor-track changes

Modify the existing path:

```text
buildPiece
  -> buildTempoTimeline
  -> writeMidiFile
  -> makeConductorTrack
```

Recommended signatures:

```js
const tempoTimeline = buildTempoTimeline(sectionMeta, settings);

midiBytes = writeMidiFile({
  tracks,
  sectionMeta,
  settings,
  totalTicks: currentTick,
  tempoTimeline
});
```

And:

```js
makeConductorTrack(sectionMeta, settings, totalTicks, tempoTimeline)
```

Rules:

- `includeTempoMap = false`: no conductor track, unchanged.
- `includeTempoMap = true`, lattice disabled: current conductor behaviour.
- `includeTempoMap = true`, lattice enabled: time signatures plus generated tempo events.
- Do not add another MIDI track for the lattice; the conductor track is the lattice.
- Track count remains voices + optional one conductor.
- Note ticks must be byte-for-byte unchanged when only the tempo-lattice toggle changes.

---

## 9. Live Teardrop Probe

### Interaction

Add:

- **Hold to hear probe** momentary button;
- **Probe mute** switch, safe/default muted;
- **Probe level** slider;
- frequency readout using the existing reference note and Hz controls.

The button must support:

- pointer down/up;
- pointer cancel;
- touch;
- Space/Enter key down/up;
- window blur;
- page visibility change.

Releasing in any way must begin the release envelope.

No sound is produced at load.

### Audio graph

Conceptually:

```text
up to 12 sine OscillatorNodes
  -> individual weight GainNodes
  -> probe mix GainNode
  -> low-pass BiquadFilterNode
  -> ASR/master GainNode
  -> shared safety bus
  -> destination
```

Use the app’s existing single `state.audioContext`, but centralise creation in:

```js
ensureAudioContextFromUserGesture()
```

Do not create a second context for the metronome.

### Pitch glide

On `referenceHz` changes while the probe is sounding:

- cancel or safely replace future automation;
- retain the current instantaneous value where supported;
- ramp every oscillator frequency to its new target over 1.0 second;
- ramp the low-pass cutoff consistently;
- do not tear down/recreate the bank for slider movement.

Provide a fallback for browsers without `cancelAndHoldAtTime()`.

### Envelope

Approximate the SuperCollider curve safely:

- attack 0.35 s;
- release 1.2 s;
- exponential or target-style curve;
- never use exact zero with exponential ramps;
- stop and disconnect the oscillator bank after the release completes.

### Level and safety

- use perceptual/dB mapping rather than a linear raw amplitude slider;
- normalise Teardrop weights;
- use conservative maximum gain;
- add a gentle safety limiter/compressor only as a final guard;
- mono is acceptable and should be routed naturally to both output channels.

---

## 10. Live pink-noise metronome

### Interaction

Add:

- metronome on/off, default off;
- metronome level;
- preview meter:
  - default “Follow section 1”;
  - optional explicit meters from `METERS`;
- rational swing amount;
- irrational swing amount;
- visible current ratio/midpoint and instantaneous tempo range.

### Efficient pink-noise source

There is no native `PinkNoiseNode`.

Create one short normalised pink-noise `AudioBuffer` per `AudioContext`, cache it, loop it, and gate/filter it for ticks.

Recommended graph:

```text
looping pink-noise AudioBufferSourceNode
  -> band-pass BiquadFilterNode
  -> scheduled tick GainNode
  -> metronome level GainNode
  -> shared safety bus
```

This is much lighter than creating a new noise buffer on every tick.

### Filter and envelope

- centre frequency: `clamp(referenceHz * 8, 400, 8000)`;
- Web Audio filter Q: approximately `5.5556` for SC `rq = 0.18`;
- centre-frequency transition: 0.03 s;
- tick attack: 0.0001 s;
- tick decay: 0.03 s;
- accent multiplier from the meter.

### Scheduler

Use Web Audio clock scheduling, not naked `setInterval()` playback.

Recommended:

- scheduler wake-up every ~25 ms;
- schedule ~100 ms ahead;
- schedule ticks against `audioContext.currentTime`;
- preserve phase when BPM/swing controls change;
- apply updated spacing at the next unscheduled pulse;
- do not stop/restart the metronome on every slider input;
- use a generation/revision token so stale scheduler callbacks cannot continue;
- stop and disconnect on off, page hide, or navigation.

The 0.03 s glide is principally the ticker filter transition. Tempo spacing changes should be phase-safe rather than implemented as an arbitrary 30 ms BPM ramp.

---

## 11. WAV stem export

### Behaviour

Add two checkboxes:

- **Prepare ticker WAV**
- **Prepare probe WAV**

Both default off.

When Generate is pressed:

1. Generate/check/save MIDI exactly as now.
2. If an audio stem was requested, render it after MIDI generation.
3. Render requested stems sequentially, not in parallel.
4. Enable explicit save buttons:
   - Save Ticker WAV
   - Save Probe WAV

Do not trigger several automatic browser downloads. Explicit save buttons are safer on iPad/Safari.

### Duration

Both stems should match the full real-time duration of the generated piece.

- ticker: exact event timing from `tempoTimeline.tickerEvents`;
- probe: constant `referenceHz` drone for the full piece;
- probe envelope: 0.35 s attack and 1.2 s release;
- include enough tail so the release is not cut off.

### Format

- mono;
- PCM WAV;
- 24-bit;
- 96 kHz when duration is under 60 seconds and resource guard permits;
- 48 kHz for longer files;
- filename includes stem type, frequency or BPM, and seed.

Examples:

```text
amy-cin-fishtail-probe-216p0000hz-<seed>.wav
amy-cin-fishtail-ticker-60p0000bpm-<seed>.wav
```

### Rendering

Use `OfflineAudioContext` for the first implementation because the synthesis graph is simple and native audio rendering is efficient.

Build the live and offline graphs from shared constants and helper functions so the WAV resembles the monitor.

### Memory guard

Before constructing an offline context, estimate:

```text
float render bytes = frames * channels * 4
24-bit WAV bytes = frames * channels * 3 + 44
```

Use mono and render one stem at a time.

Set a conservative soft limit. If the estimated memory is too high:

- keep MIDI/JSON successful;
- do not crash the page;
- offer 48 kHz if 96 kHz was selected;
- otherwise show a clear “audio stem too long for safe browser rendering” message;
- allow the user to shorten the form or skip audio.

Immediately release references to rendered `AudioBuffer`, temporary arrays, and old Blob URLs after use.

### 24-bit encoding

Implement and test a small PCM WAV writer:

- `RIFF`;
- `WAVE`;
- PCM format 1;
- mono;
- correct byte rate/block align;
- 24 bits per sample;
- signed little-endian sample packing;
- hard clamp samples to `[-1, 1]`;
- optional tiny deterministic TPDF dither may be added later, but is not required for the first pass.

---

## 12. UI placement and CSS safety

The current desktop layout uses `nth-of-type()` selectors to place the Voices and Pitch panels. Adding another panel without changing this can move the wrong panels.

Before adding the new panel:

1. Add explicit classes:
   - `voices-panel`
   - `pitch-panel`
   - `sound-time-panel`
2. Replace positional `nth-of-type()` grid rules with these classes.
3. Extend the form and action panels from two rows to three on wide screens.
4. Preserve the existing one-column responsive layout.
5. Keep touch targets at least about 44 CSS pixels where practical.
6. Use `fieldset`/`legend` or clear labelled groups for Probe, Metronome, Swing, and Export.
7. Do not communicate mute/on states by colour alone.
8. Put transient render status in the existing status area or an `aria-live` element.

Suggested wide layout:

```text
Form             Voices             Visual / Generate
Form             Pitch              Visual / Generate
Form             Probe + Time       Visual / Generate
```

---

## 13. New settings and state

Suggested settings:

```js
tempoLatticeEnabled: false,
rationalSwing: 0.5,
irrationalSwing: 0.0,
metronomeMeterMode: "section-1",

probeMuted: true,
probeLevel: 0.2,

metronomeEnabled: false,
metronomeLevel: 0.25,

prepareProbeWav: false,
prepareTickerWav: false
```

Live-only state must not be confused with generated settings.

Suggested runtime state:

```js
state.audio = {
  context: null,
  safetyBus: null,
  probe: null,
  metronome: null,
  pinkNoiseBuffer: null,
  schedulerTimer: null,
  schedulerRevision: 0
};

state.lastAudioExports = {
  probe: null,
  ticker: null
};
```

Do not persist “currently playing” across reloads.

Project JSON may persist levels, swing amounts, tempo-lattice selection, and requested export format, but must load safely if those fields are absent in older JSON.

---

## 14. Manifest and report

Add structured manifest fields, for example:

```json
{
  "tempo_lattice": {
    "enabled": true,
    "law": "balanced_random_midpoint_v1",
    "rational_amount": 0.5,
    "irrational_amount": 0.2,
    "tempo_event_count": 138,
    "minimum_instantaneous_bpm": 48.5,
    "maximum_instantaneous_bpm": 78.5,
    "bar_endpoints_preserved": true
  },
  "audio_reference": {
    "probe": {
      "model": "teardrop_v1",
      "reference_hz": 216,
      "oscillator_budget": 12,
      "delta": 0.006944444444444444,
      "q": 2,
      "p": 2,
      "glide_seconds": 1,
      "attack_seconds": 0.35,
      "release_seconds": 1.2
    },
    "ticker": {
      "model": "pink_bpf_v1",
      "frequency_multiplier": 8,
      "frequency_range_hz": [400, 8000],
      "rq": 0.18,
      "web_audio_q": 5.5556,
      "duration_seconds": 0.03,
      "filter_glide_seconds": 0.03
    }
  }
}
```

Report:

- base BPM;
- conductor lattice on/off;
- rational/irrational amounts;
- tempo event count;
- instantaneous tempo range;
- piece real-time duration;
- requested/rendered audio stems;
- sample rate/bit depth;
- any safe-render fallback.

---

## 15. Test requirements

Run the current baseline before editing:

```bash
node scripts/validate-midi.js --smoke
node scripts/validate-midi.js --batch 50
```

Extend tests rather than replacing them.

### Tempo timeline tests

For every `METERS` entry:

- pulse count matches numerator;
- accent indices are valid;
- segment ticks are increasing;
- segment durations are positive;
- no NaN/Infinity;
- section/bar endpoints remain exact;
- deterministic output for the same seed;
- changed seed changes irrational timing;
- rational 0 + irrational 0 gives straight timing;
- max swing still gives positive durations;
- mixed-meter form works;
- generated microseconds-per-quarter fit 24 bits.

### MIDI tests

- lattice off preserves current single-tempo conductor output;
- lattice on produces multiple Set Tempo events;
- Time Signature event count/positions are unchanged;
- note-track event ticks are identical with lattice off vs on;
- track count remains voices plus optional conductor;
- no duplicate tempo event at a tick;
- final End of Track reaches total ticks;
- Equal, Retuner, Bend, Dub, and Fugue cases still pass;
- conductor track is accepted by the existing parser.

### Teardrop pure tests

- oscillator count never exceeds budget;
- exact `f0` is represented;
- frequency factors are finite and positive;
- weights are finite/non-negative;
- curve is centred and approximately symmetric;
- normalisation is stable;
- low-pass clamp is correct.

### WAV tests

- correct RIFF/WAVE headers;
- PCM format 1;
- mono;
- 24-bit;
- correct sample rate;
- data length matches frame count;
- no NaN;
- sample clamp works;
- expected silence/low level at attack start and release end;
- filename metadata is correct.

### Lifecycle tests

- no `AudioContext` is created during page load;
- default live sound is off;
- stopping metronome clears scheduler;
- releasing probe disconnects after release;
- page hide stops live audio;
- generating a new piece releases old audio export blobs;
- render failure does not block MIDI/JSON.

### Manual browser checklist

- iPad Safari;
- macOS Safari;
- current Chrome;
- current Firefox;
- direct `index.html` open;
- GitHub Pages;
- touch and keyboard controls;
- portrait and landscape layout;
- reduced-motion mode;
- long form with WAV guard;
- metronome while changing reference frequency, BPM, meter, and swing.

---

## 16. Performance budget

Required design constraints:

- zero audio nodes at initial page load;
- one shared live `AudioContext`;
- no more than 12 live probe oscillators;
- one cached pink-noise buffer;
- one metronome scheduler;
- scheduler lookahead rather than high-frequency busy looping;
- stop live audio when hidden;
- no AudioWorklet requirement in v1;
- no parallel WAV renders;
- mono offline rendering;
- adaptive 96/48 kHz;
- explicit memory estimate and graceful refusal;
- no framework or dependency expansion;
- pause or reduce nonessential visual animation while offline audio is rendering.

Twelve native Web Audio sine oscillators are not the likely bottleneck. Full-length high-sample-rate offline buffers and simultaneous WebGL/rendering are the things to guard.

---

## 17. Staged commit plan

### Commit 1 — Safety and pure timing model

- baseline tests;
- add reference SuperCollider files under `reference/supercollider/`;
- explicit panel classes replacing `nth-of-type`;
- pure Teardrop curve builder;
- pure meter/accent/swing/timeline builder;
- tests only, no audible UI.

### Commit 2 — MIDI tempo lattice

- add settings and UI switch;
- upgrade conductor track;
- manifest/report;
- MIDI parser/tests;
- old output path retained when off.

### Commit 3 — Live Teardrop Probe

- central audio-context helper;
- probe button/mute/level;
- glide, envelope, filter, cleanup;
- accessibility and lifecycle tests.

### Commit 4 — Live pink-noise metronome

- cached pink noise;
- BPF/Q translation;
- scheduler;
- meter preview;
- rational/irrational controls;
- exact shared timing law.

### Commit 5 — WAV exports

- offline probe;
- offline ticker;
- 24-bit mono encoder;
- memory guard;
- explicit save buttons;
- sequential rendering.

### Commit 6 — Polish and audit

- help/README/credits;
- responsive UI;
- error messages;
- iPad manual checklist;
- final smoke and batch tests;
- PR summary with performance notes.

Each commit must leave the app runnable.

---

## 18. Ready-to-paste master Codex task

```text
Work in amycin/amy-cin-fishtail on a new branch named
feature/probe-tempo-lattice.

Read the entire repository before editing, especially:
- index.html
- styles.css
- src/app.js
- scripts/validate-midi.js
- README.md
- reference/supercollider/lattice-breakdance-v10b.scd
- reference/supercollider/tempo-lock-start.scd

First run and report:
node scripts/validate-midi.js --smoke
node scripts/validate-midi.js --batch 50

Implement the attached “Fishtail Probe + Tempo Lattice” specification in staged,
reviewable commits. Do not migrate frameworks, add npm, add a build system, or
replace the current MIDI writer. Preserve direct opening of index.html and the
existing visual design.

The crucial architecture rule is one pure tempo timeline used by:
1. the optional MIDI conductor tempo lattice,
2. the live metronome,
3. the ticker WAV,
4. duration/report metadata.

The app already has a conductor track. Upgrade it; do not add a competing clock.

Keep all new audio off by default. Use one shared AudioContext created only from
a user gesture. The Teardrop Probe must reproduce the SuperCollider curve,
1-second pitch glide, 0.35-second attack, 1.2-second release, and low-pass rule,
under a 12-OscillatorNode ceiling. Do not simply change 64 to 12 because the
original amplitude window would make most voices zero; resample the audible
lobe and retain an exact f0 voice.

The ticker must use cached pink noise, BPF centre clamp(referenceHz * 8, 400,
8000), approximately Q = 1 / 0.18, 30 ms decay, 30 ms filter glide, and
meter-aware accents from the existing METERS table.

Make the reference default A3 = 216 Hz while retaining A4 anchor = 432 Hz.
Set n = 216 so default BPM remains 60.

Tempo-lattice MIDI must use direct microseconds-per-quarter Set Tempo meta
events at pulse boundaries. When disabled, current output must remain unchanged.
When enabled, note ticks must not change; only conductor timing changes.
Rational/irrational timing must be deterministic, positive, meter-aware, and
bar-safe.

WAV exports are optional, mono, PCM 24-bit, 96 kHz under 60 seconds when safe,
otherwise 48 kHz. Render stems sequentially with a memory guard. Never let WAV
failure block MIDI or JSON. Enable explicit Save WAV buttons rather than forcing
multiple automatic downloads.

Before adding a new panel, replace the current nth-of-type grid placement with
explicit panel classes so the layout is not accidentally reordered.

Add tests for timeline mathematics, mixed meters, tempo event parsing, unchanged
note tracks, audio lifecycle, Teardrop curve, WAV headers, and memory guards.
Update README/help/manifest/report.

At the end:
- run all smoke, stability, and batch tests;
- inspect the app in the browser at desktop and narrow viewport sizes;
- provide a PR with a concise architecture summary;
- list any parts not manually verified on iPad Safari;
- do not merge to main.
```

---

## 19. Follow-up Codex review task

After Codex opens the PR, use this as a separate review:

```text
Review the probe-tempo-lattice PR as a hostile regression reviewer.

Do not add features. Check:
- whether disabled tempo lattice preserves prior MIDI behaviour;
- whether any note tick changes when only conductor swing is enabled;
- duplicate or unsorted tempo events;
- incorrect SC rq-to-Web-Audio-Q translation;
- a literal 64-to-12 Teardrop substitution that leaves most weights at zero;
- multiple AudioContexts;
- audio created before user gesture;
- leaked OscillatorNodes, timers, buffers, or Blob URLs;
- scheduler drift or restart glitches during slider movement;
- meter errors in 2/2, 5/4, 6/8, 7/8, and 9/8;
- WAV memory spikes and parallel rendering;
- Safari-hostile automatic multi-download behaviour;
- CSS nth-of-type layout regressions;
- missing keyboard/pointer-cancel release handling;
- tests that only assert “file exists” rather than timing correctness.

Run the full test suite and report findings by severity. Fix only confirmed
issues, in separate commits, without redesigning the feature.
```

---

## 20. Acceptance definition

The feature is ready to test when:

- the page opens exactly as before, with no sound;
- A3 = 216 Hz and n = 216 display 60 BPM;
- holding Probe produces a smooth Teardrop tone;
- moving reference Hz glides without clicks;
- metronome supports every existing meter;
- rational and irrational controls audibly alter spacing;
- the live ticker and generated ticker WAV share the same timing;
- MIDI conductor lattice contains multiple tempo events when enabled;
- a DAW/player that honours tempo events plays grid notes with the encoded sway;
- note tracks are unchanged by conductor-only swing;
- optional WAV stems save as valid mono 24-bit files;
- long stems fail gently rather than freezing the page;
- all previous generator modes and validation tests still pass.
