/* Fishtail Pitch/Tempo Lattice
   Copyright (c) 2025 amy_cin & Echo
*/



(
// Smoother, more “liquid” Teardrop – strong interpolation glide
SynthDef(\teardropSine, {
    |out = 0, f0 = 420, amp = 0.04, gate = 1, glide = 1.0|
    var numPartials = 64;   // fewer partials = less crunchy movement
    var delta = 1 / (12 * 12);
    var q = 2;
    var p = 2;

    // strong, symmetric time glide so slider moves smear over ~1 second
    var f0Sm = VarLag.kr(f0.max(1), glide, glide);

    var freqs = Array.fill(numPartials, { |i|
        f0Sm * (2 ** ((i - numPartials/2) * delta / (numPartials/4)))
    });

    var amps = freqs.collect { |f|
        var logdev = (log2(f / f0Sm)).abs / delta;
        ((1 - (logdev.pow(q))).max(0)).pow(p)
    };

    var sig = Mix.fill(numPartials, { |i|
        SinOsc.ar(freqs[i]) * amps[i]
    });

    // very gentle HF taming, but still mostly about interpolation, not filtering
    sig = LPF.ar(sig, (f0Sm * 12).clip(800, 14000));

    // slow ASR for smooth on/off
    sig = sig * EnvGen.kr(
        Env.asr(0.35, 1, 1.2, curve: -4),
        gate,
        doneAction: 2
    );

    Out.ar(out, sig * amp ! 2);
}).add;
)

(
// LOUD, CLEAR pink-noise ticker – internal boost for level
SynthDef(\ticker, {
    |out = 0, cf = 1000, amp = 1.0, dur = 0.06, rq = 0.4, glide = 0.03|
    var n   = PinkNoise.ar(1);
    var cfS = Lag.kr(cf, glide);          // tiny glide for movement
    var sig = BPF.ar(n, cfS, rq);         // wider band so it cuts
    var env = EnvGen.kr(
        Env.perc(0.0001, dur, 1.0, -4),
        doneAction: 2
    );

    // x4 internal boost so your 0.35 * ampMul actually hits
    Out.ar(out, (sig * env * amp * 4) ! 2);
}).add;
)

