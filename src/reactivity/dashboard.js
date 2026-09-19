import { createStateEngine } from './engine.js';
import { profiles, mapProfile } from './profiles.js';
import { createPageActivity } from './human.js';
import { searchCities, loadWeather } from './weather.js';
import { publishState } from './template-api.js';
import { agentPresentation } from './agent-view.js';
import { CONTROL_NAMES } from './controls.js';

const macroNames = CONTROL_NAMES;
const format = (value, unit = '', digits = 1) => Number.isFinite(value) ? `${value.toFixed(digits)}${unit}` : 'Unavailable';
const bytes = value => Number.isFinite(value) ? value >= 1e6 ? format(value / 1e6, ' MB/s') : format(value / 1000, ' KB/s') : 'Unavailable';

export function createReactiveDashboard(root) {
  root.innerHTML = `
    <div class="dashboard-heading"><div><p class="eyebrow">Live environment / V1</p><h2>From activity to musical behavior</h2></div><span id="companion-status" class="badge" role="status">Connecting</span></div>
    <p class="muted">Observe your work, then shape it into six smooth controls. Base song uses energy, density, tension and balance. Start playback in the Music panel below.</p>
    <div class="context-controls">
      ${['energy', 'drive', 'focus'].map(key => `<label>${key[0].toUpperCase() + key.slice(1)} <output id="context-${key}-value">50%</output><input id="context-${key}" type="range" min="0" max="1" step="0.01" value="0.5" /></label>`).join('')}
    </div>
    <div class="weather-controls"><form id="weather-search"><label for="weather-city">Weather location (optional)</label><div class="inline-controls"><input id="weather-city" type="search" placeholder="City name" maxlength="100" required /><button>Find city</button></div></form><label id="weather-choice-label" hidden>Choose a location<select id="weather-choice"></select></label><button id="clear-weather" type="button" hidden>Disconnect weather</button></div>
    <p id="weather-status" class="muted" role="status">Local time is active. Searching sends the city name to Open-Meteo; choosing a result loads its weather.</p>
    <div class="telemetry-grid">
      <article class="telemetry-card"><h3>System</h3><p id="workload-label" class="state-label">Unavailable</p><dl id="system-values" class="readings"></dl><p class="muted">Workload changes settle for 30 seconds. GPU activity does not identify which application is running.</p></article>
      <article class="telemetry-card"><h3>Human</h3><p id="human-scope" class="state-label">This page only</p><dl id="human-values" class="readings"></dl><label class="checkbox-field"><input id="windows-activity" type="checkbox" /> Track activity across Windows</label><p id="human-help" class="muted">Counts only: key presses, clicks, scroll and idle time. No text, key identities or pointer positions are stored.</p></article>
      <article class="telemetry-card"><h3>Codex IDE</h3><p id="agent-status" class="state-label" role="status">Waiting for IDE activity</p><p id="agent-activity" class="muted"></p><dl id="agent-values" class="readings"></dl><p class="muted">Activity comes from your ordinary IDE turns and tool calls. Setup and connection check: <code>integrations/codex/README.md</code>.</p></article>
    </div>
    <div class="dashboard-heading"><h3>Derived musical state</h3><span id="interaction-label" class="badge"></span></div>
    <p class="muted">Fast accents: 250 ms · Human activity: 4 sec rise / 12 sec decay · Other activity: 4 sec · Context: 45 sec. Balance runs from human (0) to agent (1), with 0.5 neutral.</p>
    <div class="macro-grid">${macroNames.map(key => `<div><label for="macro-${key}">${key.replaceAll('_', ' ')} <output id="macro-value-${key}">0.00</output></label><meter id="macro-${key}" min="0" max="1" value="0"></meter></div>`).join('')}</div>
    <div class="mapping-heading"><label for="reactive-profile">Mapping reference</label><select id="reactive-profile">${profiles.map(p => `<option value="${p.id}">${p.name}</option>`).join('')}</select><span class="muted">Base song is integrated; other profiles are previews. Select the playing song below.</span></div>
    <div class="table-scroll"><table class="mapping-table"><thead><tr><th>Ongoing process</th><th>Derived control</th><th>Template property</th><th>Value</th></tr></thead><tbody id="mapping-values"></tbody></table></div>
    <details id="reactive-details"><summary>Current state / template interface</summary><p>Author music in <code>templates/</code>. Read the six numeric values with <code>reactiveState.getControls()</code> from <code>src/reactivity/template-api.js</code>. They also appear under <code>controls</code> below. Ambience runs from dark (0) to bright (1).</p><pre id="reactive-data"></pre></details>
    <div class="trial-controls"><label for="trial-label">Work session label<input id="trial-label" maxlength="80" placeholder="coding, browsing, compiling…" /></label><button id="record-trial" type="button">Record comparison</button><button id="export-trial" type="button" disabled>Export JSON</button><span id="trial-status" class="muted">Records aggregate values once per second, for up to one hour.</span></div>
  `;
  const q = selector => root.querySelector(selector);
  const engine = createStateEngine(), page = createPageActivity();
  const context = { energy: .5, drive: .5, focus: .5, visualBrightness: null, weather: null };
  let telemetry = null, receivedAt = 0, profile = profiles[0], disposed = false, humanPending = false;
  let cities = [], city = null, weatherAbort = null, weatherRequest = 0;
  let recording = false, records = [], lastRecorded = 0, trialLabel = '';
  const stream = new EventSource('/api/events');
  stream.onmessage = event => {
    try { const data = JSON.parse(event.data); if (data.version === 1) { telemetry = data; receivedAt = Date.now(); } } catch { /* Keep the previous frame until stale. */ }
  };
  stream.onerror = () => { q('#companion-status').textContent = 'Reconnecting'; };
  for (const key of ['energy', 'drive', 'focus']) q(`#context-${key}`).addEventListener('input', event => {
    context[key] = Number(event.target.value); q(`#context-${key}-value`).value = `${Math.round(context[key] * 100)}%`;
  });
  q('#reactive-profile').addEventListener('change', event => { profile = profiles.find(p => p.id === event.target.value); });
  q('#windows-activity').addEventListener('change', async event => {
    const control = event.target; control.disabled = true; humanPending = true;
    try {
      const response = await fetch('/api/human', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-systrudel': '1' }, body: JSON.stringify({ enabled: control.checked }), signal: AbortSignal.timeout(5000) });
      if (!response.ok) throw new Error('Could not change Windows tracking. Check the companion terminal.');
      q('#human-help').textContent = control.checked ? 'Starting Windows counters. Tracking continues until disabled or the companion stops.' : 'Windows tracking stopped. This page still counts its own activity.';
    } catch (error) { control.checked = !control.checked; q('#human-help').textContent = error.message; }
    finally { control.disabled = false; humanPending = false; }
  });

  async function refreshWeather() {
    if (!city || disposed) return;
    weatherAbort?.abort(); weatherAbort = new AbortController(); const request = ++weatherRequest;
    try {
      const weather = await loadWeather(city, AbortSignal.any([weatherAbort.signal, AbortSignal.timeout(10000)]));
      if (request !== weatherRequest || disposed) return;
      context.weather = weather;
      q('#weather-status').textContent = `${city.name}: ${format(weather.temperature, ' °C')}, ${format(weather.cloudCover, '% cloud', 0)}. Open-Meteo current model conditions; refreshed every 15 minutes.`;
    } catch (error) { if (request === weatherRequest && !disposed) { context.weather = null; q('#weather-status').textContent = `Weather unavailable: ${error.message}`; } }
  }
  q('#weather-search').addEventListener('submit', async event => {
    event.preventDefault(); weatherAbort?.abort(); weatherAbort = new AbortController(); const request = ++weatherRequest;
    context.weather = null; city = null; q('#weather-choice-label').hidden = true;
    q('#weather-status').textContent = 'Searching cities…';
    try {
      const results = await searchCities(q('#weather-city').value.trim(), AbortSignal.any([weatherAbort.signal, AbortSignal.timeout(10000)]));
      if (request !== weatherRequest || disposed) return;
      cities = results;
      q('#weather-choice').replaceChildren(new Option('Select a city', ''), ...cities.map((item, index) => new Option([item.name, item.admin1, item.country].filter(Boolean).join(', '), String(index))));
      q('#weather-choice-label').hidden = !cities.length;
      q('#weather-status').textContent = cities.length ? 'Choose the matching city to connect weather.' : 'No cities found.';
    } catch (error) { if (request === weatherRequest && !disposed) q('#weather-status').textContent = `Search unavailable: ${error.message}`; }
  });
  q('#weather-choice').addEventListener('change', event => { if (event.target.value === '') return; city = cities[Number(event.target.value)]; q('#clear-weather').hidden = false; refreshWeather(); });
  q('#clear-weather').addEventListener('click', () => {
    weatherRequest++; weatherAbort?.abort(); city = null; context.weather = null; q('#clear-weather').hidden = true; q('#weather-choice-label').hidden = true;
    q('#weather-status').textContent = 'Weather disconnected. Local time remains active.';
  });
  const weatherTimer = setInterval(refreshWeather, 15 * 60 * 1000);
  q('#record-trial').addEventListener('click', () => {
    recording = !recording;
    if (recording) { records = []; lastRecorded = 0; trialLabel = q('#trial-label').value.trim() || 'unlabeled'; }
    q('#record-trial').textContent = recording ? 'Stop recording' : 'Record comparison';
  });
  q('#export-trial').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ version: 1, label: trialLabel, samples: records }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = `systrudel-${Date.now()}.json`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  function readings(selector, values) {
    const list = q(selector);
    if (list.dataset.labels !== JSON.stringify(values.map(([name]) => name))) {
      list.replaceChildren();
      for (const [name] of values) { const row = document.createElement('div'), term = document.createElement('dt'), value = document.createElement('dd'); term.textContent = name; row.append(term, value); list.append(row); }
      list.dataset.labels = JSON.stringify(values.map(([name]) => name));
    }
    values.forEach(([, value], index) => { list.children[index].lastChild.textContent = value; });
  }
  function tick() {
    const now = Date.now(), connected = now - receivedAt < 3000;
    const pageHuman = page.sample(now);
    const human = connected && telemetry?.human ? telemetry.human : pageHuman;
    const input = { system: connected ? telemetry?.system : null, agent: connected ? telemetry?.agent : null, human, context };
    const state = engine.update(input, now);
    const output = { ...state, profileId: profile.id, mapped: mapProfile(profile, state) };
    publishState(output);
    q('#companion-status').textContent = connected ? 'Companion connected' : 'Companion offline · run npm run dev';
    q('#windows-activity').disabled = !connected || humanPending;
    if (connected && !humanPending) q('#windows-activity').checked = ['on', 'starting'].includes(telemetry.humanStatus);
    q('#human-scope').textContent = human.scope === 'windows' ? 'Across Windows' : ['unavailable', 'on'].includes(telemetry?.humanStatus) ? 'Windows unavailable / stale · page fallback' : 'This page only';
    q('#workload-label').textContent = state.workload;
    const agentView = agentPresentation(input.agent, connected);
    q('#agent-status').textContent = agentView.title;
    q('#agent-activity').textContent = agentView.detail;
    q('#interaction-label').textContent = state.availability.agent ? state.interaction : `${state.interaction === 'human-leading' ? 'Human active' : 'Human quiet'} · agent unavailable`;
    const s = state.availability.system ? input.system : {}, io = state.availability.io ? s : {};
    readings('#system-values', [['CPU', format(s.cpu, '%')], ['GPU', format(io.gpu, '%')], ['RAM used', format(s.ram, '%')], ['Network down / up', `${bytes(io.networkRx)} / ${bytes(io.networkTx)}`], ['Disk read / write', `${bytes(io.diskRead)} / ${bytes(io.diskWrite)}`], ['I/O age', Number.isFinite(s.ioSampledAt) ? format((now - s.ioSampledAt) / 1000, ' s') : 'Unavailable']]);
    readings('#human-values', [['Key presses', format(human.keysPerSecond, '/s')], ['Scroll', format(human.scrollPerSecond, ' units/s')], ['Clicks', format(human.clicksPerSecond, '/s')], ['Idle', format(human.idleSeconds, ' s')]]);
    readings('#agent-values', agentView.readings);
    for (const key of macroNames) { q(`#macro-${key}`).value = state.controls[key]; q(`#macro-value-${key}`).value = state.controls[key].toFixed(2); }
    const mappings = q('#mapping-values');
    if (mappings.dataset.profile !== profile.id) {
      mappings.replaceChildren(...profile.mappings.map(row => { const tr = document.createElement('tr'); for (const text of [...row, '']) { const td = document.createElement('td'); td.textContent = text; tr.append(td); } return tr; })); mappings.dataset.profile = profile.id;
    }
    profile.mappings.forEach(([, macro], index) => { mappings.children[index].lastChild.textContent = state.controls[macro].toFixed(2); });
    if (q('#reactive-details').open) q('#reactive-data').textContent = JSON.stringify(output, null, 2);
    if (recording && now - lastRecorded >= 1000) {
      records.push({ state: output, system: input.system, human, agent: input.agent }); lastRecorded = now;
      q('#export-trial').disabled = false;
      q('#trial-status').textContent = `${records.length} seconds captured${records.length >= 3600 ? ' · limit reached' : ''}`;
      if (records.length >= 3600) { recording = false; q('#record-trial').textContent = 'Record comparison'; }
    }
  }
  const timer = setInterval(tick, 250); tick();
  function dispose() { if (disposed) return; disposed = true; stream.close(); page.close(); clearInterval(timer); clearInterval(weatherTimer); weatherAbort?.abort(); window.removeEventListener('pagehide', dispose); }
  window.addEventListener('pagehide', dispose);
  return { setVisual(features) { context.visualBrightness = features?.brightness ?? null; }, dispose };
}
