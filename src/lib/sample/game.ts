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
    'kinds/module.md': '---\nname: Rule\nplural: Rules\nfields: []\nbody: Text\n---\n\nOne rule of the book: a major rule, or a major rule with a few minor ones.\n',
    'kinds/chapter.md': '---\nname: Section\nplural: Sections\nfields:\n  - { key: items, label: Rules, type: list }\nlayout: [ flavor, items ]\nbody: Introduction\n---\n\nA rule section of the book, with its rules in order.\n',
    'kinds/division.md': '---\nname: Division\nplural: Divisions\nfields:\n  - { key: sections, label: Sections, type: list }\n  - { key: catalog, label: Kinds listed, type: list }\nlayout: [ flavor, sections, catalog ]\nbody: Front page\n---\n\nA division of the book, with its own front page.\n',
    'kinds/add-on.md': '---\nname: Add-on\nplural: Add-ons\nfields:\n  - { key: extends, label: Adds to, type: line }\nbody: Text\n---\n\nA world\'s piece of a core element.\n',
    'elements/chapter/front-matter.md': '---\nname: Front Matter\nkind: chapter\ntags: [ core, chapter ]\nitems:\n  - module/safety\n---\n',
    'elements/chapter/back-matter.md': '---\nname: Back Matter\nkind: chapter\ntags: [ core, chapter ]\n---\n',
    'elements/module/safety.md': '---\nname: Safety\nkind: module\ntags: [ core, module ]\n---\n\nAgree before play on what belongs in the game, and stop whenever anyone asks.\n',
    'book.md': '---\nname: Example Engine\nfront_matter: [ chapter/front-matter ]\nback_matter: [ chapter/back-matter ]\ndivisions:\n  - division/the-protagonist\n  - division/the-aspects\n---\n\nThe base game: everything every game built on the Example Engine shares.\n',
    'elements/division/the-protagonist.md': '---\nname: The Protagonist\nkind: division\ntags: [ core, division ]\nsections:\n  - chapter/taking-risks\n---\n\nWho the player is, and how they get into trouble.\n',
    'elements/division/the-aspects.md': '---\nname: The Aspects\nkind: division\ntags: [ core, division ]\ncatalog: [ need, gear ]\n---\n\nEvery aspect, listed by kind.\n',
    'elements/chapter/taking-risks.md': '---\nname: Taking Risks\nkind: chapter\ntags: [ core, chapter ]\nitems:\n  - module/when-to-roll\n  - module/reading-the-dice\n---\n\nWhen a protagonist tries something uncertain, the dice decide.\n',
    'elements/module/when-to-roll.md': '---\nname: When to Roll\nkind: module\ntags: [ core, module ]\n---\n\nRoll only when failing would be *interesting*. Walking across a quiet room needs no dice.\n',
    'elements/module/reading-the-dice.md': '---\nname: Reading the Dice\nkind: module\ntags: [ core, module ]\n---\n\nEach die at or under your edge is a **success**.\n\n### Ties\n\nA tie goes to the protagonist.\n',
    'elements/gear/rope.md': '---\nname: Rope\nkind: gear\ntags: [ core, gear, tool ]\navailability: "1"\nrules:\n  - "**Applies when** *(climbing, binding, or hauling)*."\nburned: Frayed through.\nrecovery: Buy more.\n---\n\nFifteen meters of braided line.\n',
    'elements/gear/lantern.md': '---\nname: Lantern\nkind: gear\ntags: [ core, gear, tool ]\navailability: "1"\nrules:\n  - "**Applies when** *(seeing in the dark)*."\nburned: Shattered, and the oil is gone.\nrecovery: Buy another.\n---\n\nA shuttered lantern that throws light one way.\n',
    'elements/need/rest.md': '---\nname: Rest\nkind: need\ntags: [ core, need ]\nburned: Exhausted. Every roll after midnight starts one die worse.\n---\n\nSleep, and somewhere safe enough to take it.\n',
  });
}

/** Harrowgate's own game files, which the sample world carries in `game/`. */
export const SAMPLE_GAME: Record<string, string> = {
  'game/elements/chapter/front-matter.md': '---\nname: Front Matter\nkind: chapter\ntags: [ harbor, chapter ]\nitems:\n  - engine:module/safety\n---\n',
  'game/elements/chapter/back-matter.md': '---\nname: Back Matter\nkind: chapter\ntags: [ harbor, chapter ]\n---\n',
  'game/elements/add-on/safety.md': '---\nname: Safety\nkind: add-on\ntags: [ add-on ]\nextends: module/safety\n---\n\nHarrowgate plays with drowning and debt. Name them before the first session.\n',
  'game/book.md': '---\nname: Harrowgate\nfront_matter: [ chapter/front-matter ]\nback_matter: [ chapter/back-matter ]\ndivisions:\n  - division/the-protagonist\n  - division/the-harbor\n  - division/the-aspects\n---\n\nA game of salt, debt, and fog on the Harrowgate docks.\n',
  'game/elements/division/the-protagonist.md': '---\nname: The Protagonist\nkind: division\ntags: [ harbor, division ]\nsections:\n  - engine:chapter/taking-risks\n---\n\nWho you play on the docks.\n',
  'game/elements/division/the-harbor.md': '---\nname: The Harbor\nkind: division\ntags: [ harbor, division ]\nsections:\n  - chapter/the-tides\n---\n\nThe city, its water, and its weather.\n',
  'game/elements/division/the-aspects.md': '---\nname: The Aspects\nkind: division\ntags: [ harbor, division ]\ncatalog: [ need, gear, vendor ]\n---\n',
  'game/elements/chapter/the-tides.md': '---\nname: The Tides\nkind: chapter\ntags: [ harbor, chapter ]\nitems:\n  - module/low-water\n---\n\nThe harbor empties twice a day.\n',
  'game/elements/module/low-water.md': '---\nname: Low Water\nkind: module\ntags: [ harbor, module ]\n---\n\nAt low water the mudflats open, and anything dropped in the harbor can be found.\n',
  'game/elements/add-on/when-to-roll.md': '---\nname: When to Roll\nkind: add-on\ntags: [ add-on ]\nextends: module/when-to-roll\n---\n\n*Wren wants to cross the pier in the fog. The narrator calls for a roll, because the guard is listening.*\n',
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
