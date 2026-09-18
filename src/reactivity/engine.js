import { controlsFromDerived } from './controls.js';

export const clamp = (value, fallback = 0) => Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
export const smooth = (previous, target, dt, tau) => previous + (target - previous) * (1 - Math.exp(-Math.max(0, dt) / tau));
const rate = (value, reference) => clamp(Math.log1p(Math.max(0, value ?? 0) / reference * 9) / Math.log(10));
const mean = (values, fallback = .5) => {
  const known = values.filter(Number.isFinite);
  return known.length ? known.reduce((a, b) => a + b, 0) / known.length : fallback;
};

// Pure, elapsed-time based engine: no devices, audio, or timers here.
export function createStateEngine({ networkReference = 20e6, diskReference = 200e6 } = {}) {
  let previousTime;
  let workload = 'unavailable', candidate = '', candidateSince = 0;
  const signals = { compute: 0, gpu: 0, transfer: 0, disk: 0, pressure: 0, human: 0, agent: 0, brightness: .5, context: .5, focus: .5, burst: 0 };
  return {
    update(input, now = Date.now()) {
      const dt = previousTime === undefined ? 250 : Math.min(30000, Math.max(0, now - previousTime));
      previousTime = now;
      const system = input.system ?? {}, human = input.human ?? {}, agent = input.agent ?? {}, context = input.context ?? {};
      const systemLive = Number.isFinite(system.sampledAt) && now - system.sampledAt < 5000;
      const ioLive = systemLive && Number.isFinite(system.ioSampledAt) && now - system.ioSampledAt < 10000;
      const agentLive = agent.connected === true;
      // A single bonus while any live turn is open, independent of turn count.
      const openTurnBoost = agentLive && Number.isFinite(agent.activeTurns) && agent.activeTurns >= 1 ? .2 : 0;
      const hour = new Date(now).getHours() + new Date(now).getMinutes() / 60;
      const daylight = clamp(.5 + .5 * Math.cos((hour - 13) / 24 * Math.PI * 2));
      const weather = context.weather && now - context.weather.sampledAt < 1800000 ? context.weather : null;
      const brightness = mean([context.visualBrightness, daylight, weather ? 1 - clamp(weather.cloudCover / 100) * .6 : null]);
      const targets = {
        compute: systemLive ? clamp(system.cpu / 100) : 0,
        gpu: ioLive ? clamp(system.gpu / 100) : 0,
        transfer: ioLive ? rate(system.networkRx + system.networkTx, networkReference) : 0,
        disk: ioLive ? rate(system.diskRead + system.diskWrite, diskReference) : 0,
        pressure: systemLive ? clamp((system.ram / 100 - .7) / .3) : 0,
        // Keyboard activity has full weight at four presses/sec. Idle mouse
        // inputs must not dilute it; retain their existing contributions.
        human: clamp(clamp(human.keysPerSecond / 4) + clamp(human.scrollPerSecond / 12) * .6 + clamp(human.clicksPerSecond / 4) * .6),
        // A reported open turn is activity, not evidence of hidden reasoning.
        agent: agentLive ? clamp(Math.max(clamp(agent.charactersPerSecond / 100), clamp(agent.toolsPerSecond / 2), clamp((agent.activeTools ?? 0) / 3), clamp((agent.activeSubagents ?? 0) / 4), agent.activeTurns > 0 ? .25 : 0, agent.thinking ? .3 : 0)) : 0,
        brightness, context: mean([clamp(context.energy, .5), clamp(context.drive, .5)]), focus: clamp(context.focus, .5),
        burst: clamp(Math.max((human.clicksPerSecond ?? 0) / 4, agentLive ? agent.toolPulse ?? 0 : 0)),
      };
      for (const key of Object.keys(signals)) {
        // Keep the existing rise speed, but let human activity linger in pauses.
        const tau = key === 'burst' ? 250 : ['brightness', 'context', 'focus'].includes(key) ? 45000
          : key === 'human' && targets[key] < signals[key] ? 12000 : 4000;
        signals[key] = smooth(signals[key], targets[key], dt, tau);
      }
      const scores = { 'compute-heavy': signals.compute, 'GPU-heavy': signals.gpu, 'network-heavy': signals.transfer, 'disk-heavy': signals.disk };
      const [leader, score] = Object.entries(scores).sort((a, b) => b[1] - a[1])[0];
      const next = !systemLive ? 'unavailable' : score < .18 ? 'idle' : score < .4 ? 'mixed' : leader;
      if (next !== candidate) { candidate = next; candidateSince = now; }
      if (!systemLive || workload === 'unavailable' || now - candidateSince >= 30000) workload = next;
      const h = signals.human, a = signals.agent;
      const interaction = h > .15 && a > .15 ? 'interaction peak' : h > .15 ? 'human-leading' : a > .15 ? 'agent-leading' : 'both idle';
      const compute = clamp(signals.compute * .5 + signals.gpu * .4 + signals.pressure * .1);
      const derived = {
        energy: clamp(signals.context * .35 + compute * .25 + Math.max(h, a) * .25 + signals.transfer * .15 + openTurnBoost),
        density: clamp((h + a) * .35 + signals.disk * .15 + signals.transfer * .15 + openTurnBoost),
        tension: clamp(compute * .35 + signals.pressure * .25 + Math.min(h, a) * .25 + (1 - signals.focus) * .15),
        human_agent_balance: h + a < .03 ? .5 : clamp(a / (h + a)),
        compute_intensity: compute,
        ambient_brightness: signals.brightness,
      };
      return {
        version: 1, sampledAt: now, derived, controls: controlsFromDerived(derived), workload, interaction,
        performers: { human: h, agent: a, accent: signals.burst },
        processes: { ...signals },
        availability: { system: systemLive, io: ioLive, agent: agentLive, human: human.scope ?? 'unavailable', visual: Number.isFinite(context.visualBrightness), weather: Boolean(weather) },
      };
    },
  };
}
