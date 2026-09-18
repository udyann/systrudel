import os from 'node:os';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';

function powershell(name, onData, onExit) {
  const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', fileURLToPath(new URL(name, import.meta.url))], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  const lines = createInterface({ input: child.stdout });
  lines.on('line', line => { try { onData(JSON.parse(line.replace(/^\uFEFF/, ''))); } catch { /* Ignore non-data diagnostics. */ } });
  child.stderr.resume();
  child.on('error', onExit);
  child.on('exit', onExit);
  return () => { lines.close(); child.kill(); };
}
const cpuTimes = () => os.cpus().reduce((sum, cpu) => {
  sum.idle += cpu.times.idle; sum.total += Object.values(cpu.times).reduce((a, b) => a + b, 0); return sum;
}, { idle: 0, total: 0 });

export function createCollectors() {
  let previous = cpuTimes();
  let system = { cpu: null, ram: null, gpu: null, diskRead: null, diskWrite: null, networkRx: null, networkTx: null, sampledAt: null, ioSampledAt: null };
  let human = null, humanStatus = 'off', stopHuman = null, humanGeneration = 0;
  const timer = setInterval(() => {
    const current = cpuTimes(), total = current.total - previous.total;
    system = { ...system, sampledAt: Date.now(), cpu: total > 0 ? Math.max(0, Math.min(100, (1 - (current.idle - previous.idle) / total) * 100)) : null, ram: 100 * (1 - os.freemem() / os.totalmem()) };
    previous = current;
  }, 1000);
  const stopMetrics = process.platform === 'win32' ? powershell('windows-metrics.ps1', sample => { system = { ...system, ...sample }; }, () => { system.ioSampledAt = null; }) : () => {};
  return {
    snapshot(now = Date.now()) { return { system, human: human && now - human.sampledAt < 3000 ? human : null, humanStatus }; },
    setHuman(enabled) {
      if (!enabled) { humanGeneration++; stopHuman?.(); stopHuman = null; human = null; humanStatus = 'off'; return; }
      if (stopHuman) return;
      if (process.platform !== 'win32') throw new Error('Windows-wide input requires Windows');
      humanStatus = 'starting';
      const generation = ++humanGeneration;
      stopHuman = powershell('windows-human.ps1', sample => { if (generation === humanGeneration) { human = sample; humanStatus = 'on'; } }, () => { if (generation === humanGeneration) { human = null; humanStatus = 'unavailable'; stopHuman = null; } });
    },
    close() { clearInterval(timer); stopMetrics(); humanGeneration++; humanStatus = 'off'; stopHuman?.(); },
  };
}
