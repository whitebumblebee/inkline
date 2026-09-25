import { StateEffect, type EditorState, type Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, ViewPlugin, type ViewUpdate, WidgetType } from '@codemirror/view'
import { postMessage } from '../protocol'
import { findMathRanges } from './math-ranges'
import { MathPreviewWidget, ownsLines } from './math-preview'
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

const hiddenSyntax = Decoration.mark({ class: 'inkline-hidden-syntax' })

function hide(from: number, to: number): PreviewItem {
  return { from, to, decoration: hiddenSyntax }
}

/** Holds a line open when everything on it is concealed. */
class LineStrutWidget extends WidgetType {
  eq(): boolean {
    return true
  }

  toDOM(): HTMLElement {
    const node = document.createElement('span')
    node.className = 'inkline-line-strut'
    return node
  }

  ignoreEvent(): boolean {
    return false
  }
}

const lineStrut = new LineStrutWidget()

/**
 * A line made up entirely of concealed syntax (a code fence, a `>` spacer in a
 * quote, a thematic break) has no visible piece for CodeMirror to map a click
 * onto, and CodeMirror 6.43 throws when a line offers none. Such lines are
 * replaced whole by an empty strut, which also keeps their height.
 */
function strutConcealedLines(items: PreviewItem[], state: EditorState): PreviewItem[] {
  const hiddenByLine = new Map<number, PreviewItem[]>()
  for (const item of items) {
    if (item.decoration !== hiddenSyntax) continue
    const line = state.doc.lineAt(item.from).number
    if (state.doc.lineAt(item.to).number !== line) continue
    hiddenByLine.set(line, [...(hiddenByLine.get(line) ?? []), item])
  }
  const replaced = new Set<PreviewItem>()
  const struts: PreviewItem[] = []
  for (const [lineNumber, hidden] of hiddenByLine) {
    const line = state.doc.line(lineNumber)
    let covered = line.from
    for (const item of [...hidden].sort((a, b) => a.from - b.from)) {
      if (item.from > covered) break
      covered = Math.max(covered, item.to)
    }
    if (covered < line.to || line.from === line.to) continue
    for (const item of hidden) replaced.add(item)
    struts.push(replaceWith(line.from, line.to, lineStrut))
  }
  return replaced.size ? [...items.filter((item) => !replaced.has(item)), ...struts] : items
}

/**
 * Swaps source for a widget that stands in for it (a checkbox for `- [x]`, the
 * rendered formula for `$…$`). A replacement rather than a widget next to
 * hidden text: CodeMirror maps a click through the rectangles of a line's
 * pieces and skips zero-length widgets, so a line holding only a widget beside
 * hidden text has nothing it can hit - and CodeMirror 6.43 throws on that.
 */
function replaceWith(from: number, to: number, widget: WidgetType): PreviewItem {
  return { from, to, decoration: Decoration.replace({ widget }) }
}

class TaskCheckboxWidget extends WidgetType {
  constructor(readonly checked: boolean) {
    super()
  }

  eq(other: TaskCheckboxWidget): boolean {
    return this.checked === other.checked
  }

  toDOM(view: EditorView): HTMLElement {
    const node = document.createElement('span')
    node.className = this.checked ? 'inkline-task-checkbox is-checked' : 'inkline-task-checkbox'
    node.setAttribute('role', 'checkbox')
    node.setAttribute('aria-checked', String(this.checked))
    node.addEventListener('mousedown', (event) => {
      event.preventDefault()
      // Positions shift as the document is edited, so the marker is located
      // from the widget's current position rather than remembered.
      const pos = view.posAtDOM(node)
      const line = view.state.doc.lineAt(pos)
      const offset = line.text.indexOf('[', pos - line.from)
      if (offset === -1 || !/^\[[ xX]\]/u.test(line.text.slice(offset))) return
      const at = line.from + offset + 1
      view.dispatch({ changes: { from: at, to: at + 1, insert: this.checked ? ' ' : 'x' } })
    })
    return node
  }

  ignoreEvent(): boolean {
    return true
  }
}

