import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createAgentState } from './agent-state.js';
import { createCollectors } from './collectors.js';
import { createHookInbox } from './hook-inbox.js';
import { config } from '../config/env.js';

export async function startCompanion({ port = config.companionPort, uiPort = config.uiPort, previewPort = config.previewPort, collectors = createCollectors(), sessionFile = new URL('../.local/telemetry.json', import.meta.url), hookDirectory } = {}) {
  const token = randomBytes(32).toString('hex');
  const agents = createAgentState(), clients = new Set();
  const inbox = hookDirectory === null ? null : createHookInbox({ agents, directory: hookDirectory });
  let actualPort = port;
  const snapshot = () => ({ version: 1, sampledAt: Date.now(), ...collectors.snapshot(), agent: agents.snapshot(), hookDiagnostics: inbox?.snapshot() ?? null });
  const authorized = req => {
    const supplied = Buffer.from(req.headers.authorization?.replace(/^Bearer /, '') ?? '');
    const expected = Buffer.from(token);
    return supplied.length === expected.length && timingSafeEqual(supplied, expected);
  };
  const server = createServer(async (req, res) => {
    const reply = (status, data) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(data)); };
    const localHosts = [`127.0.0.1:${actualPort}`, `localhost:${actualPort}`];
    // Vite keeps its host header when proxying. Only configured local ports qualify.
    for (const allowedPort of [uiPort, previewPort]) localHosts.push(`localhost:${allowedPort}`, `127.0.0.1:${allowedPort}`);
    const origin = req.headers.origin;
    if (!localHosts.includes(req.headers.host) || (origin && !localHosts.some(host => origin === `http://${host}`))) return reply(403, { error: 'Local origin required' });
    if (req.method === 'GET' && req.url === '/api/health') return reply(200, { ok: true, version: 1 });
    if (req.method === 'GET' && req.url === '/api/snapshot') return reply(200, snapshot());
    if (req.method === 'GET' && req.url === '/api/events') {
      if (clients.size >= 16) return reply(503, { error: 'Too many subscribers' });
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      res.write(`data: ${JSON.stringify(snapshot())}\n\n`);
      clients.add(res); res.on('close', () => clients.delete(res)); return;
    }
    if (req.method !== 'POST' || !['/api/agent', '/api/human'].includes(req.url)) return reply(404, { error: 'Not found' });
    if (req.url === '/api/agent' ? !authorized(req) : !(authorized(req) || (origin && req.headers['x-photosynthrudel'] === '1'))) return reply(403, { error: 'Authorization required' });
    if (!req.headers['content-type']?.startsWith('application/json')) return reply(415, { error: 'JSON required' });
    try {
      let body = '', length = 0;
      for await (const chunk of req) {
        length += chunk.length;
        if (length > 16384) { reply(413, { error: 'Body too large' }); return; }
        body += chunk;
      }
      const data = JSON.parse(body);
      if (req.url === '/api/agent') agents.ingest(data);
      else {
        if (typeof data.enabled !== 'boolean') throw new Error('enabled must be boolean');
        collectors.setHuman(data.enabled);
      }
      reply(200, { ok: true });
    } catch (error) { reply(400, { error: error.message }); }
  });
  server.requestTimeout = 5000;
  try {
    await new Promise((resolve, reject) => { server.once('error', reject); server.listen(port, '127.0.0.1', resolve); });
    actualPort = server.address().port;
    if (sessionFile) {
      await mkdir(new URL('./', sessionFile), { recursive: true });
      await writeFile(sessionFile, JSON.stringify({ url: `http://127.0.0.1:${actualPort}`, token }), { mode: 0o600 });
    }
  } catch (error) { collectors.close(); server.close(); throw error; }
  const timer = setInterval(() => {
    void inbox?.poll();
    if (!clients.size) return;
    const frame = `data: ${JSON.stringify(snapshot())}\n\n`;
    for (const client of clients) {
      if (client.writableLength > 1024 * 1024) { client.destroy(); clients.delete(client); }
      else client.write(frame);
    }
  }, 250);
  return {
    port: actualPort, token,
    async close() {
      clearInterval(timer); collectors.close();
      for (const client of clients) client.end();
      server.closeAllConnections();
      await new Promise(resolve => server.close(resolve));
      if (sessionFile) await unlink(sessionFile).catch(() => {});
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const companion = await startCompanion();
  console.log(`Local telemetry: http://127.0.0.1:${companion.port}`);
  let closing = false;
  const close = async () => { if (closing) return; closing = true; await companion.close(); process.exit(0); };
  process.on('SIGINT', close); process.on('SIGTERM', close);
}
