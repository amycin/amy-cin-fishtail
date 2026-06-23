"use strict";

const PPQ = 480;
const DEFAULT_A4_HZ = 432;
const DEFAULT_REFERENCE_NOTE = "A3";
const DEFAULT_REFERENCE_HZ = 216;
const DEFAULT_TEMPO_DIVISOR = 216;
const REFERENCE_FINE_CENTS_MIN = -100;
const REFERENCE_FINE_CENTS_MAX = 100;
const DUB_RATIONAL_SWING_DEFAULT = 28;
const DUB_IRRATIONAL_SWING_DEFAULT = 6;
const GENERATE_FADE_MS = 900;
const GENERATE_TAIL_MS = 1800;
const GENERATE_MIN_MS = 4200;
const GENERATE_RITUAL_COMFORT_MS = 5600;
const GENERATE_RITUAL_FAST_MS = 7200;
const GENERATE_RITUAL_MAX_MS = 8600;
const WORMHOLE_CYCLE_MS = 36000;
const WORMHOLE_U_SEGMENTS = 24;
const WORMHOLE_V_SEGMENTS = 7;
const CORE_ACTIVE_FRAME_MS = 1000 / 60;
const CORE_IDLE_FRAME_MS = 1000 / 30;
const CORE_HIGH_REFRESH_IDLE_FRAME_MS = 1000 / 60;
const CORE_ECO_ACTIVE_FRAME_MS = 1000 / 24;
const CORE_ECO_IDLE_FRAME_MS = 1000 / 14;
const CORE_REDUCED_FRAME_MS = 250;
const HIGH_REFRESH_SAMPLE_COUNT = 10;
const HIGH_REFRESH_FRAME_MS = 12.5;
const VISUAL_STRESS_FRAME_MS = 82;
const VISUAL_STRESS_DRAW_MS = 28;
const VISUAL_STRESS_TRIGGER = 4.6;
const VISUAL_ECO_MS = 9000;
const VISUAL_GLITCH_MS = 1900;
const VISUAL_ECO_COOLDOWN_MS = 3500;
const DUB_RELAX_LINES = [
  "Relax: Dub Gravity is active, the bass is holding the room.",
  "Take it easy: the checker found the groove and left the shimmer in.",
  "Irie: rare rule bends are being reported, not hidden.",
  "Breathe: the skank is allowed to answer between the pillars.",
  "Low and steady: bass gravity is carrying the message.",
  "Easy now: the machine is in dub mode and the checker is listening softly.",
];
const CHECK_REASSURANCE_TABLE = {
  calm: [
    "Gemma says: it's ok, it's all good.",
    "Gemma says: breathe easy, the music is still safe.",
    "Gemma says: no stress, this is just a listening note.",
    "Gemma says: relax, the piece has character.",
    "Gemma says: all good, the harmony is still welcome here.",
    "Gemma says: soft landing, nothing scary.",
    "Gemma says: steady now, the phrase is still beautiful.",
    "Gemma says: no worries, we can let the sound settle.",
  ],
  dub: [
    "Gemma says: no worries braa, the groove is still breathing.",
    "Gemma says: easy now, the bass has got this.",
    "Gemma says: all good, leave a little shimmer in the room.",
    "Gemma says: it wobbled, but the wobble has feeling.",
    "Gemma says: dub is allowed to lean a little.",
    "Gemma says: the skank heard it and smiled.",
    "Gemma says: low and kind, keep listening.",
    "Gemma says: sweet as, the pulse knows the way home.",
    "Gemma says: the bass wore sensible shoes and still danced.",
    "Gemma says: that offbeat arrived fashionably kind.",
    "Gemma says: the echo filed a polite extension request.",
    "Gemma says: the groove bent the corner and came back with snacks.",
    "Gemma says: root and fifth are doing their community service beautifully.",
    "Gemma says: the skank has excellent manners today.",
    "Gemma says: the low end checked the map and chose the scenic route.",
    "Gemma says: a tiny wobble is just bass handwriting.",
  ],
  craft: [
    "Gemma says: useful note, not a failure.",
    "Gemma says: this is a clue for the next pass.",
    "Gemma says: the checker is helping, not judging.",
    "Gemma says: one small adjustment can make it shine.",
    "Gemma says: the structure is learning its own shape.",
    "Gemma says: every warning is a little lantern.",
    "Gemma says: keep the good bit and smooth the edge.",
    "Gemma says: this is how careful music gets kinder.",
    "Gemma says: the counterpoint committee has requested a biscuit and one small revision.",
    "Gemma says: the phrase is wearing its workshop apron.",
    "Gemma says: excellent, the music has produced a teachable squiggle.",
    "Gemma says: the cadence brought a clipboard, but it is being very respectful.",
    "Gemma says: this is not a red flag, it is a tiny sticky note.",
    "Gemma says: the voice-leading has entered its thoughtful era.",
    "Gemma says: the structure is not broken; it is asking for a nicer chair.",
    "Gemma says: the harmony tried a side quest, and we have written it down.",
  ],
  tender: [
    "Gemma says: the listener is held gently.",
    "Gemma says: there is still peace in this phrase.",
    "Gemma says: the note can resolve when it is ready.",
    "Gemma says: the silence around it is helping.",
    "Gemma says: this moment has a soft heart.",
    "Gemma says: beautiful things can be slightly imperfect.",
    "Gemma says: nothing is ruined, the feeling remains.",
    "Gemma says: let the cadence breathe.",
    "Gemma says: the little dissonance is being supervised kindly.",
    "Gemma says: this phrase has a soft jumper and good intentions.",
    "Gemma says: the suspension is thinking about home.",
    "Gemma says: even careful notes need a cup of tea sometimes.",
    "Gemma says: the melody is allowed to have feelings.",
    "Gemma says: the harmony has not fallen over; it is resting elegantly.",
    "Gemma says: the resolution is nearby and waving politely.",
    "Gemma says: this tiny tension is carrying a very small lantern.",
  ],
  cosmic: [
    "Gemma says: the torus approves of this small anomaly.",
    "Gemma says: Hilbert space says relax.",
    "Gemma says: the gravity field bent, but gently.",
    "Gemma says: the phase object is still coherent.",
    "Gemma says: tiny anomaly, big calm.",
    "Gemma says: the wormhole remains stable.",
    "Gemma says: the lattice found another path.",
    "Gemma says: all systems are kind enough.",
    "Gemma says: the torus has updated its cardigan matrix.",
    "Gemma says: the phase object briefly became decorative mathematics.",
    "Gemma says: the negative-space layer has filled in the correct paperwork.",
    "Gemma says: the wormhole made a soft ping and continued being mysterious.",
    "Gemma says: the lattice is doing interpretive geometry, very tastefully.",
    "Gemma says: the gravity wave has chosen kindness over drama.",
    "Gemma says: the star in the middle says this is still splendid.",
    "Gemma says: the Hilbert corridor is clear, mind the cadence.",
  ],
  counterpoint: [
    "Gemma says: Palestrina raised one eyebrow, but in an encouraging way.",
    "Gemma says: the fifths have been asked to form an orderly queue.",
    "Gemma says: the octave is being dramatic, but not dangerously so.",
    "Gemma says: the alto has submitted a beautiful little complication.",
    "Gemma says: the tenor briefly became a philosopher; this happens.",
    "Gemma says: the soprano looked at the rulebook and added a flower.",
    "Gemma says: the bass is acting like a wise floorboard.",
    "Gemma says: the cadence arrived with a tiny cape and excellent timing.",
    "Gemma says: the suspension is doing a slow graceful curtsy toward resolution.",
    "Gemma says: the passing tone has signed the visitor book.",
    "Gemma says: the voice crossing was measured with kindness and a ruler.",
    "Gemma says: the harmony is mostly behaving, with tasteful eyebrows.",
  ],
  domestic_sci_fi: [
    "Gemma says: the synthesizer kettle is on and everything is manageable.",
    "Gemma says: the validation robot has put on its soft socks.",
    "Gemma says: the MIDI pantry remains well stocked.",
    "Gemma says: the tiny spaceship of harmony has found a parking spot.",
    "Gemma says: the bass console is glowing in a responsible manner.",
    "Gemma says: the sequence has been tucked in, but not too tightly.",
    "Gemma says: the rhythm drawer was open; we have gently closed it.",
    "Gemma says: the modulation cupboard contains one surprising but pleasant hat.",
    "Gemma says: the invention engine made a funny beep and then apologized beautifully.",
    "Gemma says: the chord table has been polished with a soft cloth.",
    "Gemma says: the note printer briefly used fancy paper.",
    "Gemma says: the refrain has returned wearing a tasteful little neon scarf.",
  ],
  ocular_art_room: [
    "Gemma says: the colors are listening too.",
    "Gemma says: the grid has become a kindly map.",
    "Gemma says: the orange square understands the assignment.",
    "Gemma says: the magenta line is offering emotional support.",
    "Gemma says: the circuit drawing has made room for the wobble.",
    "Gemma says: the visual field says the note is welcome.",
    "Gemma says: the little rectangles are nodding in agreement.",
    "Gemma says: the interface is glowing politely at the phrase.",
    "Gemma says: the artwork has absorbed the warning and turned it into pattern.",
    "Gemma says: the checker note looks better with warm colors nearby.",
    "Gemma says: the grid is holding the musical thought steady.",
    "Gemma says: the design says yes, gently.",
  ],
};
const CHECK_REASSURANCE_LINES = Object.values(CHECK_REASSURANCE_TABLE).flat();
const NOTE_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const KEY_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];
const REFERENCE_NOTE_NAMES = buildReferenceNoteNames(0, 6);
const VOICE_ORDER = ["bass", "tenor", "alto", "soprano"];
const VOICE_LAYOUTS = {
  2: ["bass", "soprano"],
  3: ["bass", "alto", "soprano"],
  4: ["bass", "tenor", "alto", "soprano"],
};
const VOICE_RANGES = {
  bass: [36, 57],
  tenor: [48, 69],
  alto: [53, 76],
  soprano: [60, 84],
};
const VELOCITY_MODEL_VERSION = "gravity_velocity_v1";
const VELOCITY_PITCH_LOW = VOICE_RANGES.bass[0];
const VELOCITY_PITCH_HIGH = VOICE_RANGES.soprano[1];
const VELOCITY_PROFILES = {
  flat: { label: "Fixed 100", min: 100, max: 100, rho: 0, drift: 0 },
  calm: { label: "Calm Gravity", min: 62, max: 108, rho: 0.84, drift: 1.2 },
  gravity: { label: "Gravity", min: 56, max: 116, rho: 0.86, drift: 1.6 },
  dub: { label: "Dub Gravity", min: 60, max: 116, rho: 0.88, drift: 1.5 },
};
const FUGUE_STYLE_ID = "fishtail_fugue";
const DUB_SKANK_EARLY_MS = [12, 34];
const DUB_SWING_LATE_MS = [8, 26];
const DUB_BASS_LATE_MS = [4, 18];
const DUB_MIN_NOTE_TICKS = 24;
const ENTROPY_TIMEOUT_MS = 2000;
const ENTROPY_MAX_BYTES = 4096;
const COMPLEXITY_WARN = {
  sections: 10,
  bars: 128,
  voicePulses: 3200,
};
const COMPLEXITY_EXPANSIVE = {
  sections: 18,
  bars: 256,
  voicePulses: 7600,
};

const AMY_DUB_RATIOS = [
  ["1/1", 1 / 1, 1.0, "home"],
  ["16/15", 16 / 15, 0.34, "upper bite"],
  ["9/8", 9 / 8, 0.52, "motion"],
  ["8/7", 8 / 7, 0.36, "blue low"],
  ["7/6", 7 / 6, 0.42, "minor soul"],
  ["5/4", 5 / 4, 0.82, "sweet light"],
  ["4/3", 4 / 3, 0.9, "plagal"],
  ["11/8", 11 / 8, 0.28, "shimmer"],
  ["3/2", 3 / 2, 0.95, "pillar"],
  ["8/5", 8 / 5, 0.34, "pivot"],
  ["13/8", 13 / 8, 0.48, "tender lift"],
  ["7/4", 7 / 4, 0.58, "dub crown"],
];

const FUNCTION_RATIOS = {
  0: 1 / 1,
  1: 16 / 15,
  2: 9 / 8,
  3: 7 / 6,
  4: 5 / 4,
  5: 4 / 3,
  6: 11 / 8,
  7: 3 / 2,
  8: 8 / 5,
  9: 13 / 8,
  10: 7 / 4,
  11: 15 / 8,
};

const MODES = {
  major: {
    label: "Major",
    offsets: [0, 2, 4, 5, 7, 9, 11],
    stable: [0, 4, 7],
    cadenceQuality: "major",
  },
  harmonic_minor: {
    label: "Harmonic minor",
    offsets: [0, 2, 3, 5, 7, 8, 11],
    stable: [0, 3, 7],
    cadenceQuality: "minor",
    tendencies: {
      11: { targets: [0], direction: "up", label: "leading tone rises" },
    },
  },
  ionian: {
    label: "Ionian (modal major)",
    offsets: [0, 2, 4, 5, 7, 9, 11],
    stable: [0, 4, 7],
    cadenceQuality: "major",
  },
  dorian: {
    label: "Dorian",
    offsets: [0, 2, 3, 5, 7, 9, 10],
    stable: [0, 3, 7],
    cadenceQuality: "minor",
  },
  phrygian: {
    label: "Phrygian",
    offsets: [0, 1, 3, 5, 7, 8, 10],
    stable: [0, 3, 7],
    cadenceQuality: "minor",
  },
  lydian: {
    label: "Lydian",
    offsets: [0, 2, 4, 6, 7, 9, 11],
    stable: [0, 4, 7],
    cadenceQuality: "major",
  },
  mixolydian: {
    label: "Mixolydian",
    offsets: [0, 2, 4, 5, 7, 9, 10],
    stable: [0, 4, 7],
    cadenceQuality: "major",
  },
  aeolian: {
    label: "Aeolian",
    offsets: [0, 2, 3, 5, 7, 8, 10],
    stable: [0, 3, 7],
    cadenceQuality: "minor",
  },
  gravity_melodic_minor: {
    label: "Gravity melodic minor",
    offsets: [0, 2, 3, 5, 7, 8, 9, 10, 11],
    stable: [0, 3, 7],
    cadenceQuality: "minor",
    tendencies: {
      11: { targets: [0], direction: "up", label: "leading tone rises" },
      9: { targets: [11, 0], direction: "up", label: "raised sixth lifts" },
      10: { targets: [9, 8, 7], direction: "down", label: "flat seventh falls" },
      8: { targets: [7], direction: "down", label: "flat sixth falls" },
    },
  },
};

const MODE_PERSONALITIES = {
  major: {
    aura: "bright",
    colorOffsets: [4, 9, 11],
    cadenceWeights: { authentic: 1.4, plagal: 1.1 },
    stableBoost: 1.2,
    stepBoost: 0.5,
    restBias: -0.02,
    cadenceIntensity: 0.76,
  },
  ionian: {
    aura: "modal bright",
    colorOffsets: [2, 5, 9],
    cadenceWeights: { plagal: 1.35, modal: 1.15, authentic: 0.85 },
    stableBoost: 0.8,
    stepBoost: 0.9,
    restBias: 0.02,
    cadenceIntensity: 0.62,
  },
  mixolydian: {
    aura: "dub earth",
    colorOffsets: [10, 5, 7],
    cadenceWeights: { plagal: 1.55, dub_suspension: 1.6, modal: 1.1 },
    stableBoost: 1,
    stepBoost: 0.4,
    restBias: 0.03,
    dubAffinity: 1.35,
    cadenceIntensity: 0.66,
  },
  lydian: {
    aura: "shimmer",
    colorOffsets: [6, 9, 11],
    cadenceWeights: { modal: 1.35, plagal: 1.25, authentic: 0.85 },
    stableBoost: 0.7,
    stepBoost: 0.6,
    restBias: 0.04,
    dubAffinity: 1.12,
    cadenceIntensity: 0.58,
  },
  dorian: {
    aura: "smooth lift",
    colorOffsets: [3, 9, 10],
    cadenceWeights: { modal: 1.35, minor_authentic: 1.05, plagal: 1.15 },
    stableBoost: 0.9,
    stepBoost: 1.2,
    restBias: 0.04,
    cadenceIntensity: 0.6,
  },
  aeolian: {
    aura: "soft shadow",
    colorOffsets: [3, 8, 10],
    cadenceWeights: { modal: 1.35, minor_authentic: 0.95 },
    stableBoost: 0.9,
    stepBoost: 1.15,
    restBias: 0.05,
    cadenceIntensity: 0.56,
  },
  harmonic_minor: {
    aura: "devotional",
    colorOffsets: [3, 8, 11],
    cadenceWeights: { minor_authentic: 1.6 },
    stableBoost: 1.15,
    stepBoost: 0.75,
    restBias: -0.01,
    cadenceIntensity: 0.82,
  },
  gravity_melodic_minor: {
    aura: "living minor",
    colorOffsets: [3, 9, 10, 11, 8],
    cadenceWeights: { minor_authentic: 1.25, modal: 1.2, dub_suspension: 1.1 },
    stableBoost: 0.95,
    stepBoost: 1.25,
    restBias: 0.04,
    cadenceIntensity: 0.68,
  },
  phrygian: {
    aura: "ancient",
    colorOffsets: [1, 5, 10],
    cadenceWeights: { modal: 1.55, minor_authentic: 0.75 },
    stableBoost: 0.85,
    stepBoost: 1.05,
    restBias: 0.08,
    cadenceIntensity: 0.5,
  },
};

const METERS = {
  "2/2": { numerator: 2, denominator: 2, pulse: PPQ * 2, accents: [0] },
  "3/4": { numerator: 3, denominator: 4, pulse: PPQ, accents: [0] },
  "4/4": { numerator: 4, denominator: 4, pulse: PPQ, accents: [0, 2] },
  "5/4": { numerator: 5, denominator: 4, pulse: PPQ, accents: [0, 3] },
  "6/8": { numerator: 6, denominator: 8, pulse: PPQ / 2, accents: [0, 3] },
  "7/8": { numerator: 7, denominator: 8, pulse: PPQ / 2, accents: [0, 2, 4] },
  "9/8": { numerator: 9, denominator: 8, pulse: PPQ / 2, accents: [0, 3, 6] },
};

const CADENCES = {
  authentic: { label: "Authentic", prep: [7, 11, 2], final: [0, 4, 7] },
  minor_authentic: { label: "Minor authentic", prep: [7, 11, 2], final: [0, 3, 7] },
  plagal: { label: "Plagal", prep: [5, 9, 0], final: [0, 4, 7] },
  modal: { label: "Modal", prep: [10, 2, 5], final: [0, 3, 7] },
  dub_suspension: { label: "Dub suspension", prep: [10, 5, 7], final: [0, 4, 7] },
};

const SECTION_ROLES = {
  normal: "Fishtail",
  refrain: "Refrain",
  development: "Development",
};

const SECTION_TREATMENTS = {
  straight: "Clear Return",
  gentle: "Gentle",
  dubby: "Dubby",
};

const DEFAULT_SECTIONS = [
  { bars: 6, key: "F", mode: "mixolydian", meter: "3/4", cadence: "plagal", role: "normal", treatment: "straight" },
  { bars: 8, key: "D", mode: "gravity_melodic_minor", meter: "6/8", cadence: "authentic", role: "normal", treatment: "straight" },
  { bars: 24, key: "F", mode: "mixolydian", meter: "3/4", cadence: "dub_suspension", role: "normal", treatment: "straight" },
];

const state = {
  sections: structuredClone(DEFAULT_SECTIONS),
  lastPiece: null,
  animationActive: false,
  animationPhase: 0,
  animationStartedAt: 0,
  animationTailUntil: 0,
  animationVisualLevel: 0,
  wormholeStartedAt: Date.now(),
  wormholePhase: 0,
  negativeSpaceOpacity: 0,
  focusZoom: 0,
  motionSetup: false,
  motionPermissionRequested: false,
  motionTargetX: 0,
  motionTargetY: 0,
  motionTiltX: 0,
  motionTiltY: 0,
  motionLastAt: 0,
  bootGlitchUntil: Date.now() + 2400,
  audioContext: null,
  audio: {
    context: null,
    safetyBus: null,
    limiter: null,
    probe: null,
    metronome: null,
    pinkNoiseBuffer: null,
    schedulerTimer: null,
    schedulerRevision: 0,
  },
  inputReference: {
    status: "idle",
    stream: null,
    track: null,
    sourceNode: null,
    highpassNode: null,
    lowpassNode: null,
    analyserNode: null,
    silentSinkNode: null,
    analysisTimer: null,
    analysisRevision: 0,
    analysisFps: FishtailPitchInput.ANALYSIS_FPS,
    selectedDeviceId: null,
    timeData: null,
    scratch: null,
    pitchHistory: [],
    latest: null,
    captured: null,
    suspendedProbe: false,
    suspendedMetronome: false,
    detectorMs: 0,
  },
  lastAudioExports: {
    probe: null,
    ticker: null,
  },
  probeHeld: false,
  referenceAnchorA4Hz: DEFAULT_A4_HZ,
  referenceExactHz: null,
  pedalTouched: false,
  generating: false,
  randomising: false,
  pageVisible: true,
  visualVisible: true,
  reducedMotion: false,
  visualStressScore: 0,
  visualEcoUntil: 0,
  visualGlitchUntil: 0,
  visualEcoCooldownUntil: 0,
  visualHighRefreshCapable: false,
  visualRefreshEstimate: 60,
  formSafetyNoticeLevel: "comfortable",
  coreFrameId: null,
  coreFrameTimer: null,
  coreLastDrawnAt: 0,
  visualLifecycleReady: false,
  visualResizeObserver: null,
  visualIntersectionObserver: null,
  reducedMotionQuery: null,
};

window.fishtailApp = { state, version: "v0" };
window.amyCinGenerator = window.fishtailApp;

const THREE_MODULE_URL = "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js";
const torusCore = {
  loading: false,
  ready: false,
  failed: false,
  THREE: null,
  renderer: null,
  scene: null,
  camera: null,
  group: null,
  torus: null,
  negativeWire: null,
  ratioLoop: null,
  ratioWeb: null,
  ratioMarkers: [],
};

const els = {};

document.addEventListener("DOMContentLoaded", () => {
  bindElements();
  hydrateSelects();
  updateTuningRootReference(false);
  updateBendControls();
  applyPedalDefaults(true);
  updatePedalControls();
  updateTempoControls();
  renderSections();
  updateSoundTimeControls();
  bindEvents();
  updateDubModeUi();
  setupMotionInput();
  setupVisualLifecycle();
  detectDisplayRefresh();
  initTorusCore();
  requestCoreFrame(true);
});

function bindElements() {
  for (const id of [
    "sectionTable",
    "formSafetyLabel",
    "addSectionButton",
    "gentleRollButton",
    "wildRollButton",
    "strangenessInput",
    "styleInput",
    "voicesInput",
    "pedalBassInput",
    "pedalTenorInput",
    "pedalAltoInput",
    "pedalSopranoInput",
    "tempoInput",
    "embedTempoInput",
    "tempoLatticeInput",
    "tempoLatticeStatusLabel",
    "tempoLatticeReadout",
    "rationalSwingInput",
    "irrationalSwingInput",
    "probePitchInput",
    "probePitchLabel",
    "probeFineInput",
    "probeFineLabel",
    "referenceListenButton",
    "referenceStopButton",
    "referenceUsePitchButton",
    "referenceDeviceInput",
    "referenceRangeInput",
    "referenceInputStatus",
    "referenceInputLevelLabel",
    "referenceInputLevelBar",
    "referenceConfidenceLabel",
    "referenceConfidenceBar",
    "referenceDetectedHzLabel",
    "referenceDetectedNoteLabel",
    "referenceDetectedCentsLabel",
    "referenceStabilityLabel",
    "metronomeMeterInput",
    "probeInput",
    "probeLevelInput",
    "metronomeInput",
    "metronomeLevelInput",
    "prepareProbeWavInput",
    "prepareTickerWavInput",
    "velocityModeInput",
    "dubModeInput",
    "referenceNoteInput",
    "referenceFreqInput",
    "tempoDivisorInput",
    "tempoDivisorLabel",
    "breathingInput",
    "densityInput",
    "resolutionInput",
    "outputModeInput",
    "rootNoteInput",
    "rootFreqInput",
    "linkRootInput",
    "generateButton",
    "downloadMidiButton",
    "downloadJsonButton",
    "downloadProbeWavButton",
    "downloadTickerWavButton",
    "toggleNotesButton",
    "helpButton",
    "helpModal",
    "closeHelpButton",
    "creditsButton",
    "creditsModal",
    "closeCreditsButton",
    "reportOutput",
    "notesPanel",
    "seedLabel",
    "statusLabel",
    "pieceLengthLabel",
    "torusHost",
    "coreCanvas",
  ]) {
    els[id] = document.getElementById(id);
  }
}

function hydrateSelects() {
  for (const key of KEY_NAMES) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = `${key}4`;
    if (key === "A") option.selected = true;
    els.rootNoteInput.append(option);
  }
  for (const note of REFERENCE_NOTE_NAMES) {
    const option = document.createElement("option");
    option.value = note;
    option.textContent = note;
    if (note === DEFAULT_REFERENCE_NOTE) option.selected = true;
    els.referenceNoteInput.append(option);
  }
  if (els.metronomeMeterInput) {
    const follow = document.createElement("option");
    follow.value = "section-1";
    follow.textContent = "Follow section 1";
    follow.selected = true;
    els.metronomeMeterInput.append(follow);
    Object.keys(METERS).forEach((meter) => {
      const option = document.createElement("option");
      option.value = meter;
      option.textContent = meter;
      els.metronomeMeterInput.append(option);
    });
  }
}

function bindEvents() {
  document.addEventListener("pointerdown", requestMotionPermissionOnce, { once: true, passive: true });
  els.addSectionButton.addEventListener("click", () => {
    state.sections.push({
      bars: 8,
      key: "C",
      mode: "major",
      meter: "4/4",
      cadence: "authentic",
      role: "normal",
      treatment: "straight",
    });
    renderSections();
  });
  els.gentleRollButton.addEventListener("click", () => randomiseForm("gentle"));
  els.wildRollButton.addEventListener("click", () => randomiseForm("wild"));
  els.voicesInput.addEventListener("change", () => {
    updatePedalControls();
    updateFormSafety();
  });
  els.styleInput.addEventListener("change", updateFormSafety);
  els.outputModeInput.addEventListener("change", () => {
    updateBendControls();
    refreshTorusTuning();
  });
  els.referenceNoteInput.addEventListener("change", () => {
    updateReferenceFrequencyFromAnchor();
    applyReferencePitchChange();
  });
  els.referenceFreqInput.addEventListener("input", () => {
    updateReferenceAnchorFromFrequency();
    applyReferencePitchChange();
  });
  els.probePitchInput?.addEventListener("input", () => {
    const index = clamp(parseInt(els.probePitchInput.value, 10) || 0, 0, REFERENCE_NOTE_NAMES.length - 1);
    const fineCents = readProbeFineCents();
    els.referenceNoteInput.value = REFERENCE_NOTE_NAMES[index] || DEFAULT_REFERENCE_NOTE;
    updateReferenceFrequencyFromFineCents(fineCents);
    applyReferencePitchChange();
  });
  els.probeFineInput?.addEventListener("input", () => {
    updateReferenceFrequencyFromFineCents(readProbeFineCents());
    applyReferencePitchChange();
  });
  els.tempoDivisorInput.addEventListener("input", () => {
    updateTempoControls();
    updateSoundTimeControls();
    updateLiveAudioFromControls();
  });
  els.rootNoteInput.addEventListener("change", () => updateTuningRootReference(true));
  els.rootFreqInput.addEventListener("input", () => {
    if (els.linkRootInput) els.linkRootInput.checked = false;
  });
  els.linkRootInput?.addEventListener("change", () => updateTuningRootReference(true));
  els.dubModeInput.addEventListener("change", () => {
    updateDubModeUi();
    applyPedalDefaults(false);
    updatePedalControls();
    updateFormSafety();
    animateFor(1200);
  });
  pedalInputs().forEach((input) => {
    input.addEventListener("change", () => {
      state.pedalTouched = true;
      updatePedalControls();
    });
  });
  els.generateButton.addEventListener("click", generatePiece);
  els.downloadMidiButton.addEventListener("click", () => downloadLast("midi"));
  els.downloadJsonButton.addEventListener("click", () => downloadLast("json"));
  els.downloadProbeWavButton?.addEventListener("click", () => downloadLast("probeWav"));
  els.downloadTickerWavButton?.addEventListener("click", () => downloadLast("tickerWav"));
  els.referenceListenButton?.addEventListener("click", startLivingReferenceInput);
  els.referenceStopButton?.addEventListener("click", () => stopLivingReferenceInput("Input ended", { restoreAudio: true }));
  els.referenceUsePitchButton?.addEventListener("click", captureLivingReferencePitch);
  els.referenceDeviceInput?.addEventListener("change", () => {
    state.inputReference.selectedDeviceId = els.referenceDeviceInput.value || null;
    if (state.inputReference.stream) startLivingReferenceInput();
  });
  els.referenceRangeInput?.addEventListener("change", () => {
    state.inputReference.pitchHistory = [];
    updateReferenceInputStatus(state.inputReference.stream ? "Listening" : "Permission needed");
  });
  els.toggleNotesButton.addEventListener("click", toggleNotes);
  els.helpButton.addEventListener("click", openHelp);
  els.closeHelpButton.addEventListener("click", closeHelp);
  els.helpModal.addEventListener("click", (event) => {
    if (event.target === els.helpModal) closeHelp();
  });
  els.creditsButton.addEventListener("click", openCredits);
  els.closeCreditsButton.addEventListener("click", closeCredits);
  els.creditsModal.addEventListener("click", (event) => {
    if (event.target === els.creditsModal) closeCredits();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !els.helpModal.hidden) closeHelp();
    if (event.key === "Escape" && !els.creditsModal.hidden) closeCredits();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.inputReference.stream) stopLivingReferenceInput("Input ended", { restoreAudio: false });
  });
  window.addEventListener("pagehide", () => {
    if (state.inputReference.stream) stopLivingReferenceInput("Input ended", { restoreAudio: false });
  });
  navigator.mediaDevices?.addEventListener?.("devicechange", () => {
    if (state.inputReference.stream) populateReferenceInputDevices(state.inputReference.selectedDeviceId);
  });
  bindSoundTimeEvents();
}

function bindSoundTimeEvents() {
  [
    els.tempoLatticeInput,
    els.rationalSwingInput,
    els.irrationalSwingInput,
    els.probePitchInput,
    els.probeFineInput,
    els.metronomeMeterInput,
    els.probeLevelInput,
    els.metronomeLevelInput,
    els.prepareProbeWavInput,
    els.prepareTickerWavInput,
  ].filter(Boolean).forEach((input) => {
    input.addEventListener("input", () => {
      updateSoundTimeControls();
      updateLiveAudioFromControls();
    });
    input.addEventListener("change", () => {
      updateSoundTimeControls();
      updateLiveAudioFromControls();
    });
  });

  els.metronomeInput?.addEventListener("click", () => {
    toggleSwitchControl(els.metronomeInput);
    updateSoundTimeControls();
    if (switchControlIsOn(els.metronomeInput)) startLiveMetronome();
    else stopLiveMetronome();
  });

  const handleProbeToggle = () => {
    toggleSwitchControl(els.probeInput);
    updateSoundTimeControls();
    if (switchControlIsOn(els.probeInput)) startProbeHold();
    else stopProbeHold();
  };
  els.probeInput?.addEventListener("click", handleProbeToggle);

  window.addEventListener("blur", () => {
    stopProbeHold();
    setSwitchControl(els.probeInput, false);
  });
}

function switchControlIsOn(control) {
  if (!control) return false;
  if ("checked" in control) return Boolean(control.checked);
  return control.getAttribute("aria-checked") === "true";
}

function setSwitchControl(control, on) {
  if (!control) return;
  const enabled = Boolean(on);
  if ("checked" in control) {
    control.checked = enabled;
  } else {
    control.setAttribute("aria-checked", enabled ? "true" : "false");
    control.classList.toggle("is-on", enabled);
  }
}

function toggleSwitchControl(control) {
  setSwitchControl(control, !switchControlIsOn(control));
}

function ensureAudioContextFromUserGesture() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return null;
  const context = state.audio.context || state.audioContext || new AudioContextClass();
  state.audio.context = context;
  state.audioContext = context;
  if (context.state === "suspended") {
    context.resume().catch((error) => {
      console.warn("Audio context resume was deferred.", error);
    });
  }
  FishtailAudioEngine.ensureAudioState(state.audio, context);
  return context;
}

function requestAudioContextResume(context, label, control) {
  if (!context || context.state !== "suspended") return;
  context.resume().then(() => {
    if (label === "Probe" && state.probeHeld && switchControlIsOn(els.probeInput)) {
      els.statusLabel.textContent = `Probe ${currentReferenceHz().toFixed(2)} Hz`;
    }
  }).catch((error) => {
    els.statusLabel.textContent = `${label} paused`;
    if (control) setSwitchControl(control, false);
    console.warn(`${label} audio resume failed.`, error);
  });
}

function readLiveAudioSettings() {
  const sectionMeter = state.sections[0]?.meter || "4/4";
  const meterChoice = els.metronomeMeterInput?.value || "section-1";
  const probeEnabled = switchControlIsOn(els.probeInput);
  return {
    seed: state.lastPiece?.settings?.seed || "live-metronome",
    ppq: PPQ,
    meters: METERS,
    metronomeMeter: meterChoice === "section-1" ? sectionMeter : meterChoice,
    tempo: currentTempoBpm(),
    referenceHz: currentReferenceHz(),
    tempoLatticeEnabled: true,
    rationalSwing: percentInput(els.rationalSwingInput, 0),
    irrationalSwing: percentInput(els.irrationalSwingInput, 0),
    probeEnabled,
    probeMuted: !probeEnabled,
    probeLevel: percentInput(els.probeLevelInput, 0.45),
    metronomeEnabled: switchControlIsOn(els.metronomeInput),
    metronomeLevel: percentInput(els.metronomeLevelInput, 0.88),
  };
}

function percentInput(input, fallback) {
  if (!input) return fallback;
  return clamp((parseFloat(input.value) || 0) / 100, 0, 1);
}

function currentTempoBpm() {
  return clamp(parseFloat(els.tempoInput?.value) || fishtailTempo(currentReferenceHz(), DEFAULT_TEMPO_DIVISOR), 30, 220);
}

