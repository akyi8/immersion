import { keepWord, word } from './prefs';
import { withHeader } from './world';
import type { WorldFs } from './fs/types';

/**
 * ICONS TRIAL (Cerys, November 24, 2026).
 *
 * Small single-color icons beside the names in sidebars, lists, and hover cards. An icon
 * has no color of its own. It is drawn in the color of the text it sits beside, so it
 * follows each world's colors and dims, brightens, and takes the accent as the words do.
 *
 * This is a trial. Cerys is using it for a few hours to see whether the icons turn into
 * clutter, and the Icons switch in Settings turns every icon off at once. If the trial
 * fails, everything it added is found by searching the code for "ICONS TRIAL":
 *
 *   src/lib/icons.svelte.ts            this file: the switch, the icon data, the defaults
 *   src/screens/Icon.svelte            draws one icon
 *   src/screens/IconPicker.svelte      the form for choosing one
 *   the marked lines in                world/Sidebar.svelte, world/WorldHome.svelte,
 *                                      world/EntryView.svelte, game/BookTree.svelte,
 *                                      game/GameKind.svelte, game/GameModule.svelte,
 *                                      Settings.svelte, App.svelte,
 *                                      lib/world.ts, lib/index/wiki.ts, lib/game/labels.ts
 *   the package                        @iconify-json/game-icons
 *   in the files of a world            `icons:` in world.md, `icon:` in an entry's header,
 *                                      `icon:` under a label in a game's labels.md
 *
 * The icons are the Game-icons set (game-icons.net), by Lorc, Delapouite, and other
 * contributors, under the Creative Commons Attribution 3.0 license, which asks for that
 * credit. Settings shows it.
 */
const KEY = 'immersion.icons';

/** Written where an icon is wanted off, so a type with a default icon can have none. */
export const NO_ICON = 'none';

/** The icon a wiki category starts with, by the category's folder name. */
const WIKI_DEFAULTS: Record<string, string> = {
  people: 'cowled',
  characters: 'cowled',
  places: 'lighthouse',
  locations: 'lighthouse',
  factions: 'knight-banner',
  organizations: 'knight-banner',
  groups: 'knight-banner',
  history: 'scroll-unfurled',
  events: 'hourglass',
  items: 'backpack',
  objects: 'backpack',
  gear: 'backpack',
  creatures: 'wolf-head',
  lore: 'spell-book',
  technology: 'circuitry',
  religion: 'church',
  ships: 'anchor',
};

/** The icon a game label starts with. */
const GAME_DEFAULTS: Record<string, string> = {
  gear: 'backpack',
  keyword: 'rune-stone',
  need: 'heart-beats',
  wound: 'broken-heart',
  belief: 'meditation',
  bond: 'linked-rings',
  technique: 'crossed-swords',
  origin: 'village',
  path: 'treasure-map',
  resource: 'coins',
  vendor: 'shop',
  chrome: 'cyber-eye',
};

type Bodies = Record<string, { body: string }>;

class Icons {
  /** Whether icons show at all, on this computer. */
  on = $state(word(KEY) !== 'off');
  /** Every icon's drawing, by name, once it has been fetched. */
  private bodies = $state.raw<Bodies | null>(null);
  private loading: Promise<void> | null = null;
  /** The open world's choices, from `icons:` in its world.md: a category's folder to an icon's name. */
  world = $state.raw<Record<string, string>>({});

  set(on: boolean) {
    this.on = on;
    keepWord(KEY, on ? 'on' : 'off');
  }

  /** Fetches the icon set the first time an icon is drawn. It is a large file kept apart from the app's own code. */
  load(): Promise<void> {
    this.loading ??= import('@iconify-json/game-icons/icons.json').then((m) => {
      this.bodies = (m.default as unknown as { icons: Bodies }).icons;
    });
    return this.loading;
  }

  /** An icon's drawing, or null while the set is on its way or when there is no such icon. */
  body(name: string | null | undefined): string | null {
    return name ? (this.bodies?.[name]?.body ?? null) : null;
  }

  /** Every icon's name, once the set has arrived. */
  get names(): string[] {
    return this.bodies ? Object.keys(this.bodies) : [];
  }

  /**
   * The icon for a wiki entry: its own, else its folder's, else the folder above's, and so
   * on up to the category, else the category's default.
   */
  forEntry(folder: string, own?: string | null): string | null {
    if (own) return own === NO_ICON ? null : own;
    return this.forCategory(folder);
  }

  /** The icon for a wiki folder, given as its path under the wiki, such as `people/major`. */
  forCategory(folder: string): string | null {
    const parts = folder.split('/').filter(Boolean);
    for (let n = parts.length; n > 0; n--) {
      const chosen = this.world[parts.slice(0, n).join('/')];
      if (chosen) return chosen === NO_ICON ? null : chosen;
    }
    return WIKI_DEFAULTS[(parts[0] ?? '').toLowerCase()] ?? null;
  }

  /** Sets a wiki folder's icon in the world's `world.md`, or clears the choice with null. */
  async setCategory(fs: WorldFs, folder: string, name: string | null): Promise<void> {
    const next = { ...this.world };
    if (name) next[folder] = name;
    else delete next[folder];
    const text = await fs.readText('world.md');
    await fs.writeText('world.md', withHeader(text, { icons: Object.keys(next).length ? next : undefined }));
    this.world = next;
  }
}

export const icons = new Icons();

/** The icon for a game label: the one its `labels.md` gives it, else the label's default. */
export function labelIcon(label: string, chosen?: string | null): string | null {
  if (chosen) return chosen === NO_ICON ? null : chosen;
  return GAME_DEFAULTS[label.trim().toLowerCase()] ?? null;
}

/** What the picker's tabs gather, by the words in an icon's name. The set has no categories of its own. */
export const ICON_GROUPS: [id: string, label: string, test: RegExp | null][] = [
  ['characters', 'Characters', /(^|-)(man|woman|person|figure|cowled|hood|hooded|knight|pirate|bandit|cultist|monk|wizard|witch|king|queen|robot|android|face|head|ninja|soldier|priest|vampire|elf|dwarf|orc|goblin|angel|devil|character|meditation|brain|heart|skull|baby|farmer|cook|captain|nun|thief|spy|ghost|zombie|mummy|cyborg|alien)(-|$)/],
  ['places', 'Places', /(^|-)(castle|village|city|town|house|tower|church|temple|cave|mountain|mountains|forest|island|bridge|gate|factory|lighthouse|planet|ruins|tomb|hut|fort|harbor|dock|shop|tavern|pyramid|windmill|barn|cabin|tent|well|road|path|river|desert|hills|jungle|swamp|volcano|moon|sun|star|galaxy|orbital|station|bunker|prison|tower)(-|$)/],
  ['objects', 'Objects', /(^|-)(sword|swords|gun|pistol|revolver|rifle|shield|book|scroll|key|potion|coin|coins|gem|ring|rings|lantern|rope|backpack|chest|map|dice|card|cards|bottle|vial|axe|bow|helmet|armor|knife|dagger|hammer|chip|circuitry|rune|crown|anchor|rocket|hourglass|flame|quill|wand|staff|bomb|grenade|mask|amulet|necklace|compass|telescope|candle|torch|flag|banner)(-|$)/],
  ['all', 'All', null],
];
