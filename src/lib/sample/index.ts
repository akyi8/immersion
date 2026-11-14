import { MemoryFs } from '../fs/memory';
import worldImage from './world.jpg';
import { SAMPLE_ENGINE, SAMPLE_GAME } from './game';

/**
 * Harrowgate, a small demo world for browser testing. It exists only to exercise the
 * app, and every name in it is invented for this purpose.
 */
// A full local copy of a real world, generated for testing and never committed.
const full = import.meta.glob<Record<string, string>>('./full.generated.json', { eager: true, import: 'default' });

export function sampleWorld(): MemoryFs {
  const generated = Object.values(full)[0];
  if (generated) return new MemoryFs({ ...generated, 'world.jpg': worldImage });
  return new MemoryFs({
    'world.md': `---
name: Harrowgate
tagline: A harbor town · demo world
wiki: wiki
stories: stories
engine: ${SAMPLE_ENGINE}
---

# Harrowgate
`,
    ...SAMPLE_GAME,
    'world.jpg': worldImage,
    'table/the-fog-season/campaign.md': `---
name: The Fog Season
role: gm
game: own
links:
  - name: Our characters
    url: https://example.com/harrowgate-characters
---
`,
    'table/the-fog-season/the-missing-ledger/adventure.md': `---
name: The Missing Ledger
order: 1
---
`,
    'table/the-fog-season/the-missing-ledger/session-1.plan.md': `---
name: The Ledger Goes Missing
---

Goal: put the ledger in play and let them meet Tomas Reyes angry.

- Open at the Salt Market at low water.
- Tomas Reyes hires them. He will not say what the ledger holds.

> [!rumor]
> The harbor watch already has the ledger.

> [!narrator]
> They do not. Wren took it, and she has not opened it.
`,
    'table/the-fog-season/the-missing-ledger/session-1.log.md': `---
name: The Ledger Goes Missing
played: 2026-11-05
when: The first night of fog
table: [ Mike, Dana, Rob ]
---

Tomas Reyes met us at the Salt Market and was already shouting. His ledger is gone, and with it every favor owed to him in Harrowgate.

> [!rumor]
> A dock boy swears he saw Wren leave the market with a book under her coat.

We agreed to find it before the fog lifts.
`,
    'table/the-fog-season/the-missing-ledger/session-2.plan.md': `---
name: Low Water
---

Goal: the mudflats, and the first real trouble.
`,
    'table/the-fog-season/the-missing-ledger/session-2.log.md': `---
name: Low Water
played: 2026-11-12
when: The second night of fog
table: [ Mike, Dana, Rob ]
---

We searched the mudflats at low water.

> [!rumor] false
> The ledger was thrown in the harbor.
`,
    'wiki/people/wren-okafor.md': `# Marta "Wren" Okafor

**Aliases:** Marta, Wren

---

## Introduction

Marta "Wren" Okafor carries messages through Harrowgate that nobody else will carry. She owes Tomas Reyes a favor and resents it.
`,
    'wiki/people/tomas-reyes.md': `---
aliases: [Rook]
---

# Tomas Reyes

A smuggler who works the Salt Market and keeps a ledger of every favor owed to him in Harrowgate.

> [!narrator]
> Tomas is quietly informing for the harbor watch.
`,
    'wiki/places/harrowgate.md': `# Harrowgate

**Aliases:** the narrows

A harbor town built on stilts over a drowned river mouth. Its alleys are called the narrows.
`,
    'wiki/places/the-salt-market.md': `# The Salt Market

The night market on the east piers of Harrowgate, where Rook keeps his stall and Wren picks up her letters.
`,
    'stories/the-tide-letter.md': `# The Tide Letter

## Chapter 1

Wren took the long way through the narrows, because the short way went past Rook's stall.
`,
  });
}
