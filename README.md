# PhotoSynthRudel

A Strudel-based reactive soundscape project. A local Node companion collects
Windows workload and optional human/agent activity; the browser derives six
smooth musical controls from those inputs and environmental context. The
dashboard shows availability, workload, performer balance, and mapping profiles.
Your Base song is integrated with live energy, density, tension and balance. The original
webcam/photo-to-filter demo remains selectable.

Start with the [reactive V1 guide](docs/reactive-v1.md) for inputs, Codex setup,
the template API, limitations and work-session comparisons.

For your ordinary Codex sidebar workflow, use the
[IDE integration guide](integrations/codex/README.md). Project lifecycle hooks
provide turn, tool and subagent activity without running tasks through `codex exec`.

## Run

```powershell
cd C:\photosynthrudel
npm install
npm run dev
```

Open http://localhost:5173. This command starts both Vite and local telemetry.
Stop an older dev server before restarting. Windows-wide input is optional and
starts only after enabling it in the dashboard. Weather uses an optional city
lookup. The companion binds only to 127.0.0.1:4317.

Requires Node 20.19+ or 22.12+ as specified by
[Vite's compatibility requirements](https://vite.dev/guide/). The prototype
was developed with Node 26.9.0.

## Verify

```powershell
npm test
npm run build
npm run preview
```

For preview, also run `npm run telemetry` in another terminal. The four mapping
profiles preview control routing; they are not additional playable compositions.
See the [V1 comparison exercise](docs/reactive-v1.md#v1-comparison-exercise).

In the browser:

1. Select a PNG, JPEG, or WebP. Check the preview, source/analysis dimensions,
   brightness, RGB values, color swatch, and expandable normalized data.
2. A solid black image should report brightness 0 and RGB (0, 0, 0); white
   should report brightness 1 and RGB (255, 255, 255). Red should report
   brightness 0.2126 (displayed as 0.213) and RGB (255, 0, 0).
3. Replace the image, select the same image again, and use Clear. No old result
   should reappear after clearing or replacing a pending upload.
4. Try an unreadable image or a fully transparent PNG: an explanatory message
   should appear, with no stale results. Files over 20 MB are rejected.
5. Narrow the browser window: the preview and statistics should stack.

Camera checks (on the laptop at `http://localhost:5173`):

1. Press Start camera and allow access. The live preview and feature values
   should appear. The app requests video only, with no microphone access.
2. Select Original image demo and press Play. Move between brighter/darker scenes or partially cover the lens:
   brightness and filter cutoff should respond smoothly while the melody continues.
3. Stop camera or Clear input: the camera indicator should turn off, the preview
   should clear, and music should return to manual settings. Music Stop is separate
   from camera Stop, so visuals can continue while sound is off.
4. Switch from camera to an uploaded image and back. Each should replace the
   active visual input. An old upload must not replace a newly started camera.
5. Try canceling while permission is pending, then granting it: the camera must
   stay stopped. Denied permission should produce a message and allow retrying.
6. Switch to another tab, minimize the browser, or navigate away: camera capture
   should stop. Return and use Start camera to resume.

Expand **Feature data and analysis timing** to inspect frame processing time,
or the separate file-decode, Canvas, and feature-calculation times for an upload.
Upload timings begin after the file chooser returns; they do not measure how
long opening the chooser or selecting a file takes.

Base song checks:

1. Select Base song, then Draft values and Play. The first load fetches the
   SR-16 samples and GM instruments and enables distortion/reverb effects.
   Expect your drums, bass, human piano and agent trombone together at 120 BPM.
2. Switch to Live inputs. Energy, density, tension and balance update at cycle
   boundaries; the phrase continues. Balance fades between piano and trombone.
   Intensity and ambience currently have no mapping.
3. Adjust master volume (zero mutes) and tempo. Stop/Play restarts the phrase.
   Stop while instruments are loading must prevent playback from starting later.
4. Switch songs while playing; the previous song should stop. The new selection
   starts only when you press Play. Check both songs after switching back.

Original image demo checks (select it in Song first):

1. Press Play without an image: an eight-note C-minor melody should repeat.
   Adjust tempo (60–160 BPM), volume, and filter while it plays.
2. With image linking checked, upload a dark image, then a bright one. The
   filter should move from a muted sound toward a brighter one; notes and
   rhythm should stay the same. The filter slider displays the mapped value.
3. Uncheck image linking: the manual filter setting should return. Clear the
   image and confirm that playback continues with manual settings. Reset
   controls restores default values; an active image link still owns the filter.
4. Press Stop, then Play again. Stop should silence scheduled voices; Play
   restarts the phrase. Repeated clicks must not create overlapping loops.
5. Volume zero should mute the sequence. Audio starts only after pressing Play.

Automated tests cover image statistics, bounded music state, mapping, real
Strudel note events/control signals, and playback lifecycle with a fake audio
runtime. Camera tests cover frame throttling, smoothing, cancellation, denied
permission, disconnection, and cleanup with simulated media objects. Real webcam
capture, audible playback, and browser permissions need the manual checks above.

## Structure

- `server/`: local telemetry, Windows collectors, agent state and Codex adapters.
- `src/reactivity/`: smoothing, derived state, profiles, dashboard and template API.
- `scripts/`: combined dev runner, CLI bridge and advisory Codex hook handler.
- `integrations/codex/`: optional lifecycle hook configuration example.
- `docs/reactive-v1.md`: full runtime and template contracts.

To write your own Strudel compositions, start with the
[template authoring guide](templates/README.md) and
[starter composition](templates/starter.strudel). Your
[base song draft](templates/base-song.strudel) has an integrated version in
`src/music/base-song.js`; additional drafts need their own integration step.

- `src/image/load.js`: local file decoding, temporary object URL cleanup,
  proportional resize, and Canvas pixel reading.
- `src/image/features.js`: pure RGBA-to-features calculation with no DOM or
  music dependencies; shared by uploaded images and live camera frames.
- `src/image/camera.js`: camera stream lifecycle and throttled frame sampling.
- `src/image/smoothing.js`: time-based smoothing for live visual features.
- `src/main.js`: upload lifecycle, stale-result protection, and UI updates.
- `src/music/state.js`: small shared state with bounded musical controls.
- `src/music/templates.js`: one declarative starting structure, Minor pulse.
- `src/music/mapping.js`: image brightness to filter cutoff, leaving the rest
  of the state intact.
- `src/music/pattern.js`: state-reading control signals over one fixed pattern.
- `src/music/strudel.js`: audio initialization, one scheduler, and play/stop.
- `src/music/ui.js`: manual controls, image linking, and playback status.
- `src/style.css`: minimal responsive styling.
- `test/features.test.js`: known-color and transparency checks using Node's
  built-in test runner.
- `test/music.test.js`: music-state, pattern, and transport checks.
- `test/camera.test.js`: live input lifecycle and smoothing checks.

## Feature contract

```js
{
  brightness: 0.2126,
  rgb: { r: 1, g: 0, b: 0 }
}
```

All feature values use a 0–1 range. The UI also shows rounded 0–255 RGB values
and a hex color. Average color is not a dominant-color estimate.

For bounded pixel processing, the image is resized to at most 512 pixels on
its longest edge (without upscaling). Statistics describe that resized image,
so small details may be blended. The original image still needs to be decoded
by the browser; the upload limit does not bound decoded memory usage.
RGB means use alpha weighting: fully transparent pixels are ignored, and
partially transparent pixels contribute in proportion to their opacity.

Brightness is `0.2126*r + 0.7152*g + 0.0722*b` over the mean normalized sRGB
channels. It is a useful perceived-brightness proxy, not gamma-corrected
physical luminance. Hue, saturation, edge density, and motion are not yet
extracted. Use static images for uploads; animated files are not sampled over time.

The webcam has a separate native video preview. Analysis reuses a Canvas with
a maximum edge of 160 pixels and samples at most 10 times per second, skipping
duplicate frames. Camera brightness and RGB values use exponential smoothing
with a 250 ms time constant; both the feature display and musical mapping use
those smoothed values. Uploaded images are analyzed once without smoothing.
Camera tracks are released on Stop, Clear, source changes, errors, page exit,
and when the tab becomes hidden. No frames are uploaded or recorded.

## Music contract

```js
{
  templateId: 'minor-pulse',
  tempo: 96,
  cutoffHz: 1400,
  volume: 0.15
}
```

The UI keeps manual state separately from the effective mapped state. An image
only overrides `cutoffHz`: `200 * 30 ** brightness`, rounded to whole Hz.
Clearing the image or disabling the link restores the manual filter value.
The volume slider maps 0–100% to a conservative gain range of 0–0.4; it is not
a measured loudness percentage.

One cycle is four beats: `cyclesPerSecond = tempo / 240`. The pattern is built
once from the template's eight MIDI notes. Filter and gain are read through
Strudel signals as upcoming notes are scheduled, with a short scheduling
lookahead; changing them does not restart the melody or compile source code.
Camera smoothing happens before this mapping; the audio scheduler continues
independently of the preview and frame analysis.

Audio uses Strudel's native sawtooth synth, amplitude envelope, and low-pass
filter, with no external sample downloads. Worklet effects are disabled for
this voice. Strudel is pinned in `package.json` and the lockfile. Future effects
that require AudioWorklets will need to enable initialization for those effects.

## Next stage

The reactive V1 input/state infrastructure is now available. Phone camera/motion,
TouchDesigner and user-authored soundscape integration remain possible next steps.
The browser camera API also supports phones, but serving this app from a laptop's
plain HTTP LAN address does not satisfy its secure-context requirement; mobile
testing needs HTTPS or a suitable localhost development setup. Phone-to-laptop
control would additionally need a connection to send features/control values.

Strudel documents device-motion signals, but the installed `@strudel/web` bundle
does not include `enableMotion`; that input still needs an integration. Camera
scene motion and the phone's physical motion are separate possible feature sources.
TouchDesigner could be an optional visual processor connected over WebSockets.
These integrations, structured random generation, and additional templates are
not implemented yet.

## Strudel

Uses [Strudel](https://strudel.cc/), licensed AGPL-3.0-or-later. See the upstream
[integration guide](https://strudel.cc/technical-manual/project-start/) and
the license included with the installed package.