function startProbeHold() {
  state.probeHeld = true;
  const settings = readLiveAudioSettings();
  if (settings.probeMuted) {
    els.statusLabel.textContent = "Probe off";
    return;
  }
  const context = ensureAudioContextFromUserGesture();
  if (!context) {
    els.statusLabel.textContent = "Audio unavailable";
    return;
  }
  if (!switchControlIsOn(els.probeInput)) return;
  els.statusLabel.textContent = `Probe ${settings.referenceHz.toFixed(2)} Hz`;
  requestAudioContextResume(context, "Probe", els.probeInput);
  try {
    FishtailAudioEngine.startProbe(state.audio, context, settings);
  } catch (error) {
    els.statusLabel.textContent = "Probe failed";
    console.warn("Probe sound unavailable.", error);
  }
}

function stopProbeHold() {
  if (!state.probeHeld && !state.audio.probe) return;
  state.probeHeld = false;
  FishtailAudioEngine.stopProbe(state.audio, state.audio.context);
  els.statusLabel.textContent = switchControlIsOn(els.metronomeInput) ? "Metronome on" : "Probe off";
}

function startLiveMetronome() {
  const context = ensureAudioContextFromUserGesture();
  if (!context) {
    els.statusLabel.textContent = "Audio unavailable";
    setSwitchControl(els.metronomeInput, false);
    return;
  }
  if (!switchControlIsOn(els.metronomeInput)) return;
  els.statusLabel.textContent = "Metronome on";
  requestAudioContextResume(context, "Metronome", els.metronomeInput);
  try {
    FishtailAudioEngine.startMetronome(state.audio, context, readLiveAudioSettings());
  } catch (error) {
    els.statusLabel.textContent = "Metronome failed";
    console.warn("Metronome unavailable.", error);
  }
}

function stopLiveMetronome() {
  FishtailAudioEngine.stopMetronome(state.audio);
  els.statusLabel.textContent = "Metronome off";
}

function updateLiveAudioFromControls() {
  const context = state.audio.context;
  const settings = readLiveAudioSettings();
  if (state.audio.probe) FishtailAudioEngine.updateProbe(state.audio, context, settings);
  if (state.probeHeld && !settings.probeMuted && !state.audio.probe) {
    const gestureContext = ensureAudioContextFromUserGesture();
    if (gestureContext) FishtailAudioEngine.startProbe(state.audio, gestureContext, settings);
  }
  if (state.audio.metronome) FishtailAudioEngine.updateMetronome(state.audio, context, settings);
}

function stopAllLiveAudio() {
  stopProbeHold();
  FishtailAudioEngine.stopAll(state.audio, state.audio.context);
  setSwitchControl(els.metronomeInput, false);
  setSwitchControl(els.probeInput, false);
}

function setReferenceInputMeter(levelPercent, confidencePercent) {
  if (els.referenceInputLevelBar) els.referenceInputLevelBar.style.width = `${clamp(levelPercent || 0, 0, 100).toFixed(1)}%`;
  if (els.referenceConfidenceBar) els.referenceConfidenceBar.style.width = `${clamp(confidencePercent || 0, 0, 100).toFixed(1)}%`;
}

function clearReferenceCaptureMetadata() {
  state.inputReference.captured = null;
}

function updateReferenceInputStatus(status) {
  state.inputReference.status = status;
  if (els.referenceInputStatus) els.referenceInputStatus.textContent = status;
  if (els.referenceListenButton) els.referenceListenButton.disabled = Boolean(state.inputReference.stream);
  if (els.referenceStopButton) els.referenceStopButton.disabled = !state.inputReference.stream;
  if (els.referenceUsePitchButton) {
    const stats = FishtailPitchInput.pitchStats(state.inputReference.pitchHistory, Date.now());
    els.referenceUsePitchButton.disabled = !state.inputReference.stream || !stats.ok;
  }
}

function referenceMidiBounds() {
  return {
    minMidi: noteNameToMidi(REFERENCE_NOTE_NAMES[0]),
    maxMidi: noteNameToMidi(REFERENCE_NOTE_NAMES[REFERENCE_NOTE_NAMES.length - 1]),
  };
}

function mediaConstraintsForReferenceInput(deviceId) {
  const supported = navigator.mediaDevices?.getSupportedConstraints?.() || {};
  const audio = {};
  if (deviceId) audio.deviceId = { ideal: deviceId };
  if (supported.channelCount) audio.channelCount = { ideal: 1 };
  if (supported.echoCancellation) audio.echoCancellation = { ideal: false };
  if (supported.noiseSuppression) audio.noiseSuppression = { ideal: false };
  if (supported.autoGainControl) audio.autoGainControl = { ideal: false };
  if (supported.latency) audio.latency = { ideal: 0.02 };
  return { audio, video: false };
}

async function populateReferenceInputDevices(selectedDeviceId = state.inputReference.selectedDeviceId) {
  if (!navigator.mediaDevices?.enumerateDevices || !els.referenceDeviceInput) return;
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((device) => device.kind === "audioinput");
    const current = selectedDeviceId || els.referenceDeviceInput.value || "";
    els.referenceDeviceInput.innerHTML = '<option value="">Default input</option>';
    inputs.forEach((device, index) => {
      const option = document.createElement("option");
      option.value = device.deviceId;
      option.textContent = device.label || `Audio input ${index + 1}`;
      if (device.deviceId === current) option.selected = true;
      els.referenceDeviceInput.append(option);
    });
    if (current && !inputs.some((device) => device.deviceId === current)) {
      state.inputReference.selectedDeviceId = null;
      els.referenceDeviceInput.value = "";
      updateReferenceInputStatus("Input unavailable");
    }
  } catch (error) {
    console.warn("Audio input device listing unavailable.", error);
  }
}

function suspendLiveAudioForReferenceInput() {
  state.inputReference.suspendedProbe = state.inputReference.suspendedProbe || Boolean(state.audio.probe);
  state.inputReference.suspendedMetronome = state.inputReference.suspendedMetronome || Boolean(state.audio.metronome);
  if (state.audio.probe) stopProbeHold();
  if (state.audio.metronome) stopLiveMetronome();
}

function restoreLiveAudioAfterReferenceInput() {
  if (state.inputReference.suspendedProbe && switchControlIsOn(els.probeInput)) startProbeHold();
  if (state.inputReference.suspendedMetronome && switchControlIsOn(els.metronomeInput)) startLiveMetronome();
  state.inputReference.suspendedProbe = false;
  state.inputReference.suspendedMetronome = false;
}

function disconnectReferenceNode(node) {
  try {
    node?.disconnect?.();
  } catch (error) {
    // Some browsers throw if a media node is already disconnected.
  }
}

function cleanupReferenceInputGraph() {
  const input = state.inputReference;
  if (input.analysisTimer) clearTimeout(input.analysisTimer);
  input.analysisTimer = null;
  input.analysisRevision += 1;
  input.stream?.getTracks?.().forEach((track) => track.stop());
  disconnectReferenceNode(input.sourceNode);
  disconnectReferenceNode(input.highpassNode);
  disconnectReferenceNode(input.lowpassNode);
  disconnectReferenceNode(input.analyserNode);
  disconnectReferenceNode(input.silentSinkNode);
  input.stream = null;
  input.track = null;
  input.sourceNode = null;
  input.highpassNode = null;
  input.lowpassNode = null;
  input.analyserNode = null;
  input.silentSinkNode = null;
  input.timeData = null;
  input.latest = null;
}

function stopLivingReferenceInput(status = "Input ended", options = {}) {
  const wasListening = Boolean(state.inputReference.stream);
  cleanupReferenceInputGraph();
  if (wasListening && options.restoreAudio !== false) restoreLiveAudioAfterReferenceInput();
  if (wasListening && options.restoreAudio === false && !options.preserveSuspended) {
    state.inputReference.suspendedProbe = false;
    state.inputReference.suspendedMetronome = false;
  }
  updateReferenceInputStatus(status);
  setReferenceInputMeter(0, 0);
}

async function startLivingReferenceInput() {
  if (!navigator.mediaDevices?.getUserMedia) {
    updateReferenceInputStatus("Input unavailable");
    if (els.referenceStabilityLabel) els.referenceStabilityLabel.textContent = "Live reference input is unavailable here. You can still type a frequency or use the Teardrop Probe.";
    return;
  }
  stopLivingReferenceInput("Requesting permission", { restoreAudio: false, preserveSuspended: true });
  updateReferenceInputStatus("Requesting permission");
  suspendLiveAudioForReferenceInput();
  const context = ensureAudioContextFromUserGesture();
  if (!context) {
    restoreLiveAudioAfterReferenceInput();
    updateReferenceInputStatus("Input unavailable");
    return;
  }
  try {
    const selectedDeviceId = els.referenceDeviceInput?.value || state.inputReference.selectedDeviceId || null;
    const stream = await navigator.mediaDevices.getUserMedia(mediaConstraintsForReferenceInput(selectedDeviceId));
    const track = stream.getAudioTracks()[0];
    if (!track) throw new Error("No audio track was provided.");
    state.inputReference.stream = stream;
    state.inputReference.track = track;
    state.inputReference.selectedDeviceId = selectedDeviceId;
    state.inputReference.pitchHistory = [];
    state.inputReference.analysisFps = FishtailPitchInput.ANALYSIS_FPS;
    state.inputReference.detectorMs = 0;
    track.addEventListener?.("ended", () => stopLivingReferenceInput("Input ended", { restoreAudio: true }), { once: true });

    const source = context.createMediaStreamSource(stream);
    const highpass = context.createBiquadFilter();
    const lowpass = context.createBiquadFilter();
    const analyser = context.createAnalyser();
    const silentSink = context.createGain();
    highpass.type = "highpass";
    highpass.frequency.setValueAtTime(25, context.currentTime);
    lowpass.type = "lowpass";
    lowpass.frequency.setValueAtTime(3600, context.currentTime);
    analyser.fftSize = FishtailPitchInput.INPUT_FFT_SIZE;
    analyser.smoothingTimeConstant = 0;
    silentSink.gain.setValueAtTime(0, context.currentTime);
    source.connect(highpass).connect(lowpass).connect(analyser).connect(silentSink).connect(context.destination);
    state.inputReference.sourceNode = source;
    state.inputReference.highpassNode = highpass;
    state.inputReference.lowpassNode = lowpass;
    state.inputReference.analyserNode = analyser;
    state.inputReference.silentSinkNode = silentSink;
    state.inputReference.timeData = new Float32Array(analyser.fftSize);
    state.inputReference.scratch = state.inputReference.scratch || FishtailPitchInput.makeScratch();
    await populateReferenceInputDevices(selectedDeviceId);
    updateReferenceInputStatus("Listening");
    if (els.referenceStabilityLabel) els.referenceStabilityLabel.textContent = "Play or sing one sustained note.";
    scheduleReferenceInputAnalysis();
  } catch (error) {
    cleanupReferenceInputGraph();
    restoreLiveAudioAfterReferenceInput();
    const denied = error?.name === "NotAllowedError" || error?.name === "SecurityError";
    updateReferenceInputStatus(denied ? "Permission denied" : "Input unavailable");
    if (els.referenceStabilityLabel) {
      els.referenceStabilityLabel.textContent = denied
        ? "Permission denied. Use the browser site settings to allow audio input, or type a frequency manually."
        : "Live reference input is unavailable here. You can still type a frequency or use the Teardrop Probe.";
    }
    console.warn("Living reference input unavailable.", error);
  }
}

function scheduleReferenceInputAnalysis() {
  const input = state.inputReference;
  const revision = input.analysisRevision;
  const delay = Math.round(1000 / Math.max(1, input.analysisFps || FishtailPitchInput.ANALYSIS_FPS));
  input.analysisTimer = setTimeout(() => {
    analyseReferenceInputFrame(revision);
    if (state.inputReference.stream && state.inputReference.analysisRevision === revision) scheduleReferenceInputAnalysis();
  }, delay);
}

function analyseReferenceInputFrame(revision) {
  const input = state.inputReference;
  const context = state.audio.context;
  if (!input.stream || input.analysisRevision !== revision || !input.analyserNode || !input.timeData || !context) return;
  input.analyserNode.getFloatTimeDomainData(input.timeData);
  const started = performance.now();
  const result = FishtailPitchInput.detectPitch(input.timeData, context.sampleRate, {
    range: els.referenceRangeInput?.value || "general",
  }, input.scratch);
  const elapsed = performance.now() - started;
  input.detectorMs = input.detectorMs ? input.detectorMs * 0.82 + elapsed * 0.18 : elapsed;
  if (input.detectorMs > 12) input.analysisFps = FishtailPitchInput.SLOW_ANALYSIS_FPS;
  updateReferenceInputReadouts(result);
}

function updateReferenceInputReadouts(result) {
  const now = Date.now();
  const rmsDb = Number.isFinite(result.rmsDb) ? result.rmsDb : -Infinity;
  const levelPercent = Number.isFinite(rmsDb) ? clamp((rmsDb + 60) * (100 / 60), 0, 100) : 0;
  const confidencePercent = clamp((result.confidence || 0) * 100, 0, 100);
  setReferenceInputMeter(levelPercent, confidencePercent);
  if (els.referenceInputLevelLabel) els.referenceInputLevelLabel.textContent = Number.isFinite(rmsDb) ? `Level ${rmsDb.toFixed(0)} dB` : "Level -inf dB";
  if (els.referenceConfidenceLabel) els.referenceConfidenceLabel.textContent = `Confidence ${Math.round(confidencePercent)}%`;
  if (result.ok) {
    state.inputReference.latest = result;
    state.inputReference.pitchHistory.push({
      at: now,
      ok: true,
      frequency: result.frequency,
      confidence: result.confidence,
    });
    state.inputReference.pitchHistory = state.inputReference.pitchHistory.filter((entry) => entry.at >= now - FishtailPitchInput.CAPTURE_HISTORY_MS * 1.6);
    const reference = FishtailPitchInput.hzToReference(result.frequency, state.referenceAnchorA4Hz, referenceMidiBounds());
    const stats = FishtailPitchInput.pitchStats(state.inputReference.pitchHistory, now);
    if (els.referenceDetectedHzLabel) els.referenceDetectedHzLabel.textContent = `${result.frequency.toFixed(3)} Hz`;
    if (els.referenceDetectedNoteLabel) els.referenceDetectedNoteLabel.textContent = reference?.referenceNote || "--";
    if (els.referenceDetectedCentsLabel) {
      const cents = reference?.deviationCents || 0;
      els.referenceDetectedCentsLabel.textContent = `${cents >= 0 ? "+" : ""}${cents.toFixed(2)} cents`;
    }
    if (els.referenceStabilityLabel) {
      if (stats.ok) {
        const movement = `±${Math.max(0, stats.spreadCents).toFixed(1)} cents`;
        els.referenceStabilityLabel.textContent = stats.state === "stable" ? `Stable ${movement}` : `Moving ${movement}`;
        updateReferenceInputStatus(stats.state === "stable" ? "Pitch stable" : "Pitch moving");
      } else {
        els.referenceStabilityLabel.textContent = "Collecting pitch centre.";
        updateReferenceInputStatus("Listening");
      }
    }
  } else {
    const status = result.reason === "too-quiet" ? "Too quiet" : "No stable fundamental";
    if (els.referenceStabilityLabel) els.referenceStabilityLabel.textContent = status;
    updateReferenceInputStatus(status);
  }
}

function captureLivingReferencePitch() {
  const stats = FishtailPitchInput.pitchStats(state.inputReference.pitchHistory, Date.now());
  if (!stats.ok) {
    updateReferenceInputStatus("No stable fundamental");
    return;
  }
  const reference = FishtailPitchInput.hzToReference(stats.frequency, state.referenceAnchorA4Hz, referenceMidiBounds());
  if (!reference || !REFERENCE_NOTE_NAMES.includes(reference.referenceNote)) {
    updateReferenceInputStatus("Input unavailable");
    return;
  }
  els.referenceNoteInput.value = reference.referenceNote;
  els.referenceFreqInput.value = stats.frequency.toFixed(4);
  state.referenceExactHz = stats.frequency;
  state.referenceAnchorA4Hz = reference.impliedA4Hz;
  state.inputReference.captured = {
    mode: "live_input",
    captured_hz: stats.frequency,
    reference_note: reference.referenceNote,
    reference_midi: reference.referenceMidi,
    deviation_before_reanchor_cents: reference.deviationCents,
    implied_a4_hz: reference.impliedA4Hz,
    confidence: stats.confidence,
    pitch_spread_cents: stats.spreadCents,
    algorithm: stats.algorithm || FishtailPitchInput.ALGORITHM,
    audio_recorded: false,
    audio_uploaded: false,
  };
  applyReferencePitchChange();
  refreshTorusTuning();
  stopLivingReferenceInput("Captured", { restoreAudio: true });
  if (els.referenceDetectedHzLabel) els.referenceDetectedHzLabel.textContent = `${stats.frequency.toFixed(4)} Hz`;
  if (els.referenceDetectedNoteLabel) els.referenceDetectedNoteLabel.textContent = reference.referenceNote;
  if (els.referenceStabilityLabel) els.referenceStabilityLabel.textContent = `Captured ${reference.referenceNote} at ${stats.frequency.toFixed(4)} Hz`;
}

function setupMotionInput() {
  if (state.motionSetup || typeof window === "undefined") return;
  state.motionSetup = true;
  window.addEventListener("deviceorientation", handleDeviceOrientation, { passive: true });
  window.addEventListener("devicemotion", handleDeviceMotion, { passive: true });
}

async function requestMotionPermissionOnce() {
  if (state.motionPermissionRequested) return;
  state.motionPermissionRequested = true;
  try {
    const requests = [];
    if (typeof DeviceOrientationEvent !== "undefined" && typeof DeviceOrientationEvent.requestPermission === "function") {
      requests.push(DeviceOrientationEvent.requestPermission());
    }
    if (typeof DeviceMotionEvent !== "undefined" && typeof DeviceMotionEvent.requestPermission === "function") {
      requests.push(DeviceMotionEvent.requestPermission());
    }
    if (requests.length) {
      const results = await Promise.all(requests.map((request) => request.catch(() => "denied")));
      if (!results.includes("granted")) return;
    }
    setupMotionInput();
  } catch (error) {
    console.warn("Device motion input unavailable.", error);
  }
}

function handleDeviceOrientation(event) {
  if (event.gamma == null && event.beta == null) return;
  const gamma = clamp(event.gamma || 0, -45, 45);
  const beta = clamp(event.beta || 0, -45, 45);
  state.motionTargetX = clamp(gamma / 45, -1, 1);
  state.motionTargetY = clamp(beta / 45, -1, 1);
  state.motionLastAt = Date.now();
}

function handleDeviceMotion(event) {
  const gravity = event.accelerationIncludingGravity;
  if (!gravity || gravity.x == null || gravity.y == null) return;
  state.motionTargetX = clamp((gravity.x || 0) / 8, -1, 1);
  state.motionTargetY = clamp((gravity.y || 0) / 8, -1, 1);
  state.motionLastAt = Date.now();
}

function setupVisualLifecycle() {
  if (state.visualLifecycleReady || typeof window === "undefined") return;
  state.visualLifecycleReady = true;
  state.pageVisible = typeof document === "undefined" ? true : document.visibilityState !== "hidden";
  state.visualVisible = true;

  if (typeof window.matchMedia === "function") {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    state.reducedMotionQuery = query;
    state.reducedMotion = Boolean(query.matches);
    const handleReducedMotion = () => {
      state.reducedMotion = Boolean(query.matches);
      requestCoreFrame(true);
    };
    if (typeof query.addEventListener === "function") query.addEventListener("change", handleReducedMotion);
    else if (typeof query.addListener === "function") query.addListener(handleReducedMotion);
  }

  document.addEventListener("visibilitychange", () => {
    state.pageVisible = document.visibilityState !== "hidden";
    if (state.pageVisible) requestCoreFrame(true);
    else {
      cancelCoreFrame();
      stopAllLiveAudio();
    }
  });

  window.addEventListener("pagehide", () => {
    cancelCoreFrame();
    stopAllLiveAudio();
    disposeTorusCore();
  });

  window.addEventListener("pageshow", () => {
    state.pageVisible = typeof document === "undefined" ? true : document.visibilityState !== "hidden";
    if (!torusCore.ready && !torusCore.loading) initTorusCore();
    requestCoreFrame(true);
  });

  if (typeof IntersectionObserver !== "undefined" && els.torusHost) {
    state.visualIntersectionObserver = new IntersectionObserver((entries) => {
      const entry = entries[0];
      state.visualVisible = !entry || entry.isIntersecting;
      if (state.visualVisible) requestCoreFrame(true);
      else cancelCoreFrame();
    }, { threshold: 0.01 });
    state.visualIntersectionObserver.observe(els.torusHost);
  }

  if (typeof ResizeObserver !== "undefined" && els.torusHost) {
    state.visualResizeObserver = new ResizeObserver(() => requestCoreFrame(true));
    state.visualResizeObserver.observe(els.torusHost);
  }
}

function visualsCanRun() {
  return Boolean(state.pageVisible && state.visualVisible);
}

function visualIsActive(now = Date.now()) {
  return Boolean(
    state.animationActive
    || state.animationTailUntil > now
    || state.bootGlitchUntil > now
    || Math.abs(state.motionTiltX) > 0.01
    || Math.abs(state.motionTiltY) > 0.01
  );
}

function currentCoreFrameDelay(now = Date.now()) {
  if (state.reducedMotion) return CORE_REDUCED_FRAME_MS;
  if (visualEcoActive(now)) return visualIsActive(now) ? CORE_ECO_ACTIVE_FRAME_MS : CORE_ECO_IDLE_FRAME_MS;
  if (state.visualHighRefreshCapable) return visualIsActive(now) ? 0 : CORE_HIGH_REFRESH_IDLE_FRAME_MS;
  return visualIsActive(now) ? CORE_ACTIVE_FRAME_MS : CORE_IDLE_FRAME_MS;
}

function requestCoreFrame(immediate = false) {
  if (!visualsCanRun()) return;
  if (state.coreFrameId != null || state.coreFrameTimer != null) return;
  const delay = immediate ? 0 : currentCoreFrameDelay();
  const schedule = () => {
    state.coreFrameTimer = null;
    if (!visualsCanRun() || state.coreFrameId != null) return;
    state.coreFrameId = requestAnimationFrame(drawCore);
  };
  if (delay <= 0) schedule();
  else state.coreFrameTimer = setTimeout(schedule, delay);
}

function cancelCoreFrame() {
  if (state.coreFrameId != null) {
    cancelAnimationFrame(state.coreFrameId);
    state.coreFrameId = null;
  }
  if (state.coreFrameTimer != null) {
    clearTimeout(state.coreFrameTimer);
    state.coreFrameTimer = null;
  }
}

function visualEcoActive(now = Date.now()) {
  return state.visualEcoUntil > now;
}

function visualGlitchEnvelope(now = Date.now()) {
  return clamp((state.visualGlitchUntil - now) / VISUAL_GLITCH_MS, 0, 1);
}

function currentVisualPixelRatio(now = Date.now()) {
  const deviceRatio = window.devicePixelRatio || 1;
  return Math.min(deviceRatio, visualEcoActive(now) ? 1 : 2);
}

function monitorVisualLoad(frameMs, drawCostMs, now = Date.now()) {
  const memoryPressure = memoryPressureLevel();
  let pressure = 0;
  if (frameMs > VISUAL_STRESS_FRAME_MS) pressure += frameMs > VISUAL_STRESS_FRAME_MS * 1.8 ? 2.4 : 1.35;
  if (drawCostMs > VISUAL_STRESS_DRAW_MS) pressure += drawCostMs > VISUAL_STRESS_DRAW_MS * 1.8 ? 2.2 : 1.2;
  if (memoryPressure > 0.86) pressure += 2.6;
  else if (memoryPressure > 0.74) pressure += 1.1;

  state.visualStressScore = pressure
    ? clamp(state.visualStressScore + pressure, 0, 9)
    : clamp(state.visualStressScore - 0.42, 0, 9);

  if (state.visualStressScore >= VISUAL_STRESS_TRIGGER) {
    activateVisualEco(now);
  }
  applyVisualEcoClass(now);
}

function activateVisualEco(now = Date.now()) {
  if (now < state.visualEcoCooldownUntil && !visualEcoActive(now)) return;
  state.visualEcoUntil = Math.max(state.visualEcoUntil, now + VISUAL_ECO_MS);
  state.visualGlitchUntil = Math.max(state.visualGlitchUntil, now + VISUAL_GLITCH_MS);
  state.visualEcoCooldownUntil = now + VISUAL_ECO_MS + VISUAL_ECO_COOLDOWN_MS;
  state.visualStressScore = Math.min(state.visualStressScore, VISUAL_STRESS_TRIGGER * 0.65);
}

function applyVisualEcoClass(now = Date.now()) {
  if (typeof document === "undefined" || !document.body) return;
  document.body.dataset.visualEco = visualEcoActive(now) ? "on" : "off";
}

function memoryPressureLevel() {
  const memory = typeof performance !== "undefined" ? performance.memory : null;
  if (!memory || !memory.jsHeapSizeLimit || !memory.usedJSHeapSize) return 0;
  return clamp(memory.usedJSHeapSize / memory.jsHeapSizeLimit, 0, 1);
}

