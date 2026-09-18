export function createPageActivity(target = window) {
  let keys = 0, clicks = 0, scroll = 0, lastInput = Date.now(), sampledAt = Date.now();
  const keydown = event => { if (!['Shift', 'Control', 'Alt', 'Meta'].includes(event.key)) keys++; lastInput = Date.now(); };
  const pointerdown = () => { clicks++; lastInput = Date.now(); };
  const wheel = event => { scroll += Math.min(20, Math.abs(event.deltaY) / (event.deltaMode === 1 ? 3 : event.deltaMode === 2 ? 1 : 100)); lastInput = Date.now(); };
  const move = () => { lastInput = Date.now(); };
  const handlers = { keydown, pointerdown, wheel, pointermove: move };
  for (const [name, fn] of Object.entries(handlers)) target.addEventListener(name, fn, { passive: true });
  return {
    sample(now = Date.now()) {
      const dt = Math.max(.001, (now - sampledAt) / 1000);
      const result = { scope: 'page', sampledAt: now, keysPerSecond: keys / dt, clicksPerSecond: clicks / dt, scrollPerSecond: scroll / dt, idleSeconds: (now - lastInput) / 1000 };
      keys = 0; clicks = 0; scroll = 0; sampledAt = now; return result;
    },
    close() { for (const [name, fn] of Object.entries(handlers)) target.removeEventListener(name, fn); },
  };
}
