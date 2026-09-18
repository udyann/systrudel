import './style.css';
import { extractFeatures } from './image/features.js';
import { loadImage } from './image/load.js';
import { createCamera } from './image/camera.js';
import { createMusicControls } from './music/ui.js';
import { createReactiveDashboard } from './reactivity/dashboard.js';

const imageInput = document.querySelector('#image-input');
const clearButton = document.querySelector('#clear-button');
const status = document.querySelector('#status');
const results = document.querySelector('#results');
const preview = document.querySelector('#preview');
const video = document.querySelector('#camera-preview');
const startCameraButton = document.querySelector('#start-camera');
const stopCameraButton = document.querySelector('#stop-camera');
let selectionId = 0;
const reactive = createReactiveDashboard(document.querySelector('#reactivity-dashboard'));
const musicControls = createMusicControls();
const camera = createCamera({
  video,
  onFrame: showCameraFrame,
  onError(error) {
    selectionId += 1;
    setCameraButtons(false);
    clearResults();
    clearButton.disabled = true;
    setStatus(error.message, true);
  },
});

function setCameraButtons(active) {
  startCameraButton.disabled = active;
  stopCameraButton.disabled = !active;
}

function setStatus(message, isError = false) {
  status.textContent = message;
  status.classList.toggle('error', isError);
}

function clearResults() {
  results.hidden = true;
  video.hidden = true;
  preview.hidden = false;
  preview.width = 1;
  preview.height = 1;
  document.querySelector('#feature-data').textContent = '';
  musicControls.setFeatures(null);
  reactive.setVisual(null);
}

function showFeatures(features) {
  const { brightness, rgb } = features;
  const channels = [rgb.r, rgb.g, rgb.b].map((value) => Math.round(value * 255));
  const color = `#${channels.map((value) => value.toString(16).padStart(2, '0')).join('')}`;

  document.querySelector('#brightness-value').textContent = `${brightness.toFixed(3)} (${(brightness * 100).toFixed(1)}%)`;
  document.querySelector('#brightness-meter').value = brightness;
  ['red', 'green', 'blue'].forEach((channel, index) => {
    document.querySelector(`#${channel}-value`).textContent = channels[index];
  });
  document.querySelector('#color-swatch').style.backgroundColor = color;
  document.querySelector('#color-value').textContent = color.toUpperCase();
  document.querySelector('#feature-data').textContent = JSON.stringify(features, null, 2);
  results.hidden = false;
  musicControls.setFeatures(features);
  reactive.setVisual(features);
}

function showResults(file, image, features, featureMs) {
  preview.width = image.canvas.width;
  preview.height = image.canvas.height;
  const context = preview.getContext('2d');
  if (!context) throw new Error('Canvas previews are unavailable in this browser.');
  context.drawImage(image.canvas, 0, 0);
  preview.setAttribute('aria-label', `Preview of ${file.name}`);
  document.querySelector('#preview-heading').textContent = 'Image preview';
  document.querySelector('#image-name').textContent = file.name;
  document.querySelector('#image-size').textContent =
    `${image.originalWidth} × ${image.originalHeight} original · ${preview.width} × ${preview.height} analyzed`;
  document.querySelector('#feature-explanation').textContent =
    'Values describe the resized image. Transparent pixels are ignored; partially transparent pixels contribute proportionally.';
  document.querySelector('#analysis-timing').textContent =
    `File decode: ${image.timing.decodeMs.toFixed(1)} ms · Canvas resize/read: ${image.timing.canvasMs.toFixed(1)} ms · Features: ${featureMs.toFixed(1)} ms. Timing starts after file selection.`;
  showFeatures(features);
}

function showCameraFrame({ features, width, height, sourceWidth, sourceHeight, processingMs }) {
  video.hidden = false;
  preview.hidden = true;
  document.querySelector('#preview-heading').textContent = 'Live camera';
  document.querySelector('#image-name').textContent = 'Webcam';
  document.querySelector('#image-size').textContent =
    `${sourceWidth} × ${sourceHeight} video · ${width} × ${height} analyzed`;
  document.querySelector('#feature-explanation').textContent =
    'Camera values are smoothed to reduce flicker. The same smoothed brightness controls the music.';
  document.querySelector('#analysis-timing').textContent =
    `Frame processing: ${processingMs.toFixed(1)} ms · Up to 10 updates/second · Smoothing: 250 ms time constant.`;
  showFeatures(features);
}

imageInput.addEventListener('change', async () => {
  const file = imageInput.files[0];
  if (!file) return;

  // Allow reselecting the same file and ignore stale asynchronous decodes.
  imageInput.value = '';
  const currentSelection = ++selectionId;
  camera.stop();
  setCameraButtons(false);
  clearResults();
  clearButton.disabled = false;
  setStatus(`Analyzing ${file.name}…`);

  try {
    const image = await loadImage(file);
    if (currentSelection !== selectionId) return;
    const featureStartedAt = performance.now();
    const features = extractFeatures(image.pixels);
    showResults(file, image, features, performance.now() - featureStartedAt);
    setStatus('Analysis complete. Choose another image to compare.');
  } catch (error) {
    if (currentSelection !== selectionId) return;
    clearResults();
    setStatus(error instanceof Error ? error.message : 'The image could not be analyzed.', true);
  }
});

clearButton.addEventListener('click', () => {
  selectionId += 1;
  camera.stop();
  setCameraButtons(false);
  imageInput.value = '';
  clearResults();
  clearButton.disabled = true;
  setStatus('No visual input selected.');
});

startCameraButton.addEventListener('click', async () => {
  const currentSelection = ++selectionId;
  clearResults();
  clearButton.disabled = false;
  setCameraButtons(true);
  setStatus('Opening camera. Allow camera access when your browser asks.');
  try {
    const started = await camera.start();
    if (currentSelection !== selectionId || !started) return;
    setStatus('Camera live. Press Play to hear the light change the filter.');
  } catch (error) {
    if (currentSelection !== selectionId) return;
    setCameraButtons(false);
    clearResults();
    clearButton.disabled = true;
    setStatus(error.message, true);
  }
});

function stopCamera(message = 'Camera stopped. Manual music controls are active.') {
  selectionId += 1;
  camera.stop();
  setCameraButtons(false);
  clearResults();
  clearButton.disabled = true;
  setStatus(message);
}

stopCameraButton.addEventListener('click', () => stopCamera());
function onVisibilityChange() {
  if (document.hidden && camera.isActive()) {
    stopCamera('Camera stopped while this tab was hidden. Press Start camera to resume.');
  }
}
function releaseCamera() {
  selectionId += 1;
  camera.stop();
}
document.addEventListener('visibilitychange', onVisibilityChange);
window.addEventListener('pagehide', releaseCamera);
if (import.meta.hot) import.meta.hot.dispose(() => {
  reactive.dispose();
  releaseCamera();
  document.removeEventListener('visibilitychange', onVisibilityChange);
  window.removeEventListener('pagehide', releaseCamera);
});
