import DOMPurify from 'dompurify';
import { marked } from 'marked';

/** A rule's markdown as HTML for the book's reading view (Mike, November 9). */
export function renderRule(markdown: string): string {
  return DOMPurify.sanitize(marked.parse(markdown, { async: false, gfm: true }) as string);
}
