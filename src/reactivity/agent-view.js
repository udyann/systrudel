const age = seconds => seconds < 60 ? `${Math.floor(seconds)}s` : seconds < 3600 ? `${Math.floor(seconds / 60)}m` : `${Math.floor(seconds / 3600)}h`;
const eventNames = { session_start: 'session opened', turn_start: 'turn started', turn_end: 'turn finished', tool_start: 'tool started', tool_end: 'tool finished', subagent_start: 'subagent started', subagent_end: 'subagent finished', disconnect: 'session closed', heartbeat: 'feed seen', output: 'output received', tokens: 'usage received' };

export function agentPresentation(agent, companionOnline = true) {
  if (!companionOnline) return { title: 'Companion offline', detail: 'Start systrudel to receive IDE activity.', readings: [] };
  const status = agent?.status ?? 'waiting';
  const last = Number.isFinite(agent?.lastEventAgeSeconds) ? `Last activity: ${eventNames[agent.lastEventKind] ?? 'event received'}, ${age(agent.lastEventAgeSeconds)} ago.` : '';
  const titles = { waiting: 'Waiting for IDE activity', working: 'Working', idle: 'Idle', unknown: 'Status unknown' };
  const explanation = status === 'working' ? `An observed turn is open${Number.isFinite(agent.workingSeconds) ? ` (${age(agent.workingSeconds)})` : ''}. This can include waiting for approval.`
    : status === 'waiting' ? 'No hook has reached this companion yet. Use Check IDE hooks in the setup guide.'
      : status === 'unknown' ? 'No recent confirmation or completion. Open turns become unknown after 15 quiet minutes.'
        : 'No observed turn is open. Event-based hooks do not send idle heartbeats.';
  const readings = [];
  if (status === 'working' || status === 'idle') {
    for (const [label, value] of [['Open turns', agent?.activeTurns], ['Running tools', agent?.activeTools], ['Tool calls / 10 sec', Number.isFinite(agent?.toolsPerSecond) ? Math.round(agent.toolsPerSecond * 10) : null], ['Observed subagents', agent?.activeSubagents]]) {
      if (Number.isFinite(value)) readings.push([label, String(value)]);
    }
  }
  return { title: titles[status] ?? 'Status unknown', detail: [explanation, last].filter(Boolean).join(' '), readings };
}
