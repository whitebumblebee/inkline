import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language'
import { imageVersion, isRemoteSource, requestImage, resolvedImage } from './image-store'
import { refreshLivePreview } from './live-preview'
import { selectionTouchesRange } from './live-preview-ranges'
import { followLink } from './links'
import { isReading, readingChanged } from './reading-mode'
import { conflictRanges, overlapsConflict } from './merge-conflicts'

/**
 * Raw HTML blocks in Markdown files, such as a README's centred logo
 * (`<p align="center"><img src="logo.png"></p>`), drawn as HTML. Like tables,
 * a block shows its source while the caret is in it.
 *
 * The HTML is rebuilt from an allowlist rather than inserted as written: the
 * webview's content policy already stops scripts, but a `<style>` tag could
 * restyle the whole editor and a `<base>` tag would change every relative link.
 * Parsing uses an inert `<template>`, so nothing in it loads or runs.
 */

const ALLOWED_TAGS = new Set([
  'a', 'abbr', 'b', 'blockquote', 'br', 'center', 'code', 'dd', 'del', 'details', 'div', 'dl', 'dt', 'em',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'hr', 'i', 'img', 'ins', 'kbd', 'li', 'mark', 'ol', 'p',
  'pre', 's', 'samp', 'small', 'span', 'strike', 'strong', 'sub', 'summary', 'sup', 'table',
  'tbody', 'td', 'tfoot', 'th', 'thead', 'tr', 'u', 'ul', 'var',
])

/** Removed together with everything inside them; any other unknown tag keeps its text. */
const DROPPED_TAGS = new Set([
  'base', 'button', 'embed', 'form', 'frame', 'frameset', 'iframe', 'input', 'link', 'math', 'meta',
  'noscript', 'object', 'script', 'select', 'source', 'style', 'svg', 'template', 'textarea', 'title',
])

/** Presentational attributes GitHub keeps too. No `style`, no event handlers. */
const ALLOWED_ATTRIBUTES = new Set([
  'align', 'alt', 'colspan', 'height', 'open', 'rowspan', 'start', 'title', 'type', 'valign', 'width',
])

const SAFE_LINK = /^(?:https?:|mailto:|#|[^:]*$)/iu

/** What an `<img>` should show: the workspace file's webview URI, or nothing yet. */
function imageSource(source: string): string | null {
  if (!source || isRemoteSource(source)) return null
  const uri = resolvedImage(source)
  if (!uri) requestImage(source)
  return uri ?? null
}

function copyElement(source: Element, into: Node): void {
  const tag = source.tagName.toLowerCase()
  if (DROPPED_TAGS.has(tag)) return
  if (!ALLOWED_TAGS.has(tag)) {
    copyChildren(source, into)
    return
  }
  const element = document.createElement(tag)
  for (const attribute of Array.from(source.attributes)) {
    const name = attribute.name.toLowerCase()
    if (ALLOWED_ATTRIBUTES.has(name)) element.setAttribute(name, attribute.value)
  }
  if (tag === 'img') {
    const uri = imageSource(source.getAttribute('src') ?? '')
    // Remote images are never fetched, and a local one may still be resolving:
    // show the alt text in its place.
    if (!uri) {
      const placeholder = document.createElement('span')
      placeholder.className = 'inkline-html-image-missing'
      placeholder.textContent = source.getAttribute('alt') || 'image'
      into.appendChild(placeholder)
      return
    }
    element.setAttribute('src', uri)
  }
  if (tag === 'a') {
    // A link is followed with ⌘/Ctrl-click like other links, never by the webview itself.
    const href = source.getAttribute('href') ?? ''
    if (SAFE_LINK.test(href.trim())) {
      element.dataset.url = href.trim()
      element.title = href.trim()
    }
  }
  into.appendChild(element)
  copyChildren(source, element)
}

const ELEMENT_NODE = 1
const TEXT_NODE = 3

function copyChildren(source: Node, into: Node): void {
  for (const child of Array.from(source.childNodes)) {
    if (child.nodeType === TEXT_NODE) into.appendChild(document.createTextNode(child.textContent ?? ''))
    else if (child.nodeType === ELEMENT_NODE) copyElement(child as Element, into)
  }
}

/** The allowed part of some HTML, as live elements. */
export function sanitizeHtml(html: string): DocumentFragment {
  const template = document.createElement('template')
  template.innerHTML = html
  const fragment = document.createDocumentFragment()
  copyChildren(template.content, fragment)
  return fragment
}

/** Dropped tags that never have content or a closing tag. */
const VOID_DROPPED = ['base', 'embed', 'frame', 'input', 'link', 'meta', 'source']
const DROPPED_VOID = new RegExp(`<(?:${VOID_DROPPED.join('|')})\\b[^>]*>`, 'giu')
const DROPPED_WITH_CONTENT = new RegExp(
  `<(${[...DROPPED_TAGS].filter((tag) => !VOID_DROPPED.includes(tag)).join('|')})\\b[\\s\\S]*?(?:</\\1\\s*>|$)`,
  'giu',
)

/**
 * Whether HTML would show anything once sanitised. A lone wrapper such as
 * `<div align="center">` does not, and neither does a `<script>` block - those
 * stay as source, so nothing in the file becomes invisible.
 */
export function hasVisibleContent(html: string): boolean {
  const kept = html.replace(/<!--[\s\S]*?-->/gu, '').replace(DROPPED_VOID, '').replace(DROPPED_WITH_CONTENT, '')
  if (/<(?:img|hr|br)\b/iu.test(kept)) return true
  return kept.replace(/<[^>]*>/gu, '').trim() !== ''
}

class HtmlBlockWidget extends WidgetType {
  constructor(readonly html: string, readonly from: number, readonly images: number) {
    super()
  }

  eq(other: HtmlBlockWidget): boolean {
    return this.html === other.html && this.images === other.images
  }

  toDOM(view: EditorView): HTMLElement {
    const node = document.createElement('div')
    node.className = 'inkline-html-block'
    node.appendChild(sanitizeHtml(this.html))
    // A <details> block is drawn open: its content is what you are editing, and
    // a click opens the source (or, while reading, selects text) rather than
    // folding it away.
    for (const details of Array.from(node.querySelectorAll('details'))) details.open = true
    node.addEventListener('click', (event) => event.preventDefault())
    node.addEventListener('mousedown', (event) => {
      const reading = isReading(view.state)
      const link = (event.target as HTMLElement).closest<HTMLElement>('[data-url]')
      // Links open with ⌘/Ctrl-click while editing, and with a plain click while reading.
      if (link?.dataset.url && (reading || event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        followLink(view, link.dataset.url)
        return
      }
      // While reading, a click is left to the browser, so text can be selected.
      if (reading) return
      event.preventDefault()
      view.dispatch({ selection: { anchor: Math.min(this.from, view.state.doc.length) } })
      view.focus()
    })
    return node
  }

  ignoreEvent(): boolean {
    return true
  }
}

interface HtmlBlock {
  from: number
  to: number
  html: string
}

function findHtmlBlocks(state: EditorState): HtmlBlock[] {
  const blocks: HtmlBlock[] = []
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'HTMLBlock') return undefined
      // Only blocks of their own: one inside a list or quote would take its markers with it.
      if (node.node.parent?.name !== 'Document') return false
      const html = state.doc.sliceString(node.from, node.to)
      if (hasVisibleContent(html)) blocks.push({ from: node.from, to: node.to, html })
      return false
    },
  })
  return blocks
}

