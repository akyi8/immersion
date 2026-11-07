import { MemoryFs } from '../fs/memory';

/**
 * An invented engine for browser testing, the Example Engine, which Harrowgate's game is
 * built on. Every name and rule in it is made up for this purpose.
 */
export const SAMPLE_ENGINE = 'games/example-engine';

export function sampleEngine(): MemoryFs {
  return new MemoryFs({
    'engine.md': '---\nname: Example Engine\n---\n\n# Example Engine\n\nA small invented engine for trying the Game module.\n',
    'kinds/gear.md': `---
name: Gear
fields:
  - { key: availability, label: Availability, type: line, hint: "How hard it is to buy, from 1 to 8." }
  - { key: rules, label: Rules, type: list }
  - { key: burned, label: Burned, type: text }
  - { key: recovery, label: Recovery, type: text }
layout: [ availability, flavor, rules, burned, recovery ]
---

What a protagonist carries.
`,
    'kinds/need.md': `---
name: Need
plural: Needs
fields:
  - { key: rules, label: Rules, type: list }
  - { key: burned, label: Burned, type: text }
layout: [ flavor, rules, burned ]
---

What a protagonist cannot go without.
`,
    'kinds/vendor.md': `---
name: Vendor
plural: Vendors
fields:
  - { key: carries, label: Carries, type: text }
  - { key: competition, label: Competition, type: text }
layout: [ flavor, carries, competition ]
---

A kind of place that sells, and the kind of person who runs it. Each world writes its own.
`,
    'elements/gear/rope.md': '---\nname: Rope\nkind: gear\ntags: [ core, gear, tool ]\navailability: "1"\nrules:\n  - "**Applies when** *(climbing, binding, or hauling)*."\nburned: Frayed through.\nrecovery: Buy more.\n---\n\nFifteen meters of braided line.\n',
    'elements/gear/lantern.md': '---\nname: Lantern\nkind: gear\ntags: [ core, gear, tool ]\navailability: "1"\nrules:\n  - "**Applies when** *(seeing in the dark)*."\nburned: Shattered, and the oil is gone.\nrecovery: Buy another.\n---\n\nA shuttered lantern that throws light one way.\n',
    'elements/need/rest.md': '---\nname: Rest\nkind: need\ntags: [ core, need ]\nburned: Exhausted. Every roll after midnight starts one die worse.\n---\n\nSleep, and somewhere safe enough to take it.\n',
  });
}

/** Harrowgate's own game files, which the sample world carries in `game/`. */
export const SAMPLE_GAME: Record<string, string> = {
  'game/game.md': '# Game\n\nHarrowgate\'s choices about its engine\'s core elements.\n',
  'game/elements/vendor/the-chandler.md': '---\nname: The Chandler\nkind: vendor\ntags: [ harbor, vendor ]\ncarries: Rope, lamps, oilskins, and anything a boat needs.\ncompetition: The Salt Market, where it is cheaper and nobody asks.\n---\n\nA counter on the east piers that smells of tar.\n',
  'game/elements/gear/salt-knife.md': '---\nname: Salt Knife\nkind: gear\ntags: [ harbor, gear, weapon ]\nvendor: the-chandler\navailability: "2"\nrules:\n  - "**Weapon** *(clears no trouble)*."\nburned: Rusted to the handle.\nrecovery: The Chandler sells another.\n---\n\nA dock knife with a cork grip, so it floats.\n',
  'game/elements/gear/storm-lamp.md': '---\nname: Storm Lamp\nkind: gear\ntags: [ harbor, gear, tool ]\nreskins: gear/lantern\n---\n\nA brass lamp that stays lit in the narrows\' wind.\n',
};

/** A real game trial, generated locally from a private rulebook and never committed. */
const trial = import.meta.glob<{ engine: string; world: Record<string, string>; engineFiles: Record<string, string> }>('./game.generated.json', { eager: true, import: 'default' });

export function trialGame(): { engine: string; world: MemoryFs; engineFs: MemoryFs } | null {
  const t = Object.values(trial)[0];
  return t ? { engine: t.engine, world: new MemoryFs(t.world), engineFs: new MemoryFs(t.engineFiles) } : null;
}
