# Immersion

Immersion is a desktop app for worldbuilding, writing fiction, and solo tabletop roleplaying. A world is an ordinary folder of markdown files, so everything Immersion shows can also be opened in Obsidian, VS Code, or any text editor, and synced with Git.

Immersion is in active development. The World, Story, and Boards modules work today, and a first version of the Game module holds a tabletop game's rules. Play, which will run solo roleplaying sessions with an AI narrator, comes next, and the Character module is still being designed.

## What it does

### The library and the Worlds page

A library is one folder that holds a writer's worlds. The app asks where the library lives on first run, finds every world in it up to six folders deep, and lists them on the Worlds page with their cover pictures. Any folder of writing becomes a world when it gains a `world.md`, and the app can create a new world with starter categories for people, places, factions, and history.

When the library is a Git repository, Immersion keeps it in sync. It commits and syncs an open world every five minutes, three minutes after typing stops, whenever the app comes back to the front, and when the world closes. The header shows how many files are waiting to go out and how many are waiting to come in, and a button syncs at once.

### World

The World module is the wiki. Every entry is a markdown file, and any name that matches another entry becomes a link. Linked entries open side by side as sliding panes, and a sidebar gathers the people and places around the open entry. The World home page opens with a band of faces: every entry with a picture, people first, with the ones opened most recently at the front.

Each entry can carry a picture. The writer frames the picture by dragging and zooming it, and the picture file itself is never changed. People show their picture as a portrait, and places, factions, and other entries show theirs as a banner across the top of the entry, with the name over it. Any entry can switch between the two.

The wiki has two views. Narrator view shows everything. Protagonist view hides passages marked as the narrator's secrets, so the wiki can be shown to players without giving anything away.

### Story

The Story module holds the writing, sorted into three places: the drawer for ideas, the desk for work in progress, and the shelf for finished work. A piece of writing is either a note, which is a single file, or a manuscript, which is a folder of chapters with a title page. Title pages carry the subtitle, series, author, and copyright, and can draw the author from a shared author profile.

The writing view is a live markdown editor. Markdown marks stay hidden until the cursor reaches them, names from the wiki link as they are typed, and a selection bar offers bold, italic, underline, and making a new wiki entry from a name. Each chapter's beat, its plan in a sentence or two, folds above the prose, and a Beats panel shows the chapter's beats on every thread beside the writing. Drafting mode hides everything but the page.

The vault keeps private stories encrypted. One passphrase unlocks every world's vault. The passphrase becomes a key through Argon2id, the stories are encrypted with AES-256-GCM, and a computer can remember the key in its own keychain. Real World is a journal world that the app creates for the writer, and its stories live in the vault.

### Boards

The Boards module draws the plan of the world as grids, with time or order along one side and threads along the other:

- **The timeline** sets every dated wiki entry in order, with eras drawn as bands beside the events inside them.
- **A manuscript's board** has one card per chapter, with its beat on each thread.
- **A series board** has one card per book, so a series can be planned before its books are written.

A board can carry a story structure, such as Kishōtenketsu, the Story Circle, or four acts. The board then groups its cards by the structure's parts, and guidance for each structure is a click away. Cards can be dragged, moved by name from a right-click menu, and edited in place.

### Game

The Game module holds a tabletop game's rules as separate elements, one file each. An aspect, such as a piece of gear, is edited as a form with its own fields, and a rule is written in the same editor as a chapter. A game is built on an engine, whose core elements appear in every game built on it. Each world adds elements of its own, brings new kinds of element if it needs them, and can set aside or reskin a core element, giving it a new name and flavor while keeping its mechanics. The module is off until it is turned on in Settings.

A game's rulebook is kept as a book. The Game sidebar shows it as a tree: the book's title page, its front matter, its divisions, the rule sections in each division, and the rules in each section, then its back matter. Rules can be dragged into a new order or added with a click. A rule opens in the same editor as a chapter, with its title, its tags, the engine's text that every game built on the engine prints, and below it the world's own text, which holds the world's examples and additions. A section opens as the book prints it, every rule formatted in order. Any page can carry a header picture, and a world can give a core rule a picture of its own. A division can list every element of some kinds instead, so the aspects print as lists. When a world has its own book and its engine has a base game book, a switch shows either one. A world's game can also have expansions, each a folder of its own that adds gear, vendors, and its own pieces to rules without changing anything in the world, so a table can play with any mix of the expansions it owns. An element can move between the world and its expansions. The title page is drawn from fields, as a manuscript's is: the title, a line under it, the author from an author profile, and the copyright line. A book prints its title page, then its front matter, then its divisions, so an introduction is a page of the front matter.

