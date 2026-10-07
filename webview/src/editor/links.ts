import type { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { postMessage } from '../protocol'

/**
 * The anchor GitHub gives a heading: lower case, punctuation removed, spaces
 * turned into hyphens. `8. Known limitations (read first)` becomes
 * `8-known-limitations-read-first`.
 */
export function slugify(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc} -]/gu, '')
    .replace(/ /gu, '-')
}

/** A heading's text as it reads, without its Markdown. */
function headingText(source: string): string {
  return source
    .replace(/^#{1,6}[ \t]+/u, '')
    .replace(/[ \t]+#+[ \t]*$/u, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/gu, '$1')
    .replace(/<[^>]+>/gu, '')
    .replace(/(\*\*|__|\*|~~|==|`)/gu, '')
}

/** Every heading's anchor and position. A repeated anchor gets `-1`, `-2`… as on GitHub. */
export function headingAnchors(state: EditorState): { slug: string; from: number }[] {
  const anchors: { slug: string; from: number }[] = []
  const seen = new Map<string, number>()
  // Long files are parsed in the background, so the end may not be parsed yet;
  // a link to a heading down there must still find it.
  const tree = ensureSyntaxTree(state, state.doc.length, 500) ?? syntaxTree(state)
  tree.iterate({
    enter(node) {
      const atx = node.name.startsWith('ATXHeading')
      if (!atx && !node.name.startsWith('SetextHeading')) return undefined
      // A Setext heading's text is everything above its underline.
      const source = atx
        ? state.doc.lineAt(node.from).text
        : state.doc.sliceString(node.from, state.doc.lineAt(node.to).from).trim()
      const base = slugify(headingText(source))
      const count = seen.get(base) ?? 0
      seen.set(base, count + 1)
      anchors.push({ slug: count === 0 ? base : `${base}-${count}`, from: node.from })
      return false
    },
  })
  return anchors
}

/**
 * The destination of the Markdown link that covers `offset` in a line, if any.
 * A link's title (`[a](url "Title")`) and angle brackets are not part of it.
 */
export function linkAt(line: string, offset: number): string | null {
  for (const match of line.matchAll(/\[[^\]\n]*\]\(([^)\n]+)\)/gu)) {
    const start = match.index ?? 0
    if (offset < start || offset > start + match[0].length) continue
    const destination = match[1].trim().replace(/\s+(?:"[^"]*"|'[^']*')$/u, '')
    return destination.replace(/^<(.*)>$/u, '$1')
  }
  return null
}

function decode(fragment: string): string {
  try {
    return decodeURIComponent(fragment)
  } catch {
    return fragment
  }
}

/**
 * Follows a link clicked in the editor. `#heading` links jump within the file;
 * everything else - other files, web pages - is opened by VS Code.
 */
export function followLink(view: EditorView, url: string): void {
  const target = url.trim()
  if (!target.startsWith('#')) {
    postMessage({ type: 'openLink', url: target })
    return
  }
  const wanted = decode(target.slice(1)).toLowerCase()
  const heading = headingAnchors(view.state).find((anchor) => anchor.slug === wanted)
  if (!heading) return
  view.dispatch({ selection: { anchor: heading.from }, effects: EditorView.scrollIntoView(heading.from, { y: 'start', yMargin: 24 }) })
}
