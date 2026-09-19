# Manual checks

These checks cover real audio, cameras and browser permissions in addition to
`npm test`. Run them on the laptop you will use for the demo.

## Verify

```powershell
npm test
npm run build
npm run preview
```

For preview, also run `npm run telemetry` in another terminal. The four mapping
profiles preview control routing; they are not additional playable compositions.
See the [V1 comparison exercise](reactive-v1.md#v1-comparison-exercise).

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