function decorate(state: EditorState, blocks: HtmlBlock[]): DecorationSet {
  const ranges: Range<Decoration>[] = []
  const conflicts = conflictRanges(state)
  const images = imageVersion()
  for (const block of blocks) {
    if (selectionTouchesRange(state, block.from, block.to) || overlapsConflict(conflicts, block.from, block.to)) continue
    const from = state.doc.lineAt(block.from).from
    const to = state.doc.lineAt(block.to).to
    ranges.push(Decoration.replace({ widget: new HtmlBlockWidget(block.html, block.from, images), block: true }).range(from, to))
  }
  return Decoration.set(ranges, true)
}

interface HtmlState {
  blocks: HtmlBlock[]
  decorations: DecorationSet
}

/**
 * The blocks are found when the document or its syntax tree changes; moving the
 * caret, or an image resolving, only redraws. The HTML itself is parsed when a
 * block is drawn, so blocks off screen cost nothing but their source text.
 */
const htmlField = StateField.define<HtmlState>({
  create(state) {
    const blocks = findHtmlBlocks(state)
    return { blocks, decorations: decorate(state, blocks) }
  },
  update(value, transaction) {
    if (transaction.docChanged || syntaxTree(transaction.startState) !== syntaxTree(transaction.state)) {
      const blocks = findHtmlBlocks(transaction.state)
      return { blocks, decorations: decorate(transaction.state, blocks) }
    }
    const refreshed = transaction.effects.some((effect) => effect.is(refreshLivePreview)) || readingChanged(transaction)
    if (!transaction.selection && !refreshed) return value
    return { blocks: value.blocks, decorations: decorate(transaction.state, value.blocks) }
  },
})

/**
 * Where the caret goes when a file opens. Normally the start, but a file that
 * opens with a block drawn as something else - a README's HTML logo, a table -
 * would then show that block as source, since the caret is in it. The caret
 * starts on the line after such a block instead.
 */
export function openingCaret(state: EditorState): number {
  // The top of the file must be parsed for this; it nearly always already is.
  const tree = ensureSyntaxTree(state, Math.min(state.doc.length, 10000), 50) ?? syntaxTree(state)
  const first = tree.topNode.firstChild
  if (!first || first.from !== 0) return 0
  const drawn = first.name === 'Table'
    || (first.name === 'HTMLBlock' && hasVisibleContent(state.doc.sliceString(first.from, first.to)))
  if (!drawn) return 0
  const line = state.doc.lineAt(first.to)
  return line.number < state.doc.lines ? state.doc.line(line.number + 1).from : 0
}

export const htmlPreview: Extension = [
  htmlField,
  EditorView.decorations.from(htmlField, (value) => value.decorations),
]