function runtimeNow() {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function detectDisplayRefresh() {
  if (typeof requestAnimationFrame !== "function") return;
  const samples = [];
  let previous = 0;
  const sample = (timestamp) => {
    if (previous) {
      const frameMs = timestamp - previous;
      if (frameMs > 0 && frameMs < 40) samples.push(frameMs);
    }
    previous = timestamp;
    if (samples.length >= HIGH_REFRESH_SAMPLE_COUNT) {
      const median = medianValue(samples);
      state.visualRefreshEstimate = Math.round(1000 / median);
      state.visualHighRefreshCapable = median > 0 && median < HIGH_REFRESH_FRAME_MS;
      requestCoreFrame(true);
      return;
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
}

function medianValue(values) {
  if (!values.length) return 1000 / 60;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function updateBendControls() {
  const showTuningRoot = isTuningRootVisible();
  document.querySelectorAll(".bend-only, .tuning-root-only").forEach((node) => {
    node.hidden = !showTuningRoot;
  });
  if (showTuningRoot) updateTuningRootReference(true);
}

function isTuningRootVisible() {
  return els.outputModeInput?.value === "bend" || els.outputModeInput?.value === "retuner";
}

function updateDubModeUi() {
  const enabled = Boolean(els.dubModeInput?.checked);
  document.body?.classList.toggle("dub-mode", enabled);
  applyDubSwingPreset(enabled);
  if (enabled) {
    if (els.styleInput) els.styleInput.value = FUGUE_STYLE_ID;
    els.statusLabel.textContent = "DUB armed";
  } else if (els.statusLabel.textContent === "DUB armed") {
    els.statusLabel.textContent = "Ready";
  }
  if (els.tempoLatticeReadout) updateSoundTimeControls();
  if (els.referenceFreqInput) updateLiveAudioFromControls();
}

function applyDubSwingPreset(enabled) {
  if (els.rationalSwingInput) els.rationalSwingInput.value = enabled ? String(DUB_RATIONAL_SWING_DEFAULT) : "0";
  if (els.irrationalSwingInput) els.irrationalSwingInput.value = enabled ? String(DUB_IRRATIONAL_SWING_DEFAULT) : "0";
}

function pedalInputs() {
  return [els.pedalBassInput, els.pedalTenorInput, els.pedalAltoInput, els.pedalSopranoInput].filter(Boolean);
}

function activeVoiceNames(count = parseInt(els.voicesInput?.value, 10) || 4) {
  return activeVoiceLayout(count);
}

function activeVoiceLayout(count = 4) {
  return [...VOICE_LAYOUTS[clamp(count, 2, 4)]];
}

function pedalInputForVoice(voice) {
  return {
    bass: els.pedalBassInput,
    tenor: els.pedalTenorInput,
    alto: els.pedalAltoInput,
    soprano: els.pedalSopranoInput,
  }[voice];
}

function applyPedalDefaults(force) {
  if (!force && state.pedalTouched) return;
  const dubDefault = Boolean(els.dubModeInput?.checked);
  VOICE_ORDER.forEach((voice) => {
    const input = pedalInputForVoice(voice);
    if (input) input.checked = dubDefault && voice === "bass";
  });
}

function updatePedalControls() {
  const active = new Set(activeVoiceNames());
  VOICE_ORDER.forEach((voice) => {
    const input = pedalInputForVoice(voice);
    if (!input) return;
    input.disabled = !active.has(voice);
    input.closest("label")?.classList.toggle("is-disabled", input.disabled);
  });
}

function updateTuningRootReference(overwrite) {
  if (els.linkRootInput && !els.linkRootInput.checked) return;
  const rootPc = noteToPc(els.rootNoteInput.value || "A");
  const rootMidi = 60 + rootPc;
  const referenceHz = currentReferenceHz();
  const referenceMidi = selectedReferenceMidi();
  const defaultHz = defaultRootHzForReference(rootMidi, referenceMidi, referenceHz);
  if (overwrite || !els.rootFreqInput.value) {
    els.rootFreqInput.value = defaultHz.toFixed(2);
  }
}

function updateTempoControls() {
  const referenceHz = currentReferenceHz();
  const minN = Math.max(1, Math.ceil((60 * referenceHz) / 220));
  const maxN = Math.max(minN, Math.floor((60 * referenceHz) / 30));
  els.tempoDivisorInput.min = String(minN);
  els.tempoDivisorInput.max = String(maxN);
  const divisor = clamp(parseInt(els.tempoDivisorInput.value, 10) || DEFAULT_TEMPO_DIVISOR, minN, maxN);
  els.tempoDivisorInput.value = String(divisor);
  const bpm = fishtailTempo(referenceHz, divisor);
  els.tempoInput.value = bpm.toFixed(4);
  els.tempoDivisorLabel.textContent = `n = ${divisor}`;
  syncProbePitchControls();
}

function currentSectionMetaForTimeline() {
  let currentTick = 0;
  return state.sections.map(normalizeSection).map((section) => {
    const meter = METERS[section.meter] || METERS["4/4"];
    const barTicks = meter.numerator * meter.pulse;
    const meta = {
      ...section,
      startTick: currentTick,
      barTicks,
      numerator: meter.numerator,
      denominator: meter.denominator,
    };
    currentTick += section.bars * barTicks;
    return meta;
  });
}

function currentTimingSettings(seed = "preview") {
  return {
    seed,
    tempo: currentTempoBpm(),
    tempoLatticeEnabled: Boolean(els.tempoLatticeInput?.checked),
    rationalSwing: percentInput(els.rationalSwingInput, 0),
    irrationalSwing: percentInput(els.irrationalSwingInput, 0),
  };
}

function previewTempoTimeline(seed = "preview") {
  return FishtailTempoLattice.buildTempoTimeline(currentSectionMetaForTimeline(), currentTimingSettings(seed), {
    ppq: PPQ,
    meters: METERS,
  });
}

function updateSoundTimeControls() {
  if (!els.tempoLatticeReadout) return;
  const timeline = previewTempoTimeline("preview");
  const swing = FishtailTempoLattice.rationalSwingAmount(percentInput(els.rationalSwingInput, 0));
  const midpoint = (1 + swing) / 2;
  const minBpm = timeline.minInstantaneousBpm.toFixed(2);
  const maxBpm = timeline.maxInstantaneousBpm.toFixed(2);
  const duration = timeline.totalSeconds;
  const meterChoice = els.metronomeMeterInput?.value || "section-1";
  const previewMeter = meterChoice === "section-1" ? `${state.sections[0]?.meter || "4/4"} from form 1` : meterChoice;
  const label = els.tempoLatticeInput?.checked ? `${minBpm}-${maxBpm} BPM` : "Straight time";
  els.tempoLatticeStatusLabel.textContent = label;
  els.tempoLatticeReadout.textContent = `${currentTempoBpm().toFixed(4)} BPM | meter ${previewMeter} | midpoint ${midpoint.toFixed(3)} | ${duration.toFixed(2)} s`;
}

function updateReferenceFrequencyFromAnchor() {
  state.referenceExactHz = null;
  clearReferenceCaptureMetadata();
  const ratio = ratioForMidiFromRoot(selectedReferenceMidi(), 69);
  const hz = clamp(state.referenceAnchorA4Hz * ratio, 20, 2000);
  els.referenceFreqInput.value = hz.toFixed(2);
}

function updateReferenceAnchorFromFrequency() {
  state.referenceExactHz = null;
  clearReferenceCaptureMetadata();
  const ratio = ratioForMidiFromRoot(selectedReferenceMidi(), 69) || 1;
  state.referenceAnchorA4Hz = currentReferenceHz() / ratio;
}

function updateReferenceFrequencyFromFineCents(fineCents) {
  state.referenceExactHz = null;
  clearReferenceCaptureMetadata();
  const baseHz = referenceBaseHzForMidi(selectedReferenceMidi());
  const hz = clamp(baseHz * (2 ** (fineCents / 1200)), 20, 2000);
  els.referenceFreqInput.value = hz.toFixed(2);
  updateReferenceAnchorFromFrequency();
}

function applyReferencePitchChange() {
  updateTempoControls();
  if (isTuningRootVisible()) updateTuningRootReference(true);
  updateSoundTimeControls();
  updateLiveAudioFromControls();
}

function currentReferenceHz() {
  const displayed = clamp(parseFloat(els.referenceFreqInput.value) || DEFAULT_REFERENCE_HZ, 20, 2000);
  if (state.referenceExactHz && Math.abs(displayed - state.referenceExactHz) < 0.01) {
    return clamp(state.referenceExactHz, 20, 2000);
  }
  return displayed;
}

function selectedReferenceMidi() {
  return noteNameToMidi(els.referenceNoteInput.value || DEFAULT_REFERENCE_NOTE);
}

function referenceBaseHzForMidi(midi) {
  return clamp(DEFAULT_A4_HZ * ratioForMidiFromRoot(midi, 69), 20, 2000);
}

function currentReferenceFineCents() {
  const baseHz = referenceBaseHzForMidi(selectedReferenceMidi()) || DEFAULT_REFERENCE_HZ;
  const cents = 1200 * Math.log2(currentReferenceHz() / baseHz);
  return clamp(Number.isFinite(cents) ? cents : 0, REFERENCE_FINE_CENTS_MIN, REFERENCE_FINE_CENTS_MAX);
}

function readProbeFineCents() {
  if (!els.probeFineInput) return currentReferenceFineCents();
  return clamp(parseFloat(els.probeFineInput.value) || 0, REFERENCE_FINE_CENTS_MIN, REFERENCE_FINE_CENTS_MAX);
}

function syncProbePitchControls() {
  if (!els.probePitchInput && !els.probeFineInput) return;
  const note = els.referenceNoteInput.value || DEFAULT_REFERENCE_NOTE;
  const noteIndex = Math.max(0, REFERENCE_NOTE_NAMES.indexOf(note));
  const fineCents = currentReferenceFineCents();
  if (els.probePitchInput) {
    els.probePitchInput.min = "0";
    els.probePitchInput.max = String(REFERENCE_NOTE_NAMES.length - 1);
    els.probePitchInput.value = String(noteIndex);
  }
  if (els.probeFineInput) {
    els.probeFineInput.min = String(REFERENCE_FINE_CENTS_MIN);
    els.probeFineInput.max = String(REFERENCE_FINE_CENTS_MAX);
    els.probeFineInput.value = fineCents.toFixed(1);
  }
  if (els.probePitchLabel) {
    els.probePitchLabel.textContent = `${note} = ${currentReferenceHz().toFixed(2)} Hz`;
  }
  if (els.probeFineLabel) {
    const sign = fineCents >= 0 ? "+" : "";
    els.probeFineLabel.textContent = `${sign}${fineCents.toFixed(1)} ct`;
  }
}

function renderSections() {
  els.sectionTable.innerHTML = "";
  state.sections.forEach((section, index) => {
    const normalized = normalizeSection(section, index);
    state.sections[index] = normalized;
    const row = document.createElement("div");
    row.className = "section-row";
    row.innerHTML = `
      <div class="row-index">${String(index + 1).padStart(2, "0")}</div>
      <label>Bars<input type="number" min="1" max="64" value="${normalized.bars}" data-field="bars"></label>
      <label>Key<select data-field="key">${KEY_NAMES.map((key) => optionHtml(key, key, key === normalized.key)).join("")}</select></label>
      <label>Mode<select data-field="mode">${Object.entries(MODES).map(([id, mode]) => optionHtml(id, mode.label, id === normalized.mode)).join("")}</select></label>
      <label>Meter<select data-field="meter">${Object.keys(METERS).map((meter) => optionHtml(meter, meter, meter === normalized.meter)).join("")}</select></label>
      <label>Cadence<select data-field="cadence">${Object.entries(CADENCES).map(([id, cadence]) => optionHtml(id, cadence.label, id === normalized.cadence)).join("")}</select></label>
      <label>Role<select data-field="role">${roleOptionsForSection(index).map(([id, label]) => optionHtml(id, label, id === normalized.role)).join("")}</select></label>
      <label>Treatment<select data-field="treatment">${treatmentOptionsForRole(normalized.role).map(([id, label]) => optionHtml(id, label, id === normalized.treatment)).join("")}</select></label>
      <button class="icon-button" type="button" data-remove="${index}" title="Remove section">-</button>
    `;
    row.querySelectorAll("[data-field]").forEach((input) => {
      input.addEventListener("change", () => {
        const field = input.dataset.field;
        state.sections[index][field] = field === "bars" ? clamp(parseInt(input.value, 10) || 1, 1, 64) : input.value;
        renderSections();
      });
    });
    row.querySelector("[data-remove]").addEventListener("click", () => {
      if (state.sections.length > 1) {
        state.sections.splice(index, 1);
        renderSections();
      }
    });
    els.sectionTable.append(row);
  });
  updateFormSafety();
  updateSoundTimeControls();
}

function updateFormSafety() {
  if (!els.formSafetyLabel) return;
  const voices = clamp(parseInt(els.voicesInput?.value, 10) || 4, 2, 4);
  const estimate = estimateComplexity(state.sections.map(normalizeSection), voices);
  const message = formComplexityMessage(estimate, els.styleInput?.value, Boolean(els.dubModeInput?.checked));
  if (!message) {
    state.formSafetyNoticeLevel = "comfortable";
    els.formSafetyLabel.hidden = true;
    els.formSafetyLabel.textContent = "";
    els.formSafetyLabel.dataset.level = estimate.level;
    return;
  }
  if (complexityRank(estimate.level) > complexityRank(state.formSafetyNoticeLevel)) {
    state.formSafetyNoticeLevel = estimate.level;
    els.formSafetyLabel.dataset.level = estimate.level;
    els.formSafetyLabel.textContent = message;
  }
  els.formSafetyLabel.hidden = false;
}

function estimateComplexity(sections, voices) {
  const normalized = sections.map(normalizeSection);
  const totalBars = normalized.reduce((sum, section) => sum + section.bars, 0);
  const totalPulses = normalized.reduce((sum, section) => {
    const meter = METERS[section.meter] || METERS["4/4"];
    return sum + section.bars * meter.numerator;
  }, 0);
  const voicePulses = totalPulses * clamp(voices, 2, 4);
  const level = complexityLevel({ sections: normalized.length, bars: totalBars, voicePulses });
  return {
    level,
    sections: normalized.length,
    bars: totalBars,
    pulses: totalPulses,
    voice_pulses: voicePulses,
    advisory: level === "comfortable" ? "comfortable" : level === "long" ? "long_form" : "expansive_long_form",
    hard_cap: false,
  };
}

function complexityLevel(estimate) {
  if (
    estimate.sections >= COMPLEXITY_EXPANSIVE.sections ||
    estimate.bars >= COMPLEXITY_EXPANSIVE.bars ||
    estimate.voicePulses >= COMPLEXITY_EXPANSIVE.voicePulses
  ) return "expansive";
  if (
    estimate.sections >= COMPLEXITY_WARN.sections ||
    estimate.bars >= COMPLEXITY_WARN.bars ||
    estimate.voicePulses >= COMPLEXITY_WARN.voicePulses
  ) return "long";
  return "comfortable";
}

function complexityRank(level) {
  return { comfortable: 0, long: 1, expansive: 2 }[level] || 0;
}

function formComplexityMessage(estimate, style, dubMode) {
  if (estimate.level === "comfortable") return "";
  const styleNote = style === FUGUE_STYLE_ID ? " Fishtail Fugue may add cadence and entry room while generating." : "";
  const dubNote = dubMode ? " DUB can add groove shaping, so give older devices a moment." : "";
  if (estimate.level === "expansive") {
    return `Expansive long-form run: ${estimate.bars} bars across ${estimate.sections} sections, about ${estimate.voice_pulses.toLocaleString()} voice-pulses. Fishtail will still try it; save project JSON and expect slower generation on smaller devices.${styleNote}${dubNote}`;
  }
  return `Long-form warning: ${estimate.bars} bars across ${estimate.sections} sections, about ${estimate.voice_pulses.toLocaleString()} voice-pulses. This is allowed, but phones and tablets may take a moment.${styleNote}${dubNote}`;
}

function roleOptionsForSection(index) {
  return index === 0 ? [["normal", SECTION_ROLES.normal]] : Object.entries(SECTION_ROLES);
}

function normalizeSection(section, index = null) {
  const requestedRole = SECTION_ROLES[section.role] ? section.role : "normal";
  const role = index === 0 ? "normal" : requestedRole;
  const defaultTreatment = role === "development" ? "gentle" : "straight";
  const allowedTreatments = treatmentOptionsForRole(role).map(([id]) => id);
  const treatment = allowedTreatments.includes(section.treatment) ? section.treatment : defaultTreatment;
  return {
    bars: clamp(parseInt(section.bars, 10) || 1, 1, 64),
    key: KEY_NAMES.includes(section.key) ? section.key : "C",
    mode: MODES[section.mode] ? section.mode : "major",
    meter: METERS[section.meter] ? section.meter : "4/4",
    cadence: CADENCES[section.cadence] ? section.cadence : "authentic",
    role,
    treatment,
  };
}

function treatmentOptionsForRole(role) {
  if (role === "development") return [["gentle", SECTION_TREATMENTS.gentle], ["dubby", SECTION_TREATMENTS.dubby]];
  if (role === "refrain") return [["straight", SECTION_TREATMENTS.straight], ["dubby", SECTION_TREATMENTS.dubby]];
  return [["straight", "Source"]];
}

function sectionTreatmentLabel(role, treatment) {
  if (role === "normal" && treatment === "straight") return "Source";
  return SECTION_TREATMENTS[treatment] || treatment;
}

function optionHtml(value, label, selected) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

async function randomiseForm(kind) {
  if (state.generating || state.randomising) return;
  state.randomising = true;
  setGenerationControlsDisabled(true);
  try {
    const seed = await makeSystemSeed();
    const rng = makeRng(seed);
    const strange = Number(els.strangenessInput.value) / 100;
    const dubMode = Boolean(els.dubModeInput?.checked);
    const sectionCount = randomFormSectionCount(rng, kind, dubMode);
    const startKey = weightedChoice(rng, KEY_NAMES.map((key) => [key, key === "C" || key === "D" || key === "G" || key === "A" ? 5 : 1]));
    let currentKey = startKey;
    let currentMode = weightedChoice(rng, [["major", 4], ["mixolydian", 3], ["dorian", 2], ["gravity_melodic_minor", 2], ["harmonic_minor", 1.8]]);
    const sections = [];

    for (let i = 0; i < sectionCount; i += 1) {
      if (i > 0) currentKey = chooseNextKey(rng, currentKey, currentMode, kind, strange);
      currentMode = chooseNextMode(rng, currentMode, kind, strange);
      const cadence = chooseCadenceForMode(rng, currentMode, dubMode, i, sectionCount);
      const roleTreatment = chooseRandomSectionRoleTreatment(rng, i, sectionCount, dubMode, kind);
      sections.push({
        bars: randomFormBars(rng, kind, dubMode),
        key: currentKey,
        mode: currentMode,
        meter: chooseMeter(rng, kind, strange),
        cadence,
        role: roleTreatment.role,
        treatment: roleTreatment.treatment,
      });
    }

    if (rng() < 0.72) {
      sections[sections.length - 1].key = startKey;
      sections[sections.length - 1].mode = sections[0].mode;
      sections[sections.length - 1].cadence = isMinorMode(sections[0].mode) ? "minor_authentic" : "authentic";
    }

    state.sections = sections;
    renderSections();
    els.seedLabel.textContent = `Dice: ${seed.slice(0, 8)}`;
    els.statusLabel.textContent = kind === "gentle" ? "D4 form" : "D20 form";
  } finally {
    state.randomising = false;
    setGenerationControlsDisabled(false);
  }
}

function randomFormSectionCount(rng, kind, dubMode) {
  if (dubMode) return kind === "gentle" ? randomInt(rng, 4, 6) : randomInt(rng, 5, 8);
  return kind === "gentle" ? randomInt(rng, 3, 5) : randomInt(rng, 4, 7);
}

function randomFormBars(rng, kind, dubMode) {
  if (dubMode) return kind === "gentle" ? randomInt(rng, 5, 11) : randomInt(rng, 4, 15);
  return kind === "gentle" ? randomInt(rng, 4, 9) : randomInt(rng, 3, 13);
}

function chooseRandomSectionRoleTreatment(rng, index, sectionCount, dubMode, kind = "gentle") {
  if (index === 0) return { role: "normal", treatment: "straight" };
  let role;
  const wide = kind === "wild";
  if (dubMode) {
    if (index === sectionCount - 1) {
      role = weightedChoice(rng, [["refrain", 5], ["development", 2], ["normal", 1.5]]);
    } else {
      role = weightedChoice(rng, [["development", 4], ["refrain", 3.2], ["normal", 1.4]]);
    }
  } else if (index === sectionCount - 1) {
    role = weightedChoice(rng, wide
      ? [["refrain", 3.6], ["development", 2.4], ["normal", 1.6]]
      : [["refrain", 3.4], ["normal", 2.4], ["development", 1.2]]);
  } else {
    role = weightedChoice(rng, wide
      ? [["development", 3.4], ["refrain", 2.7], ["normal", 1.5]]
      : [["normal", 3.0], ["refrain", 2.3], ["development", 1.7]]);
  }
  if (role === "normal") return { role, treatment: "straight" };
  const treatment = weightedChoice(rng, treatmentWeightsForRole(role, { dubMode, wide }));
  return { role, treatment };
}

function chooseCadenceForMode(rng, modeId, dubMode, sectionIndex = 0, sectionCount = 1) {
  const profile = modePersonality(modeId);
  const finalSection = sectionIndex === sectionCount - 1;
  const pairs = isMinorMode(modeId)
    ? [["minor_authentic", 5], ["modal", 2.2], ["dub_suspension", 1]]
    : [["authentic", 4], ["plagal", 2.2], ["modal", 1.2], ["dub_suspension", 2]];
  const weighted = pairs.map(([cadence, weight]) => {
    let shaped = weight * (profile.cadenceWeights?.[cadence] || 1);
    if (dubMode && cadence === "dub_suspension") shaped *= 1.15 + (profile.dubAffinity || 0) * 0.35;
    if (dubMode && cadence === "plagal") shaped *= 1.15;
    if (finalSection && (cadence === "authentic" || cadence === "minor_authentic")) shaped *= 1.35;
    if (!finalSection && cadence === "modal") shaped *= 1.15;
    return [cadence, shaped];
  });
  return weightedChoice(rng, weighted);
}

function modePersonality(modeOrId) {
  const modeId = typeof modeOrId === "string"
    ? modeOrId
    : Object.entries(MODES).find(([, mode]) => mode === modeOrId)?.[0];
  return MODE_PERSONALITIES[modeId] || MODE_PERSONALITIES.major;
}

function treatmentWeightsForRole(role, { dubMode, wide }) {
  if (dubMode) {
    return role === "refrain"
      ? [["dubby", 5], ["straight", 1.5]]
      : [["dubby", 5], ["gentle", 1.5]];
  }
  if (role === "refrain") {
    return wide
      ? [["straight", 3.2], ["dubby", 1.1]]
      : [["straight", 4.8], ["dubby", 0.35]];
  }
  return wide
    ? [["gentle", 3.4], ["dubby", 1.2]]
    : [["gentle", 5], ["dubby", 0.35]];
}

function chooseNextKey(rng, currentKey, mode, kind, strange) {
  const pc = noteToPc(currentKey);
  const weights = [
    [pcToName(pc), 1.2],
    [pcToName(pc + 7), 4.8],
    [pcToName(pc + 5), 4.5],
    [pcToName(pc + 9), mode === "major" || mode === "ionian" || mode === "mixolydian" ? 5.2 : 1.5],
    [pcToName(pc + 3), isMinorMode(mode) ? 4.2 : 1.8],
    [pcToName(pc + 2), 2.0],
    [pcToName(pc + 10), 1.2 + strange * 2.2],
    [pcToName(pc + 1), kind === "wild" ? strange * 1.4 : 0.08],
    [pcToName(pc + 6), kind === "wild" ? strange * 0.8 : 0.02],
  ];
  return weightedChoice(rng, weights);
}

function chooseNextMode(rng, currentMode, kind, strange) {
  const weights = [
    [currentMode, 2.5],
    ["major", 3.4],
    ["harmonic_minor", 2.5],
    ["ionian", 1.1],
    ["mixolydian", 2.5],
    ["dorian", 2.1],
    ["gravity_melodic_minor", 2.8],
    ["aeolian", 1.5],
    ["lydian", 0.8 + strange],
    ["phrygian", kind === "wild" ? 0.4 + strange : 0.12],
  ];
  return weightedChoice(rng, weights);
}

function isMinorMode(modeId) {
  const mode = MODES[modeId];
  return mode?.cadenceQuality === "minor";
}

function chooseMeter(rng, kind, strange) {
  const weights = [
    ["4/4", 5],
    ["3/4", 3.3],
    ["6/8", 3.2],
    ["2/2", 2.2],
    ["9/8", 0.8 + strange],
    ["5/4", kind === "wild" ? 0.5 + strange : 0.08],
    ["7/8", kind === "wild" ? 0.35 + strange * 0.8 : 0.03],
  ];
  return weightedChoice(rng, weights);
}

function playGenerateFeedback() {
  if (navigator.vibrate) navigator.vibrate([9, 24, 13]);
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) return;
  try {
    const ctx = state.audio.context || state.audioContext || new AudioContextClass();
    state.audio.context = ctx;
    state.audioContext = ctx;
    if (ctx.state === "suspended") ctx.resume();
    FishtailAudioEngine.ensureAudioState(state.audio, ctx);
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.setValueAtTime(0.0001, now);
    master.gain.exponentialRampToValueAtTime(0.16, now + 0.012);
    master.gain.exponentialRampToValueAtTime(0.0001, now + 1.08);
    master.connect(state.audio.safetyBus);

    const clickGain = ctx.createGain();
    clickGain.gain.setValueAtTime(0.0001, now);
    clickGain.gain.exponentialRampToValueAtTime(0.46, now + 0.004);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.055);
    clickGain.connect(master);

    const click = ctx.createOscillator();
    click.type = "square";
    click.frequency.setValueAtTime(520, now);
    click.frequency.exponentialRampToValueAtTime(82, now + 0.048);
    click.connect(clickGain);
    click.start(now);
    click.stop(now + 0.06);

    const whirrDuration = 0.88;
    const noiseBuffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * whirrDuration), ctx.sampleRate);
    const noise = noiseBuffer.getChannelData(0);
    for (let i = 0; i < noise.length; i += 1) {
      noise[i] = (Math.random() * 2 - 1) * (1 - i / noise.length);
    }
    const source = ctx.createBufferSource();
    source.buffer = noiseBuffer;
    const bandpass = ctx.createBiquadFilter();
    bandpass.type = "bandpass";
    bandpass.frequency.setValueAtTime(480 + Math.random() * 160, now + 0.05);
    bandpass.frequency.linearRampToValueAtTime(980 + Math.random() * 420, now + whirrDuration);
    bandpass.Q.setValueAtTime(5.2, now);
    const whirrGain = ctx.createGain();
    whirrGain.gain.setValueAtTime(0.0001, now + 0.04);
    whirrGain.gain.exponentialRampToValueAtTime(0.18, now + 0.12);
    whirrGain.gain.exponentialRampToValueAtTime(0.0001, now + whirrDuration);
    source.connect(bandpass).connect(whirrGain).connect(master);
    source.start(now + 0.035);
    source.stop(now + whirrDuration + 0.05);

    const motor = ctx.createOscillator();
    const motorGain = ctx.createGain();
    motor.type = "triangle";
    motor.frequency.setValueAtTime(72 + Math.random() * 20, now + 0.05);
    motor.frequency.linearRampToValueAtTime(118 + Math.random() * 24, now + whirrDuration);
    motorGain.gain.setValueAtTime(0.0001, now + 0.05);
    motorGain.gain.exponentialRampToValueAtTime(0.09, now + 0.16);
    motorGain.gain.exponentialRampToValueAtTime(0.0001, now + whirrDuration);
    motor.connect(motorGain).connect(master);
    motor.start(now + 0.05);
    motor.stop(now + whirrDuration + 0.04);
  } catch (error) {
    console.warn("Generate feedback sound unavailable.", error);
  }
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function generationRitualMinimumMs(piece) {
  const now = Date.now();
  const stressed = state.reducedMotion
    || visualEcoActive(now)
    || state.visualStressScore > 2.8
    || memoryPressureLevel() > 0.72;
  if (stressed) return GENERATE_MIN_MS;

  let minimum = state.visualHighRefreshCapable ? GENERATE_RITUAL_FAST_MS : GENERATE_RITUAL_COMFORT_MS;
  const complexity = piece?.manifest?.complexity;
  if (complexity?.level === "long") minimum += 350;
  if (complexity?.level === "expansive") minimum += 650;
  if (piece?.settings?.generationStyle === FUGUE_STYLE_ID) minimum += 450;
  if (piece?.settings?.dubMode) minimum += 300;
  return clamp(minimum, GENERATE_MIN_MS, GENERATE_RITUAL_MAX_MS);
}

function generationRitualStatus(piece) {
  const seed = piece?.settings?.seed || "fishtail";
  const options = piece?.settings?.dubMode ? [
    "Letting the bass breathe",
    "Weighing the echo",
    "Settling Dub Gravity",
    "Listening for the pocket",
  ] : [
    "Weighing cadences",
    "Settling the voices",
    "Letting the torus resolve",
    "Polishing the counterpoint",
  ];
  return options[Math.floor(hashUnit(seed, "generation-ritual") * options.length) % options.length];
}

function setGenerationControlsDisabled(disabled) {
  [
    els.generateButton,
    els.gentleRollButton,
    els.wildRollButton,
    els.addSectionButton,
    els.styleInput,
    els.voicesInput,
    els.tempoInput,
    els.embedTempoInput,
    els.tempoLatticeInput,
    els.rationalSwingInput,
    els.irrationalSwingInput,
    els.probePitchInput,
    els.probeFineInput,
    els.metronomeMeterInput,
    els.probeInput,
    els.probeLevelInput,
    els.metronomeInput,
    els.metronomeLevelInput,
    els.prepareProbeWavInput,
    els.prepareTickerWavInput,
    els.velocityModeInput,
    els.dubModeInput,
    els.referenceNoteInput,
    els.referenceFreqInput,
    els.tempoDivisorInput,
    els.breathingInput,
    els.densityInput,
    els.strangenessInput,
    els.resolutionInput,
    els.outputModeInput,
    els.rootNoteInput,
    els.rootFreqInput,
    els.linkRootInput,
    ...pedalInputs(),
    ...(typeof document.querySelectorAll === "function" ? document.querySelectorAll("#sectionTable input, #sectionTable select, #sectionTable button") : []),
  ].filter(Boolean).forEach((node) => {
    node.disabled = disabled;
  });
}

async function generatePiece() {
  if (state.generating) return;
  state.generating = true;
  if (state.inputReference.stream) stopLivingReferenceInput("Input ended", { restoreAudio: false });
  stopAllLiveAudio();
  playGenerateFeedback();
  state.animationPhase = 0;
  state.animationStartedAt = Date.now();
  state.animationTailUntil = 0;
  state.animationVisualLevel = 0;
  state.animationActive = true;
  requestCoreFrame(true);
  els.generateButton.classList.add("is-generating");
  setGenerationControlsDisabled(true);
  els.downloadMidiButton.disabled = true;
  els.downloadJsonButton.disabled = true;
  releaseAudioExports();
  updateAudioExportButtons();
  els.statusLabel.textContent = customEntropyEndpoint() ? "Tuning + entropy" : "Tuning";
  els.pieceLengthLabel.textContent = "Preparing";
  const startedAt = Date.now();
  try {
    const seed = await makeSystemSeed();
    const rng = makeRng(seed);
    const settings = readSettings(seed);
    await wait(650);
    els.statusLabel.textContent = "Generating";
    await wait(450);
    const piece = buildPiece(settings, rng);
    els.statusLabel.textContent = "Checking";
    await wait(650);
    state.lastPiece = piece;
    document.body.dataset.fishtailMidiBytes = String(piece.midiBytes.length);
    document.body.dataset.fishtailManifestEvents = String(piece.manifest.events.length);
    document.body.dataset.fishtailAuditIssues = String(piece.audit.issues.length);
    document.body.dataset.fishtailAuditWarnings = String(piece.audit.warnings.length);
    els.reportOutput.textContent = piece.report;
    els.seedLabel.textContent = `Seed: ${seed.slice(0, 12)}`;
    const fatalIssues = piece.audit.issues.length > 0;
    els.pieceLengthLabel.textContent = `${piece.totalBars} bars | ${piece.events.length} notes | ${piece.audit.ok ? "checked" : fatalIssues ? "MIDI blocked" : "musical notes"}`;
    els.downloadMidiButton.disabled = fatalIssues;
    els.downloadJsonButton.disabled = false;
    const ritualMinimumMs = generationRitualMinimumMs(piece);
    const ritualWaitMs = Math.max(0, ritualMinimumMs - (Date.now() - startedAt));
    document.body.dataset.fishtailRitualMs = String(Math.round(ritualMinimumMs));
    if (ritualWaitMs > 500) els.statusLabel.textContent = generationRitualStatus(piece);
    await wait(ritualWaitMs);
    if (!fatalIssues) {
      saveMidiPiece(piece);
      els.statusLabel.textContent = piece.audit.ok ? "MIDI checked + saved" : "Saved with notes";
      await prepareRequestedAudioExports(piece);
    } else {
      els.statusLabel.textContent = "MIDI blocked by checker";
    }
  } catch (error) {
    els.statusLabel.textContent = "Stopped";
    els.reportOutput.textContent = `Generation stopped:\n${error.message}`;
    console.error(error);
  } finally {
    state.animationActive = false;
    state.animationTailUntil = Date.now() + GENERATE_TAIL_MS;
    requestCoreFrame(true);
    await wait(650);
    els.generateButton.classList.remove("is-generating");
    setGenerationControlsDisabled(false);
    state.generating = false;
  }
}

function readSettings(seed) {
  const voices = clamp(parseInt(els.voicesInput.value, 10) || 4, 2, 4);
  return {
    seed,
    sections: state.sections.map(normalizeSection),
    voices,
    pedalVoices: readPedalVoices(voices),
    tempo: clamp(parseFloat(els.tempoInput.value) || 72, 30, 220),
    includeTempoMap: Boolean(els.embedTempoInput.checked),
    tempoLatticeEnabled: Boolean(els.tempoLatticeInput?.checked),
    rationalSwing: percentInput(els.rationalSwingInput, 0),
    irrationalSwing: percentInput(els.irrationalSwingInput, 0),
    metronomeMeterMode: els.metronomeMeterInput?.value || "section-1",
    probeEnabled: switchControlIsOn(els.probeInput),
    probeMuted: !switchControlIsOn(els.probeInput),
    probeLevel: percentInput(els.probeLevelInput, 0.45),
    metronomeEnabled: switchControlIsOn(els.metronomeInput),
    metronomeLevel: percentInput(els.metronomeLevelInput, 0.88),
    prepareProbeWav: Boolean(els.prepareProbeWavInput?.checked),
    prepareTickerWav: Boolean(els.prepareTickerWavInput?.checked),
    velocityProfile: els.velocityModeInput?.checked ? "auto" : "flat",
    dubMode: Boolean(els.dubModeInput.checked),
    referenceNote: els.referenceNoteInput.value || DEFAULT_REFERENCE_NOTE,
    referenceMidi: selectedReferenceMidi(),
    referenceHz: currentReferenceHz(),
    referenceAnchorA4Hz: state.referenceAnchorA4Hz,
    referenceSource: referenceSourceMetadata(),
    tempoDivisor: clamp(parseInt(els.tempoDivisorInput.value, 10) || DEFAULT_TEMPO_DIVISOR, 1, 100000),
    breathing: Number(els.breathingInput.value) / 100,
    density: Number(els.densityInput.value) / 100,
    strangeness: Number(els.strangenessInput.value) / 100,
    generationStyle: els.styleInput.value,
    resolution: els.resolutionInput.value,
    outputMode: els.outputModeInput.value,
    rootPc: noteToPc(els.rootNoteInput.value),
    rootNote: `${els.rootNoteInput.value}4`,
    rootMidi: 60 + noteToPc(els.rootNoteInput.value),
    rootFreq: clamp(parseFloat(els.rootFreqInput.value) || 432, 20, 2000),
  };
}

function referenceSourceMetadata() {
  const captured = state.inputReference?.captured;
  if (!captured) {
    return {
      mode: "manual",
      audio_recorded: false,
      audio_uploaded: false,
    };
  }
  return {
    mode: "live_input",
    captured_hz: Number(captured.captured_hz.toFixed(6)),
    reference_note: captured.reference_note,
    reference_midi: captured.reference_midi,
    deviation_before_reanchor_cents: Number(captured.deviation_before_reanchor_cents.toFixed(4)),
    implied_a4_hz: Number(captured.implied_a4_hz.toFixed(6)),
    confidence: Number(captured.confidence.toFixed(4)),
    pitch_spread_cents: Number(captured.pitch_spread_cents.toFixed(4)),
    algorithm: captured.algorithm || FishtailPitchInput.ALGORITHM,
    audio_recorded: false,
    audio_uploaded: false,
  };
}

function readPedalVoices(voiceCount) {
  const active = new Set(activeVoiceNames(voiceCount));
  return Object.fromEntries(VOICE_ORDER.map((voice) => {
    const input = pedalInputForVoice(voice);
    return [voice, Boolean(input?.checked && active.has(voice))];
  }));
}

function normalizePedalVoices(pedalVoices = {}, voiceCount = 4, dubMode = false) {
  const active = new Set(activeVoiceLayout(voiceCount));
  return Object.fromEntries(VOICE_ORDER.map((voice) => [
    voice,
    active.has(voice) && Boolean(pedalVoices[voice] ?? (dubMode && voice === "bass")),
  ]));
}

function makeRefrainState(activeVoices) {
  return {
    activeVoices,
    source: null,
    returns: 0,
    developments: 0,
    dubby: 0,
    fallbacks: 0,
    transforms: [],
  };
}

function planRefrainSection(section, sectionIndex, steps, activeVoices, refrainState, rng) {
  if (section.role === "normal") return { kind: "normal", treatment: "straight" };
  if (!refrainState.source) {
    refrainState.fallbacks += 1;
    return { kind: "fallback", treatment: section.treatment, sectionIndex };
  }
  const kind = section.role === "development" ? "development" : "return";
  const treatment = section.treatment || (kind === "development" ? "gentle" : "straight");
  const plan = {
    kind,
    treatment,
    sectionIndex,
    source: refrainState.source,
    sourceSteps: refrainState.source.steps,
    targetSteps: steps,
    voiceShift: kind === "development" ? randomInt(rng, 0, Math.max(0, activeVoices.length - 1)) : 0,
    reverse: kind === "development" && treatment === "gentle" && rng() < 0.32,
    stretch: refrainState.source.steps / Math.max(1, steps),
  };
  if (kind === "development") refrainState.developments += 1;
  else refrainState.returns += 1;
  if (treatment === "dubby") refrainState.dubby += 1;
  refrainState.transforms.push(summarizeRefrainPlan(plan));
  return plan;
}

function summarizeRefrainPlan(plan) {
  return {
    kind: plan.kind,
    treatment: plan.treatment,
    source_steps: plan.sourceSteps || null,
    target_steps: plan.targetSteps || null,
    voice_shift: plan.voiceShift || 0,
    reverse: Boolean(plan.reverse),
  };
}

function maybeCaptureRefrainSource(refrainState, section, sectionIndex, steps, meter, activeVoices, noteGrid) {
  if (refrainState.source || sectionIndex !== 0) return;
  refrainState.source = {
    sectionIndex,
    key: section.key,
    mode: section.mode,
    meter: section.meter,
    bars: section.bars,
    steps,
    numerator: meter.numerator,
    voices: activeVoices,
    grid: Object.fromEntries(activeVoices.map((voice) => [
      voice,
      noteGrid[voice].map((note) => note ? {
        midi: note.midi,
        symbolicOffset: mod(note.symbolicOffset, 12),
        literalPc: note.literalPc,
        symbolicName: note.symbolicName,
      } : null),
    ])),
  };
}

function summarizeRefrainState(refrainState) {
  return {
    has_source: Boolean(refrainState.source),
    source_section: refrainState.source ? refrainState.source.sectionIndex + 1 : null,
    source_steps: refrainState.source?.steps || 0,
    returns: refrainState.returns,
    developments: refrainState.developments,
    dubby_treatments: refrainState.dubby,
    fallbacks: refrainState.fallbacks,
    transforms: refrainState.transforms,
  };
}

function makeDubBassMemory() {
  return {
    lastCell: null,
    cells: new Map(),
    reused: 0,
    newCells: 0,
    dropBars: 0,
  };
}

function makeFallbackStats() {
  return {
    validated: 0,
    relationOnly: 0,
    verticalRelaxed: 0,
    spacingRelaxed: 0,
    noParallelOnly: 0,
    emergencyRests: 0,
    parallelBlocked: 0,
  };
}

function makePhrasePlan(section, sectionIndex, sectionCount, activeVoices, meter, settings, rng, dubBassMemory) {
  const profile = modePersonality(section.mode);
  const leadOffset = Math.floor(hashUnit(settings.seed, sectionIndex, section.key, section.mode) * activeVoices.length);
  const phraseSpan = section.bars >= 8 ? 2 : 1;
  const leadByBar = [];
  const answerByBar = [];
  const arcByBar = [];
  const bassDropBars = new Set();

  for (let bar = 0; bar < section.bars; bar += 1) {
    const phraseIndex = Math.floor(bar / phraseSpan);
    const lead = activeVoices[mod(leadOffset + phraseIndex, activeVoices.length)];
    const answer = activeVoices[mod(leadOffset + phraseIndex + 1, activeVoices.length)];
    leadByBar.push(lead);
    answerByBar.push(answer);
    arcByBar.push(bar < section.bars * 0.45 ? 1 : bar > section.bars * 0.72 ? -1 : 0);
    if (settings.dubMode && section.bars >= 4 && bar > 0 && bar < section.bars - 1 && mod(bar + sectionIndex, 4) === 3) {
      bassDropBars.add(bar);
    }
  }

  const cadenceIntensity = cadenceIntensityForSection(section, sectionIndex, sectionCount, settings, profile);
  const dubBassCell = settings.dubMode
    ? makeDubBassMemoryCell(section, sectionIndex, meter, profile, rng, dubBassMemory)
    : null;
  if (settings.dubMode) dubBassMemory.dropBars += bassDropBars.size;

  return {
    profile,
    leadByBar,
    answerByBar,
    arcByBar,
    cadenceIntensity,
    bassDropBars,
    dubBassCell,
  };
}

function cadenceIntensityForSection(section, sectionIndex, sectionCount, settings, profile) {
  let intensity = profile.cadenceIntensity ?? 0.65;
  if (sectionIndex === 0) intensity -= 0.08;
  if (sectionIndex === sectionCount - 1) intensity += 0.22;
  if (section.role === "refrain") intensity += 0.08;
  if (section.role === "development") intensity -= 0.05;
  if (section.cadence === "dub_suspension" || section.cadence === "modal") intensity -= settings.dubMode ? 0.06 : 0.02;
  if (settings.dubMode && sectionIndex !== sectionCount - 1) intensity -= 0.06;
  return clamp(intensity, 0.35, 1);
}

function summarizePhrasePlan(plan) {
  return {
    aura: plan.profile.aura,
    cadence_intensity: Number(plan.cadenceIntensity.toFixed(3)),
    lead_path: [...new Set(plan.leadByBar)],
    bass_drop_bars: [...plan.bassDropBars].map((bar) => bar + 1),
    dub_bass_cell: plan.dubBassCell ? [...plan.dubBassCell] : null,
  };
}

function phraseRoleForContext(context) {
  const plan = context.phrasePlan;
  if (!plan) return "field";
  const bar = Math.min(plan.leadByBar.length - 1, Math.max(0, context.barIndex));
  if (plan.leadByBar[bar] === context.voice) return "lead";
  if (plan.answerByBar[bar] === context.voice) return "answer";
  return "field";
}

function phraseArcDirection(context) {
  const plan = context.phrasePlan;
  if (!plan) return 0;
  return plan.arcByBar[Math.min(plan.arcByBar.length - 1, Math.max(0, context.barIndex))] || 0;
}

function makeDubBassMemoryCell(section, sectionIndex, meter, profile, rng, memory) {
  const key = `${section.mode}:${meter.numerator}/${meter.denominator}:${noteToPc(section.key)}`;
  const stored = memory.cells.get(key);
  const canReuse = stored || memory.lastCell;
  const reuse = canReuse && rng() < 0.62;
  let cell = reuse ? [...fitBassCell(stored || memory.lastCell, meter)] : defaultDubBassPattern(section, meter, profile);
  if (reuse) memory.reused += 1;
  else memory.newCells += 1;

  const color = dubBassColorOffsetForMode(section.mode);
  if (rng() < 0.42) cell[mod(sectionIndex + 1, cell.length)] = color;
  if (rng() < 0.34) cell[mod(sectionIndex + 2, cell.length)] = 7;
  if (rng() < 0.28) cell = rotateArray(cell, 1);

  memory.lastCell = [...cell];
  memory.cells.set(key, [...cell]);
  return cell;
}

function fitBassCell(cell, meter) {
  const length = dubBassPatternLength(meter);
  const source = cell?.length ? cell : [0, 0, 7, 5];
  return Array.from({ length }, (_, index) => source[index % source.length]);
}

function defaultDubBassPattern(section, meter, profile = modePersonality(section.mode)) {
  const selector = mod(noteToPc(section.key) + Math.round((profile.dubAffinity || 0) * 7), 4);
  const color = dubBassColorOffsetForMode(section.mode);
  if (meter.denominator === 8) {
    return [
      [0, 0, 7, 0, 5, 7],
      [0, 7, color, 7, 5, 7],
      [0, 0, 5, 7, color, 7],
      [0, 5, 7, 0, 7, 5],
    ][selector];
  }
  if (meter.numerator === 3) {
    return [
      [0, 0, 7],
      [0, 5, 7],
      [0, color, 7],
      [0, 7, 5],
    ][selector];
  }
  return [
    [0, 0, 7, 5],
    [0, 7, 0, color],
    [0, 5, 7, 0],
    [0, 0, color, 7],
  ][selector];
}

function dubBassPatternLength(meter) {
  if (meter.denominator === 8) return 6;
  if (meter.numerator === 3) return 3;
  return 4;
}

function dubBassColorOffsetForMode(modeId) {
  const mode = MODES[modeId] || MODES.major;
  if (mode.offsets.includes(10)) return 10;
  if (mode.offsets.includes(9)) return 9;
  if (mode.offsets.includes(6)) return 6;
  return mode.cadenceQuality === "minor" ? 3 : 5;
}

function makeSuspensionStats() {
  return {
    checks: 0,
    detected: 0,
    resolved: 0,
    overlongPrevented: 0,
    pedalHolds: 0,
    resuspendPrevented: 0,
    exceptions: 0,
  };
}

function makeHoldState() {
  return {
    midi: null,
    symbolicOffset: null,
    startedStep: 0,
    suspendedSince: null,
    lastChordKey: "",
    lastChordValid: false,
    countedSuspension: false,
  };
}

function currentChordOffsets(context) {
  const cadence = CADENCES[context.section.cadence] || CADENCES.authentic;
  const qualityThird = context.mode.cadenceQuality === "minor" ? 3 : 4;
  if (context.cadenceStage === "cadence-prep") return cadence.prep.map((offset) => mod(offset, 12));
  if (context.cadenceStage === "opening" || context.cadenceStage === "final" || context.cadenceStage === "cadence-final") {
    return [0, qualityThird, 7];
  }
  return context.mode.stable.map((offset) => mod(offset, 12));
}

function chordKeyForContext(context) {
  return currentChordOffsets(context).slice().sort((a, b) => a - b).join(".");
}

function isChordOffset(offset, context) {
  return currentChordOffsets(context).includes(mod(offset, 12));
}

function isPedalVoice(context) {
  return Boolean(context.settings.pedalVoices?.[context.voice]);
}

function isPedalOffset(offset) {
  return mod(offset, 12) === 0 || mod(offset, 12) === 7;
}

function suspensionLimitBars(voice) {
  if (voice === "soprano") return 1;
  return 2;
}

function holdBarsForCandidate(context) {
  const stateForVoice = context.holdStates?.[context.voice];
  if (!stateForVoice || stateForVoice.midi == null) return 0;
  return (context.step - stateForVoice.startedStep + 1) / context.meter.numerator;
}

function canKeepLongHold(candidate, context, stateForVoice) {
  const offset = mod(candidate.symbolicOffset, 12);
  if (isChordOffset(offset, context)) return true;
  if (isPedalVoice(context) && isPedalOffset(offset)) {
    context.suspensionStats.pedalHolds += 1;
    return true;
  }
  const suspendedSince = stateForVoice.suspendedSince ?? context.step;
  const suspensionBars = (context.step - suspendedSince + 1) / context.meter.numerator;
  const limit = suspensionLimitBars(context.voice);
  if (suspensionBars <= limit) return true;
  if (context.rng() < 0.08) {
    context.suspensionStats.exceptions += 1;
    return true;
  }
  context.suspensionStats.overlongPrevented += 1;
  return false;
}

function nearestStepChordToneExists(previousMidi, context) {
  const [low, high] = VOICE_RANGES[context.voice];
  return [-2, -1, 1, 2].some((move) => {
    const midi = previousMidi + move;
    if (midi < low || midi > high) return false;
    const offset = mod((midi % 12) - noteToPc(context.section.key), 12);
    return isChordOffset(offset, context);
  });
}

function isGoodSuspensionResolution(candidate, context, previousMidi) {
  return Math.abs(candidate.midi - previousMidi) <= 2 && isChordOffset(candidate.symbolicOffset, context);
}

function updateSuspensionState(result, context) {
  const stateForVoice = context.holdStates[context.voice];
  if (!stateForVoice) return;
  if (!result) {
    if (stateForVoice.suspendedSince != null) {
      context.resolvedBlocks[context.voice] = { midi: stateForVoice.midi, untilStep: context.step + context.meter.numerator };
    }
    context.holdStates[context.voice] = makeHoldState();
    return;
  }

  const offset = mod(result.symbolicOffset, 12);
  const chordValid = isChordOffset(offset, context);
  const chordKey = chordKeyForContext(context);
  const samePitch = stateForVoice.midi === result.midi;
  context.suspensionStats.checks += 1;

  if (!samePitch) {
    if (stateForVoice.suspendedSince != null && isGoodSuspensionResolution(result, context, stateForVoice.midi)) {
      context.suspensionStats.resolved += 1;
      context.resolvedBlocks[context.voice] = { midi: stateForVoice.midi, untilStep: context.step + context.meter.numerator };
    }
    context.holdStates[context.voice] = {
      midi: result.midi,
      symbolicOffset: offset,
      startedStep: context.step,
      suspendedSince: null,
      lastChordKey: chordKey,
      lastChordValid: chordValid,
      countedSuspension: false,
    };
    return;
  }

  if (stateForVoice.lastChordKey !== chordKey && stateForVoice.lastChordValid && !chordValid) {
    stateForVoice.suspendedSince = stateForVoice.suspendedSince ?? context.step;
    if (!stateForVoice.countedSuspension) {
      context.suspensionStats.detected += 1;
      stateForVoice.countedSuspension = true;
    }
  }
  stateForVoice.symbolicOffset = offset;
  stateForVoice.lastChordKey = chordKey;
  stateForVoice.lastChordValid = chordValid;
}

function refrainSourceNote(context) {
  const source = context.refrainPlan?.kind && context.refrainPlan.kind !== "normal" && context.refrainPlan.kind !== "capture" && context.refrainPlan.kind !== "fallback"
    ? context.refrainPlan.source || null
    : null;
  return source ? mappedRefrainNote(context, source) : null;
}

function mappedRefrainNote(context, source = context.refrainPlan?.source) {
  if (!source) return null;
  const voice = mappedRefrainVoice(context, source);
  const grid = source.grid[voice] || [];
  if (!grid.length) return null;
  const mappedStep = mappedRefrainStep(context, source);
  return grid[mappedStep] || null;
}

function mappedRefrainVoice(context, source = context.refrainPlan?.source) {
  const voices = source?.voices || context.activeVoices;
  const index = Math.max(0, voices.indexOf(context.voice));
  const shifted = mod(index + (context.refrainPlan?.voiceShift || 0), voices.length || 1);
  return voices[shifted] || context.voice;
}

function mappedRefrainStep(context, source = context.refrainPlan?.source) {
  if (!source?.steps) return 0;
  const ratio = context.step / Math.max(1, context.steps);
  let sourceStep = Math.floor(ratio * source.steps);
  if (context.refrainPlan?.reverse) sourceStep = source.steps - 1 - sourceStep;
  return clamp(sourceStep, 0, source.steps - 1);
}

function isFugueStyle(settingsOrStyle) {
  const style = typeof settingsOrStyle === "string" ? settingsOrStyle : settingsOrStyle?.generationStyle;
  return style === FUGUE_STYLE_ID;
}

function repairFugueSections(sections, activeVoices, subjectLength, settings) {
  const originalSectionCount = sections.length;
  const repaired = sections.map((section) => ({ ...normalizeSection(section) }));
  const notes = [];
  const base = repaired[0] || normalizeSection(DEFAULT_SECTIONS[0]);

  if (!repaired.length) {
    repaired.push(base);
    notes.push("Added an exposition section because the form was empty.");
  }
  while (repaired.length < 3) {
    if (repaired.length === 1) {
      repaired.push(makeAutoMiddleFugueSection(base));
      notes.push("Added a middle episode section so the fugue has room to develop.");
    } else {
      repaired.push(makeAutoFinalFugueSection(base));
      notes.push("Added a final return section so the fugue can cadence clearly.");
    }
  }

  repaired.forEach((section, index) => {
    const meter = METERS[section.meter] || METERS["4/4"];
    const minBars = fugueMinimumBars(index, repaired.length, meter, activeVoices.length, subjectLength, settings.dubMode);
    if (section.bars < minBars) {
      notes.push(`Expanded section ${index + 1} from ${section.bars} to ${minBars} bars for subject entries and cadence room.`);
      section.bars = minBars;
    }
  });

  return {
    sections: repaired,
    summary: {
      original_sections: originalSectionCount,
      final_sections: repaired.length,
      auto_repaired: notes.length > 0,
      notes,
    },
  };
}

function makeAutoMiddleFugueSection(base) {
  const minor = isMinorMode(base.mode);
  const mode = minor ? "major" : "gravity_melodic_minor";
  return {
    bars: 4,
    key: pcToName(noteToPc(base.key) + (minor ? 3 : 9)),
    mode,
    meter: base.meter,
    cadence: isMinorMode(mode) ? "minor_authentic" : "authentic",
    role: "development",
    treatment: "gentle",
  };
}

function makeAutoFinalFugueSection(base) {
  return {
    bars: 4,
    key: base.key,
    mode: base.mode,
    meter: base.meter,
    cadence: isMinorMode(base.mode) ? "minor_authentic" : "authentic",
    role: "refrain",
    treatment: "straight",
  };
}

function fugueMinimumBars(sectionIndex, sectionCount, meter, voiceCount, subjectLength, dubMode) {
  const entryGap = fugueEntryGapSteps(meter, dubMode);
  if (sectionIndex === 0) {
    return Math.max(3, Math.ceil((subjectLength + (voiceCount - 1) * entryGap) / meter.numerator) + 1);
  }
  if (sectionIndex === sectionCount - 1) {
    return Math.max(4, Math.ceil((subjectLength + meter.numerator * 2) / meter.numerator));
  }
  return Math.max(3, Math.ceil(subjectLength / meter.numerator) + 1);
}

function fugueEntryGapSteps(meter, dubMode) {
  return Math.max(2, Math.floor(meter.numerator * (dubMode ? 0.75 : 1)));
}

function makeFugueMaterial(settings, activeVoices, subject) {
  const firstMode = MODES[settings.sections[0]?.mode] || MODES.major;
  const answer = subject.map((offset) => tonalAnswerOffset(offset, firstMode));
  const countersubject = makeCounterSubject(subject, firstMode);
  return {
    gravity_mode: settings.dubMode ? "dub" : "formal",
    voice_order: fugueVoiceOrder(activeVoices),
    subject: subject.map((offset) => mod(offset, 12)),
    answer,
    countersubject,
    episode_fragments: makeEpisodeFragments(subject, countersubject),
  };
}

function tonalAnswerOffset(offset, mode) {
  const pc = mod(offset, 12);
  if (pc === 0) return 7;
  if (pc === 7) return 0;
  if (pc === 5) return 2;
  if (pc === 11 && mode.cadenceQuality === "major") return 6;
  return mod(pc + 7, 12);
}

function makeCounterSubject(subject, mode) {
  const stable = mode.stable || [0, 4, 7];
  return subject.map((offset, index) => {
    const inverted = mod(12 - mod(offset, 12), 12);
    if (index === 0) return stable[0] || 0;
    return mod(inverted + (index % 2 ? 7 : 0), 12);
  });
}

function makeEpisodeFragments(subject, countersubject) {
  const head = subject.slice(0, Math.min(4, subject.length));
  const tail = subject.slice(Math.max(0, subject.length - 4));
  const answerish = subject.slice(0, Math.min(3, subject.length)).map((offset) => mod(offset + 7, 12));
  const counter = countersubject.slice(0, Math.min(4, countersubject.length));
  return [head, tail, answerish, counter].filter((fragment) => fragment.length);
}

function fugueVoiceOrder(activeVoices) {
  return ["soprano", "alto", "tenor", "bass"].filter((voice) => activeVoices.includes(voice));
}

function rotateArray(items, amount) {
  if (!items.length) return [];
  return items.map((_, index) => items[mod(index + amount, items.length)]);
}

function planFugueForm(settings, activeVoices, material, repairSummary) {
  const sections = settings.sections.map((section, index) => {
    const meter = METERS[section.meter] || METERS["4/4"];
    const role = fugueRoleForSection(section, index, settings.sections.length);
    const entries = planFugueSectionEntries({ section, sectionIndex: index, sectionCount: settings.sections.length, role, meter, activeVoices, material, settings });
    return {
      section_index: index + 1,
      role,
      key: section.key,
      mode: section.mode,
      meter: section.meter,
      bars: section.bars,
      treatment: section.treatment,
      entries,
    };
  });
  const expositionEntries = sections[0]?.entries || [];
  return {
    enabled: true,
    formal_gravity_mode: settings.dubMode ? "dub" : "formal",
    repaired_form: repairSummary,
    subject: material.subject,
    answer: material.answer,
    countersubject: material.countersubject,
    episode_fragments: material.episode_fragments,
    voice_order: material.voice_order,
    exposition_entries: expositionEntries,
    sections,
    middle_entries: sections.filter((section) => section.role === "middle_entry").reduce((sum, section) => sum + section.entries.length, 0),
    episodes: sections.filter((section) => section.role === "episode").length,
    final_returns: sections.filter((section) => section.role === "final_return").reduce((sum, section) => sum + section.entries.length, 0),
  };
}

function summarizeFugueSectionPlan(plan) {
  if (!plan) return null;
  return {
    role: plan.role,
    entries: plan.entries.map((entry) => ({ ...entry })),
  };
}

function fugueRoleForSection(section, index, sectionCount) {
  if (index === 0) return "exposition";
  if (index === sectionCount - 1) return "final_return";
  if (section.role === "refrain") return "middle_entry";
  if (section.role === "development") return "episode";
  return index % 2 === 1 ? "episode" : "middle_entry";
}

function planFugueSectionEntries({ sectionIndex, sectionCount, role, meter, activeVoices, material, settings }) {
  const order = material.voice_order.length ? material.voice_order : fugueVoiceOrder(activeVoices);
  const entryGap = fugueEntryGapSteps(meter, settings.dubMode);
  const steps = settings.sections[sectionIndex].bars * meter.numerator;
  const cadenceReserve = role === "final_return" ? meter.numerator * 2 : 0;
  const maxStart = Math.max(0, steps - material.subject.length - cadenceReserve);
  const makeEntry = (voice, orderIndex, startStep, kind, purpose) => ({
    voice,
    start_step: clamp(startStep, 0, maxStart),
    kind,
    purpose,
  });

  if (role === "exposition") {
    return order.map((voice, index) => makeEntry(voice, index, index * entryGap, index % 2 === 0 ? "subject" : "answer", "exposition"));
  }

  if (role === "middle_entry") {
    const rotated = rotateArray(order, sectionIndex);
    const entryCount = Math.min(rotated.length, settings.dubMode ? 1 : 2);
    return rotated.slice(0, entryCount).map((voice, index) => makeEntry(
      voice,
      index,
      index * entryGap * 2,
      (sectionIndex + index) % 2 === 0 ? "subject" : "answer",
      "middle_entry",
    ));
  }

  if (role === "final_return") {
    const bass = activeVoices.includes("bass") ? "bass" : order[order.length - 1];
    const top = order[0] || bass;
    const entries = [makeEntry(bass, 0, 0, "subject", "final_return")];
    if (top && top !== bass && sectionCount > 1) entries.push(makeEntry(top, 1, entryGap, "answer", "final_closer"));
    return entries;
  }

  return [];
}

function buildPiece(settings, rng) {
  settings.sections = settings.sections.map(normalizeSection);
  settings.pedalVoices = normalizePedalVoices(settings.pedalVoices, settings.voices, settings.dubMode);
  const activeVoices = activeVoiceLayout(settings.voices);
  const subject = makeSubject(settings, rng);
  let fugueSummary = null;
  let fugueMaterial = null;
  if (isFugueStyle(settings)) {
    const repaired = repairFugueSections(settings.sections, activeVoices, subject.length, settings);
    settings.sections = repaired.sections;
    fugueMaterial = makeFugueMaterial(settings, activeVoices, subject);
    fugueSummary = planFugueForm(settings, activeVoices, fugueMaterial, repaired.summary);
  }
  const tracks = Object.fromEntries(activeVoices.map((voice, index) => [voice, { name: voice, channel: index, events: [] }]));
  const sectionMeta = [];
  const noteGrid = Object.fromEntries(activeVoices.map((voice) => [voice, []]));
  const debts = Object.fromEntries(activeVoices.map((voice) => [voice, null]));
  const reports = [];
  const refrainState = makeRefrainState(activeVoices);
  const suspensionStats = makeSuspensionStats();
  const fallbackStats = makeFallbackStats();
  const dubBassMemory = makeDubBassMemory();
  let currentTick = 0;
  let totalBars = 0;
  let avoidedParallels = 0;
  let resolvedTendencies = 0;
  let rests = 0;

  settings.sections.forEach((section, sectionIndex) => {
    const mode = MODES[section.mode];
    const meter = METERS[section.meter];
    const barTicks = meter.numerator * meter.pulse;
    const steps = section.bars * meter.numerator;
    const sectionStartTick = currentTick;
    const phrasePlan = makePhrasePlan(section, sectionIndex, settings.sections.length, activeVoices, meter, settings, rng, dubBassMemory);
    const refrainPlan = isFugueStyle(settings)
      ? { kind: "normal", treatment: section.treatment || "straight" }
      : planRefrainSection(section, sectionIndex, steps, activeVoices, refrainState, rng);
    const fugueSectionPlan = fugueSummary?.sections?.[sectionIndex] || null;
    sectionMeta.push({ ...section, startTick: currentTick, barTicks, numerator: meter.numerator, denominator: meter.denominator, refrainPlan: summarizeRefrainPlan(refrainPlan), fuguePlan: summarizeFugueSectionPlan(fugueSectionPlan), phrasePlan: summarizePhrasePlan(phrasePlan) });
    reports.push(`${sectionIndex + 1}. ${section.bars} bars in ${section.key} ${mode.label}, ${section.meter}, ${CADENCES[section.cadence].label}, ${SECTION_ROLES[section.role]}${section.role === "normal" ? "" : `/${sectionTreatmentLabel(section.role, section.treatment)}`}`);

    const entries = planEntries(activeVoices, steps, meter, rng, settings);
    const lastPitches = Object.fromEntries(activeVoices.map((voice) => [voice, null]));
    const lastLeaps = Object.fromEntries(activeVoices.map((voice) => [voice, 0]));
    const lastOffsets = Object.fromEntries(activeVoices.map((voice) => [voice, null]));
    const holdStates = Object.fromEntries(activeVoices.map((voice) => [voice, makeHoldState()]));
    const resolvedBlocks = Object.fromEntries(activeVoices.map((voice) => [voice, null]));
    activeVoices.forEach((voice) => {
      debts[voice] = null;
    });

    for (let step = 0; step < steps; step += 1) {
      const pulseInBar = step % meter.numerator;
      const barIndex = Math.floor(step / meter.numerator);
      const strong = pulseInBar === 0 || meter.accents.includes(pulseInBar);
      const cadenceStage = getCadenceStage(step, steps, meter.numerator);
      const chosen = {};
      const previousPitches = { ...lastPitches };

      activeVoices.forEach((voice, voiceIndex) => {
        const lowerVoice = voiceIndex > 0 ? activeVoices[voiceIndex - 1] : null;
        const upperVoice = voiceIndex < activeVoices.length - 1 ? activeVoices[voiceIndex + 1] : null;
        const context = {
          section,
          mode,
          meter,
          step,
          steps,
          barIndex,
          sectionIndex,
          strong,
          cadenceStage,
          voice,
          voiceIndex,
          activeVoices,
          chosen,
          previousPitches,
          lowerVoice,
          upperVoice,
          lastPitches,
          lastLeaps,
          lastOffsets,
          holdStates,
          resolvedBlocks,
          debts,
          subject,
          entries,
          refrainPlan,
          fugueSummary,
          fugueMaterial,
          fugueSectionPlan,
          phrasePlan,
          suspensionStats,
          fallbackStats,
          settings,
          rng,
        };
        const result = chooseVoiceEvent(context);
        if (result.rest) {
          chosen[voice] = null;
          noteGrid[voice].push(null);
          updateSuspensionState(null, context);
          rests += 1;
          avoidedParallels += result.parallelRejects || 0;
          return;
        }
        chosen[voice] = result;
        noteGrid[voice].push(result);
        updateSuspensionState(result, context);
        lastLeaps[voice] = lastPitches[voice] == null ? 0 : result.midi - lastPitches[voice];
        lastPitches[voice] = result.midi;
        lastOffsets[voice] = mod(result.symbolicOffset, 12);
        if (result.resolvedDebt) resolvedTendencies += 1;
        avoidedParallels += result.parallelRejects;
      });

      currentTick += meter.pulse;
    }

    if (!isFugueStyle(settings)) maybeCaptureRefrainSource(refrainState, section, sectionIndex, steps, meter, activeVoices, noteGrid);
    activeVoices.forEach((voice) => {
      const events = gridToEvents(noteGrid[voice], voice, sectionStartTick, meter.pulse, settings, section, phrasePlan);
      tracks[voice].events.push(...events);
      noteGrid[voice] = [];
    });

    totalBars += section.bars;
  });

  const velocitySummary = applyGravityVelocity(tracks, sectionMeta, settings);
  const events = activeVoices.flatMap((voice) => tracks[voice].events.map((event) => ({ ...event, voice })));
  const complexity = estimateComplexity(sectionMeta, settings.voices);
  const tempoTimeline = FishtailTempoLattice.buildTempoTimeline(sectionMeta, settings, { ppq: PPQ, meters: METERS });
  const serializationIssues = validateMidiSerializationInput(tracks, settings);
  let midiBytes = new Uint8Array();
  if (!serializationIssues.length) {
    try {
      midiBytes = writeMidiFile({ tracks, sectionMeta, settings, totalTicks: currentTick, tempoTimeline });
    } catch (error) {
      serializationIssues.push(`MIDI serialization failed: ${error.message}`);
    }
  }
  const audit = checkGeneratedPiece(settings, sectionMeta, events, midiBytes, currentTick, serializationIssues);
  const refrainSummary = summarizeRefrainState(refrainState);
  const dubGrooveSummary = summarizeDubGroove(settings, events, dubBassMemory);
  const sweetness = checkSweetness(settings, sectionMeta, events, { avoidedParallels, resolvedTendencies, rests, suspensionStats, fallbackStats, refrainSummary, fugueSummary, dubGrooveSummary, velocitySummary, complexity, tempoTimeline }, audit);
  const manifest = makeManifest(settings, sectionMeta, events, subject, { avoidedParallels, resolvedTendencies, rests, suspensionStats, fallbackStats, refrainSummary, fugueSummary, dubGrooveSummary, velocitySummary, complexity, tempoTimeline, sweetness }, audit);
  const report = makeReport(settings, sectionMeta, subject, events, { avoidedParallels, resolvedTendencies, rests, reports, suspensionStats, fallbackStats, refrainSummary, fugueSummary, dubGrooveSummary, velocitySummary, complexity, tempoTimeline, sweetness }, audit);

  return {
    settings,
    midiBytes,
    manifest,
    report,
    audit,
    events,
    sectionMeta,
    tempoTimeline,
    totalBars,
  };
}

function makeSubject(settings, rng) {
  const section = settings.sections[0];
  const mode = MODES[section.mode];
  const middle = mode.cadenceQuality === "minor" ? 3 : 4;
  const counterpointOptions = [
    [0, 2, middle, 5, 7, 5, middle, 2, 0],
    [0, 7, 5, middle, 2, middle, 5, 7, 0],
    [0, 2, 5, middle, 7, 9, 7, 5, middle, 2, 0],
    [0, middle, 5, 7, 10, 9, 7, 5, middle, 0],
  ];
  const inventionOptions = [
    [0, 2, middle, 5, 2, 0],
    [0, middle, 2, 5, 7, 5],
    [0, 7, 5, middle, 2, 0],
    [0, 2, 5, 7, 9, 7, 5],
  ];
  const inventionSource = settings.generationStyle === "invention" || isFugueStyle(settings);
  const options = inventionSource ? inventionOptions : counterpointOptions;
  const base = weightedChoice(rng, options.map((item) => [item, 1]));
  const shaped = base.filter((offset) => mode.offsets.includes(mod(offset, 12)) || offset === 0 || offset === 12);
  const minimum = inventionSource ? 5 : 7;
  return shaped.length >= minimum ? shaped : [0, 2, middle, 5, 7, 5, middle, 2, 0];
}

function planEntries(activeVoices, steps, meter, rng, settings) {
  const weights = settings.generationStyle === "invention" || isFugueStyle(settings)
    ? [[0.5, 2], [1, 4], [1.5, 2]]
    : [[1, 3], [1.5, 2], [2, 2]];
  const gap = Math.max(2, Math.floor(meter.numerator * weightedChoice(rng, weights)));
  return Object.fromEntries(activeVoices.map((voice, index) => [voice, index * gap]));
}

function getCadenceStage(step, steps, pulsesPerBar) {
  if (step === 0) return "opening";
  if (step === steps - 1) return "final";
  if (step >= steps - pulsesPerBar * 2 && step % pulsesPerBar === 0) return "cadence-prep";
  if (step >= steps - Math.ceil(pulsesPerBar * 0.5)) return "cadence-final";
  return null;
}

function chooseVoiceEvent(context) {
  const { settings, rng, strong, cadenceStage, voice, mode, section, step, entries, subject } = context;
  const debt = context.debts[voice];
  const canRest = !cadenceStage && !debt && step > 0 && !fugueNeedsVoice(context);
  if (canRest && shouldRestForRefrain(context)) return { rest: true };
  const profile = modePersonality(section.mode);
  const baseRestChance = canRest ? clamp(0.05 + settings.breathing * 0.22 - settings.density * 0.08 + (profile.restBias || 0), 0, 0.86) : 0;
  const restChance = phraseRestChance(context, fugueRestChance(context, dubRestChance(context, baseRestChance)));
  if (rng() < restChance && shouldVoiceBreathe(context)) return { rest: true };

  const offsets = cadenceStage
    ? cadenceOffsets(context)
    : motifOrFieldOffsets(context);
  const candidates = [];
  let parallelRejects = 0;

  for (const offset of shuffledWeightedOffsets(offsets, mode, strong, settings, rng)) {
    const resolved = resolvePitch(offset, context);
    const validation = validateCandidate(resolved, context);
    parallelRejects += validation.parallelReject ? 1 : 0;
    if (validation.ok) candidates.push({ ...resolved, score: scoreCandidate(resolved, context), resolvedDebt: validation.resolvedDebt });
    if (candidates.length > 8) break;
  }

  if (!candidates.length && canRest) return { rest: true, parallelRejects };
  if (!candidates.length) {
    return chooseFallbackVoiceEvent(context, parallelRejects, canRest);
  }

  candidates.sort((a, b) => b.score - a.score);
  const chosen = weightedChoice(rng, candidates.slice(0, 5).map((candidate, index) => [candidate, 6 - index]));
  return commitVoiceChoice({ ...chosen, parallelRejects }, context);
}

function chooseFallbackVoiceEvent(context, initialParallelRejects = 0, canRest = false) {
  const fallbacks = fallbackCandidatesForContext(context);
  let parallelRejects = initialParallelRejects;

  for (const fallback of fallbacks) {
    const validation = validateCandidate(fallback, context);
    parallelRejects += validation.parallelReject ? 1 : 0;
    if (validation.ok) {
      noteFallbackStat(context, "validated");
      return commitVoiceChoice({ ...fallback, resolvedDebt: validation.resolvedDebt, parallelRejects, fallbackKind: "validated" }, context);
    }
  }

  if (canRest) return fallbackRest(context, parallelRejects);

  for (const fallback of fallbacks) {
    const relation = validateCandidateRelations(fallback, context, { allowDubBend: true });
    if (relation.parallelReject) parallelRejects += 1;
    if (relation.ok) {
      noteFallbackStat(context, "relationOnly");
      return commitVoiceChoice({ ...fallback, resolvedDebt: false, parallelRejects, fallbackKind: "relation-only" }, context);
    }
  }

  for (const fallback of fallbacks) {
    const relation = validateCandidateRelations(fallback, context, { allowDubBend: true, allowVerticalDissonance: true });
    if (relation.parallelReject) parallelRejects += 1;
    if (relation.ok) {
      noteFallbackStat(context, "verticalRelaxed");
      return commitVoiceChoice({ ...fallback, resolvedDebt: false, parallelRejects, fallbackKind: "vertical-relaxed" }, context);
    }
  }

  for (const fallback of fallbacks) {
    const relation = validateCandidateRelations(fallback, context, { allowDubBend: true, allowWideSpacing: true });
    if (relation.parallelReject) parallelRejects += 1;
    if (relation.ok) {
      noteFallbackStat(context, "spacingRelaxed");
      return commitVoiceChoice({ ...fallback, resolvedDebt: false, parallelRejects, fallbackKind: "spacing-relaxed" }, context);
    }
  }

  for (const fallback of fallbacks) {
    const parallel = parallelPerfectAgainstChosen(fallback, context, { allowDubBend: true });
    if (parallel?.blocked) {
      parallelRejects += 1;
      noteFallbackStat(context, "parallelBlocked");
      continue;
    }
    noteFallbackStat(context, "noParallelOnly");
    return commitVoiceChoice({ ...fallback, resolvedDebt: false, parallelRejects, fallbackKind: "no-parallel-only" }, context);
  }

  return fallbackRest(context, parallelRejects);
}

function fallbackCandidatesForContext(context) {
  const seen = new Set();
  const candidates = [];
  fallbackOffsetsForContext(context).forEach((offset) => {
    resolvePitchOptions(offset, context, 6).forEach((candidate) => {
      const key = `${candidate.midi}:${mod(candidate.symbolicOffset, 12)}`;
      if (seen.has(key)) return;
      seen.add(key);
      candidates.push(candidate);
    });
  });
  return candidates;
}

function fallbackOffsetsForContext(context) {
  const offsets = [];
  const add = (items) => {
    items.filter((item) => Number.isFinite(item)).forEach((item) => offsets.push(mod(item, 12)));
  };
  add([context.lastOffsets?.[context.voice]]);
  add(context.mode.stable || []);
  if (context.cadenceStage) add(cadenceOffsets(context));
  add([0, 7, 5]);
  add(context.mode.offsets || []);
  if (context.mode.tendencies) add(Object.keys(context.mode.tendencies).map(Number));
  return [...new Set(offsets)];
}

function fallbackRest(context, parallelRejects) {
  noteFallbackStat(context, "emergencyRests");
  return { rest: true, parallelRejects, fallbackKind: "emergency-rest" };
}

function noteFallbackStat(context, field) {
  if (context.fallbackStats && field in context.fallbackStats) context.fallbackStats[field] += 1;
}

function shouldVoiceBreathe(context) {
  const { voice, step, meter, rng, settings } = context;
  if (fugueNeedsVoice(context)) return false;
  const phraseEdge = step % meter.numerator === meter.numerator - 1;
  if (settings.dubMode) {
    if (voice === "bass") return isDubBassDrop(context) || (phraseEdge && rng() < 0.2 + settings.breathing * 0.42);
    if (context.strong && !context.cadenceStage) return true;
    if (isDubSkankVoice(voice) && isDubOffbeat(context)) return rng() < 0.38;
  }
  const voiceBias = voice === "soprano" || voice === "bass" ? 1.25 : 0.88;
  return phraseEdge || rng() < settings.breathing * voiceBias;
}

function phraseRestChance(context, baseRestChance) {
  if (!baseRestChance || fugueNeedsVoice(context)) return baseRestChance;
  const role = phraseRoleForContext(context);
  if (role === "lead") return baseRestChance * 0.45;
  if (role === "answer") return baseRestChance * 0.72;
  return clamp(baseRestChance + context.settings.breathing * 0.055, 0, 0.88);
}

function fugueRestChance(context, baseRestChance) {
  if (!isFugueStyle(context.settings)) return baseRestChance;
  const plan = currentFugueSectionPlan(context);
  if (!plan) return baseRestChance;
  if (plan.role === "exposition" || plan.role === "middle_entry" || plan.role === "final_return") {
    return context.settings.dubMode ? baseRestChance * 0.75 : baseRestChance * 0.42;
  }
  return context.settings.dubMode ? baseRestChance * 1.08 : baseRestChance * 0.72;
}

function dubRestChance(context, baseRestChance) {
  const { settings, voice, strong, cadenceStage } = context;
  if (!settings.dubMode || cadenceStage) return baseRestChance;
  if (voice === "bass") {
    if (isDubBassDrop(context)) return clamp(0.34 + settings.breathing * 0.34 - settings.density * 0.12, 0.18, 0.82);
    return strong ? baseRestChance * 0.12 : clamp(baseRestChance * 0.55 + 0.015, 0, 0.24);
  }
  if (isDubSkankVoice(voice)) {
    return strong ? clamp(baseRestChance + 0.32, 0, 0.84) : clamp(baseRestChance * 0.32, 0, 0.42);
  }
  if (voice === "soprano") return strong ? clamp(baseRestChance + 0.2, 0, 0.78) : clamp(baseRestChance + 0.08, 0, 0.72);
  return clamp(baseRestChance + 0.08, 0, 0.72);
}

function isDubSkankVoice(voice) {
  return voice === "tenor" || voice === "alto";
}

function isDubOffbeat(context) {
  return !context.strong && context.step % context.meter.numerator > 0;
}

function isDubBassDrop(context) {
  return Boolean(
    context.settings.dubMode
    && context.voice === "bass"
    && !context.cadenceStage
    && context.phrasePlan?.bassDropBars?.has(context.barIndex)
  );
}

function cadenceOffsets(context) {
  const { cadenceStage, section, mode, voiceIndex, activeVoices } = context;
  const cadence = CADENCES[section.cadence] || CADENCES.authentic;
  const qualityThird = mode.cadenceQuality === "minor" ? 3 : 4;
  const profile = modePersonality(section.mode);
  const intensity = context.phrasePlan?.cadenceIntensity ?? profile.cadenceIntensity ?? 0.65;
  let chord;
  if (cadenceStage === "opening" || cadenceStage === "final" || cadenceStage === "cadence-final") {
    chord = intensity > 0.78 ? [0, 7, qualityThird, 12, 0, 7] : [0, 7, qualityThird, 12, ...profile.colorOffsets.slice(0, 1)];
  } else {
    chord = intensity > 0.72 ? [...cadence.prep, 7, 2] : [...cadence.prep, ...profile.colorOffsets.slice(0, 2), ...mode.stable];
  }
  const index = mapVoiceToChordIndex(voiceIndex, activeVoices.length);
  return [chord[index % chord.length], chord[(index + 1) % chord.length], chord[0]];
}

function mapVoiceToChordIndex(voiceIndex, voiceCount) {
  if (voiceCount === 2) return voiceIndex === 0 ? 0 : 2;
  if (voiceCount === 3) return [0, 1, 2][voiceIndex];
  return [0, 1, 2, 3][voiceIndex];
}

function currentFugueSectionPlan(context) {
  if (!isFugueStyle(context.settings)) return null;
  return context.fugueSectionPlan || context.fugueSummary?.sections?.[context.sectionIndex] || null;
}

function fugueSequenceForEntry(context, entry) {
  const material = context.fugueMaterial || context.fugueSummary || {};
  return entry.kind === "answer" ? material.answer || [] : material.subject || [];
}

function currentFugueEntry(context, voice = context.voice) {
  const plan = currentFugueSectionPlan(context);
  if (!plan?.entries?.length) return null;
  return plan.entries.find((entry) => {
    if (entry.voice !== voice) return false;
    const sequence = fugueSequenceForEntry(context, entry);
    return context.step >= entry.start_step && context.step < entry.start_step + sequence.length;
  }) || null;
}

function activeFugueEntry(context) {
  const plan = currentFugueSectionPlan(context);
  if (!plan?.entries?.length) return null;
  return plan.entries.find((entry) => {
    const sequence = fugueSequenceForEntry(context, entry);
    return context.step >= entry.start_step && context.step < entry.start_step + sequence.length;
  }) || null;
}

function fugueVoiceHasEntered(context, voice) {
  const plan = currentFugueSectionPlan(context);
  if (!plan?.entries?.length) return false;
  return plan.entries.some((entry) => entry.voice === voice && context.step > entry.start_step);
}

function fugueNeedsVoice(context) {
  return Boolean(currentFugueEntry(context));
}

function offsetsFromFugue(context) {
  if (!isFugueStyle(context.settings) || context.cadenceStage) return [];
  const entry = currentFugueEntry(context);
  if (entry) return fugueEntryOffsets(context, entry);

  const activeEntry = activeFugueEntry(context);
  if (activeEntry && fugueVoiceHasEntered(context, context.voice) && context.rng() > (context.settings.dubMode ? 0.35 : 0.12)) {
    return fugueCountersubjectOffsets(context, activeEntry);
  }

  const plan = currentFugueSectionPlan(context);
  if (!plan) return [];
  if (plan.role === "episode") return fugueEpisodeOffsets(context, plan);
  if (plan.role === "middle_entry" && context.rng() < (context.settings.dubMode ? 0.45 : 0.7)) return fugueEpisodeOffsets(context, plan);
  if (plan.role === "final_return" && context.step < context.steps - context.meter.numerator * 2 && context.rng() < 0.55) {
    return fugueEpisodeOffsets(context, plan);
  }
  return [];
}

function fugueEntryOffsets(context, entry) {
  const sequence = fugueSequenceForEntry(context, entry);
  const local = context.step - entry.start_step;
  const raw = sequence[local];
  if (raw == null) return [];
  const target = nearestModeOffset(raw, context.mode);
  return [target, target, raw, ...context.mode.stable];
}

function fugueCountersubjectOffsets(context, activeEntry) {
  const material = context.fugueMaterial || context.fugueSummary || {};
  const countersubject = material.countersubject || [];
  if (!countersubject.length) return [];
  const local = mod(context.step - activeEntry.start_step + context.voiceIndex, countersubject.length);
  const answerShift = activeEntry.kind === "answer" ? 7 : 0;
  const raw = mod(countersubject[local] + answerShift, 12);
  const target = nearestModeOffset(raw, context.mode);
  return [target, raw, ...context.mode.stable, nearestModeOffset(raw + 7, context.mode)];
}

function fugueEpisodeOffsets(context) {
  const material = context.fugueMaterial || context.fugueSummary || {};
  const fragments = material.episode_fragments || [];
  if (!fragments.length) return [];
  const fragment = fragments[mod(context.barIndex + context.voiceIndex + context.sectionIndex, fragments.length)];
  if (!fragment?.length) return [];
  const sequenceShift = [0, 7, 5, 2, 9][mod(context.barIndex + context.sectionIndex, 5)];
  const raw = mod(fragment[mod(context.step + context.voiceIndex, fragment.length)] + sequenceShift, 12);
  const target = nearestModeOffset(raw, context.mode);

  if (context.settings.dubMode && context.voice === "bass") return [target, ...dubBassOffsets(context), raw, 0, 7];
  if (context.settings.dubMode && isDubSkankVoice(context.voice) && isDubOffbeat(context)) {
    return [target, ...dubSkankOffsets(context), raw];
  }
  return [target, raw, nearestModeOffset(raw + 7, context.mode), ...context.mode.stable];
}

function fugueTargetOffset(context) {
  const entry = currentFugueEntry(context);
  if (!entry) return null;
  const sequence = fugueSequenceForEntry(context, entry);
  const raw = sequence[context.step - entry.start_step];
  return raw == null ? null : nearestModeOffset(raw, context.mode);
}

function motifOrFieldOffsets(context) {
  const { subject, entries, voice, step, mode, strong, rng, settings, section } = context;
  const fugueOffsets = offsetsFromFugue(context);
  if (fugueOffsets.length) return fugueOffsets;
  const refrainOffsets = offsetsFromRefrain(context);
  if (refrainOffsets.length) return refrainOffsets;
  if (settings.dubMode && voice === "bass") return dubBassOffsets(context);
  if (settings.dubMode && isDubSkankVoice(voice) && isDubOffbeat(context) && rng() < 0.72) return dubSkankOffsets(context);

  const entryStart = entries[voice];
  const inSubject = step >= entryStart && step < entryStart + subject.length;
  if (inSubject && rng() > settings.breathing * 0.18) {
    const offset = subject[step - entryStart];
    const answerShift = context.voiceIndex % 2 === 1 ? 7 : 0;
    return [mod(offset + answerShift, 12), offset, ...mode.stable];
  }
  if (settings.generationStyle === "invention" && !strong && rng() < 0.5 - settings.breathing * 0.12) {
    const fragmentIndex = mod(step + context.voiceIndex * 2 + noteToPc(section.key), subject.length);
    const fragment = subject[fragmentIndex];
    const variationShift = weightedChoice(rng, [[0, 4], [7, 2.5], [-5, 1.6], [12, 0.8], [-12, 0.6]]);
    return [mod(fragment + variationShift, 12), mod(fragment, 12), ...mode.stable];
  }
  const profile = modePersonality(section.mode);
  const pool = strong
    ? [...mode.stable, ...mode.stable, 0, 7, ...profile.colorOffsets.slice(0, 1)]
    : [...mode.offsets, ...mode.stable, ...profile.colorOffsets, ...profile.colorOffsets.slice(0, settings.dubMode ? 2 : 1)];
  if (mode.tendencies && rng() < 0.24 + settings.strangeness * 0.22) {
    pool.push(...Object.keys(mode.tendencies).map(Number));
  }
  return pool;
}

function shouldRestForRefrain(context) {
  const plan = context.refrainPlan;
  if (!plan || plan.kind === "normal" || plan.kind === "capture" || plan.kind === "fallback") return false;
  const source = plan.source;
  if (!source) return false;
  const sourceNote = mappedRefrainNote(context, source);
  if (sourceNote) return false;
  if (plan.treatment === "dubby") return context.voice !== "bass" && context.rng() < 0.74;
  if (plan.kind === "development") return context.rng() < 0.48 + context.settings.breathing * 0.22;
  return context.rng() < 0.82;
}

function offsetsFromRefrain(context) {
  const plan = context.refrainPlan;
  if (!plan || plan.kind === "normal" || plan.kind === "capture" || plan.kind === "fallback" || context.cadenceStage) return [];
  const sourceNote = mappedRefrainNote(context, plan.source);
  if (!sourceNote) return [];
  const sourceOffset = mod(sourceNote.symbolicOffset, 12);
  const transformed = transformRefrainOffset(sourceOffset, context);
  const modeOffset = nearestModeOffset(transformed, context.mode);

  if (plan.treatment === "dubby") {
    if (context.voice === "bass") {
      return [modeOffset, ...dubBassOffsets(context), sourceOffset, 0, 7];
    }
    if (isDubSkankVoice(context.voice) && isDubOffbeat(context)) {
      return [modeOffset, ...dubSkankOffsets(context), sourceOffset];
    }
    if (context.voice === "soprano" && context.rng() < 0.45) {
      return [modeOffset, sourceOffset, ...context.mode.stable];
    }
    return [modeOffset, ...context.mode.stable, sourceOffset];
  }

  if (plan.kind === "development") {
    return [modeOffset, sourceOffset, ...context.mode.stable, nearestModeOffset(mod(sourceOffset + 7, 12), context.mode)];
  }

  return [modeOffset, sourceOffset, ...context.mode.stable];
}

function transformRefrainOffset(offset, context) {
  const plan = context.refrainPlan;
  if (!plan || plan.kind === "return") return offset;
  let transformed = offset;
  if (plan.kind === "development") {
    if (context.voiceIndex % 2 === 1) transformed = mod(12 - transformed, 12);
    if (!context.strong && context.step % 2 === 1) transformed = mod(transformed + 7, 12);
    if (plan.treatment === "dubby" && context.voice === "bass") transformed = [0, 7, 5, 10].includes(mod(transformed, 12)) ? transformed : 0;
  }
  return transformed;
}

function nearestModeOffset(offset, mode) {
  const allowed = [...new Set([...mode.offsets, ...mode.stable, 0, 7].map((item) => mod(item, 12)))];
  let best = allowed[0] ?? mod(offset, 12);
  let bestDistance = Infinity;
  allowed.forEach((candidate) => {
    const distance = circularDistance(candidate, offset);
    if (distance < bestDistance) {
      best = candidate;
      bestDistance = distance;
    }
  });
  return best;
}

function dubBassOffsets(context) {
  const primary = dubBassPrimaryOffset(context);
  const previous = context.lastOffsets?.bass;
  const pulseInBar = context.step % context.meter.numerator;
  const phraseEdge = pulseInBar === context.meter.numerator - 1;
  const third = context.mode.cadenceQuality === "minor" ? 3 : 4;
  const color = context.mode.offsets.includes(10) ? 10 : context.mode.offsets.includes(9) ? 9 : 5;
  const pool = [primary, primary, primary, primary, 0, 0, 7, 7, 5, ...context.mode.stable];

  if (previous != null) {
    pool.push(...dubBassApproachOffsets(previous, primary, context));
    if (previous === primary) pool.push(7, 5, color);
  }
  if (phraseEdge) pool.push(5, 7, color, third);
  if (context.strong) pool.push(0, 0, primary);
  return pool;
}

function dubBassPrimaryOffset(context) {
  const pattern = dubBassPattern(context);
  return mod(pattern[context.step % pattern.length], 12);
}

function dubBassPattern(context) {
  if (context.phrasePlan?.dubBassCell?.length) return context.phrasePlan.dubBassCell;
  const { meter, section } = context;
  return defaultDubBassPattern(section, meter, modePersonality(section.mode));
}

function dubBassApproachOffsets(previous, primary, context) {
  const modeOffsets = context.mode.offsets.map((offset) => mod(offset, 12));
  const candidates = [
    primary,
    mod(primary + 2, 12),
    mod(primary - 2, 12),
    mod(primary + 5, 12),
    mod(primary - 5, 12),
    7,
    5,
    10,
  ].filter((offset) => modeOffsets.includes(offset) || context.mode.stable.includes(offset) || offset === 10);
  candidates.sort((a, b) => circularDistance(previous, a) - circularDistance(previous, b));
  return [candidates[0] ?? primary, candidates[1] ?? primary, primary];
}

function dubSkankOffsets(context) {
  const third = context.mode.cadenceQuality === "minor" ? 3 : 4;
  const color = context.mode.offsets.includes(10) ? 10 : context.mode.offsets.includes(11) ? 11 : 9;
  return [third, 7, 5, color, 0, ...context.mode.stable];
}

function shuffledWeightedOffsets(offsets, mode, strong, settings, rng) {
  const counts = new Map();
  offsets.forEach((offset) => {
    const normalized = mod(offset, 12);
    counts.set(normalized, (counts.get(normalized) || 0) + 1);
  });
  const unique = [...counts.keys()];
  const weighted = unique.map((offset) => {
    let weight = 1;
    weight += (counts.get(offset) - 1) * 1.6;
    if (mode.stable.includes(offset)) weight += strong ? 5 : 2;
    if (offset === 0 || offset === 7) weight += 2;
    if (mode.tendencies && mode.tendencies[offset]) weight += settings.strangeness * 2.2;
    return [offset, Math.max(0.1, weight * (0.8 + rng() * 0.6))];
  });
  const result = [];
  while (weighted.length) {
    const pick = weightedChoiceIndex(rng, weighted.map((item) => item[1]));
    result.push(weighted[pick][0]);
    weighted.splice(pick, 1);
  }
  return result;
}

function resolvePitch(offset, context) {
  return resolvePitchOptions(offset, context, 1)[0];
}

function resolvePitchOptions(offset, context, limit = 1) {
  const { section, voice, lastPitches, settings } = context;
  const [low, high] = VOICE_RANGES[voice];
  const prefer = lastPitches[voice] ?? Math.round((low + high) / 2);
  const tonicPc = noteToPc(section.key);
  const literalPc = mod(tonicPc + offset, 12);
  const options = [];

  for (let midi = low; midi <= high; midi += 1) {
    const pcDistance = circularDistance(midi % 12, literalPc);
    if (settings.resolution === "literal" || settings.outputMode === "equal") {
      if (midi % 12 !== literalPc) continue;
      const score = -Math.abs(midi - prefer);
      options.push({ midi, symbolicOffset: offset, literalPc, resolutionCents: 0, score });
      continue;
    }

    const ratioScore = ratioResolutionScore(midi, offset, tonicPc, settings);
    const score = -(ratioScore.cents + Math.abs(midi - prefer) * 4 + pcDistance * 7);
    options.push({ midi, symbolicOffset: offset, literalPc, resolutionCents: ratioScore.cents, targetRatio: ratioScore.targetRatio, score });
  }

  if (!options.length) {
    options.push({ midi: nearestMidiForPc(literalPc, low, high, prefer), symbolicOffset: offset, literalPc, resolutionCents: 0, score: -999 });
  }
  options.sort((a, b) => b.score - a.score);
  return options.slice(0, Math.max(1, limit)).map((resolved) => decorateResolvedPitch(resolved, settings, literalPc));
}

function decorateResolvedPitch(resolved, settings, literalPc) {
  return {
    ...resolved,
    noteName: midiName(resolved.midi),
    symbolicName: `${pcToName(literalPc)}${Math.floor(resolved.midi / 12) - 1}`,
    ratio: ratioForMidi(resolved.midi, settings),
    ratioName: ratioNameForMidi(resolved.midi, settings),
  };
}

function ratioResolutionScore(midi, offset, tonicPc, settings) {
  const tonicBase = nearestMidiForPc(tonicPc, 48, 72, 60);
  const targetRatio = ratioForMidi(tonicBase, settings) * (FUNCTION_RATIOS[mod(offset, 12)] || 1);
  const candidateRatio = ratioForMidi(midi, settings);
  const cents = octaveReducedCents(candidateRatio / targetRatio);
  return { cents, targetRatio };
}

function validateCandidate(candidate, context) {
  const { chosen, voiceIndex, activeVoices, lastPitches, lastLeaps, debts, voice, strong, settings } = context;
  const previous = previousPitchForVoice(context, voice);
  const debt = debts[voice];
  let resolvedDebt = false;

  if (debt) {
    const offsetOk = debt.targets.includes(mod(candidate.symbolicOffset, 12));
    const directionOk = previous == null || debt.direction === "up" ? candidate.midi > previous : candidate.midi < previous;
    if (!offsetOk || !directionOk) return { ok: false };
    resolvedDebt = true;
  }

  const leapLimit = settings.dubMode && voice === "bass" ? 14 : 12;
  if (previous != null && Math.abs(candidate.midi - previous) > leapLimit) return { ok: false };

  const holdState = context.holdStates?.[voice];
  if (previous != null && holdState) {
    const samePitch = candidate.midi === previous;
    const block = context.resolvedBlocks?.[voice];
    if (block && block.midi === candidate.midi && context.step < block.untilStep && !isChordOffset(candidate.symbolicOffset, context)) {
      context.suspensionStats.resuspendPrevented += 1;
      return { ok: false };
    }
    if (samePitch) {
      const holdBars = holdBarsForCandidate(context);
      const canPedal = isPedalVoice(context) && isPedalOffset(candidate.symbolicOffset);
      if (holdBars > 2 && !canPedal && !isChordOffset(candidate.symbolicOffset, context)) return { ok: false };
      if (holdState.suspendedSince != null && !canKeepLongHold(candidate, context, holdState)) return { ok: false };
    } else if (holdState.suspendedSince != null && nearestStepChordToneExists(previous, context) && !isGoodSuspensionResolution(candidate, context, previous)) {
      return { ok: false };
    }
  }

  if (previous != null && Math.abs(lastLeaps[voice]) >= 7) {
    const recovery = candidate.midi - previous;
    const dubBassBounce = settings.dubMode
      && voice === "bass"
      && Math.sign(recovery) !== Math.sign(lastLeaps[voice])
      && Math.abs(recovery) <= 7;
    if (!dubBassBounce && (Math.sign(recovery) === Math.sign(lastLeaps[voice]) || Math.abs(recovery) > 2)) return { ok: false };
  }

  const relation = validateCandidateRelations(candidate, context);
  if (!relation.ok) return relation.parallelReject ? { ok: false, parallelReject: true } : { ok: false };

  return { ok: true, resolvedDebt };
}

function validateCandidateRelations(candidate, context, { allowDubBend = true, allowVerticalDissonance = false, allowWideSpacing = false } = {}) {
  const { chosen, voiceIndex, activeVoices, strong } = context;
  for (let i = 0; i < activeVoices.length; i += 1) {
    const otherVoice = activeVoices[i];
    const other = chosen[otherVoice];
    if (!other) continue;
    if (i < voiceIndex && candidate.midi <= other.midi) return { ok: false, reason: "voice-order" };
    if (i > voiceIndex && candidate.midi >= other.midi) return { ok: false, reason: "voice-order" };
    const interval = mod(candidate.midi - other.midi, 12);
    const absInterval = Math.abs(candidate.midi - other.midi);
    if (strong && !allowVerticalDissonance && !isVerticalConsonance(interval, otherVoice === "bass")) return { ok: false, reason: "vertical-dissonance" };
    if (!allowWideSpacing && absInterval > 28) return { ok: false, reason: "spacing" };
  }

  const parallel = parallelPerfectAgainstChosen(candidate, context, { allowDubBend });
  if (parallel?.blocked) return { ok: false, parallelReject: true, reason: parallel.motion.type, parallel };
  return { ok: true, dubParallelAllowed: Boolean(parallel?.allowedByDub) };
}

function parallelPerfectAgainstChosen(candidate, context, { allowDubBend = true } = {}) {
  const { chosen, voiceIndex, activeVoices, voice, strong } = context;
  let allowed = null;
  for (let i = 0; i < activeVoices.length; i += 1) {
    const otherVoice = activeVoices[i];
    const other = chosen[otherVoice];
    if (!other) continue;
    const prevA = previousPitchForVoice(context, voice);
    const prevB = previousPitchForVoice(context, otherVoice);
    if (prevA == null || prevB == null) continue;
    const lowerIsCandidate = i > voiceIndex;
    const motion = classifyParallelPerfectMotion({
      previousLower: lowerIsCandidate ? prevA : prevB,
      previousUpper: lowerIsCandidate ? prevB : prevA,
      currentLower: lowerIsCandidate ? candidate.midi : other.midi,
      currentUpper: lowerIsCandidate ? other.midi : candidate.midi,
      strong,
    });
    if (!motion) continue;
    const allowedByDub = allowDubBend && allowsDubRuleBend(context, motion, otherVoice);
    if (!allowedByDub) return { blocked: true, allowedByDub: false, motion, otherVoice };
    allowed = allowed || { blocked: false, allowedByDub: true, motion, otherVoice };
  }
  return allowed;
}

function previousPitchForVoice(context, voice) {
  return context.previousPitches?.[voice] ?? context.lastPitches?.[voice] ?? null;
}

function isVerticalConsonance(interval, againstBass) {
  if (againstBass && interval === 5) return false;
  return [0, 3, 4, 7, 8, 9].includes(interval);
}

function isPerfectInterval(interval) {
  return interval === 0 || interval === 7;
}

function classifyParallelPerfectMotion({ previousLower, previousUpper, currentLower, currentUpper, strong = false }) {
  const previousInterval = mod(previousUpper - previousLower, 12);
  const currentInterval = mod(currentUpper - currentLower, 12);
  const lowerMotion = Math.sign(currentLower - previousLower);
  const upperMotion = Math.sign(currentUpper - previousUpper);
  const similarMotion = lowerMotion === upperMotion && lowerMotion !== 0;
  if (!similarMotion || !isPerfectInterval(currentInterval)) return null;

  if (isPerfectInterval(previousInterval)) {
    return { type: "parallel-perfect", interval: currentInterval };
  }

  if (strong && Math.abs(currentUpper - previousUpper) > 2) {
    return { type: "direct-perfect", interval: currentInterval };
  }

  return null;
}

function allowsDubRuleBend(context, motion, otherVoice = "") {
  const { settings, cadenceStage, rng, voice } = context;
  if (!settings.dubMode || cadenceStage) return false;
  const baseChance = motion.type === "direct-perfect" ? 0.18 : 0.09;
  const bassWeight = voice === "bass" ? 1.25 : 1;
  const unit = settings.seed
    ? hashUnit(settings.seed, "dub-rule-bend", context.sectionIndex, context.step, voice, otherVoice, motion.type, motion.interval)
    : rng();
  return unit < baseChance * bassWeight * (0.85 + settings.strangeness * 0.7);
}

function scoreCandidate(candidate, context) {
  const { mode, strong, lastPitches, voice, settings } = context;
  const offset = mod(candidate.symbolicOffset, 12);
  const profile = modePersonality(context.section.mode);
  let score = 1;
  const fugueTarget = fugueTargetOffset(context);
  if (fugueTarget != null && offset === mod(fugueTarget, 12)) score += currentFugueEntry(context) ? 16 : 7;
  if (mode.stable.includes(offset)) score += (strong ? 8 : 3) + (profile.stableBoost || 0);
  if (profile.colorOffsets?.includes(offset)) score += strong ? 0.7 : 1.8;
  if (offset === 0) score += strong ? 5 : 1.2;
  if (offset === 7) score += 3;
  if (mode.tendencies && mode.tendencies[offset]) score += settings.strangeness * 2;
  if (lastPitches[voice] != null) {
    const motion = Math.abs(candidate.midi - lastPitches[voice]);
    const direction = Math.sign(candidate.midi - lastPitches[voice]);
    const phraseDirection = phraseArcDirection(context);
    if (motion <= 2) score += 4;
    if (motion <= 2) score += profile.stepBoost || 0;
    if (motion <= 5) score += 1.5;
    if (phraseDirection && direction === phraseDirection && motion <= 7) score += 1.1;
    if (motion >= 8) score -= 4;
  }
  const phraseRole = phraseRoleForContext(context);
  if (phraseRole === "lead") score += profile.colorOffsets?.includes(offset) ? 1.4 : 0.55;
  if (phraseRole === "answer" && mode.stable.includes(offset)) score += 0.8;
  if (phraseRole === "field" && strong && mode.stable.includes(offset)) score += 1.2;
  if (context.cadenceStage) {
    const intensity = context.phrasePlan?.cadenceIntensity ?? profile.cadenceIntensity ?? 0.65;
    if (offset === 0) score += intensity * 4;
    if (mode.stable.includes(offset)) score += intensity * 2;
  }
  const holdState = context.holdStates?.[voice];
  if (holdState?.suspendedSince != null && lastPitches[voice] != null) {
    const suspensionBars = (context.step - holdState.suspendedSince + 1) / context.meter.numerator;
    if (isGoodSuspensionResolution(candidate, context, lastPitches[voice])) score += suspensionBars >= 1.5 ? 14 : 8;
    if (candidate.midi === lastPitches[voice] && suspensionBars >= 1.5) score -= 12;
  }
  if (settings.dubMode) {
    if (voice === "bass") {
      const primary = dubBassPrimaryOffset(context);
      if (offset === primary) score += strong ? 9 : 6;
      if (offset === 0 || offset === 7) score += 4;
      if (lastPitches[voice] != null && candidate.midi === lastPitches[voice]) score += 5;
    }
    if (isDubSkankVoice(voice) && isDubOffbeat(context)) {
      const third = mode.cadenceQuality === "minor" ? 3 : 4;
      if ([third, 5, 7, 10, 11].includes(offset)) score += 4.5;
    }
    if (voice === "soprano" && !strong && mode.stable.includes(offset)) score += 2;
  }
  score -= (candidate.resolutionCents || 0) / 35;
  return Math.max(0.1, score);
}

function applyTendencyDebt(chosen, context) {
  const { mode, debts, voice } = context;
  const tendency = mode.tendencies?.[mod(chosen.symbolicOffset, 12)];
  if (tendency) debts[voice] = tendency;
}

function commitVoiceChoice(choice, context) {
  if (!choice || choice.rest) return choice;
  if (choice.resolvedDebt) context.debts[context.voice] = null;
  applyTendencyDebt(choice, context);
  return choice;
}

function gridToEvents(grid, voice, sectionStartTick, pulseTicks, settings, section, phrasePlan) {
  const events = [];
  let active = null;
  let startStep = 0;
  for (let i = 0; i <= grid.length; i += 1) {
    const current = grid[i] || null;
    const same = sameGridNote(active, current, voice, i, section, settings);
    if (same) continue;
    if (active) {
      events.push(makeNoteEvent(active, voice, sectionStartTick + startStep * pulseTicks, (i - startStep) * pulseTicks, settings, { startStep, endStep: i }));
    }
    active = current;
    startStep = i;
  }
  return applyDubGroove(events, voice, sectionStartTick, pulseTicks, settings, section, phrasePlan);
}

function sameGridNote(active, current, voice, step, section, settings) {
  if (!active || !current) return false;
  if (shouldRearticulateDubRepeat(voice, step, section, settings)) return false;
  return current.midi === active.midi
    && mod(current.symbolicOffset, 12) === mod(active.symbolicOffset, 12)
    && current.ratioName === active.ratioName;
}

function shouldRearticulateDubRepeat(voice, step, section, settings) {
  if (!settings.dubMode || !section || step <= 0) return false;
  const meter = METERS[section.meter] || METERS["4/4"];
  const pulseInBar = step % meter.numerator;
  const strong = pulseInBar === 0 || meter.accents.includes(pulseInBar);
  if (voice === "bass") return true;
  return isDubSkankVoice(voice) && !strong && pulseInBar > 0;
}

function makeNoteEvent(note, voice, tick, duration, settings, meta = {}) {
  const ratioFrequency = settings.rootFreq * ratioForMidi(note.midi, settings);
  let midi = note.midi;
  let bend = null;
  let tunedFrequency = ratioFrequency;
  if (settings.outputMode === "equal") {
    midi = nearestMidiForPc(note.literalPc, VOICE_RANGES[voice][0], VOICE_RANGES[voice][1], note.midi);
    tunedFrequency = midiFrequency(midi);
  } else if (settings.outputMode === "bend") {
    midi = Math.round(69 + 12 * Math.log2(ratioFrequency / 440));
    if (Number.isInteger(midi)) {
      const etFreq = midiFrequency(midi);
      const cents = 1200 * Math.log2(ratioFrequency / etFreq);
      bend = centsToPitchBend(cents, 2);
    }
  }
  const velocity = velocityForPitch(midi);
  return {
    tick,
    duration: Math.max(PPQ / 4, duration),
    gridTick: tick,
    gridDuration: duration,
    startStep: meta.startStep ?? null,
    endStep: meta.endStep ?? null,
    grooveOffsetTicks: 0,
    grooveRole: null,
    midi,
    carrierMidi: note.midi,
    symbolicOffset: mod(note.symbolicOffset, 12),
    symbolic: note.symbolicName,
    resolved: note.noteName,
    ratioName: note.ratioName,
    tunedFrequency,
    conceptualRatioFrequency: ratioFrequency,
    exportedMidiFrequency: midiFrequency(midi),
    velocity,
    bend,
  };
}

function applyDubGroove(events, voice, sectionStartTick, pulseTicks, settings, section, phrasePlan) {
  if (!events.length || !section) return events;
  if (!settings.dubMode) return annotatePhraseRoles(events, voice, section, phrasePlan);
  const meter = METERS[section.meter] || METERS["4/4"];
  const sectionEndTick = sectionStartTick + section.bars * meter.numerator * pulseTicks;
  const shaped = events.map((event) => {
    const startStep = event.startStep ?? Math.round((event.tick - sectionStartTick) / pulseTicks);
    const pulseInBar = mod(startStep, meter.numerator);
    const strong = pulseInBar === 0 || meter.accents.includes(pulseInBar);
    const offbeat = !strong && pulseInBar > 0;
    const unit = hashUnit(settings.seed, voice, section.key, section.mode, event.gridTick, event.midi);
    let offsetTicks = 0;
    let duration = event.duration;
    let grooveRole = null;

    if (isDubSkankVoice(voice) && offbeat) {
      offsetTicks = -msToTicks(lerp(DUB_SKANK_EARLY_MS[0], DUB_SKANK_EARLY_MS[1], unit), settings);
      duration = Math.min(duration, Math.round(pulseTicks * lerp(0.14, 0.31, unit)));
      grooveRole = "skank-touch";
    } else if (voice === "bass") {
      if (!strong) offsetTicks = msToTicks(lerp(DUB_BASS_LATE_MS[0], DUB_BASS_LATE_MS[1], unit), settings);
      duration = Math.min(duration, Math.round(pulseTicks * lerp(strong ? 0.68 : 0.48, strong ? 0.94 : 0.76, unit)));
      grooveRole = "bass-pulse";
    } else if (offbeat) {
      offsetTicks = msToTicks(lerp(DUB_SWING_LATE_MS[0], DUB_SWING_LATE_MS[1], unit), settings);
      duration = Math.min(duration, Math.round(duration * lerp(0.78, 0.94, unit)));
      grooveRole = "dub-stroll";
    }

    const tick = clamp(event.tick + offsetTicks, sectionStartTick, Math.max(sectionStartTick, sectionEndTick - 1));
    return {
      ...event,
      tick,
      duration: Math.max(DUB_MIN_NOTE_TICKS, duration),
      grooveOffsetTicks: tick - event.gridTick,
      grooveRole,
      phraseRole: phraseRoleForStep(voice, startStep, meter, phrasePlan),
    };
  }).sort((a, b) => a.tick - b.tick || a.gridTick - b.gridTick);

  for (let i = 0; i < shaped.length; i += 1) {
    const next = shaped[i + 1];
    const maxEnd = next ? next.tick : sectionEndTick;
    if (shaped[i].tick + shaped[i].duration > maxEnd) {
      shaped[i].duration = Math.max(1, maxEnd - shaped[i].tick);
    }
  }
  return shaped.filter((event) => event.duration > 0);
}

function annotatePhraseRoles(events, voice, section, phrasePlan) {
  if (!phrasePlan || !section) return events;
  const meter = METERS[section.meter] || METERS["4/4"];
  return events.map((event) => {
    const startStep = event.startStep ?? 0;
    return { ...event, phraseRole: phraseRoleForStep(voice, startStep, meter, phrasePlan) };
  });
}

function phraseRoleForStep(voice, startStep, meter, phrasePlan) {
  if (!phrasePlan) return null;
  const bar = Math.floor(startStep / meter.numerator);
  if (phrasePlan.leadByBar?.[bar] === voice) return "lead";
  if (phrasePlan.answerByBar?.[bar] === voice) return "answer";
  return "field";
}

function velocityForPitch(midi) {
  return clamp(Math.round(92 + registerVelocityBalance(midi)), 1, 127);
}

function applyGravityVelocity(tracks, sectionMeta, settings) {
  const profileId = velocityProfileId(settings);
  const profile = VELOCITY_PROFILES[profileId] || VELOCITY_PROFILES.calm;
  const refs = Object.entries(tracks)
    .flatMap(([voice, track]) => track.events.map((event) => ({ voice, event })))
    .sort((a, b) => a.event.tick - b.event.tick || a.voice.localeCompare(b.voice));
  if (!refs.length) return emptyVelocitySummary(profileId, profile, settings);

  const startCounts = new Map();
  refs.forEach(({ event }) => {
    startCounts.set(event.tick, (startCounts.get(event.tick) || 0) + 1);
  });

  const previousByVoice = {};
  const driftByVoice = {};
  const rawValues = [];
  refs.forEach((ref, index) => {
    const previous = previousByVoice[ref.voice] || null;
    const components = velocityComponentsForEvent(ref, previous, sectionMeta, settings, startCounts.get(ref.event.tick) || 1);
    const driftUnit = hashUnit(settings.seed, "velocity-v1", ref.voice, ref.event.gridTick, ref.event.symbolicOffset, ref.event.phraseRole || "none", index) * 2 - 1;
    const drift = profile.rho * (driftByVoice[ref.voice] || 0) + profile.drift * driftUnit;
    driftByVoice[ref.voice] = drift;
    const raw = Object.values(components).reduce((sum, value) => sum + value, 0) + drift;
    ref.rawVelocity = raw;
    ref.gravity = components.harmonicGravity;
    ref.event.velocityComponents = components;
    rawValues.push(raw);
    previousByVoice[ref.voice] = ref;
  });

  const values = rawValues.slice().sort((a, b) => a - b);
  const median = percentile(values, 0.5);
  const spread = Math.max(10, percentile(values, 0.9) - percentile(values, 0.1));
  const tempo = velocityTempoCoupling(settings);
  const center = (profile.min + profile.max) / 2 + tempo.centerOffset;
  const halfRange = ((profile.max - profile.min) / 2) * tempo.rangeScale;
  const velocityByVoice = {};
  refs.forEach((ref) => {
    const shaped = Math.tanh((ref.rawVelocity - median) / (spread * 1.8));
    let velocity = profile.min === profile.max ? profile.min : Math.round(center + shaped * halfRange);
    velocity = clamp(velocity, profile.min, profile.max);
    const previous = velocityByVoice[ref.voice];
    if (previous != null) {
      const limit = velocityStepLimit(ref.event);
      velocity = clamp(velocity, previous - limit, previous + limit);
    }
    ref.event.velocity = clamp(Math.round(velocity), 1, 127);
    velocityByVoice[ref.voice] = ref.event.velocity;
  });

  return velocitySummary(refs.map((ref) => ref.event.velocity), profileId, profile, settings, tempo);
}

function velocityComponentsForEvent(ref, previous, sectionMeta, settings, simultaneousStarts) {
  const { event, voice } = ref;
  const location = velocityEventLocation(event, sectionMeta);
  const section = location.section || sectionMeta[0] || DEFAULT_SECTIONS[0];
  const mode = MODES[section.mode] || MODES.major;
  const gravity = harmonicGravityForEvent(event, section, settings);
  const previousGravity = previous ? harmonicGravityForEvent(previous.event, section, settings) : gravity;
  const tendencyResolved = previous && mode.tendencies?.[previous.event.symbolicOffset]?.targets?.includes(event.symbolicOffset);
  const cadenceStage = location.step == null ? null : getCadenceStage(location.step, section.bars * section.numerator, section.numerator);
  const firstBeat = location.pulseInBar === 0;
  const secondaryAccent = (METERS[section.meter]?.accents || []).includes(location.pulseInBar);
  const contour = (hashUnit(settings.seed, "velocity-contour", event.symbolicOffset, mod(event.startStep ?? location.step ?? 0, 8), event.phraseRole || "field") * 2 - 1) * 1.8;
  const tempo = velocityTempoCoupling(settings);

  return {
    base: 92,
    registerBalance: registerVelocityBalance(event.midi),
    metricAccent: firstBeat ? 4.2 : secondaryAccent ? 2.2 : -1.1,
    phraseRole: event.phraseRole === "lead" ? 2.3 : event.phraseRole === "answer" ? 1.1 : -0.7,
    harmonicGravity: (gravity - 0.5) * 4.8,
    resolutionRelease: Math.max(0, gravity - previousGravity) * 6.2 + (tendencyResolved ? 3.2 : 0),
    cadencePull: (cadenceStage === "final" || cadenceStage === "cadence-final" ? 4.5 : cadenceStage === "cadence-prep" ? 1.8 : 0) * tempo.cadenceScale,
    dubRole: dubVelocityRole(event, voice),
    motifContour: contour,
    simultaneousCompensation: -1.15 * Math.max(0, simultaneousStarts - 1),
    tempoBreath: tempo.component,
  };
}

function registerVelocityBalance(midi) {
  const pitch = clamp(midi, VELOCITY_PITCH_LOW, VELOCITY_PITCH_HIGH);
  const normalized = (pitch - VELOCITY_PITCH_LOW) / Math.max(1, VELOCITY_PITCH_HIGH - VELOCITY_PITCH_LOW);
  return (0.5 - normalized) * 5.5;
}

function dubVelocityRole(event, voice) {
  if (event.grooveRole === "skank-touch") return -3.2;
  if (event.grooveRole === "bass-pulse" || voice === "bass") {
    if (event.symbolicOffset === 0) return 3.2;
    if (event.symbolicOffset === 7) return 2.1;
    return 0.9;
  }
  if (event.grooveRole === "dub-stroll") return -0.7;
  return 0;
}

function velocityEventLocation(event, sectionMeta) {
  const tick = event.gridTick ?? event.tick;
  const located = locateTick(tick, sectionMeta);
  const section = located.section;
  if (!section) return { section: null, step: null, pulseInBar: 0 };
  const localTick = clamp(tick - section.startTick, 0, Math.max(0, section.bars * section.barTicks - 1));
  const pulseTicks = section.barTicks / section.numerator;
  const step = Math.floor(localTick / pulseTicks + 0.001);
  return { section, step, pulseInBar: mod(step, section.numerator) };
}

function harmonicGravityForEvent(event, section, settings) {
  const mode = MODES[section.mode] || MODES.major;
  const tonal = tonalFunctionGravity(event.symbolicOffset, mode);
  if (settings.outputMode === "equal") return tonal;
  const ratioGravity = AMY_DUB_RATIOS[mod(event.symbolicOffset, 12)]?.[2] ?? tonal;
  return ratioGravity * 0.64 + tonal * 0.36;
}

function tonalFunctionGravity(offset, mode) {
  const pc = mod(offset, 12);
  if (pc === 0) return 1;
  if (pc === 7) return 0.9;
  if (mode.stable?.includes(pc)) return 0.78;
  if (mode.tendencies?.[pc]) return 0.28;
  if (mode.offsets?.includes(pc)) return 0.54;
  return 0.42;
}

function velocityTempoCoupling(settings) {
  const referenceHz = Math.max(1, settings.referenceHz || DEFAULT_A4_HZ);
  const divisor = Math.max(1, settings.tempoDivisor || Math.round((60 * referenceHz) / Math.max(1, settings.tempo || 60)));
  const ratio = clamp(Math.sqrt(divisor / referenceHz), 0.78, 1.22);
  return {
    ratio,
    rangeScale: clamp(0.98 + (ratio - 1) * 0.18, 0.92, 1.06),
    cadenceScale: clamp(1 + (ratio - 1) * 0.16, 0.92, 1.08),
    centerOffset: clamp((1 - ratio) * 1.8, -1.2, 1.2),
    component: clamp((ratio - 1) * 1.6, -1.2, 1.2),
  };
}

function velocityStepLimit(event) {
  if (event.grooveRole === "skank-touch") return 16;
  if (event.phraseRole === "lead") return 14;
  return 12;
}

function velocityProfileId(settings) {
  if (VELOCITY_PROFILES[settings.velocityProfile]) return settings.velocityProfile;
  return settings.dubMode ? "dub" : "calm";
}

function emptyVelocitySummary(profileId, profile, settings) {
  return velocitySummary([], profileId, profile, settings, velocityTempoCoupling(settings));
}

function velocitySummary(velocities, profileId, profile, settings, tempo) {
  const sorted = velocities.slice().sort((a, b) => a - b);
  const average = velocities.length ? velocities.reduce((sum, value) => sum + value, 0) / velocities.length : 0;
  return {
    version: VELOCITY_MODEL_VERSION,
    profile: profileId,
    label: profile.label,
    range: [profile.min, profile.max],
    editable: true,
    rng_isolated: true,
    tempo_coupling: {
      formula: "BPM = 60 * referenceHz / n",
      reference_hz: Number((settings.referenceHz || DEFAULT_A4_HZ).toFixed(4)),
      divisor_n: settings.tempoDivisor,
      bpm: Number((settings.tempo || 60).toFixed(4)),
      ratio: Number(tempo.ratio.toFixed(4)),
      range_scale: Number(tempo.rangeScale.toFixed(4)),
    },
    stats: {
      min: sorted.length ? sorted[0] : 0,
      max: sorted.length ? sorted[sorted.length - 1] : 0,
      average: Number(average.toFixed(2)),
      p10: Number(percentile(sorted, 0.1).toFixed(2)),
      p90: Number(percentile(sorted, 0.9).toFixed(2)),
    },
  };
}

function percentile(sortedValues, amount) {
  if (!sortedValues.length) return 0;
  const index = clamp((sortedValues.length - 1) * amount, 0, sortedValues.length - 1);
  const lower = Math.floor(index);
  const upper = Math.ceil(index);
  if (lower === upper) return sortedValues[lower];
  return mix(sortedValues[lower], sortedValues[upper], index - lower);
}

function isIntegerInRange(value, min, max) {
  return Number.isInteger(value) && value >= min && value <= max;
}

function isNonNegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function midiChannel(value, label) {
  if (!isIntegerInRange(value, 0, 15)) throw new RangeError(`${label} must be 0-15, got ${value}.`);
  return value;
}

function midiDataByte(value, label, min = 0) {
  if (!isIntegerInRange(value, min, 127)) throw new RangeError(`${label} must be ${min}-127, got ${value}.`);
  return value;
}

function midiTick(value, label) {
  if (!isNonNegativeInteger(value)) throw new RangeError(`${label} must be a non-negative integer, got ${value}.`);
  return value;
}

function midiPositiveTick(value, label) {
  if (!Number.isInteger(value) || value <= 0) throw new RangeError(`${label} must be a positive integer, got ${value}.`);
  return value;
}

function validateMidiSerializationInput(tracks, settings) {
  const issues = [];
  Object.values(tracks).forEach((track) => {
    if (!isIntegerInRange(track.channel, 0, 15)) {
      issues.push(`${track.name || "Voice"} has invalid MIDI channel ${track.channel}.`);
    }
    track.events.forEach((note, index) => {
      const label = `${track.name || "Voice"} event ${index + 1}`;
      if (!isNonNegativeInteger(note.tick)) issues.push(`${label} has invalid tick ${note.tick}.`);
      if (!Number.isInteger(note.duration) || note.duration <= 0) issues.push(`${label} has invalid duration ${note.duration}.`);
      if (!isIntegerInRange(note.midi, 0, 127)) issues.push(`${label} has invalid MIDI note ${note.midi}; Bend MIDI may need a root frequency inside the usable range.`);
      if (!isIntegerInRange(note.velocity, 1, 127)) issues.push(`${label} has invalid velocity ${note.velocity}.`);
      if (settings.outputMode === "bend" && note.bend != null && !isIntegerInRange(note.bend, 0, 16383)) {
        issues.push(`${label} has invalid pitch bend ${note.bend}.`);
      }
    });
  });
  return issues;
}

function writeMidiFile({ tracks, sectionMeta, settings, totalTicks = null, tempoTimeline = null }) {
  const chunks = [];
  const voiceTracks = Object.values(tracks);
  const hasConductor = Boolean(settings.includeTempoMap);
  chunks.push(makeHeaderChunk(1, voiceTracks.length + (hasConductor ? 1 : 0), PPQ));
  if (hasConductor) {
    const conductorEndTick = totalTicks == null ? sectionMeta.reduce((sum, section) => sum + section.bars * section.barTicks, 0) : totalTicks;
    chunks.push(makeConductorTrack(sectionMeta, settings, conductorEndTick, tempoTimeline));
  }
  voiceTracks.forEach((track) => chunks.push(makeVoiceTrack(track, settings)));
  return concatBytes(chunks);
}

function makeHeaderChunk(format, ntrks, division) {
  return chunk("MThd", [
    (format >> 8) & 0xff, format & 0xff,
    (ntrks >> 8) & 0xff, ntrks & 0xff,
    (division >> 8) & 0xff, division & 0xff,
  ]);
}

function makeVoiceTrack(track, settings) {
  const events = [];
  const channel = midiChannel(track.channel, `${track.name || "Voice"} channel`);
  if (settings.outputMode === "bend") {
    events.push(...pitchBendRangeEvents(channel, 2));
  }
  for (const note of track.events) {
    const tick = midiTick(note.tick, `${track.name || "Voice"} note tick`);
    const duration = midiPositiveTick(note.duration, `${track.name || "Voice"} note duration`);
    const midi = midiDataByte(note.midi, `${track.name || "Voice"} note`);
    const velocity = midiDataByte(note.velocity, `${track.name || "Voice"} velocity`, 1);
    if (settings.outputMode === "bend" && note.bend != null) {
      events.push({ tick, bytes: pitchBendBytes(channel, note.bend) });
    }
    events.push({ tick, bytes: [0x90 | channel, midi, velocity] });
    events.push({ tick: tick + duration, bytes: [0x80 | channel, midi, 0] });
  }
  events.sort((a, b) => a.tick - b.tick || eventOrder(a.bytes) - eventOrder(b.bytes));
  return chunk("MTrk", deltaEncode(events));
}

function makeConductorTrack(sectionMeta, settings, totalTicks, tempoTimeline = null) {
  const events = [];
  if (settings.tempoLatticeEnabled && tempoTimeline?.tempoEvents?.length) {
    tempoTimeline.tempoEvents.forEach((event) => {
      events.push({ tick: event.tick, bytes: tempoMetaBytesFromMicroseconds(event.microsecondsPerQuarter) });
    });
  } else {
    events.push({ tick: 0, bytes: tempoMetaBytes(settings.tempo) });
  }
  sectionMeta.forEach((section) => {
    events.push({ tick: section.startTick, bytes: timeSignatureMetaBytes(section.numerator, section.denominator) });
  });
  events.sort((a, b) => a.tick - b.tick || eventOrder(a.bytes) - eventOrder(b.bytes));
  return chunk("MTrk", deltaEncode(events, totalTicks));
}

function tempoMetaBytes(bpm) {
  const microsecondsPerQuarter = clamp(Math.round(60000000 / clamp(bpm, 1, 999)), 1, 0xffffff);
  return tempoMetaBytesFromMicroseconds(microsecondsPerQuarter);
}

function tempoMetaBytesFromMicroseconds(microsecondsPerQuarter) {
  const safeMicroseconds = clamp(Math.round(microsecondsPerQuarter), 1, 0xffffff);
  return [
    0xff, 0x51, 0x03,
    (safeMicroseconds >>> 16) & 0xff,
    (safeMicroseconds >>> 8) & 0xff,
    safeMicroseconds & 0xff,
  ];
}

function timeSignatureMetaBytes(numerator, denominator) {
  const power = Math.max(0, Math.round(Math.log2(denominator || 4)));
  return [0xff, 0x58, 0x04, numerator & 0xff, power & 0xff, 24, 8];
}

function pitchBendRangeEvents(channel, semitones) {
  const safeChannel = midiChannel(channel, "Pitch bend range channel");
  const safeSemitones = midiDataByte(semitones, "Pitch bend range semitones");
  return [
    { tick: 0, bytes: [0xb0 | safeChannel, 101, 0] },
    { tick: 0, bytes: [0xb0 | safeChannel, 100, 0] },
    { tick: 0, bytes: [0xb0 | safeChannel, 6, safeSemitones] },
    { tick: 0, bytes: [0xb0 | safeChannel, 38, 0] },
    { tick: 0, bytes: [0xb0 | safeChannel, 101, 127] },
    { tick: 0, bytes: [0xb0 | safeChannel, 100, 127] },
  ];
}

function eventOrder(bytes) {
  if (bytes[0] === 0xff) return -1;
  if (bytes[0] >= 0xb0 && bytes[0] < 0xc0) return 0;
  if (bytes[0] >= 0x80 && bytes[0] < 0x90) return 1;
  if (bytes[0] >= 0xe0) return 2;
  if (bytes[0] >= 0x90 && bytes[0] < 0xa0) return 3;
  return 4;
}

function deltaEncode(events, endTick = null) {
  const bytes = [];
  let previousTick = 0;
  for (const event of events) {
    const tick = midiTick(event.tick, "MIDI event tick");
    bytes.push(...varLen(tick - previousTick), ...event.bytes);
    previousTick = tick;
  }
  const finalTick = endTick == null ? previousTick : Math.max(previousTick, endTick);
  bytes.push(...varLen(finalTick - previousTick), 0xff, 0x2f, 0x00);
  return bytes;
}

function chunk(id, data) {
  const header = [...id].map((char) => char.charCodeAt(0));
  const length = data.length;
  return new Uint8Array([
    ...header,
    (length >>> 24) & 0xff,
    (length >>> 16) & 0xff,
    (length >>> 8) & 0xff,
    length & 0xff,
    ...data,
  ]);
}

function pitchBendBytes(channel, value) {
  const safeChannel = midiChannel(channel, "Pitch bend channel");
  if (!isIntegerInRange(value, 0, 16383)) throw new RangeError(`Pitch bend value must be 0-16383, got ${value}.`);
  return [0xe0 | safeChannel, value & 0x7f, (value >> 7) & 0x7f];
}

function centsToPitchBend(cents, rangeSemitones) {
  return Math.round(8192 + (cents / (rangeSemitones * 100)) * 8192);
}

function varLen(value) {
  let buffer = value & 0x7f;
  const bytes = [];
  while ((value >>= 7)) {
    buffer <<= 8;
    buffer |= ((value & 0x7f) | 0x80);
  }
  while (true) {
    bytes.push(buffer & 0xff);
    if (buffer & 0x80) buffer >>= 8;
    else break;
  }
  return bytes;
}

function concatBytes(chunks) {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  chunks.forEach((chunk) => {
    out.set(chunk, offset);
    offset += chunk.length;
  });
  return out;
}

function summarizeDubGroove(settings, events, memory) {
  const grooveEvents = events.filter((event) => event.grooveRole);
  const skankTouches = grooveEvents.filter((event) => event.grooveRole === "skank-touch").length;
  const bassPulses = grooveEvents.filter((event) => event.grooveRole === "bass-pulse").length;
  const maxOffset = grooveEvents.reduce((max, event) => Math.max(max, Math.abs(event.grooveOffsetTicks || 0)), 0);
  return {
    enabled: Boolean(settings.dubMode),
    feel: settings.dubMode ? "gentle swaggering stroll" : "grid",
    groove_events: grooveEvents.length,
    skank_touches: skankTouches,
    bass_pulses: bassPulses,
    max_offset_ticks: maxOffset,
    bass_memory_reused: memory.reused,
    bass_memory_new: memory.newCells,
    bass_drop_bars: memory.dropBars,
  };
}

function checkSweetness(settings, sectionMeta, events, stats, audit) {
  const totalTicks = Math.max(1, sectionMeta.reduce((sum, section) => sum + section.bars * section.barTicks, 0));
  const activeVoices = activeVoiceLayout(settings.voices);
  const byVoice = Object.fromEntries(activeVoices.map((voice) => [voice, events.filter((event) => event.voice === voice)]));
  const totalSoundingTicks = events.reduce((sum, event) => sum + event.duration, 0);
  const restSpace = clamp(1 - totalSoundingTicks / Math.max(1, totalTicks * activeVoices.length), 0, 1);
  const bassCoverage = byVoice.bass ? clamp(byVoice.bass.reduce((sum, event) => sum + event.duration, 0) / totalTicks, 0, 1) : 0;
  const leadEvents = events.filter((event) => event.phraseRole === "lead").length;
  const groove = stats.dubGrooveSummary || summarizeDubGroove(settings, events, makeDubBassMemory());
  const notes = [];
  let score = 88;

  if (restSpace > 0.18 && restSpace < 0.62) {
    score += 5;
    notes.push("Gemma says: the phrases have air around them, which is kind to the listener.");
  } else if (restSpace <= 0.18) {
    score -= 7;
    notes.push("Gemma says: this one is quite full; a little more silence could make the glow easier to hear.");
  } else {
    score -= 3;
    notes.push("Gemma says: this one is very spacious; the quiet is doing a lot of work.");
  }

  if (settings.dubMode) {
    if (groove.skank_touches > 0) {
      score += 4;
      notes.push("Gemma says: the offbeat touches are clipped and polite, with a little porch-rain swagger.");
    }
    if (groove.bass_pulses > 0) {
      score += 4;
      notes.push("Gemma says: the bass is pulsing instead of blocking the doorway.");
    }
    if (bassCoverage > 0.9) {
      score -= 4;
      notes.push("Gemma says: the bass is wonderfully present; one or two more gaps might make it even deeper.");
    } else if (bassCoverage < 0.32) {
      score -= 3;
      notes.push("Gemma says: the low end is very airy here; it may want one more warm root/fifth answer.");
    }
    if (groove.bass_memory_reused > 0) {
      score += 3;
      notes.push("Gemma says: the bass remembers itself, which helps the groove feel like home.");
    }
  }

  if (leadEvents > 0) {
    score += 3;
    notes.push("Gemma says: the voices are taking turns instead of all speaking at once.");
  }
  if (audit.summary.parallelPerfects > 0) {
    score -= settings.dubMode ? 1 : 4;
    notes.push("Gemma says: the checker heard a strong parallel moment and wrote it down gently.");
  }
  if (audit.summary.overlongSuspensions > 0) {
    score -= 3;
    notes.push("Gemma says: a held note lingered; the surrounding harmony still knows where home is.");
  }
  if (!notes.length) notes.push("Gemma says: balanced, calm, and ready to be listened to.");

  const finalScore = clamp(Math.round(score), 1, 100);
  return {
    affirming: true,
    score: finalScore,
    label: finalScore >= 90 ? "glowing" : finalScore >= 76 ? "settled" : finalScore >= 62 ? "interesting" : "wants a little air",
    metrics: {
      rest_space: Number(restSpace.toFixed(3)),
      bass_coverage: Number(bassCoverage.toFixed(3)),
      lead_events: leadEvents,
      groove_events: groove.groove_events,
    },
    notes: notes.slice(0, 6),
  };
}

function makeManifest(settings, sectionMeta, events, subject, stats, audit) {
  return {
    title: "amy_cin fishtail generator v0",
    seed: settings.seed,
    generated_at: new Date().toISOString(),
    original_code: true,
    ownership: {
      copyright: "Copyright (c) 2026 Amy McBride. All rights reserved.",
      artwork: "Artwork by Ocular Debris.",
      third_party: "Three.js is MIT licensed and acknowledged in CREDITS.md. This version was vibe coded with Codex, collaborating as Lambda Echo.",
      source: "https://github.com/amycin/amy-cin-fishtail",
      demo: "https://amycin.github.io/amy-cin-fishtail/",
    },
    generation_style: {
      id: settings.generationStyle,
      label: generationStyleLabel(settings.generationStyle),
      dub_gravity: settings.dubMode,
      dub_checker_note: settings.dubMode ? dubRelaxLine(settings.seed) : null,
    },
    complexity: stats.complexity,
    pedal_voices: settings.pedalVoices,
    suspension_control: {
      mode: "musical_gravity",
      expressive_exception_chance: 0.08,
      generation_summary: stats.suspensionStats,
      audit_summary: {
        checks: audit.summary.suspensionChecks,
        detected: audit.summary.suspensionsDetected,
        resolved: audit.summary.suspensionsResolved,
        overlong: audit.summary.overlongSuspensions,
        pedal_holds: audit.summary.pedalHolds,
      },
    },
    refrain: stats.refrainSummary,
    fugue: stats.fugueSummary || null,
    fallback_safety: {
      mode: "validated_fallbacks_no_unchecked_parallel_perfects",
      ...stats.fallbackStats,
    },
    dub_groove: stats.dubGrooveSummary,
    sweetness: stats.sweetness,
    intonation: {
      root_note: settings.rootNote,
      root_midi: settings.rootMidi,
      root_frequency_hz: settings.rootFreq,
      ratios_by_chromatic_slot: AMY_DUB_RATIOS.map(([ratio, value, gravity, role], offset) => ({ offset, ratio, value, gravity, role })),
    },
    output: {
      pitch_resolution: settings.resolution,
      tuning_mode_id: settings.outputMode,
      tuning_mode: outputModeLabel(settings.outputMode),
      note: "Amy Dub Intonation writes carrier keys for a retuner. Bend MIDI uses per-voice channel pitch bend.",
    },
    velocity_model: stats.velocitySummary,
    velocity_curve: stats.velocitySummary,
    fishtail_tempo: {
      formula: "BPM = 60 * referenceHz / n",
      reference_note: settings.referenceNote,
      reference_midi: settings.referenceMidi,
      reference_hz: settings.referenceHz,
      a4_anchor_hz: Number(settings.referenceAnchorA4Hz.toFixed(4)),
      divisor_n: settings.tempoDivisor,
      bpm: Number(settings.tempo.toFixed(4)),
      midi_tempo_map: settings.includeTempoMap,
    },
    reference_source: settings.referenceSource || {
      mode: "manual",
      audio_recorded: false,
      audio_uploaded: false,
    },
    tempo_lattice: {
      enabled: Boolean(settings.tempoLatticeEnabled),
      law: stats.tempoTimeline?.law || FishtailTempoLattice.DEFAULT_LAW,
      rational_amount: Number((settings.rationalSwing || 0).toFixed(4)),
      rational_swing: Number(FishtailTempoLattice.rationalSwingAmount(settings.rationalSwing || 0).toFixed(4)),
      irrational_amount: Number((settings.irrationalSwing || 0).toFixed(4)),
      tempo_event_count: stats.tempoTimeline?.tempoEvents?.length || 0,
      minimum_instantaneous_bpm: Number((stats.tempoTimeline?.minInstantaneousBpm || settings.tempo).toFixed(4)),
      maximum_instantaneous_bpm: Number((stats.tempoTimeline?.maxInstantaneousBpm || settings.tempo).toFixed(4)),
      duration_seconds: Number((stats.tempoTimeline?.totalSeconds || 0).toFixed(4)),
      bar_endpoints_preserved: stats.tempoTimeline?.barEndpointsPreserved !== false,
      note_groove_layer: settings.dubMode ? "dub_note_offsets_can_compound_with_conductor_lattice" : "grid_notes_only",
    },
    audio_reference: {
      probe: {
        model: FishtailTempoLattice.TEARDROP_MODEL,
        reference_hz: Number(settings.referenceHz.toFixed(4)),
        oscillator_budget: 12,
        oscillator_count: FishtailTempoLattice.buildTeardropVoiceTable(settings.referenceHz, 12).length,
        delta: FishtailTempoLattice.TEARDROP_DELTA,
        q: FishtailTempoLattice.TEARDROP_Q,
        p: FishtailTempoLattice.TEARDROP_P,
        glide_seconds: FishtailTempoLattice.TEARDROP_GLIDE_SECONDS,
        attack_seconds: FishtailTempoLattice.TEARDROP_ATTACK_SECONDS,
        release_seconds: FishtailTempoLattice.TEARDROP_RELEASE_SECONDS,
        muted_by_default: true,
      },
      ticker: {
        model: FishtailTempoLattice.TICKER_MODEL,
        frequency_multiplier: 8,
        frequency_range_hz: [400, 8000],
        rq: FishtailTempoLattice.TICKER_RQ,
        web_audio_q: Number(FishtailTempoLattice.TICKER_WEB_AUDIO_Q.toFixed(4)),
        duration_seconds: FishtailTempoLattice.TICKER_DECAY_SECONDS,
        filter_glide_seconds: FishtailTempoLattice.TICKER_FILTER_GLIDE_SECONDS,
      },
    },
    audio_stems: {
      requested: {
        probe: Boolean(settings.prepareProbeWav),
        ticker: Boolean(settings.prepareTickerWav),
      },
      rendered: {
        probe: false,
        ticker: false,
      },
      bit_depth: 24,
      channels: 1,
    },
    sections: sectionMeta,
    subject,
    stats,
    audit: {
      ok: audit.ok,
      fatal: audit.issues.length > 0,
      summary: audit.summary,
      issues: audit.issues,
      warnings: audit.warnings,
    },
    events: events.map((event) => ({
      tick: event.tick,
      duration: event.duration,
      voice: event.voice,
      midi: event.midi,
      carrier_midi: event.carrierMidi,
      symbolic_offset: event.symbolicOffset,
      symbolic: event.symbolic,
      resolved: event.resolved,
      ratio: event.ratioName,
      hz: Number(event.tunedFrequency.toFixed(4)),
      conceptual_ratio_hz: Number(event.conceptualRatioFrequency.toFixed(4)),
      exported_midi_hz: Number(event.exportedMidiFrequency.toFixed(4)),
      velocity: event.velocity,
      groove_role: event.grooveRole,
      groove_offset_ticks: event.grooveOffsetTicks,
      phrase_role: event.phraseRole,
    })),
  };
}

function makeReport(settings, sectionMeta, subject, events, stats, audit) {
  const lines = [];
  lines.push("AMY_CIN FISHTAIL GENERATOR v0");
  lines.push("");
  lines.push(`Seed: ${settings.seed}`);
  lines.push(`Style: ${generationStyleLabel(settings.generationStyle)}`);
  lines.push(`Dub Gravity: ${settings.dubMode ? "on" : "off"}`);
  lines.push(`Tempo: ${settings.tempo.toFixed(4)} BPM`);
  lines.push(`MIDI tempo map: ${settings.includeTempoMap ? "on" : "off"}`);
  if (stats.tempoTimeline) {
    lines.push(`Tempo lattice: ${settings.tempoLatticeEnabled ? "on" : "off"} | rational ${(settings.rationalSwing || 0).toFixed(2)} | irrational ${(settings.irrationalSwing || 0).toFixed(2)} | events ${stats.tempoTimeline.tempoEvents.length} | range ${stats.tempoTimeline.minInstantaneousBpm.toFixed(2)}-${stats.tempoTimeline.maxInstantaneousBpm.toFixed(2)} BPM | duration ${stats.tempoTimeline.totalSeconds.toFixed(2)} s`);
  }
  lines.push(`Reference pitch: ${settings.referenceNote} = ${settings.referenceHz.toFixed(4)} Hz`);
  if (settings.referenceSource?.mode === "live_input") {
    lines.push(`Living reference: captured ${settings.referenceSource.captured_hz.toFixed(4)} Hz, confidence ${(settings.referenceSource.confidence * 100).toFixed(0)}%, movement ±${settings.referenceSource.pitch_spread_cents.toFixed(1)} cents; audio recorded/uploaded: no/no.`);
  }
  lines.push(`Fishtail tempo: 60 * ${settings.referenceHz.toFixed(4)} / ${settings.tempoDivisor}`);
  lines.push(`Voices: ${settings.voices}`);
  if (stats.complexity) {
    const complexityLabel = stats.complexity.level === "comfortable" ? "comfortable" : stats.complexity.level === "long" ? "long-form" : "expansive long-form";
    lines.push(`Scale: ${stats.complexity.bars} bars, ${stats.complexity.sections} sections, ${stats.complexity.voice_pulses} voice-pulses (${complexityLabel}; no hard cap).`);
    if (stats.complexity.level !== "comfortable") {
      lines.push("Long-form note: Fishtail generated this intentionally, but smaller devices may need extra time for similar settings.");
    }
  }
  lines.push(`Pedal voices: ${Object.entries(settings.pedalVoices || {}).filter(([, enabled]) => enabled).map(([voice]) => voice).join(", ") || "none"}`);
  lines.push(`Pitch map: ${settings.resolution}`);
  lines.push(`Output: ${outputModeLabel(settings.outputMode)}`);
  lines.push(`Gravity Velocity: ${stats.velocitySummary?.label || "Calm Gravity"} ${settings.velocityProfile === "flat" ? "fixed at 100" : `range ${stats.velocitySummary?.stats?.min ?? 0}-${stats.velocitySummary?.stats?.max ?? 0}, linked to Fishtail tempo n=${settings.tempoDivisor}`}.`);
  if (settings.prepareProbeWav || settings.prepareTickerWav) {
    const requested = [settings.prepareProbeWav ? "probe" : "", settings.prepareTickerWav ? "ticker" : ""].filter(Boolean).join(", ");
    lines.push(`Audio stems requested: ${requested}; rendered after MIDI generation with mono 24-bit safety checks.`);
  }
  if (settings.outputMode === "bend") {
    lines.push(`Bend reference: ${settings.rootNote} = ${settings.rootFreq.toFixed(4)} Hz, derived from ${settings.referenceNote} at ${settings.referenceHz.toFixed(4)} Hz`);
  }
  lines.push("");
  lines.push("Form");
  sectionMeta.forEach((section, index) => {
    lines.push(`  ${index + 1}. ${section.bars} bars | ${section.key} ${MODES[section.mode].label} | ${section.meter} | ${CADENCES[section.cadence].label}`);
  });
  lines.push("");
  lines.push(`Subject offsets: ${subject.join(" ")}`);
  if (settings.generationStyle === "invention") {
    lines.push("Imitation/invention mode: source cells are reused as fragments, answers, octave shifts, and rhythmic handoffs.");
  }
  if (isFugueStyle(settings) && stats.fugueSummary?.enabled) {
    const fugue = stats.fugueSummary;
    lines.push("");
    lines.push("Fishtail Fugue map");
    lines.push(`  Formal Gravity: ${fugue.formal_gravity_mode}`);
    lines.push(`  Subject: ${fugue.subject.join(" ")}`);
    lines.push(`  Answer: ${fugue.answer.join(" ")}`);
    lines.push(`  Countersubject: ${fugue.countersubject.join(" ")}`);
    lines.push(`  Exposition entries completed: ${fugue.exposition_entries.length}/${settings.voices}`);
    lines.push(`  Middle entries: ${fugue.middle_entries}`);
    lines.push(`  Episodes: ${fugue.episodes}`);
    lines.push(`  Final returns: ${fugue.final_returns}`);
    if (fugue.repaired_form?.notes?.length) {
      lines.push("  Form shaping");
      fugue.repaired_form.notes.forEach((note) => lines.push(`    - ${note}`));
    }
    lines.push("  Section roles");
    fugue.sections.forEach((section) => {
      const entries = section.entries.map((entry) => `${entry.voice}:${entry.kind}@${entry.start_step}`).join(", ") || "episode fragments";
      lines.push(`    - ${section.section_index}. ${section.role} | ${entries}`);
    });
  }
  lines.push("");
  lines.push("Rule report");
  lines.push(`  Notes written: ${events.length}`);
  lines.push(`  Rests/breaths placed: ${stats.rests}`);
  lines.push(`  Tendency resolutions completed: ${stats.resolvedTendencies}`);
  lines.push(`  Parallel perfect candidates rejected: ${stats.avoidedParallels}`);
  lines.push(`  Fallback safety: ${stats.fallbackStats.validated} validated, ${stats.fallbackStats.relationOnly} relation-only, ${stats.fallbackStats.verticalRelaxed} vertical-colour, ${stats.fallbackStats.spacingRelaxed} spacing-colour, ${stats.fallbackStats.noParallelOnly} no-parallel emergency, ${stats.fallbackStats.emergencyRests} emergency rests.`);
  lines.push(`  Suspension gravity: ${stats.suspensionStats.detected} detected, ${stats.suspensionStats.resolved} resolved, ${stats.suspensionStats.overlongPrevented} overlong candidates prevented, ${stats.suspensionStats.pedalHolds} pedal holds allowed.`);
  if (!isFugueStyle(settings)) {
    lines.push("");
    lines.push("Refrain development");
    if (stats.refrainSummary.has_source) {
      lines.push(`  Source material: section ${stats.refrainSummary.source_section}, ${stats.refrainSummary.source_steps} grid steps.`);
      lines.push(`  Returns: ${stats.refrainSummary.returns}`);
      lines.push(`  Developments: ${stats.refrainSummary.developments}`);
      lines.push(`  Dubby treatments: ${stats.refrainSummary.dubby_treatments}`);
    } else {
      lines.push("  No refrain source marked in this form.");
    }
    if (stats.refrainSummary.fallbacks) lines.push(`  Development fallback sections without source: ${stats.refrainSummary.fallbacks}`);
  }
  lines.push("");
  lines.push("Output checker");
  lines.push(`  MIDI bytes: ${audit.summary.midiBytes}`);
  lines.push(`  Grid checks: ${audit.summary.gridChecks}`);
  lines.push(`  Strong-beat vertical checks: ${audit.summary.strongBeatChecks}`);
  lines.push(`  Velocity checks: ${audit.summary.velocityChecks}`);
  if (settings.dubMode) {
    lines.push(`  Dub groove events: ${audit.summary.dubGrooveEvents} (${audit.summary.dubSkankTouches} skank touches, ${audit.summary.dubBassPulses} bass pulses)`);
  }
  lines.push(`  Suspension checks: ${audit.summary.suspensionChecks}`);
  lines.push(`  Suspensions detected/resolved: ${audit.summary.suspensionsDetected}/${audit.summary.suspensionsResolved}`);
  lines.push(`  Overlong suspensions: ${audit.summary.overlongSuspensions}`);
  lines.push(`  Pedal holds: ${audit.summary.pedalHolds}`);
  lines.push(`  Status: ${audit.ok ? "passed" : "review notes below"}`);
  if (settings.dubMode) {
    lines.push(`  Dub checker: ${dubRelaxLine(settings.seed)}`);
  }
  if (audit.issues.length) {
    lines.push("  Issues");
    audit.issues.forEach((issue, index) => {
      lines.push(`    - ${issue}`);
      lines.push(`      ${checkerReassurance(settings.seed, index)}`);
    });
  }
  if (audit.warnings.length) {
    lines.push("  Warnings");
    audit.warnings.forEach((warning, index) => {
      lines.push(`    - ${warning}`);
      lines.push(`      ${checkerReassurance(settings.seed, audit.issues.length + index)}`);
    });
  }
  if (!audit.issues.length && !audit.warnings.length) {
    lines.push("  No timing, range, overlap, cadence, tendency, or parallel-perfect warnings found in the generated event stream.");
  }
  lines.push("");
  lines.push("Sweetness check");
  lines.push(`  Feel: ${stats.sweetness.label} (${stats.sweetness.score}/100)`);
  stats.sweetness.notes.forEach((note) => lines.push(`  ${note}`));
  if (settings.dubMode) {
    lines.push(`  Hidden DUB stroll: ${stats.dubGrooveSummary.groove_events} shaped notes, ${stats.dubGrooveSummary.bass_memory_reused} remembered bass cells, ${stats.dubGrooveSummary.bass_drop_bars} bass air windows.`);
  }
  lines.push("");
  lines.push("Harmonic minor behavior");
  lines.push("  Leading tone rises to tonic.");
  lines.push("");
  lines.push("Gravity melodic minor behavior");
  lines.push("  Leading tone rises to tonic.");
  lines.push("  Raised sixth lifts toward leading tone or tonic.");
  lines.push("  Flat seventh falls to raised sixth, flat sixth, or fifth.");
  lines.push("  Flat sixth falls to fifth.");
  lines.push("");
  lines.push("Credits");
  lines.push("  Generator code: original amy_cin fishtail generator implementation for Amy McBride.");
  lines.push("  Copyright (c) 2026 Amy McBride. All rights reserved.");
  lines.push("  Artwork by Ocular Debris.");
  lines.push("  This version was vibe coded with Codex, collaborating as Lambda Echo.");
  lines.push("  Three.js is MIT licensed and acknowledged in CREDITS.md.");
  lines.push("  See CREDITS.md for theory and software inspirations.");
  return lines.join("\n");
}

function dubRelaxLine(seed) {
  const text = String(seed || "dub");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return DUB_RELAX_LINES[Math.abs(hash) % DUB_RELAX_LINES.length];
}

function checkerReassurance(seed, index) {
  const text = `${seed || "checker"}:${index}`;
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(i)) | 0;
  }
  return CHECK_REASSURANCE_LINES[Math.abs(hash) % CHECK_REASSURANCE_LINES.length];
}

