/**
 * A page whose file went away outside the app (Cerys, November 22). A sync can bring in
 * another computer's archive or rename of a file that is open here, and another program
 * can move it. The page then closes on its own and the app says why, because a page left
 * open would put the file back at its old place on the next keystroke, as a duplicate.
 *
 * A page that holds typing not yet saved does not close. Its words are saved at the old
 * place, since keeping the writer's words comes before keeping the folders tidy.
 */
class Gone {
  /** What to tell the writer, shown for a few seconds by the app's shell. */
  notice = $state('');
  private closer: ((path: string) => boolean) | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  /** The shell says how a page is closed. It returns false when no open page shows the file. */
  onClose(closer: (path: string) => boolean): () => void {
    this.closer = closer;
    return () => {
      if (this.closer === closer) this.closer = null;
    };
  }

  /** Closes the page showing this file. Returns whether a page was closed. */
  announce(path: string, name: string): boolean {
    if (!this.closer?.(path)) return false;
    this.notice = `“${name}” closed, because its file was moved or archived outside this window.`;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => (this.notice = ''), 9000);
    return true;
  }

  dismiss() {
    this.notice = '';
  }
}

export const gone = new Gone();
