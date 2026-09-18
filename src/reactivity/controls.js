// Public template contract. Drafts and the live adapter share these defaults.
export const CONTROL_DEFAULTS = Object.freeze({
  energy: 0.3,
  density: 0.5,
  tension: 0.5,
  balance: 0.5,
  intensity: 0.2,
  ambience: 0.4,
});
export const CONTROL_NAMES = Object.freeze(Object.keys(CONTROL_DEFAULTS));

const derivedKeys = {
  energy: 'energy', density: 'density', tension: 'tension',
  balance: 'human_agent_balance', intensity: 'compute_intensity', ambience: 'ambient_brightness',
};

export function normalizeControls(values) {
  return Object.freeze(Object.fromEntries(CONTROL_NAMES.map(key => {
    const value = values?.[key];
    return [key, Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : CONTROL_DEFAULTS[key]];
  })));
}

export function controlsFromDerived(derived) {
  return normalizeControls(Object.fromEntries(CONTROL_NAMES.map(key => [key, derived?.[derivedKeys[key]]])));
}
