/**
 * Reads one wiki file into what the index needs: its name, aliases, header fields,
 * and the body to display. It accepts both ways an entry can record aliases: a YAML
 * header (`aliases: [...]`) and a bold line (`**Aliases:** a, b`).
 *
 * This module has no imports so its tests can run under plain Node. The YAML header
 * is parsed by the caller and passed in.
 */

export interface ParsedEntry {
  name: string;
  aliases: string[];
  /** The body with the title heading and the aliases line removed. */
  body: string;
  /** The first ordinary paragraph, as plain text, for previews. */
  summary: string;
}

const ALIASES_LINE = /^\s*\*\*\s*aliases\s*:?\s*\*\*\s*:?\s*(.+)$/im;

function list(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split(',');
  return [];
}

/** Turns a file name like "jonah-vale.md" into "Jonah Vale". */
export function nameFromFile(fileName: string): string {
  return fileName
    .replace(/\.md$/i, '')
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/** Strips markdown down to readable plain text for previews. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]]+)\]\]/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function parseEntry(header: Record<string, unknown>, body: string, fileName: string): ParsedEntry {
  const lines = body.split(/\r?\n/);

  // The title is the header's name, else the first top-level heading, else the file name.
  const headingIndex = lines.findIndex((l) => /^#\s+\S/.test(l));
  const heading = headingIndex >= 0 ? lines[headingIndex].replace(/^#\s+/, '').trim() : '';
  const name =
    (typeof header.name === 'string' && header.name.trim()) ||
    (typeof header.title === 'string' && header.title.trim()) ||
    heading ||
    nameFromFile(fileName);

  const aliases = new Set<string>();
  for (const a of list(header.aliases)) if (a.trim()) aliases.add(a.trim());
  const aliasLine = ALIASES_LINE.exec(body);
  if (aliasLine) for (const a of aliasLine[1].split(',')) if (a.trim()) aliases.add(a.trim());
  aliases.delete(name);

  // Display body: drop every top-level heading that repeats the title, and the aliases line.
  const kept = lines.filter((l) => {
    if (/^#\s+/.test(l) && l.replace(/^#\s+/, '').trim() === name) return false;
    if (ALIASES_LINE.test(l)) return false;
    return true;
  });
  const display = kept.join('\n').replace(/^\s*(---\s*\n\s*)+/, '').trim();

  // Summary: the first paragraph that is prose, not a heading, rule, field line, or quote.
  let summary = '';
  for (const block of display.split(/\n\s*\n/)) {
    const prose = block
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l && !/^(#|---|\*\*\*|>|\||!\[|\[media)/.test(l) && !/^\*\*[^*]+:?\*\*:?\s/.test(l));
    summary = plainText(prose.join(' '));
    if (summary) break;
  }
  if (summary.length > 320) summary = summary.slice(0, 317).replace(/\s+\S*$/, '') + '…';

  return { name, aliases: [...aliases], body: display, summary };
}
