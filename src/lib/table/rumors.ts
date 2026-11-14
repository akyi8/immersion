/**
 * Rumors (Mike, November 14). A rumor is a paragraph a player suspects and the game
 * master knows the answer to. It is written as a callout, the way narrator-only text is:
 *
 *     > [!rumor]
 *     > The bear at Imber has a man's eyes.
 *
 * A rumor that has been settled says so on its first line: `> [!rumor] confirmed` or
 * `> [!rumor] false`. Text with no tag is known to everyone, and `> [!narrator]` text is
 * the game master's secret.
 */
export type Standing = 'open' | 'confirmed' | 'false';

export interface Rumor {
  text: string;
  standing: Standing;
  /** The line of the file the rumor's tag is on, counted from 0. */
  line: number;
}

const TAG = /^\s*>\s*\[!rumor\][-+]?[ \t]*(.*)$/i;

export function standingOf(word: string): Standing {
  const w = word.trim().toLowerCase();
  if (/^(confirmed|true|proven)\b/.test(w)) return 'confirmed';
  if (/^(false|busted|untrue|disproven)\b/.test(w)) return 'false';
  return 'open';
}

/** Every rumor in a file, in the order written. */
export function rumorsIn(source: string): Rumor[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const out: Rumor[] = [];
  for (let n = 0; n < lines.length; n++) {
    const tag = TAG.exec(lines[n]);
    if (!tag) continue;
    const standing = standingOf(tag[1]);
    // Anything after the tag that is not a standing is the start of the rumor itself.
    const first = standing === 'open' ? tag[1].trim() : '';
    const body: string[] = first ? [first] : [];
    let end = n;
    while (end + 1 < lines.length && /^\s*>/.test(lines[end + 1]) && !/^\s*>\s*\[!\w+\]/.test(lines[end + 1])) {
      end++;
      body.push(lines[end].replace(/^\s*>\s?/, ''));
    }
    const text = body.join(' ').replace(/\s+/g, ' ').trim();
    if (text) out.push({ text, standing, line: n });
    n = end;
  }
  return out;
}

/** The file with the rumor on `line` marked as standing some way. Null when no rumor is there. */
export function setStanding(source: string, line: number, standing: Standing): string | null {
  const lines = source.split('\n');
  const tag = lines[line] === undefined ? null : TAG.exec(lines[line]);
  if (!tag) return null;
  const was = standingOf(tag[1]);
  const rest = was === 'open' ? tag[1].trim() : '';
  const head = /^(\s*>\s*\[!rumor\][-+]?)/i.exec(lines[line])![1];
  lines[line] = `${head}${standing === 'open' ? '' : ` ${standing}`}`;
  // Text that shared the tag's line moves to a line of its own, so the standing is not read as part of it.
  if (rest) lines.splice(line + 1, 0, `> ${rest}`);
  return lines.join('\n');
}
