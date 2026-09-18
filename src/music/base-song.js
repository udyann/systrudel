// Adapted from the user's base song. Musical choices are kept in this module.
export const BASE_SONG = Object.freeze({
  id: 'base-song', name: 'Base song', key: 'D minor', tempo: 120, beatsPerCycle: 4,
  controls: Object.freeze({ energy: .1, density: .5, tension: .9, balance: .5, intensity: .3, ambience: .4 }),
  usedControls: Object.freeze(['energy', 'density', 'tension', 'balance']),
});

const lerp = (a, b, x) => a + (b - a) * x;
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));

export function createBaseSong({ sound, n, mini, seq, chooseCycles, wchooseCycles, stack }, { energy, density, tension, balance = .5 }) {
  const s0 = sound(mini('[rd rd, bd bd, - -]'));
  const s1 = sound(mini('[rd rd, - -, sd [- sd]]'));
  const s2 = sound(mini('[rd rd, - [bd bd], [- sd] -]'));
  const s3 = sound(mini('[rd rd, - -, sd -]'));
  const s4 = sound(mini('[rd rd, - -, [- sd] -]'));
  const s5 = sound(mini('[rd rd, - -, sd [- sd]]'));
  const s6 = sound(mini('[rd rd, - [bd bd], - -]'));
  const s7 = sound(mini('[rd rd, - -, sd [sd sd]]'));
  const drumMutation = clamp((density * .55 + tension * .45) * .35);
  const randomDrum = () => chooseCycles(s0, s1, s2, s3, s4, s5, s6, s7);
  const mutateDrum = base => wchooseCycles([base, 1 - drumMutation], [randomDrum(), drumMutation]);
  const drums = seq(
    mutateDrum(s0), mutateDrum(s1), mutateDrum(s2), mutateDrum(s3),
    mutateDrum(s4), mutateDrum(s5), mutateDrum(s6), mutateDrum(s7),
  ).slow(2).bank('sr16')
    .velocity(lerp(.30, .75, energy)).lpf(lerp(800, 9000, energy))
    .sometimesBy(density * .03, x => x.speed(-1));

  const bassKeep = lerp(.1, .90, density);
  const bass = n(mini('[0@2 - 0  0 3 4 5  - 0@2 2  0 3@2 0]'))
    .slow(2).scale('D2:minor').degradeBy(1 - bassKeep)
    .sometimesBy(.08, x => x.add(chooseCycles(-1, 1)))
    .sometimesBy(bassKeep, x => x.ply(2))
    .sound('gm_synth_bass_2').lpf(500).distort(lerp(0, 1.2, tension))
    .attack(lerp(.08, .005, energy)).decay(lerp(.25, .08, energy))
    .sustain(lerp(.30, .65, energy)).release(lerp(.35, .08, energy)).velocity(.4).gain(.8);

  const melodyKeep = 1;
  const userMotif = n(mini('[[7, 5]@2.5 6@0.5 [5 3] [6, 4]@3 [- [5 6]] [6,3]@3 [- 7] [[5,2]@2 [4,1]] [3,0]@2 - ]'))
    .slow(4).scale('D4:minor');
  // The draft declares melodyTensionProb but does not use it; keep .005 as supplied.
  const melody = userMotif.degradeBy(1 - melodyKeep).sometimesBy(.005, x => x.scaleTranspose(1))
    .sound('gm_epiano2').velocity(lerp(.25, .65, energy)).gain(1 - balance).lpf(lerp(1200, 6500, energy))
    .attack(lerp(.08, .01, energy)).release(lerp(.5, .12, energy)).room(.25);

  const agentMotif = n(mini('[0 2 4 6 <5 -> 2 3 0]')).slow(2).scale('D4:minor');
  const agentMelody = agentMotif.degradeBy(1 - melodyKeep).sometimesBy(.005, x => x.scaleTranspose(1))
    .sound('gm_trombone').velocity(lerp(.25, .65, energy)).gain(.5 * balance)
    .lpf(lerp(1200, 6500, energy)).attack(lerp(.08, .01, energy))
    .release(lerp(7, .12, energy)).room(.7);

  // Linear melody crossfade preserves the agent's supplied 0.5 gain trim.
  // Equivalent to the draft's four parallel $: parts.
  return stack(drums, bass, melody, agentMelody);
}