### Across the app

- **Quick finder.** Ctrl or Cmd K finds any entry, chapter, board, or action in the open world.
- **Saving.** Everything typed saves on its own a moment after typing stops, and at once when the writer turns to another program, leaves a world, or closes the window.
- **Edits from outside.** A file changed by another program while it is open in Immersion, such as by a Git pull or an assistant working in the same folder, shows the change at once. When the writer has unsaved typing in the same file, edits to different paragraphs are joined, and the writer is asked to choose only when both changed the same lines.
- **How a page is shown.** Every open page has a view button in its corner, beside full screen. It sets the page's column to a book's line or the full reading width, makes its text smaller, shows, hides, changes, frames, or removes its picture, and lights the paragraph being written while the others fall back and the line stays near the middle of the page. Each page remembers its own choices on each computer, so a session plan can stay dense while a chapter stays spare.
- **A page as a card.** An entry's picture can be a banner, a portrait, or behind the page, chosen where the picture is framed. Behind the page, the entry's name runs up the left edge with its category above it, its first sentence is set at the top right, and the picture lies low on the page and fades slowly upward. The card is as wide as its column of text, so on a wide screen its name and picture stay with the text.
- **Quiet while typing.** While you type, the header, the sidebar, and the page's buttons dim, and they return when the pointer moves. Settings, under This computer, turns this off.
- **Names in a game's text.** A game's rules, sections, and aspects link names as they are typed, the way a chapter does. The world's people and places are marked as names, and the game's own terms are set in small capitals in a second color. A name opens its wiki entry, and a term opens its rule, section, or aspect. The base engine's text links only the engine's terms, because every world shares it. The wiki and the stories link the world's names and leave game terms alone, since a game's terms are often ordinary words.
- **Back and forward.** The header's arrows, Cmd with a bracket on a Mac, Alt with an arrow elsewhere, and a mouse's side buttons move through everything looked at.
- **Themes.** Each world has its own colors and fonts, chosen in the theme editor. Each writer chooses light or dark, a layout, a board font, and a zoom level in Settings.
- **Modules.** Settings show or hide each module in the header. World, Boards, and Story are on from the start, and Character, Play, and Game wait until they are turned on.
- **Updates.** The app checks for a new release when it starts and every six hours, and offers to install it.

## What a world looks like

A world is any folder that contains a `world.md`:

```
harrowgate/
  world.md          the world's name, tagline, and folders
  world.jpg         the cover picture
  wiki/             one markdown file per entry, in category folders
    people/
      wren-okafor.md
      wren-okafor.jpg
    places/
  stories/          the desk: work in progress
    ideas/          the drawer
    finished/       the shelf
```

`world.md` starts with a YAML header:

```yaml
---
name: Harrowgate
tagline: A harbor town
wiki: wiki
stories: stories
---
```

[docs/world-format.md](docs/world-format.md) describes every file and header field the app reads, including entries, pictures and framing, dates and eras, manuscripts, beats and threads, series, story structures, and game engines and elements.

## Building

- `npm install` installs the frontend dependencies.
- `npm run dev` serves the app in a browser at http://localhost:1420, with Harrowgate, a small built-in demo world.
- `npm test` runs the unit tests, and `npm run check` type-checks the code.
- `cargo test` in `src-tauri/` runs the Rust tests.
- `npx tauri dev` runs the desktop app. It needs Rust and, on Linux, the WebKitGTK development libraries.
- `npx tauri build` builds an installer for the current platform. Release builds sign their update files, so a local build needs the update key in `TAURI_SIGNING_PRIVATE_KEY`, or `--config '{"bundle":{"createUpdaterArtifacts":false}}'` to skip signing.

## Releases

GitHub Actions builds the macOS and Windows apps on every push to `main` and publishes each build as a release. Updates are signed with the project's update key, and the app refuses any update that is not signed with it. The builds are not yet code-signed with Apple or Microsoft certificates, so macOS and Windows show a warning the first time the app is installed by hand.

## Stack

Tauri 2 with a Rust backend, Svelte 5 and TypeScript for the screens, CodeMirror 6 for the editor, and Vite. Fonts are bundled, so every theme works offline.

## License

No license has been chosen yet, so all rights are reserved for now.
