import { createServer } from 'vite';
import { startCompanion } from '../server/server.js';

let companion, vite;
try {
  companion = await startCompanion();
  vite = await createServer();
  await vite.listen();
  vite.printUrls();
  console.log('Local telemetry is running. Windows-wide activity starts only when enabled in the dashboard.');
} catch (error) {
  await vite?.close(); await companion?.close();
  console.error(error.message); process.exit(1);
}
let closing = false;
async function close() { if (closing) return; closing = true; await vite.close(); await companion.close(); process.exit(0); }
process.on('SIGINT', close); process.on('SIGTERM', close);
