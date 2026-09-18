/**
 * The span that actually differs between two revisions, as offsets into
 * `previous`. Replacing only this span keeps undo history and cursor positions
 * meaningful: a whole-document replace maps every position to the start of the
 * file and turns one keystroke into an edit the size of the note.
 */
export function diffRange(previous: string, next: string): { from: number; to: number; insert: string } {
  const max = Math.min(previous.length, next.length)
  let prefix = 0
  while (prefix < max && previous.charCodeAt(prefix) === next.charCodeAt(prefix)) prefix += 1
  let suffix = 0
  while (
    suffix < max - prefix &&
    previous.charCodeAt(previous.length - 1 - suffix) === next.charCodeAt(next.length - 1 - suffix)
  ) suffix += 1
  return {
    from: prefix,
    to: previous.length - suffix,
    insert: next.slice(prefix, next.length - suffix),
  }
}