function checkGeneratedPiece(settings, sectionMeta, events, midiBytes, totalTicks, preflightIssues = []) {
  const issues = [];
  const warnings = [];
  const summary = {
    events: events.length,
    midiBytes: midiBytes.length,
    gridChecks: 0,
    strongBeatChecks: 0,
    parallelPerfects: 0,
    rangeChecks: 0,
    cadenceChecks: 0,
    tendencyChecks: 0,
    velocityChecks: 0,
    suspensionChecks: 0,
    suspensionsDetected: 0,
    suspensionsResolved: 0,
    overlongSuspensions: 0,
    pedalHolds: 0,
    refrainReturns: 0,
    refrainDevelopments: 0,
    dubbyRefrains: 0,
    dubGrooveEvents: 0,
    dubSkankTouches: 0,
    dubBassPulses: 0,
  };
  const activeVoices = activeVoiceLayout(settings.voices);
  const byVoice = Object.fromEntries(activeVoices.map((voice) => [voice, []]));
  const pushIssue = (message) => pushLimited(issues, message);
  const pushWarning = (message) => pushLimited(warnings, message);
  preflightIssues.forEach(pushIssue);
  summary.refrainReturns = sectionMeta.filter((section) => section.refrainPlan?.kind === "return").length;
  summary.refrainDevelopments = sectionMeta.filter((section) => section.refrainPlan?.kind === "development").length;
  summary.dubbyRefrains = sectionMeta.filter((section) => section.refrainPlan?.treatment === "dubby").length;

  if (midiBytes.length < 22) pushIssue("MIDI file is unexpectedly small.");
  if (String.fromCharCode(...midiBytes.slice(0, 4)) !== "MThd") {
    pushIssue("MIDI header chunk is missing.");
  } else {
    const headerLength = readUint32(midiBytes, 4);
    const format = readUint16(midiBytes, 8);
    const trackCount = readUint16(midiBytes, 10);
    const division = readUint16(midiBytes, 12);
    const expectedTracks = activeVoices.length + (settings.includeTempoMap ? 1 : 0);
    if (headerLength !== 6) pushIssue(`MIDI header length should be 6 bytes, got ${headerLength}.`);
    if (format !== 1) pushIssue(`MIDI format should be 1 for separate voice tracks, got ${format}.`);
    if (trackCount !== expectedTracks) pushIssue(`MIDI header track count should be ${expectedTracks}, got ${trackCount}.`);
    if (division !== PPQ) pushIssue(`MIDI time division should be ${PPQ} ticks per quarter, got ${division}.`);
    if (String.fromCharCode(...midiBytes.slice(14, 18)) !== "MTrk") pushIssue("First MIDI track chunk does not start immediately after the header.");
    if (settings.outputMode !== "bend") {
      const noteOnlyIssue = noteOnlyMidiIssue(midiBytes, { allowConductor: settings.includeTempoMap });
      if (noteOnlyIssue) pushIssue(noteOnlyIssue);
    }
  }
  if (!events.length) pushIssue("No note events were written.");
  const expectedTotalTicks = sectionMeta.reduce((sum, section) => sum + section.bars * section.barTicks, 0);
  if (expectedTotalTicks !== totalTicks) pushIssue(`Section duration mismatch: expected ${expectedTotalTicks} ticks, got ${totalTicks}.`);

  events.forEach((event) => {
    const voiceRange = VOICE_RANGES[event.voice];
    if (!byVoice[event.voice]) {
      pushIssue(`Unexpected voice ${event.voice}.`);
      return;
    }
    byVoice[event.voice].push(event);
    if (!Number.isInteger(event.tick) || event.tick < 0) pushIssue(`${event.voice} has invalid tick ${event.tick}.`);
    if (!Number.isInteger(event.duration) || event.duration <= 0) pushIssue(`${event.voice} has invalid duration ${event.duration}.`);
    if (event.tick + event.duration > totalTicks) pushIssue(`${event.voice} note starting at ${describeTickLocation(event.tick, sectionMeta, settings)} extends past the piece end.`);
    const offAuditGrid = event.tick % (PPQ / 4) !== 0 || event.duration % (PPQ / 4) !== 0;
    if (offAuditGrid && settings.dubMode && event.grooveRole) {
      summary.dubGrooveEvents += 1;
      if (event.grooveRole === "skank-touch") summary.dubSkankTouches += 1;
      if (event.grooveRole === "bass-pulse") summary.dubBassPulses += 1;
    } else if (offAuditGrid) {
      pushWarning(`${event.voice} note at ${describeTickLocation(event.tick, sectionMeta, settings)} is off the 16th-note audit grid.`);
    }
    if (event.midi < 0 || event.midi > 127) pushIssue(`${event.voice} outputs invalid MIDI note ${event.midi}.`);
    if (!Number.isInteger(event.velocity) || event.velocity < 1 || event.velocity > 127) {
      pushIssue(`${event.voice} has invalid velocity ${event.velocity} at ${describeTickLocation(event.tick, sectionMeta, settings)}.`);
    } else {
      summary.velocityChecks += 1;
    }
    const carrier = event.carrierMidi ?? event.midi;
    if (voiceRange && (carrier < voiceRange[0] || carrier > voiceRange[1])) {
      pushWarning(`${event.voice} carrier ${carrier} at ${describeTickLocation(event.tick, sectionMeta, settings)} is outside its intended range ${voiceRange[0]}-${voiceRange[1]}.`);
    }
    summary.rangeChecks += 1;
  });

  activeVoices.forEach((voice) => {
    const voiceEvents = byVoice[voice].sort((a, b) => a.tick - b.tick || b.duration - a.duration);
    for (let i = 1; i < voiceEvents.length; i += 1) {
      if (voiceEvents[i].tick < voiceEvents[i - 1].tick + voiceEvents[i - 1].duration) {
        pushIssue(`${voice} has overlapping notes around ${describeTickLocation(voiceEvents[i].tick, sectionMeta, settings)}.`);
      }
    }
  });

  auditSuspensionTimeline(settings, sectionMeta, byVoice, activeVoices, summary, pushWarning);

  sectionMeta.forEach((section) => {
    const mode = MODES[section.mode];
    const sectionEnd = section.startTick + section.bars * section.barTicks;
    const sampleTicks = [];
    const steps = section.bars * section.numerator;
    const pulse = section.barTicks / section.numerator;
    for (let step = 0; step < steps; step += 1) sampleTicks.push(section.startTick + step * pulse);

    const finalSnapshot = snapshotAtTick(byVoice, activeVoices, Math.max(section.startTick, sectionEnd - 1));
    const tonicPc = noteToPc(section.key);
    const finalOffsets = finalSnapshot.map((note) => note ? mod((note.carrierMidi ?? note.midi) - tonicPc, 12) : null).filter((offset) => offset != null);
    const finalStable = mode.stable.map((offset) => mod(offset, 12));
    summary.cadenceChecks += 1;
    if (!finalOffsets.includes(0)) pushWarning(`${section.key} ${mode.label} section does not end with a sounding tonic.`);
    const offCadence = finalOffsets.filter((offset) => !finalStable.includes(offset));
    if (offCadence.length) pushWarning(`${section.key} ${mode.label} final sonority includes non-chord offsets ${[...new Set(offCadence)].join(", ")}.`);

    let previousSnapshot = null;
    let previousTick = null;
    sampleTicks.forEach((tick, step) => {
      const snapshot = snapshotAtTick(byVoice, activeVoices, tick);
      summary.gridChecks += 1;
      const pulseInBar = step % section.numerator;
      const strong = pulseInBar === 0 || (METERS[section.meter]?.accents || []).includes(pulseInBar);
      const location = describeTickLocation(tick, sectionMeta, settings);
      if (strong) {
        summary.strongBeatChecks += 1;
        checkVerticalSnapshot(snapshot, activeVoices, strong, location, pushWarning);
      }
      if (previousSnapshot) {
        checkParallelSnapshot(previousSnapshot, snapshot, activeVoices, previousTick, tick, strong, sectionMeta, settings, summary, pushWarning);
      }
      previousSnapshot = snapshot;
      previousTick = tick;
    });

    activeVoices.forEach((voice) => {
      const voiceEvents = byVoice[voice].filter((event) => event.tick >= section.startTick && event.tick < sectionEnd);
      voiceEvents.forEach((event, index) => {
        const tendency = mode.tendencies?.[event.symbolicOffset];
        if (!tendency) return;
        summary.tendencyChecks += 1;
        const next = voiceEvents[index + 1];
        if (!next || next.tick >= sectionEnd) {
          pushWarning(`${voice} ${mode.label} tendency at ${describeTickLocation(event.tick, sectionMeta, settings)} has no following note before the section ends.`);
          return;
        }
        const directionOk = tendency.direction === "up" ? next.midi > event.midi : next.midi < event.midi;
        const offsetOk = tendency.targets.includes(next.symbolicOffset);
        if (!directionOk || !offsetOk) {
          pushWarning(`${voice} ${mode.label} tendency at ${describeTickLocation(event.tick, sectionMeta, settings)} resolves to ${next.symbolic}, expected ${tendency.label}.`);
        }
      });
    });
  });

  return {
    ok: issues.length === 0 && warnings.length === 0,
    issues,
    warnings,
    summary,
  };
}

