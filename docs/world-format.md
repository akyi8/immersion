# The world format

Immersion keeps no database. A world is a folder of ordinary markdown files, and the app reads everything it shows from those files. This document describes every file and header field the app reads, so a world can be written by hand, by a script, or in another editor, and still appear in Immersion exactly as intended.

The examples use Harrowgate, the small demo world that the browser build opens. Its people and places are invented for testing.

## Contents

1. [The library](#1-the-library)
2. [A world](#2-a-world)
3. [Wiki entries](#3-wiki-entries)
4. [Stories: the desk, the drawer, and the shelf](#4-stories-the-desk-the-drawer-and-the-shelf)
5. [Beats and threads](#5-beats-and-threads)
6. [Boards](#6-boards)
7. [Story structures](#7-story-structures)
8. [Formatting](#8-formatting)
9. [Files the app keeps for itself](#9-files-the-app-keeps-for-itself)
10. [Editing a world while the app is open](#10-editing-a-world-while-the-app-is-open)
11. [Games: engines and elements](#11-games-engines-and-elements)

## 1. The library

A library is one folder that holds a writer's worlds. Immersion asks for its location the first time it runs, and the Worlds page lists every world it finds there. The app looks for worlds up to six folders deep, so a world can sit inside a project folder. It skips hidden folders, `node_modules`, and any folder inside a world.

The library's root can hold `immersion.md`, which belongs to the app. That file stores the writer's author profiles, the vault's key settings, and per-writer choices such as layout and which modules the header shows. When the library is a Git repository, `immersion.md` syncs along with the worlds, so those choices follow the writer to other computers.

## 2. A world

A world is any folder that contains a `world.md`. Its YAML header names the world and the folders the app reads:

```yaml
---
name: Harrowgate
tagline: A harbor town
wiki: wiki
stories: stories
---
```

- `name:` is the world's name, and `tagline:` is the line shown under it.
- `wiki:` is the folder that holds the wiki. It defaults to `wiki`.
- `stories:` is the folder that holds the writing. It defaults to `stories`.
- `theme:` holds the world's colors and fonts, which the app's theme editor writes.
- `profile:` names the author profile that new manuscripts in this world use.
- `series_threads:` and `series_structures:` belong to series boards, which section 6 describes.
- `journal:` and `daily:` mark the writer's journal world, which the app creates and manages.
- `engine:` names the engine this world's game is built on, as the engine folder's path from the top of the library. `game:` names the folder that holds the world's own game elements, and defaults to `game`. Section 11 describes both.

A picture named `world.jpg`, `world.png`, or `world.webp` beside `world.md` is the world's cover. The app shows the cover on the Worlds page and on the world's loading screen, and can blur it behind the world as a glass backdrop.

## 3. Wiki entries

Each wiki entry is one markdown file in the wiki folder. The top-level folder an entry sits in is its category, such as `people/`, `places/`, `factions/`, or `history/`. Deeper folders are allowed, and an entry inside them keeps its top-level category. A file directly in the wiki folder is Unfiled.

The app leaves some files out of the wiki. It hides folders named `archive`, files named `README.md`, files ending in `.outline.md`, `.notes.md`, or `.summary.md`, and hidden files and folders such as `.git`.

### Names and links

An entry's name comes from a `name:` header field if there is one, then from the first `# ` heading, then from the file name. A lowercase slug with hyphens makes a good file name, such as `wren-okafor.md`.

Other names for the same entry go in the header as a list:

```markdown
---
aliases: [Rook]
---

# Tomas Reyes

A smuggler who works the Salt Market and keeps a ledger of every favor owed to him.
```

An older form is also read: a bold line under the title, such as `**Aliases:** Rook, the Ledger-keeper`.

Names link on their own. Wherever an entry's name or one of its aliases appears in any text in the world, the app links it, so `[[wiki links]]` are unnecessary. The first paragraph of prose is the entry's summary, which the app shows on hover and on the World home page, so an entry reads best when it opens with a sentence that says what the thing is.

### Narrator-only text

Immersion shows the wiki in two views. Narrator view shows everything, and Protagonist view hides the narrator's secrets so the wiki can be shown to players. A `> [!narrator]` callout marks text that only Narrator view shows:

```markdown
> [!narrator]
> Tomas is quietly informing for the harbor watch.
```

### Pictures, framing, and banners

A picture with the same file stem as an entry is that entry's picture. For example, `wren-okafor.jpg` beside `wren-okafor.md` belongs to Wren. JPEG, PNG, and WebP are read.

The app never crops a picture file. Instead, it frames the picture, and the entry's header records the framing:

```yaml
portrait_frame: 50 30 1.4
banner_frame: 50 40 1
```

Each frame holds three numbers. The first two are the point of the picture that stays in view, measured across and down from 0 to 100. The third is the zoom, from 1 to 4. A missing frame is centered at a zoom of 1.

An entry in People shows its picture as a portrait beside its name. An entry in any other category shows its picture as a banner across the top of the entry, with the name over the banner's lower edge. A `picture: banner` or `picture: portrait` field overrides the category's default. Faces on the World home page always use the portrait framing.

A world can set how all its pictures show at once, with `pictures: behind`, `pictures: banner`, or `pictures: portrait` in its `world.md`. An entry's own `picture:` still wins over the world's choice, and with neither the category decides. The app sets the world's choice in Settings, under This world, where it can also take every entry's own choice away so that all of them follow the world.

A third value, `picture: behind`, lays the picture behind the page. The page is then set like a card: the entry's name runs up its left edge with its category above it, its first sentence is set at the top right, and the picture stands as a tall strip down the page's left side, behind the name, fading toward the text. `behind_frame:` frames the picture for that shape, in the same form as the other two frames. All three are chosen in the app where the picture is framed.

### Dates and eras

An entry with a `when:` field appears on the world's timeline. The app shows the date exactly as written and uses it only to sort, so a date reads best when it is written the way a writer would say it. These forms are understood:

- a year: `2057`, `44 BCE`, `AD 33`
- a day: `14 October 1066`, `Aug 8 2020`, `2020-08-08`, or `8/8/2020`, which reads month first
- a season: `spring 2052`
- a decade: `1920s`
- a century: `5th century BCE`
- an approximate date: `c. 1200 BCE`
- a span: `1985 to 2000` or `1985-2000`

An entry whose date is a span longer than a year becomes an era when its header also says `era: true`. The timeline draws an era as a band beside every event inside its span. When one era ends in the year the next begins, events in that shared year belong to the later era.

```markdown
---
when: 1840 to 1871
era: true
---

# The Long Tide
```

## 4. Stories: the desk, the drawer, and the shelf

The stories folder holds the writing, sorted into three places by how active it is:

- The **desk** is the stories folder itself. It holds work in progress.
- The **drawer** is `ideas/`. It holds pieces that might be worked on later.
- The **shelf** is `finished/`. It holds finished or published work.

Moving a piece between places means moving its file or folder between those three folders. The app leaves `export/`, `archive/`, and `old/` out, along with files ending in `.outline.md`, `.notes.md`, or `.summary.md`.

Every piece of writing is one of two kinds. A **note** is a single markdown file with a `# Title`, such as a story seed or working notes. A note has no chapters and no board. A **manuscript** is a folder that holds a `book.md` and its chapters. Anything with chapters is a manuscript, even a short story with only one chapter.

### A manuscript folder

```
the-tide-letter/
  book.md              the title page
  01-the-narrows.md    chapters, numbered in reading order
  02-salt-market.md
  part-two/            a part is a folder of numbered chapters
    03-the-ledger.md
  front/               pages before the story, such as a dedication
    01-dedication.md
  back/                pages after it, such as acknowledgements
    01-acknowledgements.md
```

- **Chapters** are numbered files named `NN-slug.md`, with two digits, in reading order. Each starts with `# Chapter title`. A prologue and an epilogue are ordinary chapters numbered first and last. Inserting a chapter means renumbering the files after it, so the numbers stay in order with no gaps or repeats.
- **Scenes** are `## ` headings inside a chapter.
- **Front and back pages** go in `front/` and `back/`, numbered the same way. They never count toward the story's words.

A new chapter made in the app without a title of its own is named with the book's part word and its number, such as `# Chapter 5` or `# Part 3`.

### The title page

`book.md` is the title page. It holds header fields and the title heading, and the app draws the page from those fields, so the series line and the copyright line are never typed into the body.

```markdown
---
subtitle: A Harrowgate Story
series: The Harrowgate Letters
number: 1
series_word: Story
part_word: Chapter
author: Wren Okafor
copyright: Wren Okafor
year: 2026
threads:
  - Main plot
  - Wren's debt
---

# The Tide Letter
```

- `subtitle:` is the line under the title.
- `series:` and `number:` place the book in a series. A book that stands alone leaves both out.
- `series_word:` is what one book of the series is called, such as Story, Book, Novel, or Episode. It defaults to Story. Every book in a series shares one word.
- `part_word:` is what the book's chapters are called, such as Chapter, Part, or Episode. It defaults to Chapter.
- `profile:` links the book to an author profile stored in the library's `immersion.md`. A book with a profile takes its author and copyright from the profile. A book without one can carry `author:` and `copyright:` directly.
- `year:` is the copyright year.
- `threads:` lists the book's threads, which section 5 describes. The field appears only when the book has more than its main thread.
- `structure:` names the board's story structure, which section 7 describes.

## 5. Beats and threads

A chapter's plan lives inside the chapter, as a folded callout directly under its title heading. Immersion calls that callout the chapter's beat. A book can follow several threads at once, such as a subplot or one character's arc, and each thread has its own labelled beat:

```markdown
# The Salt Market

> [!outline]-
> Wren picks up a letter addressed to someone who drowned last winter.

> [!outline]- Wren's debt
> Rook calls in the favor she owes him.

The market opened at dusk, as it always did, under lanterns that smelled of fish oil.
```

- An unlabelled `> [!outline]-` belongs to the main thread.
- A label names one of the threads in the book's `threads:` list. The first name in that list is the main thread's name, and the others follow in board order. A label missing from the list still gets a column, placed after the listed ones.
- A beat can run several paragraphs, as long as every line of the callout starts with `>`, including the blank lines between paragraphs.
- The writing view folds beats into a single quiet line above the prose, so a beat can be as blunt as a note to self.

## 6. Boards

Immersion draws three kinds of board, and none of them has a file of its own. Each board is a grid drawn from the files described above, with one card per row in order and one column per thread. As a result, changing a board from outside the app means changing those files.

### The timeline

The timeline is every wiki entry with a `when:` field, in time order, with eras drawn as bands. An entry joins the timeline when it gains a `when:` field and leaves when the field is removed.

### A manuscript's board

A manuscript's board has one card per chapter, in chapter-number order. A card shows the chapter's title, its main beat, its beat on each thread, and its word count. The columns come from the book's `threads:` list. Adding a card means adding a chapter file, and moving a card means renumbering the chapter files.

### A series board

A series board has one card per book in the series. It is the place to plan a series before its books are written.

- **A book joins a series** through `series:` and `number:` in its `book.md`. The series name is matched without regard to capitals, but every book reads best with the same spelling. The board orders books by `number:`, so every book needs its own number.
- **A series has no file of its own.** It exists because its books name it. Renaming a series means changing `series:` in every one of its books, along with the series' keys in `world.md`.
- **A book's card** is its `book.md`. The card's title is the book's `# Title`, and the card's beats are `> [!outline]-` callouts directly under that heading.
- **The series' threads** live in `world.md` under `series_threads:`, keyed by the series name. A series with only its main thread needs no entry.
- **A book not yet written** still needs a manuscript folder, because a card is a `book.md`. A folder in the drawer with a `book.md` and no chapters is enough, and it can gain chapters later without moving.

```yaml
series_threads:
  The Harrowgate Letters:
    - Main plot
    - Wren's debt
```

A book's own `threads:` list belongs to that book's board, and a series' threads belong to the series board. The two lists are separate even when they share names.

## 7. Story structures

A manuscript's board and a series board can each carry a story structure. A board with a structure shows its cards in one band per part of the structure, in story order. A board without one shows its cards in a single run. The structures, and the ids of their parts, are these:

- `kishotenketsu`: `ki`, `sho`, `ten`, `ketsu`
- `story-circle`: `you`, `need`, `go`, `search`, `find`, `take`, `return`, `change`
- `four-acts`: `act-1`, `act-2`, `act-3`, `act-4`

A manuscript names its structure with `structure:` in its `book.md`. A series names its structure in `world.md` under `series_structures:`, keyed by the series name, in the same form as `series_threads:`.

Each card records its own part. A chapter records its part in a header at the top of the chapter file, keyed by structure:

```markdown
---
stages:
  kishotenketsu: ten
---

# The Ledger
```

The writing view hides that header only while every key in it belongs to the app. A chapter's header should therefore hold `stages:` and nothing else, because any other key makes the whole header show as raw lines above the prose.

A book records its part on its series board as `series_stages:` in its `book.md`, in the same form. That field stays separate from the structure of the book's own chapters. A card with no part in the board's current structure sits in an Unassigned band after the last part. A card can record parts in several structures at once, so switching a board between structures loses nothing.

Reading order follows the board. Because bands run in story order, every chapter in one part comes before every chapter in the next part, and unassigned chapters come last. Chapter numbers, or a series' `number:` fields, follow the same order.

## 8. Formatting

The writing view uses ordinary markdown for formatting, and the app writes these marks itself when the writer uses its shortcuts:

- Bold is `**text**`, written with Ctrl or Cmd B.
- Italic is `*text*`, written with Ctrl or Cmd I.
- Underline is `<u>text</u>`, written with Ctrl or Cmd U. Markdown has no underline of its own, and other markdown editors read the same tags.

Paragraphs are separated by one blank line, which the editor writes when the writer presses Enter.

## 9. Files the app keeps for itself

Some files belong to the app, and editing them by hand risks damaging what they hold:

- **`.vault/`** inside a world holds encrypted stories. Each file is encrypted with AES-256-GCM under a key derived from the writer's passphrase with Argon2id, and each file has a random name, so the folder reveals only how many stories it holds. Any edit to these files makes them unreadable.
- **`immersion.md`** at the library root holds author profiles, the vault's key settings, and the writer's layout choices. Its `vault:` field must never be changed by hand.
- **`archive/`** folders are deliberately left out of the app.

## 10. Editing a world while the app is open

Immersion watches the world's folder while it runs. A file changed in another program appears in an open window within about a second, so the app can stay open while another tool edits the world.

When the library is a Git repository, the app also commits and syncs each open world. It commits everything in the world's folder, together with `immersion.md`, then pulls and pushes. It does so every five minutes, three minutes after typing stops, whenever the app comes back to the front, and when the world closes. Its commits are named `Immersion: <world name>`.

That sync has one consequence for any other tool writing into an open world. A file that is only half written can be committed by the app and reach other computers. A tool should therefore write each file whole in one step, pull before it starts, and commit promptly when it finishes.

## 11. Games: engines and elements

The Game module holds a tabletop game's rules as separate elements, one markdown file each. An element is one aspect, such as a piece of gear or a need, or one rule, such as a keyword. The module is off until the writer turns it on in Settings.

A game is built on an engine. The engine holds the core elements, which appear in every game built on it. Each world's game adds elements of its own, and can set aside or reskin core elements from its own side, so the engine stays the same for every game.

### The engine folder

An engine is a folder anywhere in the library that holds an `engine.md`. It is not a world, so it never appears on the Worlds page:

```
games/example-engine/
  engine.md                 the engine's name
  book.md                   the base game's book: its title page and divisions
  kinds/
    gear.md                 the shape of a kind: its fields and their order
    need.md
  elements/
    gear/
      rope.md               one element
      lantern.md
    need/
      rest.md
    division/
      the-protagonist.md    a division of the book, with its front page
    chapter/
      taking-risks.md       a rule section
    module/
      when-to-roll.md       a rule
      when-to-roll.png      the rule's header picture
```

A world points at its engine with `engine: games/example-engine` in its `world.md`. While the world is open, the app reads and writes the engine folder beside it, and Git sync carries the engine's changes in the same commit as the world's.

### A world's game folder

A world keeps its own game in its game folder, `game/` unless `world.md` names another:

```
harrowgate/
  world.md
  game/
    game.md                 the world's choices about core elements
    book.md                 the world's book: its title page and divisions
    kinds/                  kinds the world brings, if any
    elements/
      gear/
        salt-knife.md
        storm-lamp.md
      vendor/
        the-chandler.md
      add-on/
        when-to-roll.md     the world's piece of a core rule
    expansions/
      fogbound/             an expansion, with elements of its own
```

A world can bring kinds of its own, such as a magic system, in its `kinds/` folder. A world never redefines a kind its engine already has.

### Kinds

Each kind's shape file lists the fields every element of that kind carries, and the order its parts print in:

```markdown
---
name: Gear
fields:
  - { key: availability, label: Availability, type: line }
  - { key: rules, label: Rules, type: list }
  - { key: burned, label: Burned, type: text }
layout: [ availability, flavor, rules, burned ]
---

What a protagonist carries.
```

A field's type decides how the app edits it. A `line` field is one line, a `text` field is a paragraph, and a `list` field holds one item a line, such as an element's rules. The `layout` places the element's flavor, its body text, among its fields. The body of the shape file says what the kind is.

### Elements

An element's structured fields live in its header, and its flavor text is its body:

```markdown
---
name: Salt Knife
kind: gear
tags: [ harbor, gear, weapon ]
vendor: the-chandler
availability: "2"
rules:
  - "**Weapon** *(clears no trouble)*."
burned: Rusted to the handle.
---

A dock knife with a cork grip, so it floats.
```

- `name` and `kind` name the element and its kind. The file's name, without `.md`, is its id, and it stays the same when the element is renamed.
- `tags` says where the element belongs and what it is. A `core` tag marks an engine's element.
- `vendor` names the id of the vendor element that sells it, in the same world.
- Every other key is one of the kind's fields.

### The book

A game's rulebook is a book of divisions, rule sections, and rules. The book has a title page and is split into divisions, such as The Protagonist and The Narrator, and each division has a front page of its own. A division holds rule sections, and each section holds its rules in order. A rule is where the text lives: it prints under its own heading, and any subheadings inside its text are written as `###`.

The engine can have a `book.md`, which is the base game's book, and a world's game folder can have one, which is that world's book. When both exist, the Game sidebar offers a switch between them. `book.md` is the book's title page, and its header names the book and lists its divisions in order:

```markdown
---
name: Harrowgate
divisions:
  - division/the-protagonist
  - division/the-harbor
  - division/the-aspects
---
```

The app draws the title page from header fields, in the same names a manuscript's `book.md` uses, so the byline and the copyright line are never typed into the page:

```yaml
subtitle: A game of salt, debt, and fog
profile: wren-okafor
year: 2026
```

- `subtitle:` is the line under the title.
- `profile:` links the book to an author profile in the library's `immersion.md`, by its id. While it is set, the profile's author and copyright holder are the book's.
- `author:` and `copyright:` hold the names written out by hand, for a book with no profile.
- `year:` is the copyright year.

A world's title page also names the engine the game is built on, taken from the world's `engine:`.

A book prints its title page, then its front matter, then its divisions. An introduction is therefore a page of the front matter, usually its last. Text in the body of `book.md` is left from before the title page, when the body was the book's front page and printed ahead of the front matter. The app still shows that text on the title page and offers to move it into the front matter as a page named Introduction.

A book can also list front matter and back matter, each a list of rule sections that sit before and after the divisions, such as the license, the copyright page, and the safety page:

```yaml
front_matter: [ chapter/front-matter ]
back_matter: [ chapter/back-matter ]
```

Each book lists its own, so a world's front matter is a section of the world's own. It can still print the engine's pages, each with the world's piece after it, and a page that belongs to one book alone sits only in that book's front matter.

A reference names an element by `engine:` or `world:`, then its kind and id, such as `engine:chapter/taking-risks`. A reference without `engine:` or `world:` points into the folder of the file that names it, so a world's `book.md` names the world's own divisions.

A division is an element of kind `division`. Its body is its front page, and its `sections` list its rule sections in order. A division with a `catalog` lists every element of those kinds instead, by kind and by name, so the book's aspects print as lists:

```markdown
---
name: The Protagonist
kind: division
tags: [ harbor, division ]
sections:
  - engine:chapter/taking-risks
  - chapter/the-tides
---

Who you play on the docks.
```

```markdown
---
name: The Aspects
kind: division
tags: [ harbor, division ]
catalog: [ need, gear, vendor ]
---
```

A rule section is an element of kind `chapter`. Its body is the section's introduction, and its `items` list its rules in order. A line written as `heading:` and its text is a divider between groups of rules:

```markdown
---
name: Taking Risks
kind: chapter
tags: [ core, chapter ]
items:
  - module/when-to-roll
  - module/reading-the-dice
---

When a protagonist tries something uncertain, the dice decide.
```

A rule is an element of kind `module`, and its body is its text. An engine's rule is a core rule, which every game built on the engine prints. A world adds its own piece to a core rule with an element of kind `add-on` in `elements/add-on/`, whose `extends` names the rule it belongs to. The world's piece prints after the core text, and holds the world's examples and anything only that world adds:

```markdown
---
name: When to Roll
kind: add-on
tags: [ add-on ]
extends: module/when-to-roll
---

*Wren wants to cross the pier in the fog. The narrator calls for a roll, because the guard is listening.*
```

The app creates the add-on the first time the writer types in a core rule's world piece. A rule of the world's own has no add-on, because all of its text is already the world's. A world's own rule goes only into the world's own sections, and a world's own section only into the world's divisions, so the engine's book never names something one world alone has.

Any page of the book can carry a header picture: the title page, a division, a section, or a rule. The picture is a JPEG, PNG, or WebP file beside the element's file with the same name, such as `elements/module/when-to-roll.png`, or `book.png` beside `book.md`. The page's header remembers how the picture is framed in `banner_frame:`, as a wiki entry does. In a world's book, the world's piece of a core rule or section can carry a picture of its own beside the add-on, which shows instead of the core picture.

A kind's shape file can name its body with `body:`, such as `body: Text` for rules or `body: Front page` for divisions. The form shows that name above the body instead of Flavor.

### Expansions

A world's game can have expansions, each a folder of its own in the game folder's `expansions/`. An expansion adds to its world and never changes it, so any mix of expansions makes a sound game: a table that owns two of a world's expansions has those two folders and plays with them, and a table without the rest never has their files. The app shows every expansion whose folder is present.

```
harrowgate/game/expansions/
  fogbound/
    expansion.md            the expansion's name, and what it is about as its body
    elements/
      gear/
        dark-lantern.md
      add-on/
        when-to-roll.md     Fogbound's piece of a core rule
```

An expansion's elements have the expansion's folder name as their origin, so a reference to one is written `fogbound:gear/dark-lantern`, and two expansions can each have an element with the same id. An expansion's gear, vendors, and other aspects appear in the world book's catalog lists, marked with the expansion's name. The engine's base game never shows them.

An expansion adds its own piece to a rule with an add-on in its own `elements/add-on/`. Its `extends` names a core rule as `module/<id>`, or a rule of the world's own as `world:module/<id>`. The piece prints after the world's piece, for a table that has the expansion.

An element of the world's own can move into one of its expansions, or back, with Belongs to in its form. The app moves the file and its picture. The folder names `engine`, `world`, and `heading` cannot name an expansion.

### Setting aside and reskinning

A world records its choices about core elements on its own side. Its `game.md` lists the core elements it sets aside, each written as kind and id:

```yaml
---
set_aside:
  - need/rest
---
```

A reskin is a world's element that names a core element in `reskins:`. It carries only a new name and new flavor. Its mechanics are read from the core element, so a change to the core element reaches every reskin of it, and the core element itself leaves that world's game:

```markdown
---
name: Storm Lamp
kind: gear
tags: [ harbor, gear, tool ]
reskins: gear/lantern
---

A brass lamp that stays lit in the narrows' wind.
```

