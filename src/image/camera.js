import { extractFeatures } from './features.js';
import { smoothFeatures } from './smoothing.js';

const SAMPLE_INTERVAL_MS = 100;
const MAX_ANALYSIS_EDGE = 160;

function cameraError(error) {
  const messages = {
    NotAllowedError: 'Camera access was denied. Allow camera access in your browser’s site settings, then try again.',
    NotFoundError: 'No camera was found. Connect a webcam and try again.',
    NotReadableError: 'The camera could not be opened. Close other apps using it and try again.',
    OverconstrainedError: 'This camera cannot provide the requested video settings.',
  };
  return new Error(messages[error?.name] || error?.message || 'The camera could not be started.');
}

/**
 * Stream directly to a video element. Reuse one small Canvas for analysis.
 * The environment argument lets lifecycle tests run without opening a camera.
 */
export function createCamera({ video, onFrame, onError }, environment = globalThis) {
  let stream = null;
  let frameId = null;
  let requestId = 0;
  let pending = false;
  const canvas = environment.document.createElement('canvas');
  const context = canvas.getContext('2d', { willReadFrequently: true });

  function release(candidate) {
    candidate?.getTracks().forEach((track) => {
      track.removeEventListener('ended', disconnected);
      track.stop();
    });
  }

  function stop() {
    requestId += 1;
    pending = false;
    if (frameId !== null) environment.cancelAnimationFrame(frameId);
    frameId = null;
    video.pause();
    video.srcObject = null;
    release(stream);
    stream = null;
  }

  function fail(error) {
    stop();
    onError(cameraError(error));
  }

  function disconnected() {
    if (stream) fail(new Error('The camera was disconnected. Reconnect it and press Start camera.'));
  }

  async function start() {
    stop();
    const currentRequest = requestId;
    pending = true;
    try {
      if (!environment.isSecureContext) {
        throw new Error('Camera access needs HTTPS or localhost. Open this app at http://localhost:5173 on this laptop.');
      }
      if (!environment.navigator.mediaDevices?.getUserMedia) {
        throw new Error('Camera access is unavailable in this browser. Try a current version of Chrome, Edge, or Firefox.');
      }
      if (!context) throw new Error('Canvas image analysis is unavailable in this browser.');

      const candidate = await environment.navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          frameRate: { ideal: 24, max: 30 },
          facingMode: 'user',
        },
      });
      // Permission may be granted after Stop, Clear, or another input selection.
      if (currentRequest !== requestId) {
        release(candidate);
        return false;
      }
      stream = candidate;
      stream.getVideoTracks().forEach((track) => track.addEventListener('ended', disconnected));
      video.srcObject = stream;
      await video.play();
      if (currentRequest !== requestId) return false;
      pending = false;

      let previous = null;
      let lastSampleAt = -Infinity;
      let lastVideoTime = -1;
      let lastFrameAt = environment.performance.now();

      function sample(now) {
        if (currentRequest !== requestId) return;
        frameId = null;
        try {
          if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0
              && video.currentTime !== lastVideoTime && now - lastSampleAt >= SAMPLE_INTERVAL_MS) {
            const startedAt = environment.performance.now();
            const scale = Math.min(1, MAX_ANALYSIS_EDGE / Math.max(video.videoWidth, video.videoHeight));
            const width = Math.max(1, Math.round(video.videoWidth * scale));
            const height = Math.max(1, Math.round(video.videoHeight * scale));
            if (canvas.width !== width) canvas.width = width;
            if (canvas.height !== height) canvas.height = height;
            context.drawImage(video, 0, 0, width, height);
            const raw = extractFeatures(context.getImageData(0, 0, width, height));
            const features = smoothFeatures(previous, raw, now - lastSampleAt);
            previous = features;
            lastSampleAt = now;
            lastFrameAt = now;
            lastVideoTime = video.currentTime;
            onFrame({
              features,
              width,
              height,
              sourceWidth: video.videoWidth,
              sourceHeight: video.videoHeight,
              processingMs: environment.performance.now() - startedAt,
            });
          } else if (now - lastFrameAt > 5000) {
            throw new Error('The camera stopped delivering frames. Press Start camera to reconnect.');
          }
          if (currentRequest === requestId) frameId = environment.requestAnimationFrame(sample);
        } catch (error) {
          if (currentRequest === requestId) fail(error);
        }
      }
      frameId = environment.requestAnimationFrame(sample);
      return true;
    } catch (error) {
      if (currentRequest !== requestId) return false;
      stop();
      throw cameraError(error);
    }
  }

  return { start, stop, isActive: () => pending || stream !== null };
}
