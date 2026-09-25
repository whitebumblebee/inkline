import { StateField, type EditorState, type Extension, type Range, type Text } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import katex from 'katex'
import { findMathRanges, type MathRange } from './math-ranges'
import { selectionTouchesRange } from './live-preview-ranges'

function renderLatex(node: HTMLElement, latex: string, displayMode: boolean): void {
  try {
    katex.render(latex, node, { displayMode, throwOnError: false, output: 'html' })
  } catch {
    node.textContent = latex
  }
}

/** Rendered math shown in place of a concealed `$…$` or mid-paragraph `$$…$$`. */
export class MathPreviewWidget extends WidgetType {
  constructor(readonly latex: string, readonly block: boolean) {
    super()
  }

  eq(other: MathPreviewWidget): boolean {
    return this.latex === other.latex && this.block === other.block
  }

  toDOM(): HTMLElement {
    const node = document.createElement('span')
    node.className = this.block ? 'inkline-math-preview-widget is-block' : 'inkline-math-preview-widget'
    node.setAttribute('aria-hidden', 'true')
    renderLatex(node, this.latex, this.block)
    return node
  }

  // Let CodeMirror place the caret on click; landing next to the formula
  // touches its range, which reveals the source for editing.
  ignoreEvent(): boolean {
    return false
  }
}

/**
 * A `$$…$$` block that has its lines to itself - the usual way display math is
 * written, and the only shape that can span several lines. Those are rendered
 * as one block in place of the lines; anything sharing a line with prose stays
 * inline.
 */
export function ownsLines(doc: Text, range: Pick<MathRange, 'from' | 'to' | 'block'>): boolean {
  if (!range.block) return false
  const first = doc.lineAt(range.from)
  const last = doc.lineAt(range.to)
  return doc.sliceString(first.from, range.from).trim() === '' && doc.sliceString(range.to, last.to).trim() === ''
}

interface MathBlock {
  from: number
  to: number
  latex: string
  /** Where the caret goes when the rendered block is clicked: the first character of the formula. */
  editAt: number
}

export function findMathBlocks(doc: Text): MathBlock[] {
  const text = doc.toString()
  const blocks: MathBlock[] = []
  for (const range of findMathRanges(text)) {
    if (!range.latex || !ownsLines(doc, range)) continue
    const inner = text.slice(range.from + 2, range.to - 2)
    blocks.push({
      from: doc.lineAt(range.from).from,
      to: doc.lineAt(range.to).to,
      latex: range.latex,
      editAt: range.from + 2 + (inner.length - inner.trimStart().length),
    })
  }
  return blocks
}

class MathBlockWidget extends WidgetType {
  constructor(readonly block: MathBlock) {
    super()
  }

  eq(other: MathBlockWidget): boolean {
    return this.block.latex === other.block.latex && this.block.editAt === other.block.editAt
  }

  toDOM(view: EditorView): HTMLElement {
    const node = document.createElement('div')
    node.className = 'inkline-math-block-preview'
    node.setAttribute('aria-hidden', 'true')
    renderLatex(node, this.block.latex, true)
    // Clicking the formula opens its source with the caret at the formula's start.
    node.addEventListener('mousedown', (event) => {
      event.preventDefault()
      view.dispatch({ selection: { anchor: Math.min(this.block.editAt, view.state.doc.length) } })
      view.focus()
    })
    return node
  }

  ignoreEvent(): boolean {
    return true
  }
}

interface MathBlockState {
  blocks: MathBlock[]
  decorations: DecorationSet
}

function decorate(state: EditorState, blocks: MathBlock[]): DecorationSet {
  const ranges: Range<Decoration>[] = []
  for (const block of blocks) {
    if (selectionTouchesRange(state, block.from, block.to)) continue
    ranges.push(Decoration.replace({ widget: new MathBlockWidget(block), block: true }).range(block.from, block.to))
  }
  return Decoration.set(ranges, true)
}

function build(state: EditorState): MathBlockState {
  const blocks = findMathBlocks(state.doc)
  return { blocks, decorations: decorate(state, blocks) }
}

/**
 * Like the table preview, a rendered block replaces whole lines, which only a
 * state field may do. The document is scanned when it changes; caret moves just
 * decide which blocks are being edited.
 */
const mathBlockField = StateField.define<MathBlockState>({
  create: (state) => build(state),
  update(value, transaction) {
    if (transaction.docChanged) return build(transaction.state)
    if (!transaction.selection) return value
    return { blocks: value.blocks, decorations: decorate(transaction.state, value.blocks) }
  },
})

export const mathBlockPreview: Extension = [
  mathBlockField,
  EditorView.decorations.from(mathBlockField, (value) => value.decorations),
]
