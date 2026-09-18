import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'

export type ColumnAlign = 'left' | 'center' | 'right' | null

export interface TableBlock {
  firstLineNumber: number
  lastLineNumber: number
  from: number
  to: number
  /** Raw source of every row, header first. The delimiter row is not included. */
  rows: string[]
  align: ColumnAlign[]
}

const DELIMITER_ROW = /^\s*\|?(?:\s*:?-+:?\s*\|)*\s*:?-+:?\s*\|?\s*$/u
const PIPE_ROW = /\|/u

/**
 * A delimiter row needs at least one pipe: without that check the pattern also
 * matches a thematic break (`---`) and a Setext underline.
 */
export function isDelimiterRow(text: string): boolean {
  return PIPE_ROW.test(text) && DELIMITER_ROW.test(text)
}

function isRow(text: string): boolean {
  return PIPE_ROW.test(text) && text.trim().length > 0 && !/^\s*$/u.test(text)
}

/** Splits a row on unescaped pipes, dropping the optional outer pipes. */
export function splitCells(row: string): string[] {
  const cells: string[] = []
  let current = ''
  for (let index = 0; index < row.length; index += 1) {
    const char = row[index]
    if (char === '\\' && row[index + 1] === '|') {
      current += '|'
      index += 1
      continue
    }
    if (char === '|') {
      cells.push(current)
      current = ''
      continue
    }
    current += char
  }
  cells.push(current)
  if (cells.length && cells[0].trim() === '') cells.shift()
  if (cells.length && cells[cells.length - 1].trim() === '') cells.pop()
  return cells.map((cell) => cell.trim())
}

function parseAlignment(delimiter: string): ColumnAlign[] {
  return splitCells(delimiter).map((cell) => {
    const left = cell.startsWith(':')
    const right = cell.endsWith(':')
    if (left && right) return 'center'
    if (right) return 'right'
    if (left) return 'left'
    return null
  })
}

/**
 * GFM tables: a header row, a delimiter row, then any number of body rows.
 * Requiring the delimiter keeps ordinary prose containing a pipe out of this.
 */
export function findTableBlocks(state: EditorState): TableBlock[] {
  const doc = state.doc
  const blocks: TableBlock[] = []
  for (let lineNo = 1; lineNo < doc.lines; lineNo += 1) {
    const header = doc.line(lineNo)
    if (!isRow(header.text) || isDelimiterRow(header.text)) continue
    const delimiter = doc.line(lineNo + 1)
    if (!isDelimiterRow(delimiter.text)) continue

    const rows = [header.text]
    let lastLineNumber = lineNo + 1
    for (let next = lineNo + 2; next <= doc.lines; next += 1) {
      const line = doc.line(next)
      if (!isRow(line.text)) break
      rows.push(line.text)
      lastLineNumber = next
    }
    blocks.push({
      firstLineNumber: lineNo,
      lastLineNumber,
      from: header.from,
      to: doc.line(lastLineNumber).to,
      rows,
      align: parseAlignment(delimiter.text),
    })
    lineNo = lastLineNumber
  }
  return blocks
}

interface InlineRule {
  pattern: RegExp
  render: (match: RegExpExecArray) => Node
}

function element(tag: string, text: string, className?: string): HTMLElement {
  const node = document.createElement(tag)
  node.textContent = text
  if (className) node.className = className
  return node
}

