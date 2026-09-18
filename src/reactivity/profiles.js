// Mapping contracts only. These contain no notes, instruments, or audio patterns.
export const profiles = [
  { id: 'base-song', name: 'Base song (integrated)', mappings: [
    ['Context + workload + performers + open agent turn', 'energy', 'Drum/melody velocity and filters; bass envelope'],
    ['Performers + I/O activity + open agent turn', 'density', 'Drum mutation/reversal; bass retention/repeats'],
    ['Compute + pressure + interaction', 'tension', 'Drum mutation; bass distortion'],
    ['Human / agent activity', 'balance', 'Piano gain (1 − balance); trombone gain (0.5 × balance)'],
  ] },
  { id: 'ambient-work', name: 'Ambient Work', mappings: [
    ['Compute workload', 'intensity', 'texture'], ['Human + agent activity', 'density', 'gentle rhythm'], ['Human / agent balance', 'balance', 'melody presence'],
  ] },
  { id: 'machine-room', name: 'Machine Room', mappings: [
    ['CPU + GPU + memory pressure', 'intensity', 'machine texture'], ['Disk + transfer + performers', 'density', 'layer density'], ['Concurrent activity', 'tension', 'roughness'],
  ] },
  { id: 'human-vs-agent', name: 'Human vs Agent', mappings: [
    ['Human / agent activity', 'balance', 'voice dominance'], ['Both performers', 'density', 'polyphony'], ['Interaction + workload', 'tension', 'call / response tension'],
  ] },
  { id: 'quiet-night', name: 'Quiet Night', mappings: [
    ['Time + weather + visual light', 'ambience', 'harmonic palette'], ['Energy + drive + activity', 'energy', 'movement'], ['Workload + interaction', 'tension', 'subtle disturbance'],
  ] },
];

export function mapProfile(profile, state) {
  return Object.fromEntries(profile.mappings.map(([, macro, property]) => [property, state.controls[macro]]));
}
