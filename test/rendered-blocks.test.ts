import { describe, expect, it } from 'vitest'
import { EditorSelection, EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { buildLivePreviewDecorations } from '../webview/src/editor/live-preview'
import { findLivePreviewItems } from '../webview/src/editor/live-preview-ranges'
import { findMathBlocks, ownsLines } from '../webview/src/editor/math-preview'

function createState(doc: string, cursor = doc.length): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursor),
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
  })
}

interface Found {
  from: number
  to: number
  className?: string
  widget: boolean
}

function decorationsOf(state: EditorState): Found[] {
  const found: Found[] = []
  buildLivePreviewDecorations({ state }).between(0, state.doc.length, (from, to, decoration) => {
    found.push({ from, to, className: decoration.spec.class, widget: Boolean(decoration.spec.widget) })
  })
  return found
}

describe('task list items', () => {
  it('stands a single checkbox in for the bullet and the marker', () => {
    const doc = 'intro\n\n- [x] Shipped'
    const state = createState(doc, 0)
    const lineFrom = doc.indexOf('- [x]')
    const found = decorationsOf(state)
    // Replaced rather than hidden beside a zero-length widget - see replaceWith.
    expect(found).toContainEqual({ from: lineFrom, to: lineFrom + 5, className: undefined, widget: true })
  })

  it('keeps the number of an ordered task item', () => {
    const state = createState('intro\n\n1. [ ] First', 0)
    const task = findLivePreviewItems(state).find((item) => item.type === 'task')
    expect(task?.type === 'task' && state.doc.sliceString(task.concealFrom, task.to)).toBe('[ ]')
  })

  it('strikes through the text of a done item only', () => {
    const doc = 'intro\n\n- [x] Done\n- [ ] Open'
    const done = decorationsOf(createState(doc, 0)).filter((d) => d.className === 'inkline-task-done')
    expect(done.map((d) => doc.slice(d.from, d.to))).toEqual(['Done'])
  })

  it('reveals the source once the caret reaches the marker', () => {
    const doc = '- [ ] Open'
    const found = decorationsOf(createState(doc, 3))
    expect(found.some((d) => d.widget)).toBe(false)
    expect(found.some((d) => d.className === 'inkline-task-marker')).toBe(true)
  })

  it('keeps the checkbox while typing the item text', () => {
    const doc = '- [ ] Open'
    expect(decorationsOf(createState(doc, doc.length)).some((d) => d.widget)).toBe(true)
  })

  it('accepts a checkbox on the same line as block spacing', () => {
    // The code block pads the line above it, where the checkbox also sits.
    const doc = 'intro\n\n- [ ] Task\n```js\ncode\n```'
    expect(() => decorationsOf(createState(doc, 0))).not.toThrow()
  })
})

describe('callout titles', () => {
  it('conceals only the marker when a custom title follows it', () => {
    const doc = 'intro\n\n> [!TIP] Tags matter\n> body'
    const found = decorationsOf(createState(doc, 0))
    const replaced = found.find((d) => d.widget)
    const title = found.find((d) => d.className === 'inkline-callout-title')
    expect(replaced && doc.slice(replaced.from, replaced.to)).toBe('> [!TIP] ')
    expect(title && doc.slice(title.from, title.to)).toBe('Tags matter')
  })

  it('draws a title in place of a bare marker', () => {
    const doc = 'intro\n\n> [!TIP]\n> body'
    const replaced = decorationsOf(createState(doc, 0)).find((d) => d.widget)
    expect(replaced && doc.slice(replaced.from, replaced.to)).toBe('> [!TIP]')
  })
})

describe('math', () => {
  it('replaces inline source with the rendered formula', () => {
    const doc = 'intro\n\nA bet that $a > b$ holds.'
    const replaced = decorationsOf(createState(doc, 0)).find((d) => d.widget)
    expect(replaced && doc.slice(replaced.from, replaced.to)).toBe('$a > b$')
  })

  it('renders a multi-line block as one block in place of its lines', () => {
    const doc = 'intro\n\n$$\nx \\approx 0\n$$\n\nafter'
    const blocks = findMathBlocks(createState(doc).doc)
    expect(blocks).toHaveLength(1)
    expect(doc.slice(blocks[0].from, blocks[0].to)).toBe('$$\nx \\approx 0\n$$')
    expect(blocks[0].latex).toBe('x \\approx 0')
    expect(doc.slice(blocks[0].editAt)).toMatch(/^x \\approx/u)
    // The inline pass leaves it alone rather than drawing it a second time.
    expect(decorationsOf(createState(doc, 0)).some((d) => d.widget)).toBe(false)
  })

  it('keeps a block that shares its line with prose inline', () => {
    const doc = 'So $$x$$ inline'
    expect(ownsLines(createState(doc).doc, { from: 3, to: 8, block: true })).toBe(false)
    expect(findMathBlocks(createState(doc).doc)).toEqual([])
  })

  it('shows the source while the caret is inside a block', () => {
    const doc = '$$\nx\n$$'
    const found = decorationsOf(createState(doc, 3))
    expect(found.some((d) => d.className === 'inkline-math-source')).toBe(true)
  })
})
