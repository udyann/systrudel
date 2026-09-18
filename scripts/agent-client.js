import { readFile } from 'node:fs/promises';
export async function createAgentClient() {
  const session = JSON.parse(await readFile(new URL('../.local/telemetry.json', import.meta.url), 'utf8'));
  const address = new URL(session.url);
  if (address.hostname !== '127.0.0.1' || address.protocol !== 'http:') throw new Error('Companion must be local');
  return async event => {
    const response = await fetch(`${address.origin}/api/agent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.token}` }, body: JSON.stringify(event), signal: AbortSignal.timeout(1500),
    });
    if (!response.ok) throw new Error(`Telemetry returned ${response.status}`);
  };
}