function auditSuspensionTimeline(settings, sectionMeta, byVoice, activeVoices, summary, pushWarning) {
  sectionMeta.forEach((section) => {
    const mode = MODES[section.mode];
    const steps = section.bars * section.numerator;
    const pulse = section.barTicks / section.numerator;
    activeVoices.forEach((voice) => {
      let stateForVoice = makeHoldState();
      let warnedOverlong = false;
      for (let step = 0; step < steps; step += 1) {
        const tick = section.startTick + step * pulse;
        const note = snapshotAtTick(byVoice, [voice], tick)[0];
        if (!note) {
          stateForVoice = makeHoldState();
          warnedOverlong = false;
          continue;
        }
        const context = contextForSectionStep(section, mode, step, settings, voice);
        const offset = mod((note.carrierMidi ?? note.midi) - noteToPc(section.key), 12);
        const chordValid = isChordOffset(offset, context);
        const chordKey = chordKeyForContext(context);
        const samePitch = stateForVoice.midi === (note.carrierMidi ?? note.midi);
        summary.suspensionChecks += 1;

        if (!samePitch) {
          if (stateForVoice.suspendedSince != null && Math.abs((note.carrierMidi ?? note.midi) - stateForVoice.midi) <= 2 && chordValid) {
            summary.suspensionsResolved += 1;
          }
          stateForVoice = {
            midi: note.carrierMidi ?? note.midi,
            symbolicOffset: offset,
            startedStep: step,
            suspendedSince: null,
            lastChordKey: chordKey,
            lastChordValid: chordValid,
            countedSuspension: false,
          };
          warnedOverlong = false;
          continue;
        }

        if (stateForVoice.lastChordKey !== chordKey && stateForVoice.lastChordValid && !chordValid) {
          stateForVoice.suspendedSince = stateForVoice.suspendedSince ?? step;
          if (!stateForVoice.countedSuspension) {
            summary.suspensionsDetected += 1;
            stateForVoice.countedSuspension = true;
          }
        }

        const holdBars = (step - stateForVoice.startedStep + 1) / section.numerator;
        const suspensionBars = stateForVoice.suspendedSince == null ? 0 : (step - stateForVoice.suspendedSince + 1) / section.numerator;
        const pedalAllowed = settings.pedalVoices?.[voice] && isPedalOffset(offset);
        if (pedalAllowed && holdBars > 2) summary.pedalHolds += 1;
        const overlongSuspension = stateForVoice.suspendedSince != null && suspensionBars > suspensionLimitBars(voice) && !pedalAllowed;
        const overlongTie = holdBars > 2 && !chordValid && !pedalAllowed;
        if ((overlongSuspension || overlongTie) && !warnedOverlong) {
          summary.overlongSuspensions += 1;
          pushWarning(`${voice} held ${midiName(note.carrierMidi ?? note.midi)} too long as a non-chord suspension around ${describeTickLocation(tick, sectionMeta, settings)}.`);
          warnedOverlong = true;
        }

        stateForVoice.symbolicOffset = offset;
        stateForVoice.lastChordKey = chordKey;
        stateForVoice.lastChordValid = chordValid;
      }
    });
  });
}

