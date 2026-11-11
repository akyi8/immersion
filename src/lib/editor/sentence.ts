/**
 * The sentence around a place in a paragraph. While the writer types, the sentence being
 * written stays at full strength and the rest of its paragraph steps back a little
 * (Mike, November 11).
 *
 * A sentence ends at a period, a question mark, an exclamation mark, or an ellipsis,
 * with any closing quote or bracket after it, followed by a space. A place just past the
 * last sentence of a paragraph, with nothing written after it yet, still belongs to that
 * sentence, so the text does not fall back the moment its period is typed.
 */
export function sentenceAt(text: string, offset: number): { from: number; to: number } {
  const starts = [0];
  const end = /[.!?…]+["'”’)\]*_]*\s+/g;
  let m: RegExpExecArray | null;
  while ((m = end.exec(text))) starts.push(m.index + m[0].length);
  let i = starts.length - 1;
  while (i > 0 && starts[i] > offset) i--;
  if (i > 0 && text.slice(starts[i]).trim() === '') i--;
  return { from: starts[i], to: i + 1 < starts.length ? starts[i + 1] : text.length };
}