const INLINE_RULES: InlineRule[] = [
  { pattern: /`([^`]+)`/u, render: (m) => element('code', m[1], 'inkline-table-code') },
  { pattern: /\*\*([^*]+)\*\*/u, render: (m) => element('strong', m[1]) },
  { pattern: /__([^_]+)__/u, render: (m) => element('strong', m[1]) },
  { pattern: /~~([^~]+)~~/u, render: (m) => element('del', m[1]) },
  { pattern: /==([^=]+)==/u, render: (m) => element('mark', m[1], 'inkline-highlight') },
  { pattern: /\*([^*]+)\*/u, render: (m) => element('em', m[1]) },
  { pattern: /_([^_]+)_/u, render: (m) => element('em', m[1]) },
  {
    pattern: /\[([^\]]+)\]\(([^)]+)\)/u,
    render: (m) => {
      const node = element('span', m[1], 'inkline-live-link')
      node.setAttribute('title', m[2])
      return node
    },
  },
]

/**
 * Renders a cell's inline Markdown into DOM nodes. Built node by node rather
 * than through innerHTML: the text comes from the user's document and must
 * never be interpreted as markup beyond the small set handled here.
 */
function renderInline(text: string, parent: HTMLElement): void {
  const segments = text.split(/<br\s*\/?>/giu)
  segments.forEach((segment, index) => {
    if (index > 0) parent.appendChild(document.createElement('br'))
    renderSpans(segment, parent)
  })
}

function renderSpans(text: string, parent: HTMLElement): void {
  let rest = text
  while (rest.length > 0) {
    let best: { index: number; match: RegExpExecArray; rule: InlineRule } | null = null
    for (const rule of INLINE_RULES) {
      const match = rule.pattern.exec(rest)
      if (match && (!best || match.index < best.index)) best = { index: match.index, match, rule }
    }
    if (!best) break
    if (best.index > 0) parent.appendChild(document.createTextNode(rest.slice(0, best.index)))
    parent.appendChild(best.rule.render(best.match))
    rest = rest.slice(best.index + best.match[0].length)
  }
  if (rest.length > 0) parent.appendChild(document.createTextNode(rest))
}

class TableWidget extends WidgetType {
  constructor(readonly block: TableBlock) {
    super()
  }

  eq(other: TableWidget): boolean {
    return (
      this.block.from === other.block.from &&
      this.block.rows.length === other.block.rows.length &&
      this.block.rows.every((row, index) => row === other.block.rows[index]) &&
      this.block.align.join() === other.block.align.join()
    )
  }

  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('div')
    wrapper.className = 'inkline-table-preview'
    const table = document.createElement('table')

    this.block.rows.forEach((row, rowIndex) => {
      // Row 0 is the header; body rows start after the delimiter line.
      const sourceLine = this.block.firstLineNumber + (rowIndex === 0 ? 0 : rowIndex + 1)
      const tr = document.createElement('tr')
      splitCells(row).forEach((cell, columnIndex) => {
        const td = document.createElement(rowIndex === 0 ? 'th' : 'td')
        const align = this.block.align[columnIndex]
        if (align) td.style.textAlign = align
        renderInline(cell, td)
        tr.appendChild(td)
      })
      // Clicking a row puts the caret on the line it came from, so the table
      // turns back into editable source exactly where it was clicked.
      tr.addEventListener('mousedown', (event) => {
        event.preventDefault()
        const line = view.state.doc.line(Math.min(sourceLine, view.state.doc.lines))
        view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true })
        view.focus()
      })
      ;(rowIndex === 0 ? table.createTHead() : table.tBodies[0] ?? table.createTBody()).appendChild(tr)
    })

    wrapper.appendChild(table)
    return wrapper
  }

  ignoreEvent(): boolean {
    return true
  }
}

function selectionTouches(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) if (range.from <= to && range.to >= from) return true
  return false
}

interface TableState {
  blocks: TableBlock[]
  decorations: DecorationSet
}

function decorate(state: EditorState, blocks: TableBlock[]): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (const block of blocks) {
    // Editing inside the table shows its source instead.
    if (selectionTouches(state, block.from, block.to)) continue
    ranges.push(
      Decoration.replace({ widget: new TableWidget(block), block: true }).range(block.from, block.to),
    )
  }
  return Decoration.set(ranges, true)
}

function buildTableState(state: EditorState): TableState {
  const blocks = findTableBlocks(state)
  return { blocks, decorations: decorate(state, blocks) }
}

/**
 * A rendered table replaces several source lines at once, and CodeMirror
 * requires decorations that span line breaks to come from a state field rather
 * than a view plugin - the viewport cannot be computed without knowing them.
 *
 * The scan looks at every line, so it runs only when the document changes;
 * moving the caret reuses the blocks it found and just decides which of them
 * are being edited.
 */
const tableField = StateField.define<TableState>({
  create: (state) => buildTableState(state),
  update(value, transaction) {
    if (transaction.docChanged) return buildTableState(transaction.state)
    if (!transaction.selection) return value
    return { blocks: value.blocks, decorations: decorate(transaction.state, value.blocks) }
  },
})

export const tablePreview: Extension = [
  tableField,
  EditorView.decorations.from(tableField, (value) => value.decorations),
]
