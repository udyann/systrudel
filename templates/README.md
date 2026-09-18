# Writing PhotoSynthRudel templates

The reactive dashboard publishes six numeric controls: `energy`, `density`,
`tension`, `balance`, `intensity`, and `ambience`, all from 0 to 1. See the
[reactive template contract](../docs/reactive-v1.md#your-music-interface) for
their meanings and the app's live signal API. Describe which of these your draft
uses; keep the musical decisions in your composition. Mapping profiles live in
`src/reactivity/profiles.js` and can be changed independently of the collectors.

This folder is for your Strudel compositions. Each `.strudel` file is plain
text that you can copy into the [Strudel editor](https://strudel.cc/) to play
and edit. These are authoring drafts; the app does not discover or play files
from this folder automatically yet.

## Your integrated base song

[`base-song.strudel`](base-song.strudel) is the supplied draft, with the pasted
Markdown escapes removed. Its app version is
[`src/music/base-song.js`](../src/music/base-song.js). This is the default song
in the Music panel, at **120 BPM / D minor**. Its four `$:` parts become one
`stack`, with explicit mini-notation parsing; the notes and mapping formulas
are preserved. An automated comparison checks it against the updated draft.

Select **Live inputs** for the current smoothed state, or **Draft values** to
audition your fixed settings: energy .1, density .5, tension .9, balance .5,
intensity .3, ambience .4. Changes apply at the next cycle without restarting
the phrase. Volume is a separate master control, initially 50%.

This song consumes energy, density, tension and balance. Balance controls a
linear crossfade: the human piano uses `.gain(1 - balance)`, and the agent
trombone uses `.gain(0.5 * balance)`, preserving its 0.5 trim. At balance 0.5,
their gains are 0.5 and 0.25 respectively; at the endpoints only one melody
triggers audibly. Existing release/reverb tails finish with their earlier gain.
Bass uses `.gain(0.8)` independently of balance. The master volume scales all
these gains together.

Intensity and ambience remain unused. The draft also declares
`melodyTensionProb` without using it; both melodies keep `.sometimesBy(0.005, ...)`.

First Play loads SR-16 kick/snare/ride samples, the three GM instruments and
AudioWorklet effects for distortion. Internet access is needed; subsequent
plays reuse the loaded assets. See [audio setup](../src/music/base-song-audio.js).
Edit the app module to change immediate playback; editing the `.strudel` draft
alone does not sync it automatically. Keep both versions aligned when revising
the composition.

## Workflow

1. Open `starter.strudel` in VS Code and copy the entire file into the Strudel
   editor. Play it there and change the music however you like.
2. Save your version here under a descriptive name, such as `warm-ambient.strudel`
   or `broken-beat.strudel`. One composition per file is enough.
3. Fill in the comment at the top: name, tempo, beats per cycle, sound/sample
   requirements, and the six controls your composition uses.
4. Once the composition feels good, give Codex its filename to integrate it
   into the app's template selection and shared music state.

No special module format, exports, or JSON schema is required for these drafts.
Ordinary Strudel syntax, including multiple `$:` parts, is fine in the editor.
The starter uses `stack(...)` so its two layers are visible together.
Do not run these files with Node; they are source for Strudel's editor.

## Use these six variables

Use these exact names at the top of your Strudel draft. These are also the
app's fallback values before its first live state arrives:

```js
const energy = 0.3
const density = 0.5
const tension = 0.5
const balance = 0.5
const intensity = 0.2
const ambience = 0.4
```

`balance` runs from human dominance (0) to agent dominance (1), with 0.5
neutral. `intensity` measures combined compute activity. `ambience` describes
environmental brightness, from dark (0) to bright (1). You choose what any
of these values do musically, including whether they affect reverb.

Ordinary JavaScript arithmetic and conditions work: `Math.round(density * 8)`,
`200 + ambience * 5000`, or `balance > 0.5`. Audition the endpoints (0 and 1)
as well as the defaults, making sure counts and durations stay valid for the
Strudel functions you use. You do not need to use all six variables.

When integrated, the app supplies these numbers to your pattern factory once
per cycle (or a chosen whole number of cycles). Arithmetic and branches then
reevaluate with a consistent snapshot while the scheduler keeps playing.
Continuous Strudel signals are also available for controls that should update
between cycle boundaries. See the [adapter examples](../docs/reactive-v1.md#your-music-interface).
Your constants remain fixed audition settings in the external Strudel editor;
that editor does not receive the local dashboard's data automatically.

## Tempo and cycle length

`setcpm` sets **cycles per minute**, not beats per minute. With four beats per
cycle, write `setcpm(96 / 4)` for 96 BPM. State a different beats-per-cycle
convention in the header if your composition uses one; the app currently uses
four for its built-in pattern.

## Sounds and effects

The starter uses built-in sawtooth and triangle synths. You can use drums,
sample banks, soundfonts, and effects in your drafts too. Include explicit
sample-loading code or a note identifying the source/bank and any setup the
composition depends on.

Base song loads its specific drum samples, GM soundfonts and worklet effects.
The original image demo uses basic synths. Additional sample banks or effects
in new compositions still need initialization during integration.
The app also currently builds patterns through JavaScript, so REPL features
such as `$:` parts and mini-notation string methods need adaptation or a
transpilation step. You do not need to handle that in your draft.

## Editing the current built-in pattern directly

For a quick change to the original image demo, edit
[`src/music/templates.js`](../src/music/templates.js). Its `MINOR_PULSE` object
defines the notes (MIDI numbers), waveform, envelope, display name, and beats
per cycle. `key` is a descriptive label; changing it does not transpose notes.

[`src/music/pattern.js`](../src/music/pattern.js) turns that object into a
Strudel pattern. Save, refresh the local app, and press Play to hear a change.
Base song and the original image demo are selectable in the Music panel. Adding
another object to that file alone will not make it selectable.
