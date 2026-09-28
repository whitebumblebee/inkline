import { StateField, type EditorState, type Extension, type Range, type Text } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'

/**
 * A Git merge conflict. Line numbers are 1-based; `base` is set only for the
 * diff3 style, which adds a `|||||||` section with the common ancestor.
 */
export interface ConflictBlock {
  from: number
  to: number
  startLine: number
  baseLine: number | null
  separatorLine: number
  endLine: number
}

export type ConflictChoice = 'current' | 'incoming' | 'both'

// Git writes seven marker characters, then a space and a label (none for `=======`).
const START = /^<{7}(?:\s|$)/u
const BASE = /^\|{7}(?:\s|$)/u
const SEPARATOR = /^={7}\s*$/u
const END = /^>{7}(?:\s|$)/u

/**
 * Only complete blocks count: a start, a separator and an end, in that order.
 * The scan works on raw lines, like VS Code's own conflict detection, so a
 * conflict inside a code block is found too.
 */
export function findConflicts(doc: Text): ConflictBlock[] {
  const blocks: ConflictBlock[] = []
  let start: number | null = null
  let base: number | null = null
  let separator: number | null = null
  for (let lineNo = 1; lineNo <= doc.lines; lineNo += 1) {
    const text = doc.line(lineNo).text
    if (START.test(text)) {
      start = lineNo
      base = null
      separator = null
    } else if (start === null) {
      continue
    } else if (BASE.test(text) && separator === null && base === null) {
      base = lineNo
    } else if (SEPARATOR.test(text) && separator === null) {
      separator = lineNo
    } else if (END.test(text) && separator !== null) {
      blocks.push({
        from: doc.line(start).from,
        to: doc.line(lineNo).to,
        startLine: start,
        baseLine: base,
        separatorLine: separator,
        endLine: lineNo,
      })
      start = null
    }
  }
  return blocks
}

function linesBetween(doc: Text, first: number, last: number): string[] {
  const lines: string[] = []
  for (let lineNo = first; lineNo <= last; lineNo += 1) lines.push(doc.line(lineNo).text)
  return lines
}

/** The edit that replaces a conflict with the side (or sides) chosen. */
export function resolveConflict(doc: Text, block: ConflictBlock, choice: ConflictChoice): { from: number; to: number; insert: string } {
  const current = linesBetween(doc, block.startLine + 1, (block.baseLine ?? block.separatorLine) - 1)
  const incoming = linesBetween(doc, block.separatorLine + 1, block.endLine - 1)
  const kept = choice === 'current' ? current : choice === 'incoming' ? incoming : [...current, ...incoming]
  if (kept.length > 0) return { from: block.from, to: block.to, insert: kept.join('\n') }
  // Nothing kept: take one line break with the block so no blank line is left behind.
  if (block.to < doc.length) return { from: block.from, to: block.to + 1, insert: '' }
  return { from: Math.max(0, block.from - 1), to: block.to, insert: '' }
}

class ConflictActionsWidget extends WidgetType {
  constructor(readonly block: ConflictBlock) {
    super()
  }

  eq(other: ConflictActionsWidget): boolean {
    return this.block.from === other.block.from && this.block.to === other.block.to
  }

  toDOM(view: EditorView): HTMLElement {
    const bar = document.createElement('div')
    bar.className = 'inkline-conflict-actions'
    const choices: [ConflictChoice, string][] = [['current', 'Accept Current'], ['incoming', 'Accept Incoming'], ['both', 'Accept Both']]
    for (const [choice, label] of choices) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = label
      // Positions move as the document changes, so find this conflict again
      // rather than trusting the offsets the widget was drawn with.
      button.addEventListener('mousedown', (event) => event.preventDefault())
      button.addEventListener('click', () => {
        const block = findConflicts(view.state.doc).find((found) => found.startLine === this.block.startLine)
        if (!block) return
        view.dispatch({ changes: resolveConflict(view.state.doc, block, choice), userEvent: 'input.resolve' })
        view.focus()
      })
      bar.appendChild(button)
    }
    return bar
  }

  ignoreEvent(): boolean {
    return true
  }
}

function lineClass(doc: Text, lineNo: number, className: string): Range<Decoration> {
  const line = doc.line(lineNo)
  return Decoration.line({ class: `inkline-conflict-line ${className}` }).range(line.from)
}

function decorate(doc: Text, blocks: ConflictBlock[]): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (const block of blocks) {
    ranges.push(Decoration.widget({ widget: new ConflictActionsWidget(block), block: true, side: -1 }).range(block.from))
    ranges.push(lineClass(doc, block.startLine, 'inkline-conflict-marker inkline-conflict-current-marker'))
    const currentEnd = (block.baseLine ?? block.separatorLine) - 1
    for (let lineNo = block.startLine + 1; lineNo <= currentEnd; lineNo += 1) ranges.push(lineClass(doc, lineNo, 'inkline-conflict-current'))
    if (block.baseLine !== null) {
      ranges.push(lineClass(doc, block.baseLine, 'inkline-conflict-marker inkline-conflict-base-marker'))
      for (let lineNo = block.baseLine + 1; lineNo < block.separatorLine; lineNo += 1) ranges.push(lineClass(doc, lineNo, 'inkline-conflict-base'))
    }
    ranges.push(lineClass(doc, block.separatorLine, 'inkline-conflict-marker'))
    for (let lineNo = block.separatorLine + 1; lineNo < block.endLine; lineNo += 1) ranges.push(lineClass(doc, lineNo, 'inkline-conflict-incoming'))
    ranges.push(lineClass(doc, block.endLine, 'inkline-conflict-marker inkline-conflict-incoming-marker'))
  }
  return Decoration.set(ranges, true)
}

interface ConflictState {
  blocks: ConflictBlock[]
  decorations: DecorationSet
}

function build(doc: Text): ConflictState {
  const blocks = findConflicts(doc)
  return { blocks, decorations: decorate(doc, blocks) }
}

const conflictField = StateField.define<ConflictState>({
  create: (state) => build(state.doc),
  update: (value, transaction) => (transaction.docChanged ? build(transaction.state.doc) : value),
})

/**
 * The ranges the live preview must leave as plain source: each conflict, grown
 * to cover any Markdown block it touches. Conflict markers are not Markdown, but
 * the parser reads them as if they were - `=======` turns the line above it into
 * a heading, and `>>>>>>>` into seven nested quotes - and that misreading can
 * reach lines outside the markers.
 */
export function conflictRanges(state: EditorState): { from: number; to: number }[] {
  const blocks = state.field(conflictField, false)?.blocks ?? findConflicts(state.doc)
  if (blocks.length === 0) return []
  const tree = syntaxTree(state)
  return blocks.map((block) => {
    let from = block.from
    let to = block.to
    for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
      if (node.from > block.to) break
      if (node.to < block.from) continue
      from = Math.min(from, node.from)
      to = Math.max(to, node.to)
    }
    return { from, to }
  })
}

export function overlapsConflict(ranges: readonly { from: number; to: number }[], from: number, to: number): boolean {
  return ranges.some((range) => from <= range.to && to >= range.from)
}

export const mergeConflicts: Extension = [
  conflictField,
  EditorView.decorations.from(conflictField, (value) => value.decorations),
]
