# Immersion

Immersion is a desktop app for solo tabletop roleplaying, worldbuilding, and writing fiction. A world is an ordinary folder of markdown files, so everything Immersion shows can also be opened in Obsidian, VS Code, or any text editor, and synced with git.

Immersion is early in development. Today it opens a world folder and presents its wiki: every entry is readable, names that match other entries become links with a preview panel, a working-set sidebar gathers the people and places around the open entry, and back and forward work across the app. Editing, a writing module for manuscripts and outlines, and a play module with an AI narrator follow.

## What a world looks like

A world is any folder that contains a `world.md` file:

```
my-world/
  world.md        name, tagline, and which folders hold the wiki and stories
  world.jpg       the loading-screen image (PNG, JPEG, or WebP)
  wiki/           one markdown file per entry, in category folders
    people/
    places/
  stories/        manuscripts
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

An image beside an entry with the same name, such as `wren-okafor.png` next to `wren-okafor.md`, becomes that entry's portrait. Aliases come from a YAML `aliases:` list or a `**Aliases:** a, b` line. A passage written as a `> [!narrator]` callout is shown in Narrator view and hidden in Protagonist view.

## Building

- `npm install` installs the frontend dependencies.
- `npm run dev` serves the app in a browser at http://localhost:1420 with a built-in demo world.
- `npm test` runs the unit tests, and `npm run check` type-checks the code.
- `npx tauri dev` runs the desktop app. It needs Rust and, on Linux, the WebKitGTK development libraries.
- `npx tauri build` builds an installer for the current platform.

GitHub Actions builds the macOS and Windows apps on every push to `main`. The builds are not yet code-signed, so macOS and Windows show a warning the first time the app opens.

## Stack

Tauri 2 with a small Rust backend, Svelte 5 and TypeScript for the screens, and Vite. Fonts are bundled: Bebas Neue, Atkinson Hyperlegible, and IBM Plex Mono.

## License

No license has been chosen yet, so all rights are reserved for now.