function contextForSectionStep(section, mode, step, settings, voice) {
  const meter = METERS[section.meter];
  const steps = section.bars * section.numerator;
  return {
    section,
    mode,
    meter,
    step,
    cadenceStage: getCadenceStage(step, steps, section.numerator),
    voice,
    settings,
  };
}

function readUint16(bytes, offset) {
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

function readUint32(bytes, offset) {
  return ((bytes[offset] ?? 0) * 0x1000000) + (((bytes[offset + 1] ?? 0) << 16) | ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0));
}

function noteOnlyMidiIssue(bytes, options = {}) {
  const allowConductor = Boolean(options.allowConductor);
  const trackCount = readUint16(bytes, 10);
  let offset = 14;
  for (let track = 0; track < trackCount; track += 1) {
    const conductorTrack = allowConductor && track === 0;
    if (String.fromCharCode(...bytes.slice(offset, offset + 4)) !== "MTrk") return `MIDI track ${track + 1} is missing its MTrk header.`;
    const trackLength = readUint32(bytes, offset + 4);
    offset += 8;
    const trackEnd = offset + trackLength;
    let runningStatus = null;
    while (offset < trackEnd) {
      const delta = readVarLen(bytes, offset);
      offset = delta.next;
      let status = bytes[offset];
      if (status < 0x80) {
        if (runningStatus == null) return `MIDI track ${track + 1} uses running status before any status byte.`;
        status = runningStatus;
      } else {
        offset += 1;
        if (status < 0xf0) runningStatus = status;
      }

      if (status === 0xff) {
        const type = bytes[offset];
        offset += 1;
        const length = readVarLen(bytes, offset);
        offset = length.next + length.value;
        if (conductorTrack && (type === 0x51 || type === 0x58)) continue;
        if (type !== 0x2f) return `MIDI track ${track + 1} contains meta event 0x${type.toString(16)}; note-only exports should contain notes only.`;
        continue;
      }
      if (status === 0xf0 || status === 0xf7) return `MIDI track ${track + 1} contains SysEx data; note-only exports should contain notes only.`;

      const eventType = status & 0xf0;
      const dataBytes = eventType === 0xc0 || eventType === 0xd0 ? 1 : 2;
      offset += dataBytes;
      if (conductorTrack) {
        return "MIDI conductor track contains MIDI note/controller data; it should contain tempo and time-signature metadata only.";
      }
      if (eventType !== 0x80 && eventType !== 0x90) {
        return `MIDI track ${track + 1} contains MIDI event 0x${eventType.toString(16)}; note-only exports should contain note on/off only.`;
      }
    }
  }
  if (offset !== bytes.length) return "MIDI file has unexpected trailing bytes after the declared tracks.";
  return "";
}

