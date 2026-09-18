import test from 'node:test';
import assert from 'node:assert/strict';
import { createCamera } from '../src/image/camera.js';
import { smoothFeatures } from '../src/image/smoothing.js';

const dark = { brightness: 0, rgb: { r: 0, g: 0, b: 0 } };
const bright = { brightness: 1, rgb: { r: 1, g: 1, b: 1 } };

test('first live frame is immediate; following frames approach the target gradually', () => {
  const first = smoothFeatures(null, dark, 100);
  assert.deepEqual(first, dark);
  assert.notEqual(first.rgb, dark.rgb);
  const next = smoothFeatures(first, bright, 100);
  assert.ok(next.brightness > 0.3 && next.brightness < 0.34);
  assert.equal(next.rgb.r, next.brightness);
  assert.deepEqual(first, dark);
  assert.deepEqual(smoothFeatures(first, bright, 0), dark);
});

test('smoothing response depends on elapsed time, not the number of frames', () => {
  const once = smoothFeatures(dark, bright, 200);
  const twice = smoothFeatures(smoothFeatures(dark, bright, 100), bright, 100);
  assert.ok(Math.abs(once.brightness - twice.brightness) < 1e-12);
  const settled = smoothFeatures(dark, bright, 3000);
  assert.ok(settled.brightness > 0.999 && settled.brightness <= 1);
});

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function harness() {
  const frames = [];
  const errors = [];
  const callbacks = new Map();
  const calls = { stopped: 0, constraints: [], draw: [] };
  let clock = 0;
  let frameId = 0;
  let pixels = [0, 0, 0, 255];
  const track = new EventTarget();
  track.stop = () => { calls.stopped += 1; };
  const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: (...args) => calls.draw.push(args),
      getImageData: () => ({ data: new Uint8ClampedArray(pixels) }),
    }),
  };
  const video = {
    videoWidth: 640, videoHeight: 480, readyState: 4, currentTime: 0,
    srcObject: null, play: async () => {}, pause: () => {},
  };
  const environment = {
    isSecureContext: true,
    document: { createElement: () => canvas },
    performance: { now: () => clock },
    navigator: { mediaDevices: { getUserMedia: async (constraints) => {
      calls.constraints.push(constraints);
      return stream;
    } } },
    requestAnimationFrame: (callback) => { callbacks.set(++frameId, callback); return frameId; },
    cancelAnimationFrame: (id) => callbacks.delete(id),
  };
  const camera = createCamera({ video, onFrame: (frame) => frames.push(frame), onError: (error) => errors.push(error) }, environment);
  return {
    camera, video, environment, stream, track, frames, errors, callbacks, calls, canvas,
    color: (rgba) => { pixels = rgba; },
    tick(now, videoTime = now / 1000) {
      clock = now;
      video.currentTime = videoTime;
      const entry = callbacks.entries().next().value;
      assert.ok(entry, 'a frame callback should be scheduled');
      callbacks.delete(entry[0]);
      entry[1](now);
    },
  };
}

test('camera analyzes bounded frames at no more than 10 Hz and never requests audio', async () => {
  const h = harness();
  assert.equal(h.calls.constraints.length, 0, 'camera starts only when requested');
  assert.equal(await h.camera.start(), true);
  assert.equal(h.calls.constraints[0].audio, false);
  h.tick(0);
  h.tick(50);
  h.tick(100);
  assert.equal(h.frames.length, 2);
  assert.deepEqual([h.canvas.width, h.canvas.height], [160, 120]);
  assert.deepEqual(h.frames[0].features, dark);
  h.camera.stop();
  assert.equal(h.video.srcObject, null);
  assert.equal(h.calls.stopped, 1);
  assert.equal(h.callbacks.size, 0);
  assert.equal(h.camera.isActive(), false);
});

test('duplicate video frames are skipped, and the music receives smoothed features', async () => {
  const h = harness();
  await h.camera.start();
  h.tick(0, 0);
  h.tick(100, 0);
  assert.equal(h.frames.length, 1);
  h.color([255, 255, 255, 255]);
  h.tick(200);
  assert.ok(h.frames[1].features.brightness > 0.5 && h.frames[1].features.brightness < 0.6);
  h.camera.stop();
  await h.camera.start();
  h.tick(300);
  assert.ok(h.frames[2].features.brightness > 0.999, 'a new stream must reset smoothing history');
  h.camera.stop();
});

test('canceling pending camera permission releases a stream granted afterward', async () => {
  const h = harness();
  const permission = deferred();
  h.environment.navigator.mediaDevices.getUserMedia = () => permission.promise;
  const starting = h.camera.start();
  assert.equal(h.camera.isActive(), true);
  h.camera.stop();
  permission.resolve(h.stream);
  assert.equal(await starting, false);
  assert.equal(h.calls.stopped, 1);
  assert.equal(h.video.srcObject, null);
  assert.equal(h.callbacks.size, 0);
});

test('canceling while video starts never schedules a late sampling loop', async () => {
  const h = harness();
  const ready = deferred();
  h.video.play = () => ready.promise;
  const starting = h.camera.start();
  await Promise.resolve();
  h.camera.stop();
  ready.resolve();
  assert.equal(await starting, false);
  assert.equal(h.calls.stopped, 1);
  assert.equal(h.callbacks.size, 0);
});

test('denied camera permission reports an actionable error and can be retried', async () => {
  const h = harness();
  h.environment.navigator.mediaDevices.getUserMedia = async () => { throw { name: 'NotAllowedError' }; };
  await assert.rejects(h.camera.start(), /Camera access was denied/);
  assert.equal(h.camera.isActive(), false);
  h.environment.navigator.mediaDevices.getUserMedia = async () => h.stream;
  assert.equal(await h.camera.start(), true);
  h.camera.stop();
});

test('video playback failure releases the camera', async () => {
  const h = harness();
  h.video.play = async () => { throw new Error('Video failed'); };
  await assert.rejects(h.camera.start(), /Video failed/);
  assert.equal(h.calls.stopped, 1);
  assert.equal(h.video.srcObject, null);
});

test('camera disconnection ends sampling and reports the loss', async () => {
  const h = harness();
  await h.camera.start();
  h.track.dispatchEvent(new Event('ended'));
  assert.equal(h.errors.length, 1);
  assert.match(h.errors[0].message, /disconnected/);
  assert.equal(h.calls.stopped, 1);
  assert.equal(h.callbacks.size, 0);
});

test('a stalled camera reports an error and releases its tracks', async () => {
  const h = harness();
  await h.camera.start();
  h.tick(0, 0);
  h.tick(5100, 0);
  assert.match(h.errors[0].message, /stopped delivering frames/);
  assert.equal(h.calls.stopped, 1);
  assert.equal(h.callbacks.size, 0);
});

test('insecure contexts fail before requesting the camera', async () => {
  const h = harness();
  h.environment.isSecureContext = false;
  await assert.rejects(h.camera.start(), /HTTPS or localhost/);
  assert.equal(h.calls.constraints.length, 0);
});
