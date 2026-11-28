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
  - { key: prerequisite, label: Prerequisite, type: line }
  - { key: flavor, label: Flavor, type: text }
  - { key: rules, label: Rules, type: list }
  - { key: consequences, label: Consequences, type: list }
  - { key: darkened_flavor, label: "Flavor (Darkened)", type: text }
  - { key: darkened_rules, label: "Rules (Darkened)", type: list }
  - { key: darkened_consequences, label: "Consequences (Darkened)", type: list }
  - { key: recovery, label: Recovery, type: text }
layout: [ prerequisite, flavor, rules, consequences, darkened_flavor, darkened_rules, darkened_consequences, recovery, body ]
body: Page
---

What a protagonist carries.
`,
    'kinds/keyword.md': '---\nname: Keyword\nplural: Keywords\nfields:\n  - { key: reminder, label: Reminder, type: text }\n  - { key: full_rule, label: Full rule, type: line }\nlayout: [ reminder, full_rule ]\n---\n\nA name for a rule that many aspects share.\n',
    'elements/keyword/tool.md': '---\nname: Tool\nkind: keyword\ntags: [ core, keyword ]\nreminder: "on a roll it applies to, your edge sharpens by one"\n---\n',
    'elements/keyword/trouble.md': '---\nname: Trouble\nkind: keyword\ntags: [ core, keyword ]\nreminder: "each die over your edge is one trouble; clear it or pay for it"\nfull_rule: Reading the Dice\n---\n',
    'kinds/need.md': `---
name: Need
plural: Needs
fields:
  - { key: prerequisite, label: Prerequisite, type: line }
  - { key: flavor, label: Flavor, type: text }
  - { key: rules, label: Rules, type: list }
  - { key: consequences, label: Consequences, type: list }
  - { key: darkened_flavor, label: "Flavor (Darkened)", type: text }
  - { key: darkened_rules, label: "Rules (Darkened)", type: list }
  - { key: darkened_consequences, label: "Consequences (Darkened)", type: list }
  - { key: recovery, label: Recovery, type: text }