function readVarLen(bytes, offset) {
  let value = 0;
  let current = 0;
  do {
    current = bytes[offset] ?? 0;
    value = (value << 7) | (current & 0x7f);
    offset += 1;
  } while (current & 0x80);
  return { value, next: offset };
}

function describeTickLocation(tick, sectionMeta, settings) {
  const info = locateTick(tick, sectionMeta);
  const time = formatTickTime(tick, settings);
  if (!info.section) return `time ${time}`;
  const mode = MODES[info.section.mode]?.label || info.section.mode;
  return `section ${info.sectionNumber} (${info.section.key} ${mode}), bar ${info.barNumber}/${info.section.bars}, beat ${info.beatLabel}, time ${time}`;
}

function locateTick(tick, sectionMeta) {
  if (!sectionMeta.length || !Number.isFinite(tick)) return { section: null };
  const safeTick = Math.max(0, tick);
  let sectionIndex = sectionMeta.findIndex((section, index) => {
    const sectionEnd = section.startTick + section.bars * section.barTicks;
    const isLast = index === sectionMeta.length - 1;
    return safeTick >= section.startTick && (safeTick < sectionEnd || (isLast && safeTick <= sectionEnd));
  });
  if (sectionIndex === -1) sectionIndex = safeTick < sectionMeta[0].startTick ? 0 : sectionMeta.length - 1;

  const section = sectionMeta[sectionIndex];
  const sectionTicks = section.bars * section.barTicks;
  const localTick = clamp(safeTick - section.startTick, 0, Math.max(0, sectionTicks - 1));
  const barNumber = Math.floor(localTick / section.barTicks) + 1;
  const barTick = localTick % section.barTicks;
  const pulseTicks = section.barTicks / section.numerator;
  const beat = barTick / pulseTicks + 1;

  return {
    section,
    sectionNumber: sectionIndex + 1,
    barNumber,
    beatLabel: formatBeat(beat),
  };
}

function formatTickTime(tick, settings) {
  const seconds = Math.max(0, tick) / PPQ * (60 / settings.tempo);
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds - minutes * 60;
  return `${minutes}:${remaining.toFixed(2).padStart(5, "0")}`;
}

function formatBeat(beat) {
  if (Math.abs(beat - Math.round(beat)) < 0.001) return String(Math.round(beat));
  return beat.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function snapshotAtTick(byVoice, activeVoices, tick) {
  return activeVoices.map((voice) => {
    const event = byVoice[voice].find((candidate) => candidate.tick <= tick && candidate.tick + candidate.duration > tick);
    return event ? { ...event, voice } : null;
  });
}

function checkVerticalSnapshot(snapshot, activeVoices, strong, location, pushWarning) {
  for (let i = 0; i < snapshot.length; i += 1) {
    for (let j = i + 1; j < snapshot.length; j += 1) {
      const lower = snapshot[i];
      const upper = snapshot[j];
      if (!lower || !upper) continue;
      if ((lower.carrierMidi ?? lower.midi) >= (upper.carrierMidi ?? upper.midi)) {
        pushWarning(`Voice crossing between ${activeVoices[i]} and ${activeVoices[j]} at ${location}.`);
      }
      const interval = mod((upper.carrierMidi ?? upper.midi) - (lower.carrierMidi ?? lower.midi), 12);
      if (strong && !isVerticalConsonance(interval, activeVoices[i] === "bass")) {
        pushWarning(`Dissonant strong-beat interval ${interval} between ${activeVoices[i]} and ${activeVoices[j]} at ${location}.`);
      }
    }
  }
}

function checkParallelSnapshot(previous, current, activeVoices, previousTick, tick, strong, sectionMeta, settings, summary, pushWarning) {
  for (let i = 0; i < current.length; i += 1) {
    for (let j = i + 1; j < current.length; j += 1) {
      const prevA = previous[i];
      const prevB = previous[j];
      const nowA = current[i];
      const nowB = current[j];
      if (!prevA || !prevB || !nowA || !nowB) continue;
      const motion = classifyParallelPerfectMotion({
        previousLower: prevA.carrierMidi ?? prevA.midi,
        previousUpper: prevB.carrierMidi ?? prevB.midi,
        currentLower: nowA.carrierMidi ?? nowA.midi,
        currentUpper: nowB.carrierMidi ?? nowB.midi,
        strong,
      });
      if (motion) {
        summary.parallelPerfects += 1;
        const label = motion.type === "direct-perfect" ? "Direct perfect motion" : "Parallel perfect motion";
        pushWarning(`${label} between ${activeVoices[i]} and ${activeVoices[j]} from ${describeTickLocation(previousTick, sectionMeta, settings)} to ${describeTickLocation(tick, sectionMeta, settings)}.`);
      }
    }
  }
}

function pushLimited(list, message, limit = 12) {
  if (list.length < limit && !list.includes(message)) list.push(message);
}

function downloadLast(kind) {
  if (!state.lastPiece) return;
  if (kind === "midi") {
    if (state.lastPiece.audit?.issues?.length) {
      els.statusLabel.textContent = "MIDI blocked by checker";
      return;
    }
    saveMidiPiece(state.lastPiece);
    els.statusLabel.textContent = "MIDI save requested";
  } else if (kind === "json") {
    downloadBlob(new Blob([JSON.stringify(state.lastPiece.manifest, null, 2)], { type: "application/json" }), "amy-cin-fishtail-generator.json");
    els.statusLabel.textContent = "Settings save requested";
  } else if (kind === "probeWav") {
    downloadAudioExport("probe");
  } else if (kind === "tickerWav") {
    downloadAudioExport("ticker");
  } else {
    downloadBlob(new Blob([state.lastPiece.report], { type: "text/plain" }), "amy-cin-fishtail-generation-notes.txt");
    els.statusLabel.textContent = "Notes save requested";
  }
}

function releaseAudioExports() {
  state.lastAudioExports.probe = null;
  state.lastAudioExports.ticker = null;
}

function updateAudioExportButtons() {
  if (els.downloadProbeWavButton) els.downloadProbeWavButton.disabled = !state.lastAudioExports.probe?.blob;
  if (els.downloadTickerWavButton) els.downloadTickerWavButton.disabled = !state.lastAudioExports.ticker?.blob;
}

async function prepareRequestedAudioExports(piece) {
  const requested = [];
  if (piece.settings.prepareProbeWav) requested.push(["probe", FishtailWavExport.renderProbeWav]);
  if (piece.settings.prepareTickerWav) requested.push(["ticker", FishtailWavExport.renderTickerWav]);
  if (!requested.length) return;

  const rendered = [];
  const failed = [];
  piece.manifest.audio_stems = piece.manifest.audio_stems || { requested: {}, rendered: {}, bit_depth: 24, channels: 1 };
  piece.manifest.audio_stems.errors = [];

  for (const [kind, renderer] of requested) {
    try {
      els.statusLabel.textContent = `Rendering ${kind} WAV`;
      document.body.dataset.audioRendering = kind;
      const audioExport = await renderer(piece);
      state.lastAudioExports[kind] = audioExport;
      recordAudioExport(piece, audioExport);
      rendered.push(`${kind} ${audioExport.sampleRate / 1000} kHz`);
      updateAudioExportButtons();
    } catch (error) {
      const message = `${kind} WAV skipped: ${error.message}`;
      failed.push(message);
      piece.manifest.audio_stems.errors.push(message);
      console.warn(message, error);
    } finally {
      document.body.dataset.audioRendering = "";
    }
  }

  const lines = [];
  if (rendered.length) lines.push(`Rendered WAV stems: ${rendered.join(", ")}.`);
  failed.forEach((message) => lines.push(message));
  if (lines.length) {
    piece.report = `${piece.report}\n\nAudio stems\n  ${lines.join("\n  ")}`;
    els.reportOutput.textContent = piece.report;
  }
  els.statusLabel.textContent = rendered.length ? "WAV ready" : "MIDI saved";
}

function recordAudioExport(piece, audioExport) {
  const kind = audioExport.kind;
  piece.manifest.audio_stems.rendered[kind] = true;
  piece.manifest.audio_stems[kind] = {
    filename: audioExport.filename,
    sample_rate_hz: audioExport.sampleRate,
    bit_depth: audioExport.bitDepth,
    channels: 1,
    duration_seconds: Number(audioExport.durationSeconds.toFixed(4)),
    piece_seconds: Number(audioExport.pieceSeconds.toFixed(4)),
    fallback_sample_rate: Boolean(audioExport.fallbackSampleRate),
  };
}

function downloadAudioExport(kind) {
  const audioExport = state.lastAudioExports[kind];
  if (!audioExport?.blob) {
    els.statusLabel.textContent = `${kind} WAV not ready`;
    return;
  }
  downloadBlob(audioExport.blob, audioExport.filename);
  els.statusLabel.textContent = `${kind} WAV save requested`;
}

function toggleNotes() {
  const isHidden = els.notesPanel.hidden;
  els.notesPanel.hidden = !isHidden;
  els.toggleNotesButton.textContent = isHidden ? "Hide Notes" : "Show Notes";
}

function openHelp() {
  els.creditsModal.hidden = true;
  els.helpModal.hidden = false;
  els.closeHelpButton.focus();
}

function closeHelp() {
  els.helpModal.hidden = true;
  els.helpButton.focus();
}

function openCredits() {
  els.helpModal.hidden = true;
  els.creditsModal.hidden = false;
  els.closeCreditsButton.focus();
}

function closeCredits() {
  els.creditsModal.hidden = true;
  els.creditsButton.focus();
}

function saveMidiPiece(piece) {
  const seed = piece.settings.seed.slice(0, 8);
  const style = generationStyleSlug(piece.settings.generationStyle);
  const tempo = tempoFilenameSlug(piece.settings.tempo);
  downloadBlob(new Blob([piece.midiBytes], { type: "audio/midi" }), `amy-cin-fishtail-${style}-${tempo}-${seed}.mid`);
}

function tempoFilenameSlug(bpm) {
  const tempo = Number.isFinite(Number(bpm)) ? Number(bpm) : 72;
  return `${tempo.toFixed(4).replace(".", "p")}bpm`;
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function outputModeLabel(mode) {
  if (mode === "retuner") return "Amy Dub Intonation";
  if (mode === "equal") return "Equal Temperament";
  if (mode === "bend") return "Bend MIDI";
  return mode;
}

function generationStyleLabel(style) {
  if (style === "invention") return "Imitation + Invention";
  if (style === FUGUE_STYLE_ID) return "Fishtail Fugue";
  return "Counterpoint";
}

function generationStyleSlug(style) {
  if (style === "invention") return "invention";
  if (style === FUGUE_STYLE_ID) return "fugue";
  return "counterpoint";
}

function isDubModeVisual() {
  return Boolean(els.dubModeInput?.checked);
}

function torusPalette(dubVisual = isDubModeVisual()) {
  if (dubVisual) {
    return {
      torus: 0x36ff78,
      torusActive: 0xc7ff6a,
      negative: 0x00ffc8,
      web: 0x78ff9a,
      markerA: 0x39ff88,
      markerB: 0xb7ff4d,
    };
  }
  return {
    torus: 0x29a9c7,
    torusActive: 0xc7357f,
    negative: 0xc7357f,
    web: 0xc7357f,
    markerA: 0x35a2b8,
    markerB: 0xd72e7f,
  };
}

function makeWormholeLineGeometry(THREE, uSegments, vSegments) {
  const lineCount = uSegments * vSegments * 2;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(lineCount * 2 * 3), 3));
  geometry.userData.uSegments = uSegments;
  geometry.userData.vSegments = vSegments;
  return geometry;
}

async function initTorusCore() {
  if (!els.torusHost || torusCore.loading || torusCore.ready) return;
  torusCore.loading = true;
  try {
    const THREE = await import(THREE_MODULE_URL);
    torusCore.THREE = THREE;
    const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.domElement.setAttribute("aria-hidden", "true");
    els.torusHost.append(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    camera.position.set(0, 0, 6.2);

    const group = new THREE.Group();
    scene.add(group);
    scene.add(new THREE.AmbientLight(0xeaffff, 1.35));

    const keyLight = new THREE.DirectionalLight(0xf7ffff, 1.2);
    keyLight.position.set(2.5, 3.2, 4.8);
    scene.add(keyLight);

    const rimLight = new THREE.PointLight(0x35a2b8, 2.1, 8);
    rimLight.position.set(-2.2, -1.4, 3.2);
    scene.add(rimLight);

    const torusGeometry = makeWormholeLineGeometry(THREE, WORMHOLE_U_SEGMENTS, WORMHOLE_V_SEGMENTS);
    const torusMaterial = new THREE.LineBasicMaterial({
      color: 0x29a9c7,
      transparent: true,
      opacity: 0.36,
      depthTest: false,
      depthWrite: false,
    });
    torusCore.torus = new THREE.LineSegments(torusGeometry, torusMaterial);
    torusCore.torus.renderOrder = 2;
    group.add(torusCore.torus);

    const negativeGeometry = makeWormholeLineGeometry(THREE, WORMHOLE_U_SEGMENTS, WORMHOLE_V_SEGMENTS);
    torusCore.negativeWire = new THREE.LineSegments(
      negativeGeometry,
      new THREE.LineBasicMaterial({
        color: 0xc7357f,
        transparent: true,
        opacity: 0,
        depthTest: false,
        depthWrite: false,
      }),
    );
    torusCore.negativeWire.renderOrder = 1;
    group.add(torusCore.negativeWire);

    const markerGeometry = new THREE.SphereGeometry(0.08, 20, 14);
    for (let slot = 0; slot < 12; slot += 1) {
      const material = new THREE.MeshStandardMaterial({
        color: ratioColorHex(slot),
        emissive: ratioColorHex(slot),
        emissiveIntensity: 0.24,
        roughness: 0.22,
        metalness: 0.02,
        transparent: true,
        opacity: 0.86,
      });
      const marker = new THREE.Mesh(markerGeometry, material);
      marker.userData.slot = slot;
      marker.renderOrder = 5;
      group.add(marker);
      torusCore.ratioMarkers.push(marker);
    }

    const loopGeometry = new THREE.BufferGeometry();
    loopGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(12 * 3), 3));
    torusCore.ratioLoop = new THREE.LineLoop(
      loopGeometry,
      new THREE.LineBasicMaterial({
        color: 0xc7357f,
        transparent: true,
        opacity: 0.76,
        depthTest: false,
        depthWrite: false,
      }),
    );
    torusCore.ratioLoop.renderOrder = 4;
    group.add(torusCore.ratioLoop);

    const webGeometry = new THREE.BufferGeometry();
    webGeometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(12 * 2 * 3), 3));
    torusCore.ratioWeb = new THREE.LineSegments(
      webGeometry,
      new THREE.LineBasicMaterial({
        color: 0xc7357f,
        transparent: true,
        opacity: 0.64,
        depthTest: false,
        depthWrite: false,
      }),
    );
    torusCore.ratioWeb.renderOrder = 6;
    group.add(torusCore.ratioWeb);

    torusCore.renderer = renderer;
    torusCore.scene = scene;
    torusCore.camera = camera;
    torusCore.group = group;
    torusCore.ready = true;
    torusCore.loading = false;
    state.bootGlitchUntil = Date.now() + 1800;
    refreshTorusTuning();
    requestCoreFrame(true);
  } catch (error) {
    torusCore.loading = false;
    torusCore.failed = true;
    console.warn("Three.js torus visualisation unavailable; using canvas fallback.", error);
  }
}

function disposeTorusCore() {
  cancelCoreFrame();
  if (torusCore.scene) {
    torusCore.scene.traverse((object) => {
      if (object.geometry && typeof object.geometry.dispose === "function") object.geometry.dispose();
      if (object.material) {
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          if (material && typeof material.dispose === "function") material.dispose();
        });
      }
    });
  }
  if (torusCore.renderer) {
    const canvas = torusCore.renderer.domElement;
    if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
    torusCore.renderer.dispose();
  }
  torusCore.loading = false;
  torusCore.ready = false;
  torusCore.failed = false;
  torusCore.renderer = null;
  torusCore.scene = null;
  torusCore.camera = null;
  torusCore.group = null;
  torusCore.torus = null;
  torusCore.negativeWire = null;
  torusCore.ratioLoop = null;
  torusCore.ratioWeb = null;
  torusCore.ratioMarkers = [];
}

