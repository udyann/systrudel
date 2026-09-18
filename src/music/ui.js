import * as strudel from '@strudel/web';
import { createMusicState, LIMITS } from './state.js';
import { mapFeaturesToMusic } from './mapping.js';
import { MINOR_PULSE } from './templates.js';
import { createStrudelPlayer } from './strudel.js';
import { BASE_SONG, createBaseSong } from './base-song.js';
import { prepareBaseSongAudio } from './base-song-audio.js';
import { reactiveState } from '../reactivity/template-api.js';

export function createMusicControls() {
  const playButton = document.querySelector('#play-button');
  const stopButton = document.querySelector('#stop-button');
  const resetButton = document.querySelector('#reset-music');
  const status = document.querySelector('#music-status');
  const linkImage = document.querySelector('#link-image');
  const mappingStatus = document.querySelector('#mapping-status');
  const data = document.querySelector('#music-data');
  const templateSelect = document.querySelector('#music-template');
  const inputMode = document.querySelector('#music-input-mode');
  const controls = Object.fromEntries(Object.keys(LIMITS).map((key) => [key, {
    input: document.querySelector(`#music-${key}`),
    output: document.querySelector(`#music-${key}-value`),
  }]));
  let manualState = createMusicState({ templateId: BASE_SONG.id });
  let features = null;
  let busy = false;
  let transportRequest = 0;

  function setStatus(message, isError = false) {
    status.textContent = message;
    status.classList.toggle('error', isError);
  }

  const isBaseSong = () => manualState.templateId === BASE_SONG.id;
  const readControls = () => inputMode.value === 'draft' ? BASE_SONG.controls : reactiveState.getControls();
  function makePlayer() {
    return createStrudelPlayer(strudel, {
      ...(isBaseSong() ? {
        buildPattern: values => createBaseSong(strudel, values), readControls,
        prepareAudio: prepareBaseSongAudio, masterGain: true,
      } : {}),
      onError(error) {
        transportRequest += 1;
        playButton.disabled = busy;
        stopButton.disabled = true;
        setStatus(`Playback stopped: ${error.message || error}`, true);
      },
    });
  }
  let player = makePlayer();

  function renderData() {
    data.textContent = JSON.stringify({ ...manualState,
      ...(isBaseSong() ? { mode: inputMode.value, availableControls: readControls(), usedControls: BASE_SONG.usedControls } : {}),
    }, null, 2);
  }

  function render() {
    const baseSong = isBaseSong();
    const linked = !baseSong && linkImage.checked && features !== null;
    const musicState = linked ? mapFeaturesToMusic(features, manualState) : { ...manualState };
    player.update(musicState);
    for (const [key, { input, output }] of Object.entries(controls)) {
      [input.min, input.max] = LIMITS[key];
      input.value = musicState[key];
      output.value = key === 'tempo' ? `${musicState[key]} BPM`
        : key === 'cutoffHz' ? `${musicState[key]} Hz`
          : `${Math.round(musicState[key] / LIMITS.volume[1] * 100)}%`;
    }
    controls.cutoffHz.input.disabled = linked;
    controls.cutoffHz.input.closest('label').hidden = baseSong;
    linkImage.closest('label').hidden = baseSong;
    inputMode.closest('label').hidden = !baseSong;
    const template = baseSong ? BASE_SONG : MINOR_PULSE;
    document.querySelector('#template-name').textContent = `${template.name} · ${template.key}`;
    document.querySelector('#music-description').textContent = baseSong
      ? 'SR-16 drums, synth bass, human electric piano and agent trombone. Balance crossfades the two melodies.'
      : 'An eight-note sequence over four beats. Brighter images open the filter for a brighter sound.';
    mappingStatus.textContent = baseSong
      ? `${inputMode.value === 'draft' ? 'Using your fixed draft values' : 'Using live energy, density, tension and balance; updated each cycle'}. Balance runs from human piano (0) to agent trombone (1). Intensity and ambience are unused.`
      : linked
      ? `Visual brightness ${(features.brightness * 100).toFixed(1)}% → filter ${musicState.cutoffHz} Hz. Uncheck to adjust the filter manually.`
      : linkImage.checked
        ? 'Choose an image or start the camera to control the filter. Manual settings are active until then.'
        : 'Manual filter is active. Visual changes will not affect the music.';
    if (baseSong) renderData();
    else data.textContent = JSON.stringify(musicState, null, 2);
  }

  for (const [key, { input }] of Object.entries(controls)) {
    input.addEventListener('input', () => {
      manualState = createMusicState({ ...manualState, [key]: Number(input.value) });
      render();
    });
  }
  linkImage.addEventListener('change', render);
  inputMode.addEventListener('change', render);
  templateSelect.addEventListener('change', () => {
    stopPlayback();
    manualState = createMusicState({ templateId: templateSelect.value });
    player = makePlayer();
    render();
  });
  resetButton.addEventListener('click', () => {
    manualState = createMusicState({ templateId: manualState.templateId });
    render();
  });

  playButton.addEventListener('click', async () => {
    const currentRequest = ++transportRequest;
    busy = true;
    playButton.disabled = true;
    stopButton.disabled = false;
    templateSelect.disabled = true;
    setStatus(isBaseSong() ? 'Loading instruments and effects… First play needs internet access.' : 'Starting audio…');
    try {
      const started = await player.play();
      if (currentRequest !== transportRequest) return;
      if (started) setStatus(isBaseSong() ? 'Playing Base song. Input changes apply at the next cycle.' : 'Playing. Controls affect upcoming notes.');
      else {
        playButton.disabled = false;
        stopButton.disabled = true;
        setStatus('Stopped.');
      }
    } catch (error) {
      if (currentRequest !== transportRequest) return;
      playButton.disabled = false;
      stopButton.disabled = true;
      setStatus(`Could not start audio: ${error.message || error}. Check your connection, reload and try again.`, true);
    } finally {
      busy = false;
      templateSelect.disabled = false;
      if (currentRequest !== transportRequest) playButton.disabled = false;
    }
  });

  function stopPlayback() {
    transportRequest += 1;
    player.stop();
    playButton.disabled = busy;
    stopButton.disabled = true;
    setStatus('Stopped. Press Play to restart the phrase.');
  }

  stopButton.addEventListener('click', stopPlayback);
  // Also stop when leaving the page or replacing this module during development.
  window.addEventListener('pagehide', stopPlayback);
  const unsubscribe = reactiveState.subscribe(() => { if (isBaseSong()) renderData(); });
  if (import.meta.hot) import.meta.hot.dispose(() => { stopPlayback(); unsubscribe(); window.removeEventListener('pagehide', stopPlayback); });
  render();

  return {
    setFeatures(nextFeatures) {
      features = nextFeatures;
      render();
    },
  };
}
