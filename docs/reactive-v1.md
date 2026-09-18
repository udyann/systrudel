# Reactive V1: inputs and template contract

Run `npm run dev` from `C:\photosynthrudel`, then open <http://localhost:5173>.
This starts Vite and a loopback-only Node companion on port 4317. Stop with Ctrl+C.
If Vite is already running, restart it for the new proxy configuration. For separate
terminals use `npm run telemetry` and `npm run dev:ui`. Production preview also
needs `npm run telemetry` alongside `npm run preview`.

## What is ready

The pipeline is **process → smoothed state → template behavior**. The dashboard
shows live inputs, derived state, mapping references and connection status.
The user's Base song is integrated and selected by default; the original
image/filter demo is available in the Music panel's Song selector.

Base song uses SR-16 drums, GM synth bass 2, GM electric piano 2 and GM trombone
at 120 BPM. Balance crossfades human piano (`gain = 1 - balance`) and agent
trombone (`gain = 0.5 * balance`). Bass has a fixed gain of 0.8.
Choose Live inputs for the smoothed state or Draft values for the supplied
constants. Energy, density and tension drive its other formulas; intensity and
ambience are unused. First Play loads samples, soundfonts and worklets;
it needs internet access. [Composition and editing guide](../templates/README.md#your-integrated-base-song).

| Source | Collection and limitations |
| --- | --- |
| CPU / RAM | Node OS counters every second; machine-wide CPU delta and used RAM percentage. |
| GPU | Windows performance counters; busiest engine after summing per-process contributions. Driver-dependent; unavailable is not zero. GPU load does not establish that inference is running. |
| Network | Physical, up adapters only; receive/transmit byte deltas. Virtual adapters are excluded to reduce double counting. First sample establishes a baseline. |
| Disk | Windows physical-disk total bytes/sec and operations/sec. |
| Human | Page events by default. Enable **Track activity across Windows** for other applications. The helper counts key presses (including repeats, excluding modifiers), clicks, wheel units and idle duration. |
| Codex | Structured CLI/app-server feed or optional lifecycle hooks; see below. |
| Visual | Existing photo/webcam brightness, entirely in-browser. Camera stops when the tab is hidden. |
| Time | Local clock; a smooth daily brightness curve, not astronomical sunrise/sunset. |
| Weather | Optional city lookup with Open-Meteo, current model conditions refreshed every 15 minutes. City/coordinates go to that service only after user action. |
| Energy / drive / focus | User sliders, 0–1; continue influencing state after initialization. |

Windows GPU/disk/network queries run in one persistent hidden PowerShell process,
with a two-second pause between completed samples. Slow provider queries can make
the effective interval longer. CPU data expires after 5 seconds; I/O after 10.
The browser treats an interrupted companion feed as offline after 3 seconds.
Individual unavailable counters remain null. A missing agent feed is not idle AI.

Windows activity is off on startup and remains enabled until switched off or the
companion exits. Closing the browser alone does not stop an enabled collector.
It emits aggregates every 250 ms; no typed text, key identities, window names,
pointer positions, prompts, outputs or transcript files are stored by telemetry.
Page-only idle means time since input **in this page**, not machine idle. Wheel
units are approximate and differ between browsers and Windows devices.

## Timescales and classification

Fast click/tool accents use 250 ms smoothing. Human activity uses a four-second
rise and twelve-second decay time constant, so pauses in typing retain about
61% of the preceding activity after six seconds. Other activity uses a
four-second exponential time constant. Context uses 45 seconds. Workload candidates must
persist for 30 seconds before changing the arrangement label. Values do not
restart the audio scheduler.

Typing contributes independently to human activity, reaching full strength at
four key presses per second. Scrolling and clicking each contribute up to 0.6;
combined human activity is capped at 1. The smoothed performer state influences
energy, density and human/agent balance. In Base song, this makes typing increase
bass activity and brighten the drum/melody filters through the existing mappings.

While a connected agent reports at least one open turn, add 0.2 to both energy
and density after the usual smoothed calculation, capped at 1. Multiple open
turns do not multiply this bonus. It is removed when the last turn closes or
the agent feed becomes unavailable; the underlying activity still decays normally.

Workload labels: `idle`, `mixed`, `compute-heavy`, `GPU-heavy`, `network-heavy`,
`disk-heavy`, `unavailable`. Network and disk normalization uses logarithmic
reference rates of 20 MB/s and 200 MB/s; tune constructor options in
`src/reactivity/engine.js` for the machine. These are normalization references,
not measured device capacity. CPU/GPU, memory pressure, I/O, human and agent
activity mix into the controls below. Classifications describe resource use,
not application identity or intent.

## Your music interface

Keep writing ordinary Strudel drafts in `templates/*.strudel`. They are not
automatically evaluated. Add a comment listing the controls your composition
consumes and their useful musical ranges. You own scales, notes, instruments,
rhythms, effects and all decisions about how these controls should sound.

| Control | Range / meaning |
| --- | --- |
| `energy` | 0–1: context, workload and performer activity |
| `density` | 0–1: combined performers and I/O activity |
| `tension` | 0–1: compute, memory pressure, interaction and focus |
| `balance` | 0 = human, 1 = agent, 0.5 = neutral when both quiet |
| `intensity` | 0–1: combined CPU, GPU and memory pressure |
| `ambience` | 0 = dark, 1 = bright: available visual light, local time and weather; the template decides its musical effect |

Keep these constants in your draft:

```js
const energy = 0.3
const density = 0.5
const tension = 0.5
const balance = 0.5
const intensity = 0.2
const ambience = 0.4
```

The dashboard publishes `state.controls` with exactly those six names. Its
meters, mapping profiles and exported recordings use the same values.
`state.derived` retains the earlier descriptive names for diagnostics and old
recordings; templates should consume `controls`. Values are finite, clamped
to 0–1 and read-only. Missing or invalid values use the draft defaults above;
a valid live zero stays zero. After initialization, the smoothed engine supplies
live values, including its existing decay behavior for unavailable inputs.

For a numeric snapshot in an app-integrated JavaScript module:

```js
import { reactiveState, createControlSignals } from '../src/reactivity/template-api.js';

const { energy, density, tension, balance, intensity, ambience } = reactiveState.getControls();
// These are ordinary numbers. Call getControls() again to get a newer snapshot.

const unsubscribe = reactiveState.subscribe(state => {
  // state.controls: the six numeric controls
  // state.workload: stable workload label
  // state.interaction: human-leading / agent-leading / interaction peak / both idle
  // state.performers: human, agent, accent (0–1)
  // state.availability: check whether each input exists before interpreting it
  // state.profileId, state.mapped: selected routing profile and named 0–1 values
});

// Call unsubscribe() when removing the template.
```

For playback, `createStrudelPlayer` accepts `buildPattern(controls)` and optional
`updateEveryCycles` (a positive integer, default 1). During integration, move the
draft's pattern-building code into this factory, replacing its six constant
declarations with the supplied numbers:

```js
// Inside src/music/ui.js; composePattern is your integrated composition module.
const player = createStrudelPlayer(strudel, {
  buildPattern: ({ energy, density, tension, balance, intensity, ambience }) =>
    composePattern({ energy, density, tension, balance, intensity, ambience }),
  updateEveryCycles: 1, // Use 4, for example, to hold controls for a four-cycle phrase.
});
```

`composePattern` here is a placeholder for your music, not a built-in composition.
Return one Strudel pattern synchronously (use `stack` for several voices).
Ordinary numeric arithmetic such as `Math.round(density * 8)` and conditional
arrangement decisions work inside this factory. Keep sample loading, tempo
setup and other side effects outside it; the factory runs repeatedly. The
existing player uses four beats per cycle and manual tempo control. Optional
`readControls` supplies a template-specific numeric source, `prepareAudio`
loads assets/effects before scheduling, and `masterGain` enables the UI's
0–100% master level while preserving the composition's relative gain/velocity.
Base song uses all three hooks; its asset loader is `src/music/base-song-audio.js`.

`src/music/reactive-pattern.js` snapshots the numbers when the scheduler first
queries a cycle/phrase, which may be slightly ahead of playback. It keeps them
stable across partial queries, preserves absolute musical time and reuses the
same scheduler. Stop/Play clears the snapshot cache. Direct adapter consumers
receive `{ pattern, reset }` and should call `reset()` before restarting their
clock. The bounded cache holds the latest 16 queried groups; this is a live
adapter, not a historical replay store. Already scheduled/sounding events keep
their earlier values.

For continuous parameters, `createControlSignals(strudel.signal)` returns the
same six names as live Strudel signal patterns. Use Strudel operations such as
`controls.ambience.mul(5000).add(200)` for these signals; JavaScript arithmetic
and `Math.round` apply to the numeric factory values instead. See Strudel's
[signals](https://strudel.cc/learn/signals/) and
[pattern queries](https://strudel.cc/technical-manual/patterns/) documentation.

`reactiveState.getSnapshot()` returns null before initialization; `getControls()`
and signals already supply the draft defaults. Treat snapshots as read-only.
Browser timers may be throttled while minimized; timing uses elapsed time, but
this is not a background real-time audio guarantee. Drafts in strudel.cc stay
fixed until reevaluated; there is no cross-site telemetry connection.

Mapping contracts are editable in `src/reactivity/profiles.js`. Base song's
reference describes its actual mappings. Ambient Work,
Machine Room, Human vs Agent and Quiet Night route macros to named musical
properties. They contain no compositions. Selecting one changes the mapping
preview and published `mapped` values; it does not switch or rewrite the song.
The module runs inside this app; it does not inject live values into strudel.cc.

## Recommended: normal Codex IDE workflow

The IDE extension is the selected integration target. Follow
[`integrations/codex/README.md`](../integrations/codex/README.md) for the project
hook setup. Work in the Codex sidebar as usual while the companion runs. This
path collects lifecycle events, not live token/output rates. The CLI bridge below
remains an optional developer adapter and is not required for your normal work.

## Optional structured CLI feed

With the companion running, execute your own task and pipe its structured output:

```powershell
codex exec --json "YOUR TASK" | npm run agent:codex --silent
```

Use your normal Codex permissions and working directory. This command runs the
task you supply. The bridge itself only consumes stdin and posts numeric metadata;
it neither launches agent work nor reads session history. It consumes the JSON
output, so that terminal will not also show the ordinary assistant reply. Use
Codex's normal final-output option if you need a saved answer.

CLI messages may arrive as completed items rather than token deltas. Output is
reported as **characters/sec** over a ten-second window; reported token usage
arrives when the upstream event supplies it, often at turn completion. It is not
an estimated live token rate. Reported reasoning duration requires an explicit
reasoning start/end pair; hidden thinking and reasoning level are unavailable.

The same bridge recognizes app-server `item/agentMessage/delta`, item lifecycle,
turn lifecycle and cumulative token notifications. A client that owns an
app-server connection can forward a copy of its JSONL notifications into the
bridge. This does not attach automatically to an already-open desktop app.
Use one feed per session to avoid double counting. Feed heartbeats run every
10 seconds after a recognized event; absence for 30 seconds clears active state.
At EOF, the last rates remain visible until that expiry.

## Codex app / CLI lifecycle hooks

`integrations/codex/hooks.example.json` is a prepared configuration for the
installed project path. Merge its `hooks` entries into a supported, trusted
Codex config layer (`<repo>/.codex/hooks.json` or your user hooks file). Preserve
existing hooks. If the project moves, update the absolute script path.

Codex requires reviewing/trusting each hook definition; OpenAI documents `/hooks`
in the interactive CLI for review if your extension lacks hook controls. Reload
the Codex session as required by your client. The project configuration is
installed in `.codex/hooks.json`; its trust decision remains yours. Global Codex
configuration is not modified.

Hooks write tool start/end, turn start/end, and subagent lifecycle counters to
`.local/codex-inbox/`; the companion consumes that queue every 250 ms. They discard
prompt/tool payloads and never open the supplied transcript path. Streamed output,
token counts and reasoning duration are omitted from the IDE panel.

The dashboard reports Working while an observed turn is open, Idle after its
completion, Waiting before any hook arrives, and Unknown after 15 quiet minutes
without confirmation/completion. Working can include waiting for approval. Idle
hooks require no heartbeat. Counts describe observed activity, not an authoritative
inventory of every agent. This differs from the optional CLI stream's 30-second
heartbeat expiry. Counter-only inbox entries survive a temporarily offline
companion, expire after 15 minutes and are deleted after consumption.

Sources: [Codex structured CLI output](https://learn.chatgpt.com/docs/non-interactive-mode),
[app-server events](https://learn.chatgpt.com/docs/app-server),
[hook configuration and trust](https://learn.chatgpt.com/docs/hooks).

## Local service contract

- `GET /api/health`, `GET /api/snapshot`, `GET /api/events` (SSE, 250 ms).
- `POST /api/human` with `{ "enabled": true }` from the same-origin dashboard.
- `POST /api/agent` accepts numeric metadata events with bearer authentication.
  The bridge reads the session token from ignored `.local/telemetry.json`.
- Event fields: `source`, `kind`, optional opaque `id`, numeric `count`.
  Kinds: heartbeat, session_start, turn_start/end, output, tokens, tool_start/end,
  thinking_start/end, subagent_start/end, subagents (absolute count), disconnect.
  Text and arbitrary extra fields are rejected. Times come from the receiver.

The service binds to 127.0.0.1, checks Host/Origin, limits bodies to 16 KB, caps
sources and subscriptions, and exposes no remote-control or command-execution
endpoint. It is for this local laptop, not a public or LAN deployment. CPU/RAM
work elsewhere; the optional collectors require Windows.

## V1 comparison exercise

1. Enable Windows activity to capture work outside this browser. Connect one
   Codex event source when testing AI interaction.
2. Keep context/profile fixed. Label and record 1–3 minutes each of idle, typing,
   browsing, downloading, compiling, and GPU work if applicable. Avoid synthetic
   workloads that overwhelm the machine just for a test.
3. Stop and export each recording before starting the next (the next recording
   resets the in-memory buffer). Export contains aggregate metrics/state, not
   prompts, output text, images or input events. Maximum one hour per recording.
4. Compare workload labels, density, balance, compute intensity and tension.
   Allow 30 seconds for a workload label to settle. Exports are JSON artifacts,
   not an in-app playback/replay feature.
5. Once your music is attached, repeat the same sessions and evaluate whether
   they sound recognizably different without deliberate musical control.

Automated fixtures verify distinct sustained CPU/GPU/transfer/disk/idle states,
performer dominance, smoothing, expiry, protocol privacy and server boundaries.
That validates infrastructure, not the musical quality of compositions you have
not supplied yet. Actual browser layout, Windows input gestures, weather access
and audible behavior still require checking in your browser.

Sources: [Open-Meteo forecast API](https://open-meteo.com/en/docs),
[geocoding API](https://open-meteo.com/en/docs/geocoding-api),
[Windows GPU counter interpretation](https://devblogs.microsoft.com/directx/gpus-in-the-task-manager/).
