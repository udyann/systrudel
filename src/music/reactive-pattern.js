import { normalizeControls } from '../reactivity/controls.js';
import { reactiveState } from '../reactivity/template-api.js';

/** Feed ordinary numbers into a template, holding each snapshot for whole cycles. */
export function createReactivePattern({ Pattern }, buildPattern, {
  readControls = reactiveState.getControls,
  updateEveryCycles = 1,
  onError = error => { throw error; },
} = {}) {
  if (typeof buildPattern !== 'function') throw new TypeError('A reactive template needs a buildPattern function.');
  if (!Number.isSafeInteger(updateEveryCycles) || updateEveryCycles < 1) {
    throw new RangeError('updateEveryCycles must be a positive integer.');
  }
  const cache = new Map();
  const pattern = new Pattern(state => {
    try {
      return state.span.spanCycles.flatMap(span => {
        const group = Math.floor(Number(span.begin) / updateEveryCycles);
        if (!cache.has(group)) {
          const built = buildPattern(normalizeControls(readControls()));
          if (!built || typeof built.query !== 'function') {
            throw new TypeError('buildPattern must return a Strudel pattern synchronously.');
          }
          cache.set(group, built);
          // Keep recent lookahead/overlapping queries stable without growing forever.
          if (cache.size > 16) cache.delete(cache.keys().next().value);
        }
        // Preserve absolute musical time, including phrases spanning several cycles.
        return cache.get(group).query(state.setSpan(span));
      });
    } catch (error) {
      // Strudel's queryArc catches errors; explicitly notify the player first.
      onError(error);
      return [];
    }
  });
  return { pattern, reset: () => cache.clear() };
}
