import { createMusicState, LIMITS } from './state.js';
import { createMusicPattern } from './pattern.js';
import { MINOR_PULSE } from './templates.js';
import { createReactivePattern } from './reactive-pattern.js';

/** Own one Strudel scheduler. The runtime is supplied by the browser UI. */
export function createStrudelPlayer(runtime, {
  onError = () => {}, buildPattern, updateEveryCycles = 1,
  readControls, prepareAudio = async () => {}, masterGain = false,
} = {}) {
  let state = createMusicState();
  const reactiveTemplate = buildPattern === undefined ? null : createReactivePattern(runtime, buildPattern, { readControls, updateEveryCycles, onError: fail });
  let scheduler;
  let audioReady;
  let starting = false;
  let playing = false;
  let requestId = 0;

  function stop() {
    requestId += 1;
    playing = false;
    scheduler?.stop();
    // Disconnect active/scheduled voices too, so Stop has no lingering tails.
    if (scheduler) runtime.getSuperdoughAudioController().reset();
  }

  function fail(error) {
    stop();
    onError(error);
  }

  function update(nextState) {
    state = createMusicState(nextState);
    scheduler?.setCps(state.tempo / (60 * MINOR_PULSE.beatsPerCycle));
  }

  async function play() {
    if (playing || starting) return false;
    starting = true;
    const currentRequest = ++requestId;

    try {
      // Resume directly inside the Play gesture, before any asynchronous work.
      const context = runtime.getAudioContext();
      const resumed = context.resume();
      if (!audioReady) {
        // Templates can explicitly load their samples/effects before scheduling.
        audioReady = Promise.all([
          runtime.registerSynthSounds(),
          runtime.initAudio({ disableWorklets: true }),
          prepareAudio(runtime),
        ]).catch((error) => {
          audioReady = undefined;
          throw error;
        });
      }
      await Promise.all([resumed, audioReady]);
      if (currentRequest !== requestId) return false;
      if (context.state !== 'running') {
        throw new Error('Audio is paused by the browser. Press Play again to enable it.');
      }

      if (!scheduler) {
        scheduler = new runtime.Cyclist({
          getTime: () => context.currentTime,
          onError: fail,
          onTrigger: (...args) => {
            const triggerRequest = requestId;
            Promise.resolve(runtime.webaudioOutput(...args)).catch((error) => {
              if (triggerRequest === requestId) fail(error);
            });
          },
        });
        let pattern = reactiveTemplate?.pattern ?? createMusicPattern(runtime, () => state);
        if (masterGain) pattern = pattern.fmap(value => ({ ...value, gain: (value.gain ?? 1) * state.volume / LIMITS.volume[1] }));
        await scheduler.setPattern(pattern);
      }
      if (currentRequest !== requestId) return false;
      reactiveTemplate?.reset();
      update(state);
      await scheduler.start();
      if (currentRequest !== requestId) {
        scheduler.stop();
        return false;
      }
      playing = true;
      return true;
    } catch (error) {
      if (currentRequest !== requestId) return false;
      stop();
      throw error;
    } finally {
      starting = false;
    }
  }

  return { play, stop, update };
}