const CALLOUT_ICONS: Record<string, string[]> = {
  note: ['M22 12a10 10 0 1 1-20 0a10 10 0 1 1 20 0', 'M12 16v-4', 'M12 8h.01'],
  tip: [
    'M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5',
    'M9 18h6',
    'M10 22h4',
  ],
  important: ['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z', 'M12 7v4', 'M12 14h.01'],
  warning: ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  caution: [
    'M8.7 2h6.6a2 2 0 0 1 1.4.6l4.7 4.7a2 2 0 0 1 .6 1.4v6.6a2 2 0 0 1-.6 1.4l-4.7 4.7a2 2 0 0 1-1.4.6H8.7a2 2 0 0 1-1.4-.6l-4.7-4.7A2 2 0 0 1 2 15.3V8.7a2 2 0 0 1 .6-1.4l4.7-4.7A2 2 0 0 1 8.7 2z',
    'M12 8v4',
    'M12 16h.01',
  ],
}

/** The icon, plus the type's name when the callout has no title of its own. */
class CalloutTitleWidget extends WidgetType {
  constructor(readonly calloutType: string, readonly showLabel: boolean) {
    super()
  }

  eq(other: CalloutTitleWidget): boolean {
    return this.calloutType === other.calloutType && this.showLabel === other.showLabel
  }

  toDOM(): HTMLElement {
    const node = document.createElement('span')
    node.className = 'inkline-callout-title-widget'
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'inkline-callout-icon')
    svg.setAttribute('viewBox', '0 0 24 24')
    svg.setAttribute('aria-hidden', 'true')
    for (const d of CALLOUT_ICONS[this.calloutType] ?? CALLOUT_ICONS.note) {
      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      path.setAttribute('d', d)
      svg.appendChild(path)
    }
    node.appendChild(svg)
    if (this.showLabel) {
      const label = document.createElement('span')
      label.className = 'inkline-callout-title'
      label.textContent = this.calloutType.charAt(0).toUpperCase() + this.calloutType.slice(1)
      node.appendChild(label)
    }
    return node
  }

  // Clicking the title puts the caret on the header line, revealing `[!TYPE]`.
  ignoreEvent(): boolean {
    return false
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
    case 'task': {
      if (item.hidden) {
        items.push(replaceWith(item.concealFrom, item.to, new TaskCheckboxWidget(item.checked)))
      } else {
        items.push(mark(item.from, item.to, 'inkline-task-marker'))
      }
      const textFrom = Math.min(item.to + 1, item.lineTo)
      if (item.checked && textFrom < item.lineTo) items.push(mark(textFrom, item.lineTo, 'inkline-task-done'))
      break
    }
    case 'callout':
      addBlockSpacing(items, state, state.doc.lineAt(item.firstLineFrom).number, item.lastLineNumber)
      items.push({
        from: item.firstLineFrom,
        to: item.firstLineFrom,
        decoration: Decoration.line({
          class: `inkline-callout-line inkline-callout-first inkline-callout-${item.calloutType}`,
        }),
      })
      if (item.hidden && item.markFrom < item.markTo) {
        items.push(replaceWith(item.markFrom, item.markTo, new CalloutTitleWidget(item.calloutType, !item.title)))
      } else if (item.markFrom < item.markTo) {
        items.push(mark(item.markFrom, item.markTo, 'inkline-callout-marker'))
      }
      if (item.title) items.push(mark(item.markTo, item.firstLineTo, 'inkline-callout-title'))
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
        items.push(replaceWith(item.from, item.to, new ImagePreviewWidget(uri, item.alt)))
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
    if (active) {
      items.push(mark(range.from, range.to, 'inkline-math-source'))
    } else if (!ownsLines(state.doc, range)) {
      // Blocks on lines of their own are rendered by the math block preview.
      items.push(replaceWith(range.from, range.to, new MathPreviewWidget(range.latex, range.block)))
    }
  }

  // Decoration.set sorts by position *and* side; sorting by position alone can
  // put a line decoration after a widget at the same spot, which is rejected.
  // Empty marks (``, an empty bold) style nothing and are not allowed.
  const ranges: Range<Decoration>[] = strutConcealedLines(items, state)
    .filter((item) => item.from < item.to || item.decoration.point)
    .map((item) => item.decoration.range(item.from, item.to))
  return Decoration.set(ranges, true)
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
