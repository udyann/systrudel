import { loadEnvFile } from 'node:process';
import { fileURLToPath } from 'node:url';

// Resolve against this checkout, even when a helper runs from another directory.
try { loadEnvFile(fileURLToPath(new URL('../.env', import.meta.url))); }
catch (error) { if (error.code !== 'ENOENT') throw error; }

export function readConfig(env = process.env) {
  const port = (name, fallback) => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const value = Number(raw);
    if (!/^\d+$/.test(raw) || !Number.isInteger(value) || value < 1 || value > 65535) {
      throw new Error(`${name} must be an integer port between 1 and 65535.`);
    }
    return value;
  };
  const config = {
    uiPort: port('PHOTOSYNTH_UI_PORT', 5173),
    companionPort: port('PHOTOSYNTH_COMPANION_PORT', 4317),
    previewPort: port('PHOTOSYNTH_PREVIEW_PORT', 4173),
  };
  if (new Set(Object.values(config)).size !== 3) throw new Error('PhotoSynthRudel UI, companion and preview ports must be different.');
  return config;
}

export const config = readConfig();
