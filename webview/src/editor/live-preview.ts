import { RangeSetBuilder, StateEffect, type EditorState, type Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import katex from 'katex'
import { postMessage } from '../protocol'
import { findMathRanges } from './math-ranges'
import {
  findCodeRanges,
  findFrontmatter,
  findLivePreviewItems,
  insideCodeRange,
  selectionTouchesRange,
  type CodeRange,
  type LivePreviewItem,
} from './live-preview-ranges'
import { requestImage, resolvedImage } from './image-store'
import { isDelimiterRow } from './table-preview'

interface PreviewItem {
  from: number
  to: number
  decoration: Decoration
}

class LinkIconWidget extends WidgetType {
  constructor(readonly url: string) {
    super()
  }

  eq(other: LinkIconWidget): boolean {
    return this.url === other.url
  }

  toDOM(): HTMLElement {
    const node = document.createElement('span')
    node.className = 'inkline-live-link-icon'
    node.textContent = '↗'
    node.setAttribute('aria-hidden', 'true')
    node.setAttribute('data-url', this.url)
    node.setAttribute('title', this.url)
    node.addEventListener('click', () => {
      postMessage({ type: 'openLink', url: this.url })
    })
    return node
  }

  ignoreEvent(): boolean {
    return true
  }
}

class ImagePreviewWidget extends WidgetType {
  constructor(readonly uri: string, readonly alt: string) {
    super()
  }

  eq(other: ImagePreviewWidget): boolean {
    return this.uri === other.uri && this.alt === other.alt
  }

  toDOM(): HTMLElement {
    const node = document.createElement('span')
    node.className = 'inkline-image-preview'
    const image = document.createElement('img')
    image.src = this.uri
    image.alt = this.alt
    image.decoding = 'async'
    node.appendChild(image)
    return node
  }

  ignoreEvent(): boolean {
    return true
  }
}

function mark(from: number, to: number, className: string, attributes?: Record<string, string>): PreviewItem {
  return {
    from,
    to,
    decoration: Decoration.mark({ class: className, attributes }),
  }
}

function hide(from: number, to: number): PreviewItem {
  return { from, to, decoration: Decoration.mark({ class: 'inkline-hidden-syntax' }) }
}

class MathPreviewWidget extends WidgetType {
  constructor(readonly latex: string, readonly block: boolean) {
    super()
  }

  eq(other: MathPreviewWidget): boolean {
    return this.latex === other.latex && this.block === other.block
  }

  toDOM(): HTMLElement {
    const node = document.createElement('span')
    node.className = 'inkline-math-preview-widget'
    node.setAttribute('aria-hidden', 'true')
    try {
      katex.render(this.latex, node, { displayMode: this.block, throwOnError: false, output: 'html' })
    } catch {
      node.textContent = this.latex
    }
    return node
  }

  ignoreEvent(): boolean {
    return true
  }
}

const spaceAboveDecoration = Decoration.line({ class: 'inkline-space-above' })
const spaceBelowDecoration = Decoration.line({ class: 'inkline-space-below' })

/**
 * CodeMirror measures line heights from their border boxes, so margins on a
 * `.cm-line` are invisible to the height map and every line below them ends up
 * drawn lower than CodeMirror believes it is - which makes clicks land on the
 * wrong line. Card-style blocks therefore get their outer gap as padding on the
 * neighbouring lines instead of as a margin on the block itself.
 */
function addBlockSpacing(items: PreviewItem[], state: EditorState, firstLineNumber: number, lastLineNumber: number): void {
  if (firstLineNumber > 1) {
    const before = state.doc.line(firstLineNumber - 1)
    items.push({ from: before.from, to: before.from, decoration: spaceBelowDecoration })
  }
  if (lastLineNumber < state.doc.lines) {
    const after = state.doc.line(lastLineNumber + 1)
    items.push({ from: after.from, to: after.from, decoration: spaceAboveDecoration })
  }
}

export interface ScanScope {
  from: number
  to: number
}

const SCOPE_MARGIN = 2000

function resolveScope(state: EditorState, scope?: ScanScope): ScanScope {
  const length = state.doc.length
  if (!scope) return { from: 0, to: length }
  const from = state.doc.lineAt(Math.max(0, Math.min(scope.from - SCOPE_MARGIN, length))).from
  const to = state.doc.lineAt(Math.max(0, Math.min(scope.to + SCOPE_MARGIN, length))).to
  return { from, to }
}

function addCodeFenceMarks(items: PreviewItem[], state: EditorState, item: Extract<LivePreviewItem, { type: 'codeblock' }>): void {
  const firstLine = state.doc.line(item.firstLineNumber)
  const lastLine = state.doc.line(item.lastLineNumber)
  const firstMatch = firstLine.text.match(/^(\s*)(`{3,}|~{3,})(.*)$/u)
  const lastMatch = lastLine.text.match(/^(\s*)(`{3,}|~{3,})\s*$/u)

  if (firstMatch) {
    const markerStart = firstLine.from + firstMatch[1].length
    const markerEnd = markerStart + firstMatch[2].length
    if (item.firstLineActive) items.push(mark(markerStart, markerEnd, 'inkline-codeblock-fence'))
    else items.push(hide(markerStart, markerEnd))
    if (firstMatch[3].trim()) {
      if (item.firstLineActive) items.push(mark(markerEnd, firstLine.to, 'inkline-codeblock-info'))
      else items.push(hide(markerEnd, firstLine.to))
    }
  }
  if (lastMatch && item.lastLineNumber > item.firstLineNumber) {
    const markerStart = lastLine.from + lastMatch[1].length
    if (item.lastLineActive) items.push(mark(markerStart, lastLine.to, 'inkline-codeblock-fence'))
    else items.push(hide(markerStart, lastLine.to))
  }
}

function itemStart(item: LivePreviewItem): number {
  if ('from' in item) return item.from
  if ('lineFrom' in item) return item.lineFrom
  if ('firstLineFrom' in item) return item.firstLineFrom
  if ('openFrom' in item) return item.openFrom
  return Number.MAX_SAFE_INTEGER
}

function addItemDecorations(items: PreviewItem[], state: EditorState, item: LivePreviewItem): void {
  switch (item.type) {
    case 'heading':
      items.push({
        from: item.lineFrom,
        to: item.lineFrom,
        decoration: Decoration.line({ class: `inkline-heading-line inkline-h${item.level}-line` }),
      })
      if (item.hidden && item.hideFrom < item.hideTo) items.push(hide(item.hideFrom, item.hideTo))
      else if (item.hideFrom < item.hideTo) items.push(mark(item.hideFrom, item.hideTo, 'inkline-heading-mark'))
      break
    case 'link':
      if (item.hidden) {
        items.push(hide(item.openFrom, item.openTo))
        items.push(mark(item.openTo, item.closeFrom, 'inkline-live-link', { title: item.url }))
        items.push({
          from: item.closeFrom,
          to: item.closeFrom,
          decoration: Decoration.widget({ widget: new LinkIconWidget(item.url), side: 1 }),
        })
        items.push(hide(item.closeFrom, item.to))
      }
      break
    case 'wikilink':
      if (item.hidden) items.push(mark(item.from, item.to, 'inkline-live-wikilink'))
      break
    case 'codeblock':
      addBlockSpacing(items, state, item.firstLineNumber, item.lastLineNumber)
      for (let lineNo = item.firstLineNumber; lineNo <= item.lastLineNumber; lineNo += 1) {
        const line = state.doc.line(lineNo)
        let className = 'inkline-codeblock-line'
        if (lineNo === item.firstLineNumber) className += ' inkline-codeblock-first'
        if (lineNo === item.lastLineNumber) className += ' inkline-codeblock-last'
        items.push({
          from: line.from,
          to: line.from,
          decoration: Decoration.line({
            class: className,
            attributes: lineNo === item.firstLineNumber
              ? { 'data-code-language': item.language || 'code' }
              : undefined,
          }),
        })
      }
      addCodeFenceMarks(items, state, item)
      break
    case 'bold':
    case 'italic':
    case 'strike':
      if (item.hidden) {
        items.push(hide(item.openFrom, item.openTo))
        items.push(hide(item.closeFrom, item.closeTo))
      }
      break
    case 'inline-code':
      if (item.hidden) {
        items.push(hide(item.openFrom, item.openTo))
        items.push(mark(item.contentFrom, item.contentTo, 'inkline-live-inline-code'))
        items.push(hide(item.closeFrom, item.closeTo))
      }
      break
    case 'task':
      if (item.hidden) items.push(mark(item.from, item.to, 'inkline-task-marker inkline-hidden-syntax'))
      break
    case 'callout':
      addBlockSpacing(items, state, state.doc.lineAt(item.firstLineFrom).number, item.lastLineNumber)
      items.push({
        from: item.firstLineFrom,
        to: item.firstLineFrom,
        decoration: Decoration.line({
          class: `inkline-callout-line inkline-callout-first inkline-callout-${item.calloutType}`,
        }),
      })
      if (item.hidden && item.markFrom < item.markTo) items.push(hide(item.markFrom, item.markTo))
      else if (item.markFrom < item.markTo) items.push(mark(item.markFrom, item.markTo, 'inkline-callout-marker'))
      break
    case 'blockquote':
      items.push({
        from: item.lineFrom,
        to: item.lineFrom,
        decoration: Decoration.line({ class: item.className || 'inkline-blockquote-line' }),
      })
      if (item.markFrom !== undefined && item.markTo !== undefined && item.markFrom < item.markTo) {
        if (item.hidden) items.push(hide(item.markFrom, item.markTo))
        else items.push(mark(item.markFrom, item.markTo, 'inkline-blockquote-mark'))
      }
      break
    case 'hr':
      items.push({
        from: item.from,
        to: item.from,
        decoration: Decoration.line({
          class: item.hidden ? 'inkline-horizontal-rule-line' : 'inkline-horizontal-rule-line inkline-rule-source',
        }),
      })
      if (item.hidden) items.push(hide(item.from, item.to))
      else items.push(mark(item.from, item.to, 'inkline-horizontal-rule'))
      break
    case 'image': {
      const uri = resolvedImage(item.source)
      if (!uri) {
        requestImage(item.source)
        items.push(mark(item.from, item.to, 'inkline-image-source'))
        break
      }
      if (item.hidden) {
        items.push(hide(item.from, item.to))
        items.push({
          from: item.to,
          to: item.to,
          decoration: Decoration.widget({ widget: new ImagePreviewWidget(uri, item.alt), side: 1 }),
        })
      } else {
        items.push(mark(item.from, item.to, 'inkline-image-source'))
      }
      break
    }
    case 'frontmatter':
      for (let lineNo = item.firstLineNumber; lineNo <= item.lastLineNumber; lineNo += 1) {
        const line = state.doc.line(lineNo)
        let className = 'inkline-frontmatter-line'
        if (lineNo === item.firstLineNumber) className += ' inkline-frontmatter-first'
        if (lineNo === item.lastLineNumber) className += ' inkline-frontmatter-last'
        items.push({ from: line.from, to: line.from, decoration: Decoration.line({ class: className }) })
      }
      break
  }
}

function isTableRow(state: EditorState, lineNo: number): boolean {
  if (lineNo < 1 || lineNo > state.doc.lines) return false
  const text = state.doc.line(lineNo).text
  if (!text.includes('|')) return false
  const next = lineNo < state.doc.lines ? state.doc.line(lineNo + 1).text : ''
  const previous = lineNo > 1 ? state.doc.line(lineNo - 1).text : ''
  const headerOfTable = isDelimiterRow(next)
  const bodyOfTable = /^\s*\|.*\|\s*$/u.test(text) && /^\s*\|.*\|\s*$/u.test(previous)
  return headerOfTable || bodyOfTable
}

function lineIsDelimiter(state: EditorState, lineNo: number): boolean {
  if (lineNo < 1 || lineNo > state.doc.lines) return false
  return isDelimiterRow(state.doc.line(lineNo).text)
}

function addTableDecorations(items: PreviewItem[], state: EditorState, scope: ScanScope, skipBefore: number): void {
  const firstLine = state.doc.lineAt(scope.from).number
  const lastLine = state.doc.lineAt(scope.to).number
  for (let lineNo = firstLine; lineNo <= lastLine; lineNo += 1) {
    if (!isTableRow(state, lineNo)) continue
    const line = state.doc.line(lineNo)
    if (line.from <= skipBefore) continue
    let className = 'inkline-table-line'
    if (lineIsDelimiter(state, lineNo)) className += ' inkline-table-delimiter'
    if (!isTableRow(state, lineNo - 1)) className += ' inkline-table-first'
    if (!isTableRow(state, lineNo + 1)) className += ' inkline-table-last'
    items.push({ from: line.from, to: line.from, decoration: Decoration.line({ class: className }) })
  }
}

function addPatternMarks(
  items: PreviewItem[],
  text: string,
  offset: number,
  pattern: RegExp,
  className: string,
  code: readonly CodeRange[],
): void {
  pattern.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = pattern.exec(text)) !== null) {
    const from = offset + match.index
    const to = from + match[0].length
    if (!insideCodeRange(code, from, to)) items.push(mark(from, to, className))
    if (match[0].length === 0) pattern.lastIndex += 1
  }
}

