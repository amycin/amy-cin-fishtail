(
// SynthDef
SynthDef(\teardropSine, {
    |out = 0, f0 = 420, amp = 0.05, gate = 1|
    var numPartials = 128;
    var delta = 1 / (12 * 12);
    var q = 2;
    var p = 2;

    var freqs = Array.fill(numPartials, { |i|
        f0 * (2 ** ((i - numPartials/2) * delta / (numPartials/4)))
    });

    var amps = freqs.collect { |f|
        var logdev = (log2(f / f0)).abs / delta;
        ((1 - (logdev.pow(q))).max(0)).pow(p)
    };

    var sig = Mix.fill(numPartials, { |i|
        SinOsc.ar(freqs[i]) * amps[i]
    });

    sig = sig * EnvGen.kr(Env.asr(0.01, 1, 0.2), gate, doneAction: 2);
    Out.ar(out, sig * amp ! 2);
}).add;

SynthDef(\ticker, {
    |out = 0, amp = 0.8, tickFreq = 840, dur = 0.01|
    var sig = SinOsc.ar(tickFreq) * Env.perc(0.001, dur, amp).ar;
    Out.ar(out, sig.dup);
}).add;
)



//=====ticker test=====
(
// Step 2: Metronome clock and beat task
~bpm = 132;  // or any BPM you like
~metro = TempoClock(~bpm / 60);  // TempoClock works in beats/sec

~tickTask = Task({
    loop {
        Synth(\ticker);  // Play the tick
        1.wait;          // Wait 1 beat (auto scales to BPM)
    }
}, ~metro);
)

(
// Step 3: Start ticking
~tickTask.start;
)
//=====ticker test=====




(
// Slider → k → BPM, where BPM = 60 * (f0 / k)
~tempoFromSlider = { |sliderVal, f0 = 420|
    var kMin = 50;  // fewer cycles = slower tempo
    var kMax = 8400;  // more cycles = faster tempo
    var k = sliderVal.linlin(0, 1, kMax, kMin).round;  //test
    var bpm = (60 * f0) / k;
    [bpm, k];
};
)

(
// GUI block with coarse + fine pitch control, manual BPM, and ticker LED
var window, coarseSlider, fineSlider, freqLabel, bpmLabel, bpmSlider, synth, beatSlider;
var defaultFreq = 420.0;
var maxFreq = 43000.0;
var fineSemitoneRatio = 2 ** (1/12);

// Update function
var updateFreq = {
    var coarseVal = (coarseSlider.value * 2) - 1;
    var negMaxFreq = 0 - maxFreq;
    var coarseFreq = coarseVal.linlin(-1, 1, negMaxFreq, maxFreq);

    var fineVal = (fineSlider.value * 2) - 1;
    var fineMult = fineSemitoneRatio.pow(fineVal);

    var totalFreq = coarseFreq * fineMult;

    freqLabel.string = if(totalFreq.abs < 1e-5, {
        "f₀ = 0.0000000000 Hz"
    }, {
        "f₀ = " ++ (if(totalFreq >= 0, { "+" }, { "−" })) ++
        totalFreq.abs.asStringPrec(10) ++ " Hz"
    });

    if (synth.notNil) {
        synth.set(\f0, totalFreq);
        synth.set(\amp, if(totalFreq.abs < 0.01, 0, 0.2));
    };
};

// GUI window
window = Window("Teardrop Pitch Controller", Rect(100, 100, 600, 260));
window.view.decorator = FlowLayout(window.view.bounds);

freqLabel = StaticText(window, 580@20)
    .string_("f₀ = +420.0000000000 Hz")
    .align_(\center)
    .font_(Font("Helvetica", 14));

bpmLabel = StaticText(window, 580@20)
    .string_("BPM = 63.0000000000")
    .align_(\center)
    .font_(Font("Helvetica", 12));

// NEW: BPM slider
StaticText(window, 580@20)
    .string_("Manual BPM Control (20–300)")
    .align_(\center)
    .font_(Font("Helvetica", 12));

bpmSlider = Slider(window, 580@20)
    .action_({
        var bpm, k, result;
        var coarseVal = (coarseSlider.value * 2) - 1;
        var coarseFreq = coarseVal.linlin(-1, 1, 0 - maxFreq, maxFreq);
        var fineVal = (fineSlider.value * 2) - 1;
        var fineMult = fineSemitoneRatio.pow(fineVal);
        var totalFreq = coarseFreq * fineMult;

        result = ~tempoFromSlider.(bpmSlider.value, totalFreq);
        bpm = result[0];
        k = result[1];

        bpmLabel.string = "BPM = " ++ bpm.asStringPrec(10) ++ "  (k = " ++ k ++ ")";

        // Stop old ticker
        if (~tickTask.notNil) { ~tickTask.stop };

        // Update tempo
        ~metro = TempoClock.new(bpm / 60);

        // Restart ticker
        ~tickTask = Task({
            loop {
                Synth(\ticker);
                {
                    beatSlider.value = 1;
                    0.06.wait;
                    beatSlider.value = 0;
                }.fork(AppClock);
                1.wait;
            }
        }, ~metro);

        ~tickTask.start;
    });

StaticText(window, 580@20)
    .string_("Coarse Control (±43kHz)")
    .align_(\center)
    .font_(Font("Helvetica", 12));

coarseSlider = Slider(window, 580@20);

StaticText(window, 580@20)
    .string_("Fine Control (±1 semitone)")
    .align_(\center)
    .font_(Font("Helvetica", 12));

fineSlider = Slider(window, 580@20);
fineSlider.value = 0.5;

// Ticker LED
StaticText(window, 580@20)
    .string_("Ticker Pulse")
    .align_(\center)
    .font_(Font("Helvetica", 12));

beatSlider = Slider(window, 580@20)
    .value_(0)
    .enabled_(false);

coarseSlider.action = { updateFreq.value };
fineSlider.action = { updateFreq.value };

// Sound synth
synth = Synth(\teardropSine, [\f0, defaultFreq, \amp, 0.05]);



// Metronome
~metro = TempoClock.new(63 / 60);
~tickTask = Task({
    loop {
        Synth(\ticker);
        {
            beatSlider.value = 1;
            0.06.wait;
            beatSlider.value = 0;
        }.fork(AppClock);
        1.wait;
    }
}, ~metro);

// Clean exit
window.onClose = {
    synth.free;
    ~tickTask.stop;
};

// Show GUI + start
window.front;

AppClock.sched(0.1, {
    var bpm, k, result, totalFreq, fineMult;

    coarseSlider.value = defaultFreq.linlin(0 - maxFreq, maxFreq, 0, 1);
    fineSlider.value = 0.5;
    updateFreq.value;

    fineMult = fineSemitoneRatio.pow((fineSlider.value * 2) - 1);
    totalFreq = defaultFreq * fineMult;

    bpmSlider.value = 0.1;  // e.g., lower start value — adjust as you like
    result = ~tempoFromSlider.(bpmSlider.value, totalFreq);
    bpm = result[0];
    k = result[1];

    bpmLabel.string = "BPM = " ++ bpm.asStringPrec(10) ++ "  (k = " ++ k ++ ")";

    ~metro = TempoClock.new(bpm / 60);
    ~tickTask = Task({
        loop {
            Synth(\ticker);
            {
                beatSlider.value = 1;
                0.06.wait;
                beatSlider.value = 0;
            }.fork(AppClock);
            1.wait;
        }
    }, ~metro);

    ~tickTask.start;
});
)
