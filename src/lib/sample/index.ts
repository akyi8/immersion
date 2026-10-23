import { MemoryFs } from '../fs/memory';
import worldImage from './world.jpg';

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
---

# Harrowgate
`,
    'world.jpg': worldImage,
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