/**
 * Constructs the Markdown grammar does not model. They are matched on raw text,
 * so every match is checked against the code regions first - otherwise a `==`
 * or `[^1]` written inside a code block gets styled as markup.
 */
function addTextScanDecorations(
  items: PreviewItem[],
  state: EditorState,
  scope: ScanScope,
  code: readonly CodeRange[],
  skipBefore: number,
): void {
  const from = Math.max(scope.from, skipBefore + 1)
  const text = state.doc.sliceString(from, scope.to)
  const offset = from
  addPatternMarks(items, text, offset, /<!--([\s\S]*?)-->/gu, 'inkline-comment', code)
  addPatternMarks(items, text, offset, /%%([\s\S]*?)%%/gu, 'inkline-comment', code)
  addPatternMarks(items, text, offset, /\[\^[^\]\n]+\]/gu, 'inkline-footnote', code)
  addPatternMarks(items, text, offset, /^\s*\[\^[^\]\n]+\]:.*$/gmu, 'inkline-footnote-definition', code)
  addPatternMarks(items, text, offset, /==([^=\n]+)==/gu, 'inkline-highlight', code)
}

function buildDecorations(state: EditorState, scope?: ScanScope): DecorationSet {
  const items: PreviewItem[] = []
  const scan = resolveScope(state, scope)
  const code = findCodeRanges(state, scan)
  const frontmatter = findFrontmatter(state)
  for (const item of findLivePreviewItems(state, scan)) {
    if (frontmatter && itemStart(item) <= frontmatter.to) continue
    addItemDecorations(items, state, item)
  }
  if (frontmatter && frontmatter.to >= scan.from && frontmatter.from <= scan.to) {
    addItemDecorations(items, state, frontmatter)
  }
  addTableDecorations(items, state, scan, frontmatter?.to ?? -1)
  addTextScanDecorations(items, state, scan, code, frontmatter?.to ?? -1)
  for (const found of findMathRanges(state.doc.sliceString(scan.from, scan.to))) {
    const range = { ...found, from: found.from + scan.from, to: found.to + scan.from }
    if (!range.latex) continue
    if (insideCodeRange(code, range.from, range.to)) continue
    const active = selectionTouchesRange(state, range.from, range.to)
    items.push(mark(
      range.from,
      range.to,
      active
        ? range.block ? 'inkline-math-source inkline-math-block-source' : 'inkline-math-source'
        : range.block ? 'inkline-math-preview-source inkline-math-block-source' : 'inkline-math-preview-source',
    ))
    if (!active) {
      items.push({
        from: range.from,
        to: range.from,
        decoration: Decoration.widget({ widget: new MathPreviewWidget(range.latex, range.block), side: -1 }),
      })
    }
  }

  const ranges: Range<Decoration>[] = items
    .sort((a, b) => a.from - b.from || a.to - b.to)
    .map((item) => ({ from: item.from, to: item.to, value: item.decoration }))
  const builder = new RangeSetBuilder<Decoration>()
  for (const range of ranges) builder.add(range.from, range.to, range.value)
  return builder.finish()
}

