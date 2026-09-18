import test from 'node:test';
import assert from 'node:assert/strict';
import { extractFeatures } from '../src/image/features.js';

const featuresOf = (...pixels) => extractFeatures({ data: new Uint8ClampedArray(pixels.flat()) });
const closeTo = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} ≠ ${expected}`);

test('black and white span the normalized brightness range', () => {
  assert.deepEqual(featuresOf([0, 0, 0, 255]), { brightness: 0, rgb: { r: 0, g: 0, b: 0 } });
  const white = featuresOf([255, 255, 255, 255]);
  closeTo(white.brightness, 1);
  assert.deepEqual(white.rgb, { r: 1, g: 1, b: 1 });
});

test('primary colors use perceptual brightness weights', () => {
  closeTo(featuresOf([255, 0, 0, 255]).brightness, 0.2126);
  closeTo(featuresOf([0, 255, 0, 255]).brightness, 0.7152);
  closeTo(featuresOf([0, 0, 255, 255]).brightness, 0.0722);
});

test('averages all visible pixels rather than selecting a dominant color', () => {
  const features = featuresOf([255, 0, 0, 255], [0, 0, 255, 255]);
  assert.deepEqual(features.rgb, { r: 0.5, g: 0, b: 0.5 });
  closeTo(features.brightness, 0.1424);
});

test('transparent RGB bytes do not bias the result', () => {
  assert.deepEqual(featuresOf([255, 0, 0, 255], [0, 0, 255, 0]), featuresOf([255, 0, 0, 255]));
});

test('partial transparency weights contributions by alpha', () => {
  const features = featuresOf([255, 0, 0, 255], [0, 0, 255, 128]);
  closeTo(features.rgb.r, 255 / 383);
  closeTo(features.rgb.b, 128 / 383);
});

test('fully transparent images report that there are no visible pixels', () => {
  assert.throws(() => featuresOf([255, 100, 0, 0]), /fully transparent/);
});

test('empty or incomplete pixel data is rejected', () => {
  assert.throws(() => featuresOf(), /RGBA/);
  assert.throws(() => featuresOf([255, 0, 0]), /RGBA/);
});
