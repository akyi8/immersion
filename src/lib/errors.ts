/**
 * What went wrong, in words fit to show. A failure from the disk arrives as plain text
 * and one from the app's own code as an Error, whose text would otherwise show with
 * "Error:" in front of it.
 */
export function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
