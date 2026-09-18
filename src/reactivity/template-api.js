import { CONTROL_DEFAULTS, CONTROL_NAMES, controlsFromDerived, normalizeControls } from './controls.js';

// Import this singleton from your template module. The dashboard publishes into it.
let snapshot = null;
const listeners = new Set();
export const reactiveState = {
  getSnapshot: () => snapshot,
  getControls: () => snapshot?.controls ?? CONTROL_DEFAULTS,
  subscribe(listener) { listeners.add(listener); if (snapshot) listener(snapshot); return () => listeners.delete(listener); },
};
export function publishState(state) {
  snapshot = Object.freeze({ ...state, controls: state.derived ? controlsFromDerived(state.derived) : normalizeControls(state.controls) });
  for (const listener of listeners) {
    try { listener(snapshot); } catch (error) { console.error('Reactive template subscriber failed', error); }
  }
}
export function createControlSignals(signal) {
  return Object.fromEntries(CONTROL_NAMES.map(key => [key, signal(() => reactiveState.getControls()[key])]));
}