export function buildLivePreviewDecorations(view: { state: EditorState; viewport?: ScanScope }): DecorationSet {
  return buildDecorations(view.state, view.viewport)
}

/** Forces a decoration rebuild when something outside the document changes. */
export const refreshLivePreview = StateEffect.define<null>()

const livePreviewPlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    mouseDown = false
    /** A selection change was swallowed while dragging and still needs applying. */
    staleSelection = false
    pendingRebuild = false
    pendingSelectionRaf: number | null = null
    view: EditorView

    constructor(view: EditorView) {
      this.view = view
      this.decorations = buildDecorations(view.state, view.viewport)
      this.onMouseDown = this.onMouseDown.bind(this)
      this.onMouseUp = this.onMouseUp.bind(this)
      view.dom.addEventListener('mousedown', this.onMouseDown, true)
      window.addEventListener('mouseup', this.onMouseUp, true)
    }

    onMouseDown(): void {
      this.mouseDown = true
      if (this.pendingSelectionRaf !== null) {
        cancelAnimationFrame(this.pendingSelectionRaf)
        this.pendingSelectionRaf = null
      }
    }

    onMouseUp(): void {
      if (!this.mouseDown) return
      this.mouseDown = false
      if (!this.staleSelection) return
      if (this.pendingSelectionRaf !== null) cancelAnimationFrame(this.pendingSelectionRaf)
      this.pendingSelectionRaf = requestAnimationFrame(() => {
        this.pendingSelectionRaf = null
        this.pendingRebuild = true
        this.view.dispatch({ effects: refreshLivePreview.of(null) })
      })
    }

    update(update: ViewUpdate): void {
      // Concealed syntax is revealed around the selection, so rebuilding while a
      // drag is in flight would reflow text out from under the pointer. Hold the
      // selection-driven rebuild until mouseup; document and viewport changes
      // still rebuild immediately, because those lines would otherwise render
      // with no decorations at all.
      const refreshed = update.transactions.some((tr) => tr.effects.some((effect) => effect.is(refreshLivePreview)))
      const rebuild = this.pendingRebuild || refreshed || update.docChanged || update.viewportChanged
        || (update.selectionSet && !this.mouseDown)
      if (update.selectionSet && this.mouseDown) this.staleSelection = true
      if (!rebuild) return
      this.pendingRebuild = false
      if (!this.mouseDown) this.staleSelection = false
      this.decorations = buildDecorations(update.state, update.view.viewport)
    }

    destroy(): void {
      if (this.pendingSelectionRaf !== null) cancelAnimationFrame(this.pendingSelectionRaf)
      this.view.dom.removeEventListener('mousedown', this.onMouseDown, true)
      window.removeEventListener('mouseup', this.onMouseUp, true)
    }
  },
  { decorations: (value) => value.decorations },
)

export const livePreview = [livePreviewPlugin]