layout: [ prerequisite, flavor, rules, consequences, darkened_flavor, darkened_rules, darkened_consequences, recovery, body ]
body: Page
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
    'book.md': '---\nname: Example Engine\nfront_matter: [ chapter/front-matter ]\nback_matter: [ chapter/back-matter ]\ndivisions:\n  - division/the-protagonist\n  - division/the-narrator\n  - division/the-aspects\n---\n\nThe base game: everything every game built on the Example Engine shares.\n',
    'elements/division/the-protagonist.md': '---\nname: The Protagonist\nkind: division\ntags: [ core, division ]\nsections:\n  - chapter/taking-risks\n---\n\nWho the player is, and how they get into trouble.\n',
    // A division the world's book does not list. The world shows it all the same, because a
    // world's book follows the base game's.
    'elements/division/the-narrator.md': '---\nname: The Narrator\nkind: division\ntags: [ core, division ]\nsections:\n  - chapter/running-a-scene\n---\n\nHow to run the game.\n',
    'elements/chapter/running-a-scene.md': '---\nname: Running a Scene\nkind: chapter\ntags: [ core, chapter ]\nitems:\n  - module/set-the-stakes\n---\n',
    'elements/module/set-the-stakes.md': '---\nname: Set the Stakes\nkind: module\ntags: [ core, module ]\n---\n\nSay what is at risk before anyone rolls.\n',
    'elements/division/the-aspects.md': '---\nname: The Aspects\nkind: division\ntags: [ core, division ]\ncatalog: [ need, gear, keyword ]\n---\n\nEvery aspect, listed by kind.\n',
    'elements/chapter/taking-risks.md': '---\nname: Taking Risks\nkind: chapter\ntags: [ core, chapter ]\nitems:\n  - module/when-to-roll\n  - module/reading-the-dice\n---\n\nWhen a protagonist tries something uncertain, the dice decide.\n',
    'elements/module/when-to-roll.md': '---\nname: When to Roll\nkind: module\ntags: [ core, module ]\n---\n\nRoll only when failing would be *interesting*. Walking across a quiet room needs no dice.\n',
    'elements/module/reading-the-dice.md': '---\nname: Reading the Dice\nkind: module\ntags: [ core, module ]\n---\n\nEach die at or under your edge is a **success**. Each die over it is one trouble.\n\n### Ties\n\nA tie goes to the protagonist.\n',
    'elements/gear/rope.md': '---\nname: Rope\nkind: gear\ntags: [ core, gear, tool ]\nflavor: Fifteen meters of braided line.\nrules:\n  - "**Tool** *(on a roll it applies to, your edge sharpens by one)*."\n  - "**Applies when** *(climbing, binding, or hauling)*."\ndarkened_flavor: Frayed through.\nrecovery: Buy more.\n---\n',
    'elements/gear/lantern.md': '---\nname: Lantern\nkind: gear\ntags: [ core, gear, tool ]\nflavor: A shuttered lantern that throws light one way.\nrules:\n  - "**Tool** *(on a roll it applies to, your edge sharpens by one)*."\n  - "**Applies when** *(seeing in the dark)*."\nconsequences:\n  - "**8:** Someone on the water answers your light."\ndarkened_flavor: Shattered, and the oil is gone.\ndarkened_consequences:\n  - "**Two 1s:** You drop it, and everyone on the pier hears."\nrecovery: Buy another.\n---\n\nA lantern is a tool for the dark. It applies on any roll where a protagonist finds their way at night or signals someone at a distance.\n\n## Example\n\nWren rows out to the mudflats at low water. Her player declares the lantern, and her edge sharpens from 7 to 6.\n',
    'elements/need/rest.md': '---\nname: Rest\nkind: need\ntags: [ core, need ]\nflavor: "Sleep, and somewhere safe enough to take it. You have gone without both for so long that you have stopped noticing what it costs you, and the people who love you have stopped saying so. A bed is a rumor. A locked door is a luxury. You sleep in boats, in doorways, and once in a confessional, and every morning you tell yourself that tonight will be different. It never is. The harbor does not sleep, and neither do the people who are looking for you, and so you have learned to rest with one hand on the gunwale and one eye on the tide."\nrules:\n  - "**Need** *(an inner aspect; darken it to skip a roll when the action directly feeds the need, now)*."\n  - "When you sleep a full night behind a door that locks, relight one inner aspect."\n  - "When someone keeps watch so that you can sleep, your edge sharpens by one on your first roll the next day."\n  - "When you go a second night without sleep, the narrator names one thing you did not notice."\nconsequences:\n  - "**8:** You dream of the answer."\n  - "**Two 1s:** You fall asleep where you stand."\ndarkened_flavor: Exhausted.\ndarkened_rules:\n  - Every roll after midnight starts one die worse.\nrecovery: A full night, somewhere safe.\n---\n',
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
  'game/elements/division/the-aspects.md': '---\nname: The Aspects\nkind: division\ntags: [ harbor, division ]\ncatalog: [ need, gear, vendor, tool ]\n---\n',
  // A list by a tag: every element tagged `tool`, whatever its kind.
  'game/labels.md': '---\ntool:\n  plural: Tools\n---\n\nWhat Harrowgate\'s labels mean.\n',
  'game/elements/chapter/the-tides.md': '---\nname: The Tides\nkind: chapter\ntags: [ harbor, chapter ]\nitems:\n  - module/low-water\n---\n\nThe harbor empties twice a day.\n',
  'game/elements/module/low-water.md': '---\nname: Low Water\nkind: module\ntags: [ harbor, module ]\n---\n\nAt low water the mudflats open, and anything dropped in the harbor can be found.\n',
  'game/elements/add-on/when-to-roll.md': '---\nname: When to Roll\nkind: add-on\ntags: [ add-on ]\nextends: module/when-to-roll\n---\n\n*Wren wants to cross the pier in the fog. The narrator calls for a roll, because the guard is listening.*\n',
  'game/expansions/fogbound/expansion.md': '---\nname: Fogbound\n---\n\nAn expansion for the smugglers of the outer banks: their boats, their lamps, and their fence.\n',
  'game/expansions/fogbound/elements/gear/dark-lantern.md': '---\nname: Dark Lantern\nkind: gear\ntags: [ fogbound, gear, tool ]\nflavor: A lantern with a shutter that shows light to one boat and no one else.\nrules:\n  - "**Applies when** *(signaling a boat without being seen from shore)*."\n---\n',
  'game/expansions/fogbound/elements/add-on/when-to-roll.md': '---\nname: When to Roll\nkind: add-on\ntags: [ add-on ]\nextends: module/when-to-roll\n---\n\nIn fog, the narrator calls for a roll before anyone sees anything farther than an oar\'s length.\n',
  'game/game.md': '# Game\n\nHarrowgate\'s choices about its engine\'s core elements.\n',
  'game/elements/vendor/the-chandler.md': '---\nname: The Chandler\nkind: vendor\ntags: [ harbor, vendor ]\ncarries: Rope, lamps, oilskins, and anything a boat needs.\ncompetition: The Salt Market, where it is cheaper and nobody asks.\n---\n\nA counter on the east piers that smells of tar.\n',
  'game/elements/gear/salt-knife.md': '---\nname: Salt Knife\nkind: gear\ntags: [ harbor, gear, weapon ]\nprerequisite: A berth on the docks\nflavor: A dock knife with a cork grip, so it floats.\nrules:\n  - "**Weapon** *(clears no trouble)*."\ndarkened_flavor: Rusted to the handle.\nrecovery: The Chandler sells another.\n---\n',
  'game/elements/gear/storm-lamp.md': '---\nname: Storm Lamp\nkind: gear\ntags: [ harbor, gear, tool ]\nreskins: gear/lantern\nflavor: A brass lamp that stays lit in the narrows\' wind.\n---\n',
};

/** A real game trial, generated locally from a private rulebook and never committed. */
const trial = import.meta.glob<{ engine: string; world: Record<string, string>; engineFiles: Record<string, string> }>('./game.generated.json', { eager: true, import: 'default' });

export function trialGame(): { engine: string; world: MemoryFs; engineFs: MemoryFs } | null {
  const t = Object.values(trial)[0];
  return t ? { engine: t.engine, world: new MemoryFs(t.world), engineFs: new MemoryFs(t.engineFiles) } : null;
}