function updateTorusSize(width, height) {
  if (!torusCore.ready) return;
  const renderer = torusCore.renderer;
  const camera = torusCore.camera;
  const pixelRatio = currentVisualPixelRatio();
  if (typeof renderer.getPixelRatio === "function" && Math.abs(renderer.getPixelRatio() - pixelRatio) > 0.01) {
    renderer.setPixelRatio(pixelRatio);
  }
  const pixelWidth = Math.max(1, Math.round(width));
  const pixelHeight = Math.max(1, Math.round(height));
  const canvas = renderer.domElement;
  if (canvas.width !== Math.round(pixelWidth * renderer.getPixelRatio()) || canvas.height !== Math.round(pixelHeight * renderer.getPixelRatio())) {
    renderer.setSize(pixelWidth, pixelHeight, false);
    camera.aspect = pixelWidth / pixelHeight;
    camera.updateProjectionMatrix();
  }
}

function refreshTorusTuning() {
  if (!torusCore.ready) return;
  const THREE = torusCore.THREE;
  const ringRadius = 1.18;
  const markerRadius = 0.72;
  torusCore.lastOutputMode = els.outputModeInput?.value;
  torusCore.ratioMarkers.forEach((marker) => {
    const slot = marker.userData.slot;
    const angle = tuningAngleForSlot(slot) - Math.PI / 2;
    const z = Math.sin(slot * 1.37) * 0.08;
    marker.position.set(
      Math.cos(angle) * (ringRadius + markerRadius),
      Math.sin(angle) * (ringRadius + markerRadius),
      z,
    );
    marker.userData.basePosition = new THREE.Vector3(marker.position.x, marker.position.y, z);
    marker.userData.baseAngle = angle;
  });
  updateRatioConnectorGeometry();
}

function renderTorusFrame(width, height, phase) {
  if (!torusCore.ready) return;
  updateTorusSize(width, height);
  if (torusCore.lastOutputMode !== els.outputModeInput?.value) refreshTorusTuning();

  const now = Date.now();
  const palette = torusPalette();
  const eco = visualEcoActive(now);
  const activeBoost = getGenerateEnvelope(now);
  const bootGlitch = Math.max(0, (state.bootGlitchUntil - now) / 2400);
  const stressGlitch = visualGlitchEnvelope(now);
  const glitch = Math.max(bootGlitch, stressGlitch);
  const reducedIdle = state.reducedMotion && activeBoost <= 0.02 && glitch <= 0.02;
  const motionAge = now - state.motionLastAt;
  const motionPresence = reducedIdle ? 0 : clamp(1 - motionAge / 3200, 0, 1);
  const tiltEase = reducedIdle ? 0.02 : 0.045;
  state.motionTiltX += (state.motionTargetX * motionPresence - state.motionTiltX) * tiltEase;
  state.motionTiltY += (state.motionTargetY * motionPresence - state.motionTiltY) * tiltEase;
  const time = phase * 0.026;
  const wormholePhase = reducedIdle ? 0 : wormholeLoopPhase(now);
  const negativeSpaceOpacity = smoothstep(0.25, 0.75, wormholePhase);
  const focusZoom = smoothstep(0.18, 0.82, wormholePhase);
  const idleLevel = Math.max(0, 1 - Math.max(activeBoost, glitch));
  const idleBreath = idleLevel * (0.5 + Math.sin(time * 0.36) * 0.5);
  const pulse = activeBoost * (0.5 + Math.sin(time * 1.75) * 0.5) + glitch * (0.45 + Math.sin(time * 5.8) * 0.18) + idleBreath * 0.18;
  const twitch = glitch ? Math.sin(time * 19.5) * glitch * (stressGlitch > 0 ? 0.028 : 0.012) : 0;

  state.wormholePhase = wormholePhase;
  state.negativeSpaceOpacity = negativeSpaceOpacity;
  state.focusZoom = focusZoom;
  state.animationVisualLevel = Math.max(activeBoost, glitch, negativeSpaceOpacity * 0.35);
  updateWormholeGeometry(torusCore.torus, wormholePhase, time, false);
  if (torusCore.negativeWire) {
    torusCore.negativeWire.visible = !eco || activeBoost > 0.18 || glitch > 0.2 || negativeSpaceOpacity > 0.68;
    if (torusCore.negativeWire.visible) updateWormholeGeometry(torusCore.negativeWire, wormholePhase, time, true);
  }
  updateFocusCamera(focusZoom, activeBoost);

  torusCore.group.scale.set(
    1.03 - wormholePhase * 0.06 + pulse * 0.035,
    0.68 - wormholePhase * 0.08 + pulse * 0.025,
    0.92 + wormholePhase * 0.18,
  );
  torusCore.group.rotation.x = 0.11 + idleLevel * Math.sin(time * 0.28) * 0.032 + activeBoost * Math.sin(time * 0.56) * 0.035 + state.motionTiltY * 0.1 + twitch;
  torusCore.group.rotation.y = idleLevel * Math.sin(time * 0.22) * 0.05 + activeBoost * Math.sin(time * 0.48) * 0.055 + state.motionTiltX * 0.13 + twitch * 0.8;
  torusCore.group.rotation.z = idleLevel * Math.sin(time * 0.18) * 0.04 + activeBoost * Math.sin(time * 0.72) * 0.065 + state.motionTiltX * 0.05 + twitch * 1.6;
  torusCore.torus.rotation.z = idleLevel * Math.sin(time * 0.34) * 0.08 + activeBoost * Math.sin(time * 0.95) * 0.14 + glitch * Math.sin(time * 8.2) * 0.035;
  torusCore.torus.material.opacity = 0.26 + idleBreath * 0.07 + negativeSpaceOpacity * 0.08 + activeBoost * 0.22 + glitch * 0.16;
  torusCore.torus.material.color.setHex((activeBoost > 0.28 || glitch > 0.08) ? palette.torusActive : palette.torus);
  if (torusCore.negativeWire) {
    torusCore.negativeWire.rotation.copy(torusCore.torus.rotation);
    torusCore.negativeWire.material.opacity = eco && !torusCore.negativeWire.visible ? 0 : negativeSpaceOpacity * 0.22 + activeBoost * 0.08 + glitch * 0.06;
    torusCore.negativeWire.material.color.setHex(palette.negative);
  }
  const scaffoldFocus = 1 - focusZoom * 0.46;
  torusCore.ratioLoop.visible = true;
  torusCore.ratioWeb.visible = !eco || activeBoost > 0.42 || glitch > 0.3;
  torusCore.ratioLoop.material.opacity = (0.34 + activeBoost * 0.24 + glitch * 0.18 + negativeSpaceOpacity * 0.08) * scaffoldFocus * (eco ? 0.45 : 1);
  torusCore.ratioWeb.material.opacity = torusCore.ratioWeb.visible ? (0.26 + activeBoost * 0.26 + glitch * 0.18 + negativeSpaceOpacity * 0.08) * scaffoldFocus : 0;
  torusCore.ratioLoop.material.color.setHex(palette.web);
  torusCore.ratioWeb.material.color.setHex(palette.web);

  torusCore.ratioMarkers.forEach((marker) => {
    const base = marker.userData.basePosition;
    const slot = marker.userData.slot;
    const angle = marker.userData.baseAngle;
    marker.visible = !eco || slot % 3 === 0 || activeBoost > 0.36 || glitch > 0.2;
    const gravityWave = Math.sin(phase * (activeBoost > 0.02 ? 0.036 : 0.014) + slot * 0.86) * (idleLevel * 0.026 + (activeBoost || glitch > 0 ? 0.08 + pulse * 0.18 : 0));
    const rimFold = smoothstep(0.18, 0.86, wormholePhase);
    const vortex = rimFold * Math.sin(slot * 1.7 + time * 0.42) * 0.08;
    marker.position.set(
      base.x * (1 - rimFold * 0.08) + Math.cos(angle) * vortex,
      base.y * (1 - rimFold * 0.08) + Math.sin(angle) * vortex,
      base.z + gravityWave + rimFold * Math.sin(slot * 1.21 + time * 0.38) * 0.16,
    );
    marker.scale.setScalar(1 + idleLevel * Math.max(0, Math.sin(phase * 0.016 + slot)) * 0.06 + Math.max(activeBoost, glitch) * Math.max(0, Math.sin(phase * 0.04 + slot)) * 0.18 - rimFold * 0.08);
    marker.material.opacity = (0.86 - focusZoom * 0.34 + activeBoost * 0.08) * (eco && slot % 3 !== 0 ? 0.3 : 1);
    const markerColor = ratioColorHex(slot, isDubModeVisual());
    marker.material.color.setHex(markerColor);
    marker.material.emissive.setHex(markerColor);
  });
  if (!eco || activeBoost > 0.35 || glitch > 0.24) updateRatioConnectorGeometry();

  torusCore.renderer.render(torusCore.scene, torusCore.camera);
}

function wormholeLoopPhase(now) {
  const t = ((now - state.wormholeStartedAt) % WORMHOLE_CYCLE_MS) / WORMHOLE_CYCLE_MS;
  return 0.5 - 0.5 * Math.cos(Math.PI * 2 * t);
}

function updateFocusCamera(focusZoom, activeBoost) {
  if (!torusCore.camera) return;
  const camera = torusCore.camera;
  const zoomEase = smoothstep(0, 1, focusZoom);
  const activeNudge = activeBoost * 0.28;
  const nextZ = mix(6.2, 4.68, zoomEase) - activeNudge;
  const nextFov = mix(42, 35, zoomEase);
  camera.position.z += (nextZ - camera.position.z) * 0.045;
  camera.fov += (nextFov - camera.fov) * 0.045;
  camera.updateProjectionMatrix();
}

function updateWormholeGeometry(lineObject, morphPhase, time, negativeLayer) {
  const geometry = lineObject.geometry;
  const positions = geometry.attributes.position.array;
  const uSegments = geometry.userData.uSegments;
  const vSegments = geometry.userData.vSegments;
  let cursor = 0;

  for (let u = 0; u < uSegments; u += 1) {
    for (let v = 0; v < vSegments; v += 1) {
      cursor = writeWormholePoint(positions, cursor, u, v, uSegments, vSegments, morphPhase, time, negativeLayer);
      cursor = writeWormholePoint(positions, cursor, u + 1, v, uSegments, vSegments, morphPhase, time, negativeLayer);
      cursor = writeWormholePoint(positions, cursor, u, v, uSegments, vSegments, morphPhase, time, negativeLayer);
      cursor = writeWormholePoint(positions, cursor, u, v + 1, uSegments, vSegments, morphPhase, time, negativeLayer);
    }
  }

  geometry.attributes.position.needsUpdate = true;
}

function writeWormholePoint(positions, cursor, uIndex, vIndex, uSegments, vSegments, morphPhase, time, negativeLayer) {
  const u = (mod(uIndex, uSegments) / uSegments) * Math.PI * 2;
  const v = (mod(vIndex, vSegments) / vSegments) * Math.PI * 2;
  const cosU = Math.cos(u);
  const sinU = Math.sin(u);
  const cosV = Math.cos(v);
  const sinV = Math.sin(v);
  const p = morphPhase;
  const inner = (1 - cosV) * 0.5;
  const innerRim = smoothstep(0.16, 1, inner);
  const innerExpansion = smoothstep(0.2, 0.4, p);
  const foldInward = smoothstep(0.4, 0.65, p);
  const mouthOpen = smoothstep(0.65, 0.85, p);
  const settle = smoothstep(0.85, 1, p);
  const majorRadius = mix(1.34, 0.58, p);
  const minorRadius = mix(0.34, 0.22, p);
  const throatLength = mix(0, 2.2, p);
  const phaseWave = Math.sin(u * 2 + time * 0.34 + inner * Math.PI * 1.7) * 0.055 * innerExpansion * innerRim;
  const torusRadial = majorRadius + minorRadius * cosV;
  const mouthRadius = 0.52 + (1 - inner) * 0.3 + Math.cos(v * 2) * 0.035 * mouthOpen;
  const inversionBlend = innerRim * p * (0.68 + foldInward * 0.22);
  const radial = mix(torusRadial, mouthRadius, inversionBlend) + phaseWave;
  const throatWeight = Math.pow(inner, 0.56) * (0.42 + foldInward * 0.48 + settle * 0.1);
  let z = minorRadius * sinV * (1 - p * 0.42) + throatLength * sinV * throatWeight;
  z += Math.sin(u * 2.4 - time * 0.26) * innerRim * foldInward * 0.07;

  let x = radial * cosU;
  let y = radial * sinU;
  if (negativeLayer) {
    const shadow = smoothstep(0.25, 0.75, p);
    x *= 0.9 - shadow * 0.04;
    y *= 0.9 - shadow * 0.04;
    z = -z * (0.78 + shadow * 0.16) - shadow * 0.08;
  }

  positions[cursor] = x;
  positions[cursor + 1] = y;
  positions[cursor + 2] = z;
  return cursor + 3;
}

function updateRatioConnectorGeometry() {
  if (!torusCore.ratioLoop || !torusCore.ratioWeb) return;
  const loopPositions = torusCore.ratioLoop.geometry.attributes.position.array;
  torusCore.ratioMarkers.forEach((marker, index) => {
    loopPositions[index * 3] = marker.position.x;
    loopPositions[index * 3 + 1] = marker.position.y;
    loopPositions[index * 3 + 2] = marker.position.z;
  });
  torusCore.ratioLoop.geometry.attributes.position.needsUpdate = true;

  const webPositions = torusCore.ratioWeb.geometry.attributes.position.array;
  let cursor = 0;
  torusCore.ratioMarkers.forEach((marker, index) => {
    const other = torusCore.ratioMarkers[(index + 5) % torusCore.ratioMarkers.length];
    webPositions[cursor] = marker.position.x;
    webPositions[cursor + 1] = marker.position.y;
    webPositions[cursor + 2] = marker.position.z;
    webPositions[cursor + 3] = other.position.x;
    webPositions[cursor + 4] = other.position.y;
    webPositions[cursor + 5] = other.position.z;
    cursor += 6;
  });
  torusCore.ratioWeb.geometry.attributes.position.needsUpdate = true;
}

function ratioColorHex(slot, dubVisual = false) {
  const palette = torusPalette(dubVisual);
  return slot % 2 ? palette.markerB : palette.markerA;
}

function drawCore(timestamp = 0) {
  const drawStartedAt = runtimeNow();
  state.coreFrameId = null;
  if (!visualsCanRun()) return;
  const canvas = els.coreCanvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    requestCoreFrame();
    return;
  }
  const rect = canvas.getBoundingClientRect();
  const width = rect.width || 360;
  const height = rect.height || 220;
  const dpr = currentVisualPixelRatio();
  const targetWidth = Math.max(1, Math.round(width * dpr));
  const targetHeight = Math.max(1, Math.round(height * dpr));
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  const dubVisual = isDubModeVisual();
  ctx.fillStyle = dubVisual ? "rgba(0, 8, 3, 0.22)" : "rgba(255, 248, 220, 0.08)";
  ctx.fillRect(0, 0, width, height);
  const cx = width / 2;
  const cy = height / 2;
  const phase = state.animationPhase;
  renderTorusFrame(width, height, phase);

  const voidGlow = state.negativeSpaceOpacity || 0;
  const halo = ctx.createRadialGradient(cx, cy, 8, cx, cy, Math.min(width, height) * (0.34 + voidGlow * 0.12));
  halo.addColorStop(0, dubVisual ? `rgba(183, 255, 77, ${0.1 + voidGlow * 0.16})` : `rgba(215, 46, 127, ${0.08 + voidGlow * 0.12})`);
  halo.addColorStop(0.28, dubVisual ? `rgba(48, 255, 126, ${0.12 + voidGlow * 0.1})` : `rgba(41, 169, 199, ${0.08 + voidGlow * 0.08})`);
  halo.addColorStop(0.55, dubVisual ? "rgba(0, 255, 200, 0.06)" : "rgba(53, 162, 184, 0.06)");
  halo.addColorStop(1, dubVisual ? "rgba(0, 0, 0, 0)" : "rgba(255, 209, 102, 0)");
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, width, height);

  drawGravityWaveField(ctx, width, height, phase);
  drawApertureLens(ctx, width, height, phase);
  drawEcoGlitchOverlay(ctx, width, height, phase);
  if (!torusCore.ready) drawProjectedTorusFallback(ctx, width, height, phase);

  const frameMs = Math.max(16, timestamp - (state.coreLastDrawnAt || timestamp));
  state.coreLastDrawnAt = timestamp;
  const speed = state.reducedMotion && !visualIsActive() ? 0.04 : state.animationVisualLevel > 0.02 ? 1.18 : 0.18;
  state.animationPhase += speed * clamp(frameMs / 16.67, 0.25, 2.4);
  monitorVisualLoad(frameMs, runtimeNow() - drawStartedAt);
  requestCoreFrame();
}

function drawGravityWaveField(ctx, width, height, phase) {
  const cx = width / 2;
  const cy = height / 2;
  const dubVisual = isDubModeVisual();
  const eco = visualEcoActive();
  const horizontalGap = eco ? 30 : 18;
  const horizontalStep = eco ? 18 : 10;
  const verticalGap = eco ? 34 : 22;
  const verticalStep = eco ? 18 : 10;
  ctx.save();
  ctx.lineWidth = eco ? 0.46 : 0.56;
  ctx.globalAlpha = ((dubVisual ? 0.58 : 0.42) + state.animationVisualLevel * 0.3) * (eco ? 0.72 : 1);

  for (let y = -18; y <= height + 18; y += horizontalGap) {
    ctx.beginPath();
    for (let x = -16; x <= width + 16; x += horizontalStep) {
      const point = warpedFieldPoint(x, y, cx, cy, phase);
      if (x === -16) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.strokeStyle = dubVisual ? "rgba(57, 255, 136, 0.42)" : "rgba(41, 169, 199, 0.38)";
    ctx.stroke();
  }

  for (let x = -18; x <= width + 18; x += verticalGap) {
    ctx.beginPath();
    for (let y = -16; y <= height + 16; y += verticalStep) {
      const point = warpedFieldPoint(x, y, cx, cy, phase + 48);
      if (y === -16) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
    ctx.strokeStyle = dubVisual ? "rgba(183, 255, 77, 0.24)" : "rgba(61, 183, 178, 0.26)";
    ctx.stroke();
  }

  ctx.restore();
}

function drawApertureLens(ctx, width, height, phase) {
  const focus = state.focusZoom || 0;
  const voidGlow = state.negativeSpaceOpacity || 0;
  const dubVisual = isDubModeVisual();
  const intensity = Math.max(focus, voidGlow * 0.72);
  if (intensity <= 0.025) return;

  const cx = width / 2;
  const cy = height / 2;
  const base = Math.min(width, height) * (0.095 + focus * 0.035);
  const wobble = Math.sin(phase * 0.018) * 0.08;
  ctx.save();
  ctx.globalAlpha = 0.18 + intensity * 0.36;
  ctx.lineWidth = 0.62;
  ctx.shadowBlur = 12 + intensity * 18;
  ctx.shadowColor = dubVisual ? `rgba(57, 255, 136, ${0.18 + intensity * 0.22})` : `rgba(215, 46, 127, ${0.12 + intensity * 0.18})`;

  for (let ring = 0; ring < 4; ring += 1) {
    const radius = base * (1 + ring * 0.42 + Math.sin(phase * 0.012 + ring) * 0.035);
    ctx.beginPath();
    ctx.ellipse(cx, cy, radius * (1.55 + wobble), radius * (0.58 - wobble * 0.18), Math.sin(phase * 0.006) * 0.08, 0, Math.PI * 2);
    ctx.strokeStyle = dubVisual
      ? (ring % 2 ? "rgba(183, 255, 77, 0.32)" : "rgba(57, 255, 136, 0.36)")
      : (ring % 2 ? "rgba(215, 46, 127, 0.32)" : "rgba(41, 169, 199, 0.34)");
    ctx.stroke();
  }

  ctx.shadowBlur = 0;
  ctx.globalAlpha = 0.08 + intensity * 0.16;
  for (let ray = 0; ray < 10; ray += 1) {
    const angle = (ray / 10) * Math.PI * 2 + Math.sin(phase * 0.009) * 0.12;
    const inner = base * (0.62 + Math.sin(phase * 0.014 + ray) * 0.08);
    const outer = base * (2.35 + focus * 0.8);
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner * 0.58);
    ctx.quadraticCurveTo(
      cx + Math.cos(angle + 0.18) * outer * 0.62,
      cy + Math.sin(angle + 0.18) * outer * 0.34,
      cx + Math.cos(angle) * outer,
      cy + Math.sin(angle) * outer * 0.58,
    );
    ctx.strokeStyle = dubVisual ? "rgba(0, 255, 200, 0.32)" : "rgba(41, 169, 199, 0.36)";
    ctx.stroke();
  }

  ctx.restore();
}

function drawEcoGlitchOverlay(ctx, width, height, phase) {
  const now = Date.now();
  const glitch = visualGlitchEnvelope(now);
  const eco = visualEcoActive(now);
  const intensity = Math.max(glitch, eco ? 0.16 : 0);
  if (intensity <= 0.01) return;

  const dubVisual = isDubModeVisual();
  const bandCount = glitch > 0.04 ? 8 : 3;
  const paletteA = dubVisual ? "rgba(57, 255, 136," : "rgba(41, 169, 199,";
  const paletteB = dubVisual ? "rgba(183, 255, 77," : "rgba(215, 46, 127,";
  ctx.save();
  ctx.globalCompositeOperation = "screen";

  for (let band = 0; band < bandCount; band += 1) {
    const wave = Math.sin(phase * 0.19 + band * 2.71);
    const y = mod((phase * (0.9 + band * 0.07) + band * 41), height + 28) - 14;
    const bandHeight = glitch > 0.04 ? 1 + Math.abs(wave) * 7 : 1.4;
    const offset = wave * width * (0.018 + intensity * 0.036);
    ctx.globalAlpha = 0.06 + intensity * (band % 2 ? 0.2 : 0.13);
    ctx.fillStyle = `${band % 2 ? paletteB : paletteA} ${0.22 + intensity * 0.42})`;
    ctx.fillRect(offset, y, width, bandHeight);
    if (glitch > 0.08) {
      ctx.globalAlpha = 0.035 + intensity * 0.1;
      ctx.fillStyle = `${band % 2 ? paletteA : paletteB} ${0.14 + intensity * 0.28})`;
      ctx.fillRect(-offset * 0.6, y + bandHeight + 2, width, 1);
    }
  }

  ctx.globalAlpha = 0.06 + intensity * 0.18;
  ctx.lineWidth = 0.5;
  for (let y = 0; y < height; y += eco ? 16 : 9) {
    const offset = Math.sin(y * 0.045 + phase * 0.05) * intensity * 8;
    ctx.beginPath();
    ctx.moveTo(offset, y + 0.5);
    ctx.lineTo(width + offset, y + 0.5);
    ctx.strokeStyle = dubVisual ? "rgba(57, 255, 136, 0.34)" : "rgba(255, 255, 255, 0.32)";
    ctx.stroke();
  }

  ctx.restore();
}

function warpedFieldPoint(x, y, cx, cy, phase) {
  const dx = x - cx;
  const dy = y - cy;
  const radius = Math.hypot(dx, dy) || 1;
  const gravity = Math.exp(-(radius * radius) / (cx * cy * 0.72));
  const tunnel = state.negativeSpaceOpacity || 0;
  const aperture = smoothstep(0.22, 0.85, state.wormholePhase || 0);
  const wave = Math.sin(x * 0.03 + phase * 0.018) * (4.2 + tunnel * 1.2) + Math.sin((x + y) * 0.018 - phase * 0.013) * (3 + aperture * 1.1);
  const pull = Math.sin(phase * 0.016 + radius * 0.055) * gravity * (16 + aperture * 18);
  return {
    x: x + (dx / radius) * pull * (0.24 + tunnel * 0.22) + Math.sin(y * 0.024 - phase * 0.01) * (1.4 + aperture),
    y: y + wave + (dy / radius) * pull * (1 + tunnel * 0.5),
  };
}

function drawProjectedTorusFallback(ctx, width, height, phase) {
  const cx = width / 2;
  const cy = height / 2;
  const rx = Math.min(width, height) * 0.32;
  const ry = rx * 0.42;
  const tilt = Math.sin(phase * 0.008) * 0.14;
  const dubVisual = isDubModeVisual();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(tilt);
  ctx.shadowBlur = state.animationVisualLevel > 0.02 ? 18 : 10;
  ctx.shadowColor = dubVisual ? "rgba(57, 255, 136, 0.34)" : "rgba(215, 46, 127, 0.28)";
  for (let ring = -4; ring <= 4; ring += 1) {
    ctx.beginPath();
    ctx.ellipse(0, ring * 3.1, rx + Math.cos(phase * 0.018 + ring) * 3, ry + ring * 1.2, 0, 0, Math.PI * 2);
    ctx.strokeStyle = dubVisual
      ? (ring % 2 ? "rgba(183, 255, 77, 0.24)" : "rgba(57, 255, 136, 0.32)")
      : (ring % 2 ? "rgba(215, 46, 127, 0.22)" : "rgba(53, 162, 184, 0.28)");
    ctx.lineWidth = 0.72;
    ctx.stroke();
  }
  ctx.restore();
}

function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function mix(start, end, amount) {
  return start + (end - start) * amount;
}

function getGenerateEnvelope(now = Date.now()) {
  if (state.animationActive) {
    return smoothstep(0, GENERATE_FADE_MS, now - state.animationStartedAt);
  }
  const tail = clamp((state.animationTailUntil - now) / GENERATE_TAIL_MS, 0, 1);
  return smoothstep(0, 1, tail);
}

function tuningAngleForSlot(slot) {
  const outputMode = els.outputModeInput?.value || "retuner";
  if (outputMode === "equal") return (slot / 12) * Math.PI * 2;
  const ratio = AMY_DUB_RATIOS[slot][1];
  return (Math.log2(ratio) % 1) * Math.PI * 2;
}

function animateFor(ms) {
  state.animationStartedAt = Date.now();
  state.animationTailUntil = 0;
  state.animationActive = true;
  requestCoreFrame(true);
  setTimeout(() => {
    state.animationActive = false;
    state.animationTailUntil = Date.now() + GENERATE_TAIL_MS;
    requestCoreFrame(true);
  }, ms);
}

function noteToPc(name) {
  const normalized = String(name).replace(/[0-9]/g, "");
  const map = { C: 0, "C#": 1, Db: 1, D: 2, "D#": 3, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, "A#": 10, Bb: 10, B: 11 };
  return map[normalized] ?? 0;
}

function noteNameToMidi(name) {
  const match = String(name).match(/^([A-G](?:#|b)?)(-?\d+)$/);
  if (!match) return 69;
  const [, note, octaveText] = match;
  return (parseInt(octaveText, 10) + 1) * 12 + noteToPc(note);
}

function buildReferenceNoteNames(lowOctave, highOctave) {
  const notes = [];
  for (let octave = lowOctave; octave <= highOctave; octave += 1) {
    NOTE_NAMES.forEach((note) => notes.push(`${note}${octave}`));
  }
  return notes;
}

function pcToName(pc) {
  return NOTE_NAMES[mod(pc, 12)];
}

function midiName(midi) {
  return `${pcToName(midi % 12)}${Math.floor(midi / 12) - 1}`;
}

function midiFrequency(midi, a4 = 440) {
  return a4 * 2 ** ((midi - 69) / 12);
}

function nearestMidiForPc(pc, low, high, prefer) {
  let best = low;
  let bestScore = Infinity;
  for (let midi = low; midi <= high; midi += 1) {
    if (midi % 12 !== mod(pc, 12)) continue;
    const score = Math.abs(midi - prefer);
    if (score < bestScore) {
      best = midi;
      bestScore = score;
    }
  }
  return best;
}

function ratioForMidi(midi, settings) {
  return ratioForMidiFromRoot(midi, settings.rootMidi);
}

function ratioForMidiFromRoot(midi, rootMidi) {
  const rel = midi - rootMidi;
  const offset = mod(rel, 12);
  const octave = Math.floor((rel - offset) / 12);
  return AMY_DUB_RATIOS[offset][1] * 2 ** octave;
}

function defaultRootHzForReference(rootMidi, referenceMidi, referenceHz) {
  const referenceRatioFromRoot = ratioForMidiFromRoot(referenceMidi, rootMidi);
  return referenceHz / referenceRatioFromRoot;
}

function fishtailTempo(referenceHz, divisor) {
  return (60 * referenceHz) / divisor;
}

function ratioNameForMidi(midi, settings) {
  const rel = midi - settings.rootMidi;
  const offset = mod(rel, 12);
  return AMY_DUB_RATIOS[offset][0];
}

function octaveReducedCents(ratio) {
  let cents = 1200 * Math.log2(ratio);
  cents = ((cents + 600) % 1200 + 1200) % 1200 - 600;
  return Math.abs(cents);
}

function circularDistance(a, b) {
  const diff = Math.abs(mod(a, 12) - mod(b, 12));
  return Math.min(diff, 12 - diff);
}

function mod(value, base) {
  return ((value % base) + base) % base;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function lerp(min, max, amount) {
  return min + (max - min) * amount;
}

function msToTicks(ms, settings) {
  return Math.max(1, Math.round((ms / 1000) * (settings.tempo / 60) * PPQ));
}

function hashUnit(...parts) {
  const text = parts.map((part) => String(part)).join(":");
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) / 0xffffffff;
}

function weightedChoice(rng, pairs) {
  const total = pairs.reduce((sum, [, weight]) => sum + Math.max(0, weight), 0);
  let target = rng() * total;
  for (const [value, weight] of pairs) {
    target -= Math.max(0, weight);
    if (target <= 0) return value;
  }
  return pairs[pairs.length - 1][0];
}

function weightedChoiceIndex(rng, weights) {
  const total = weights.reduce((sum, weight) => sum + Math.max(0, weight), 0);
  let target = rng() * total;
  for (let i = 0; i < weights.length; i += 1) {
    target -= Math.max(0, weights[i]);
    if (target <= 0) return i;
  }
  return weights.length - 1;
}

function randomInt(rng, min, max) {
  return Math.floor(rng() * (max - min + 1)) + min;
}

async function makeSystemSeed() {
  const browserBytes = new Uint8Array(32);
  crypto.getRandomValues(browserBytes);
  const endpoint = customEntropyEndpoint();
  if (!endpoint) return bytesToHex(browserBytes.slice(0, 16));

  try {
    const externalBytes = await fetchExternalEntropy(endpoint);
    if (externalBytes.length < 8) throw new Error("Entropy endpoint returned too few bytes");
    const mixed = concatEntropyBytes(browserBytes, externalBytes);
    const digest = await crypto.subtle.digest("SHA-256", mixed);
    return bytesToHex(new Uint8Array(digest).slice(0, 16));
  } catch (error) {
    console.warn("Custom entropy endpoint unavailable; using browser Web Crypto only.", error);
    return bytesToHex(browserBytes.slice(0, 16));
  }
}

function customEntropyEndpoint() {
  const fromWindow = typeof window !== "undefined" ? window.FISHTAIL_ENTROPY_URL : "";
  const fromMeta = typeof document !== "undefined"
    ? document.querySelector('meta[name="fishtail-entropy-url"]')?.content
    : "";
  let fromStorage = "";
  try {
    fromStorage = typeof localStorage !== "undefined" ? localStorage.getItem("fishtailEntropyUrl") : "";
  } catch (error) {
    fromStorage = "";
  }
  return String(fromWindow || fromMeta || fromStorage || "").trim();
}

async function fetchExternalEntropy(endpoint) {
  const url = validatedEntropyUrl(endpoint);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ENTROPY_TIMEOUT_MS);
  try {
    const response = await fetch(url.href, {
      cache: "no-store",
      credentials: "omit",
      referrerPolicy: "no-referrer",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Entropy endpoint returned ${response.status}`);
    const contentLength = parseInt(response.headers.get("content-length") || "0", 10);
    if (contentLength > ENTROPY_MAX_BYTES) throw new Error(`Entropy endpoint returned more than ${ENTROPY_MAX_BYTES} bytes`);
    const contentType = response.headers.get("content-type") || "";
    const rawBytes = await readEntropyResponseBytes(response);
    const text = new TextDecoder().decode(rawBytes);
    if (contentType.includes("application/json")) {
      const payload = JSON.parse(text);
      if (typeof payload.hex === "string") return hexToBytes(payload.hex);
      if (Array.isArray(payload.bytes)) return new Uint8Array(payload.bytes.map((byte) => clamp(Number(byte) || 0, 0, 255)));
      throw new Error("Entropy JSON must include a hex string or bytes array");
    }
    const compactHex = text.replace(/[^0-9a-f]/gi, "");
    if (compactHex.length >= 16) return hexToBytes(compactHex);
    return rawBytes;
  } finally {
    clearTimeout(timeout);
  }
}

function validatedEntropyUrl(endpoint) {
  let url;
  try {
    url = new URL(endpoint, window.location?.href || "http://localhost/");
  } catch (error) {
    throw new Error("Entropy endpoint URL is invalid");
  }
  const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
  const localHttp = url.protocol === "http:" && localHosts.has(url.hostname);
  if (url.protocol !== "https:" && !localHttp) {
    throw new Error("Entropy endpoint must use https or localhost http");
  }
  return url;
}

async function readEntropyResponseBytes(response) {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      if (total > ENTROPY_MAX_BYTES) {
        try {
          await reader.cancel();
        } catch (error) {
          // Ignore cancellation errors after the size guard has already fired.
        }
        throw new Error(`Entropy endpoint returned more than ${ENTROPY_MAX_BYTES} bytes`);
      }
      chunks.push(value);
    }
    const out = new Uint8Array(total);
    let offset = 0;
    chunks.forEach((chunk) => {
      out.set(chunk, offset);
      offset += chunk.length;
    });
    return out;
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > ENTROPY_MAX_BYTES) throw new Error(`Entropy endpoint returned more than ${ENTROPY_MAX_BYTES} bytes`);
  return new Uint8Array(buffer);
}

function concatEntropyBytes(a, b) {
  const combined = new Uint8Array(a.length + b.length);
  combined.set(a, 0);
  combined.set(b, a.length);
  return combined;
}

function bytesToHex(bytes) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const compact = hex.replace(/[^0-9a-f]/gi, "");
  const bytes = new Uint8Array(Math.floor(compact.length / 2));
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = parseInt(compact.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function makeRng(seed) {
  const data = cyrb128(seed);
  return sfc32(data[0], data[1], data[2], data[3]);
}

function cyrb128(str) {
  let h1 = 1779033703;
  let h2 = 3144134277;
  let h3 = 1013904242;
  let h4 = 2773480762;
  for (let i = 0, k; i < str.length; i += 1) {
    k = str.charCodeAt(i);
    h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
    h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
    h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
    h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
  }
  h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
  h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
  h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
  h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
  return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

function sfc32(a, b, c, d) {
  return function rng() {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const out = (t + d) | 0;
    c = (c + out) | 0;
    return (out >>> 0) / 4294967296;
  };
}
