// Node equivalent of Vite's exact aliases for the GM registry integration test.
const bundle = new URL('../../node_modules/@strudel/web/dist/index.mjs', import.meta.url).href;
export function resolve(specifier, context, next) {
  if (/^@strudel\/(core|webaudio)$/.test(specifier)) return { url: bundle, shortCircuit: true };
  return next(specifier, context);
}
