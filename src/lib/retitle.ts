import { errorText } from './errors.ts';
/**
 * "Rename" in a menu asks for the cursor in a page's title. The title's own action looks
 * for the request, so a request made before the page exists is served once it does.
 */
export const titleFocus = {
  ask: null as { id: string; at: number } | null,
  /**
   * Asks for the cursor in the title of the page with this id. Some pages have no title
   * to type over, such as a card or a book's title page, so `otherwise` runs when no
   * title has answered in a moment, and it opens the small form instead.
   */
  request(id: string, otherwise?: () => void) {
    const ask = { id, at: Date.now() };
    this.ask = ask;
    if (!otherwise) return;
    setTimeout(() => {
      if (this.ask !== ask) return;
      this.ask = null;
      otherwise();
    }, 900);
  },
};

/**
 * A page's title is renamed by typing over it (Cerys, November 15). The title looks like
 * a heading and wraps like one. A rename is taken on Enter or when the cursor leaves the
 * title, and Escape puts the old name back, so a stray key cannot rename a page: a rename
 * can move files and change every link to the page. "Rename" in a menu puts the cursor
 * here, through `titleFocus`.
 *
 * Every page's title uses this one action, whether it is drawn as a heading or as a
 * field, so the three keys mean the same thing on every page.
 */
export interface Retitle {
  /** The page's id, which a menu's Rename asks for. */
  id: string;
  name: string;
  /** Renames the page. Returns a problem to show, or null. Without it the title only shows. */
  rename?: ((name: string) => Promise<string | null>) | null;
  /** Called with a problem, or with '' when a rename went through. */
  problem?: (text: string) => void;
}

export function retitle(node: HTMLElement, given: Retitle) {
  let now = given;
  let busy = false;
  const field = node instanceof HTMLInputElement ? node : null;
  const read = () => (field ? field.value : (node.textContent ?? ''));
  const write = (text: string) => (field ? (field.value = text) : (node.textContent = text));

  const show = () => {
    if (document.activeElement !== node || !now.rename) write(now.name);
    if (field) {
      field.readOnly = !now.rename;
      field.spellcheck = false;
      return;
    }
    if (now.rename) {
      node.setAttribute('contenteditable', 'plaintext-only');
      node.setAttribute('role', 'textbox');
      node.setAttribute('aria-label', 'The name. Type over it to rename.');
      node.spellcheck = false;
      node.classList.add('retitle');
    } else {
      node.removeAttribute('contenteditable');
      node.removeAttribute('role');
      node.removeAttribute('aria-label');
      node.classList.remove('retitle');
    }
  };

  const serve = () => {
    const ask = titleFocus.ask;
    if (!ask || ask.id !== now.id || !now.rename || Date.now() - ask.at > 4000) return;
    titleFocus.ask = null;
    node.focus();
    if (field) return void field.select();
    const range = document.createRange();
    range.selectNodeContents(node);
    const sel = getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  };

  async function commit() {
    const next = read().replace(/\s+/g, ' ').trim();
    if (!now.rename || busy || !next || next === now.name) {
      if (!busy) write(now.name);
      return;
    }
    busy = true;
    const problem = await now.rename(next).catch((e) => errorText(e));
    busy = false;
    now.problem?.(problem ?? '');
    if (problem) write(now.name);
  }

  function keydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      e.preventDefault();
      node.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      write(now.name);
      node.blur();
    }
  }
  const blur = () => void commit();

  node.addEventListener('keydown', keydown);
  node.addEventListener('blur', blur);
  show();
  // A request made before the page existed is served once it does.
  const waiting = setInterval(serve, 120);

  return {
    update(next: Retitle) {
      now = next;
      show();
    },
    destroy() {
      clearInterval(waiting);
      node.removeEventListener('keydown', keydown);
      node.removeEventListener('blur', blur);
    },
  };
}