(
// FISHTAIL Pitch/Tempo Lattice v10b
// - Pitch/tempo lattice
// - Teardrop ON/OFF using \teardropSine
// - Metronome ON/OFF using \ticker with 1-2-3-4 accent pattern
// - Rational + Irrational swing encoders

s.waitForBoot {
    var win;
    var coarseSpec, fineSpec, kSpec;
    var coarse, fine, f0, k, bpm, tempo;
    var coarseSlider, fineSlider, kSlider;
    var kLabel;
    var f0Label, bpmLabel;
    var f0Box, bpmBox, tempoBox;
    var update;
    var coarseStep;
    var tearButton, metroButton;
    var startMetronome, stopMetronome;

    // NEW swing controls
    var rationalSwing = 0.0;    // 0..1
    var irrationalSwing = 0.0;  // 0..1
    var ratLabel, ratSlider, irrLabel, irrSlider;

    // global-ish state
    ~teardropSynth = ~teardropSynth ?? { nil };
    ~metronomeOn   = ~metronomeOn   ?? { false };
    ~tickTask      = ~tickTask      ?? { nil };
    ~clock         = ~clock         ?? { TempoClock.new(1) };  // single shared clock

    if(~tickTask.notNil) { ~tickTask.stop; ~tickTask = nil; };

    // 1200 Hz / 1024 ≈ 1.171875 Hz per coarse step
    coarseStep = 1200 / 1024;

    coarse = 0.0;
    fine   = 0.0;
    k      = 216;

    coarseSpec = ControlSpec(-600, 600, \lin, coarseStep, coarse);
    fineSpec   = ControlSpec(coarseStep.neg, coarseStep, \lin, coarseStep / 1024, fine);
    kSpec      = ControlSpec(1, 256, \lin, 1, k);

    // ---------- Metronome helpers: with swing ----------

    startMetronome = {
        if(~tickTask.notNil) { ~tickTask.stop; ~tickTask = nil; };

        ~tickTask = Task({
            var step, ampPattern;
            var baseDur, swingAmt, durPattern, dur;
            var jitterAmt, jitter;
            var gentle, feral;
            var baseF, cf, ampMul;

            step = 0;
            ampPattern = #[1.0, 0.25, 0.5, 0.25];  // 1-2-3-4 accents

            gentle = 0.12;   // ≈ 12% swing at mid
            feral  = 0.40;   // ≈ feral swing at max

            // small delay before first tick
            0.25.wait;

            loop {
                baseDur = 1.0;   // one beat

                // Map rationalSwing (0..1) → swingAmt (0..[gentle..feral])
                swingAmt = {
                    var v = rationalSwing.clip(0, 1);
                    if(v <= 0.5) {
                        // first half: 0 → gentle
                        v * (gentle / 0.5)
                    }{
                        // second half: gentle → feral
                        gentle + ((v - 0.5) * ((feral - gentle) / 0.5))
                    }
                }.value;

                // 4-beat duration pattern; sum stays ~4 beats
                durPattern = [
                    baseDur + swingAmt,
                    baseDur - swingAmt,
                    baseDur + swingAmt,
                    baseDur - swingAmt
                ];

                dur = durPattern[step % 4];

                // Irrational swing: random jitter on top, symmetric around 0
                jitterAmt = 0.5 * irrationalSwing.clip(0, 1);   // up to ±0.5 beats
                jitter    = (1.0.rand2) * jitterAmt;
                dur       = (dur + jitter).max(0.05);           // keep positive

                // Tick frequency and amplitude
                baseF  = ~f0.abs.max(40);
                cf     = (baseF * 8).clip(400, 8000);  // 8× fundamental
                ampMul = ampPattern[step % 4];

                Synth(\ticker, [
                    \cf,  cf,
                    \amp, 1.0 * ampMul,
                    \dur, 0.03,
                    \rq,  0.18
                ]);

                step = step + 1;
                dur.wait;    // swing-aware spacing
            }
        }).play(~clock);
    };

    stopMetronome = {
        if(~tickTask.notNil) {
            ~tickTask.stop;
            ~tickTask = nil;
        };
    };

    // ---------- main update: recompute f0/BPM/tempo ----------

    update = {
        f0 = coarse + fine;
        bpm = (60 * f0.abs) / k;
        tempo = bpm / 60;

        ~coarse = coarse;
        ~fine   = fine;
        ~f0     = f0;
        ~k      = k;
        ~bpm    = bpm;
        ~tempo  = tempo;

        // Update clock tempo (beats/sec)
        ~clock.tempo = tempo.max(0.0001);

        // Keep Teardrop tracking pitch smoothly via VarLag in SynthDef
        if(~teardropSynth.notNil) {
            ~teardropSynth.set(\f0, ~f0.abs.max(40));
        };

        if(kLabel.notNil)   { kLabel.string    = "k: %".format(k.asInteger) };
        if(f0Box.notNil)    { f0Box.value      = f0.round(0.000001) };
        if(bpmBox.notNil)   { bpmBox.value     = bpm.round(0.000001) };
        if(tempoBox.notNil) { tempoBox.value   = tempo.round(0.000001) };
    };

    // ================= GUI =================

    // a bit taller to fit swing sliders
    win = Window("FISHTAIL Pitch/Tempo Lattice v10b", Rect(200, 200, 720, 305))
        .front
        .alwaysOnTop_(true);

    win.view.resize_(2 + 8);

    // coarse row
    StaticText(win, Rect(10, 10, 260, 20))
        .string_("Coarse pitch (Hz, -600 .. 600)");
    coarseSlider = Slider(win, Rect(10, 30, 700, 20))
        .resize_(2)
        .action_({ |sl|
            coarse = coarseSpec.map(sl.value);
            update.value;
        });

    // fine row
    StaticText(win, Rect(10, 60, 260, 20))
        .string_("Fine pitch offset (± one coarse step)");
    fineSlider = Slider(win, Rect(10, 80, 700, 20))
        .resize_(2)
        .action_({ |sl|
            fine = fineSpec.map(sl.value);
            update.value;
        });

    // k row
    StaticText(win, Rect(10, 110, 260, 20))
        .string_("Divisor k (1 .. 256)");
    kLabel = StaticText(win, Rect(280, 110, 120, 20));
    kSlider = Slider(win, Rect(10, 130, 700, 20))
        .resize_(2)
        .action_({ |sl|
            k = kSpec.map(sl.value).round.asInteger;
            update.value;
        });

    // f0 / BPM / tempo row
    f0Label = StaticText(win, Rect(10, 160, 120, 20))
        .string_("Effective f0 (Hz):");
    f0Box = NumberBox(win, Rect(130, 160, 150, 20))
        .decimals_(6)
        .clipLo_(-600.0)
        .clipHi_(600.0)
        .action_({ |nb|
            var newF0 = nb.value.clip(-600.0, 600.0);
            coarse = coarseSpec.constrain(newF0);
            fine   = (newF0 - coarse).clip(fineSpec.minval, fineSpec.maxval);
            coarseSlider.value = coarseSpec.unmap(coarse);
            fineSlider.value   = fineSpec.unmap(fine);
            update.value;
        });

    bpmLabel = StaticText(win, Rect(290, 160, 40, 20))
        .string_("BPM:");
    bpmBox = NumberBox(win, Rect(330, 160, 120, 20))
        .decimals_(6)
        .clipLo_(0.0)
        .action_({ |nb|
            var newBpm = nb.value.abs;
            if(newBpm <= 0.0 or: { f0 == 0.0 }) {
                { "Ignoring BPM change (need f0 ≠ 0 and BPM > 0)".postln }.defer;
            }{
                k = ((60 * f0.abs) / newBpm).clip(1, 256).round.asInteger;
                kSlider.value = kSpec.unmap(k);
                update.value;
            };
        });

    StaticText(win, Rect(460, 160, 120, 20))
        .string_("Tempo (beats/s):");
    tempoBox = NumberBox(win, Rect(580, 160, 130, 20))
        .decimals_(6)
        .enabled_(false);

    // buttons row
    tearButton = Button(win, Rect(10, 195, 180, 25))
        .states_([
            ["Teardrop OFF", Color.black, Color(0.8, 0.8, 0.8)],
            ["Teardrop ON",  Color.white, Color(0.1, 0.5, 0.1)]
        ])
        .action_({ |btn|
            if(btn.value == 1) {
                if(~teardropSynth.notNil) { ~teardropSynth.free; };
                ~teardropSynth = Synth(\teardropSine, [
                    \f0,    ~f0.abs.max(40),
                    \amp,   0.05,
                    \glide, 1.0
                ]);
            }{
                if(~teardropSynth.notNil) {
                    ~teardropSynth.set(\gate, 0);
                    ~teardropSynth = nil;
                };
            };
        });

    metroButton = Button(win, Rect(210, 195, 200, 25))
        .states_([
            ["Metronome OFF", Color.black, Color(0.8, 0.8, 0.8)],
            ["Metronome ON",  Color.white, Color(0.1, 0.5, 0.1)]
        ])
        .action_({ |btn|
            ~metronomeOn = (btn.value == 1);
            if(~metronomeOn) {
                startMetronome.();
            }{
                stopMetronome.();
            };
        });

    // --------- swing row ---------

    ratLabel = StaticText(win, Rect(10, 230, 140, 20))
        .string_("Rational swing");
    ratSlider = Slider(win, Rect(150, 230, 260, 20))
        .resize_(2)
        .action_({ |sl|
            rationalSwing = sl.value;   // 0..1
        });

    irrLabel = StaticText(win, Rect(430, 230, 140, 20))
        .string_("Irrational swing");
    irrSlider = Slider(win, Rect(570, 230, 140, 20))
        .resize_(2)
        .action_({ |sl|
            irrationalSwing = sl.value; // 0..1
        });

    // initialise everything
    coarseSlider.value = coarseSpec.unmap(coarse);
    fineSlider.value   = fineSpec.unmap(fine);
    kSlider.value      = kSpec.unmap(k);
    ratSlider.value    = 0.5;   // gentle default ≈ 12%
    irrSlider.value    = 0.0;   // no jitter by default
    update.value;
};
)