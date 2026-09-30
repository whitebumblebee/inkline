import { afterEach, describe, expect, it } from 'vitest'
import { history, redo, undo } from '@codemirror/commands'
import { EditorState, Text } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { buildLivePreviewDecorations, livePreview } from '../webview/src/editor/live-preview'
import { findConflicts, mergeConflicts, resolveConflict } from '../webview/src/editor/merge-conflicts'
import { tablePreview } from '../webview/src/editor/table-preview'
import { createEditor, installDom } from './editor-test-utils'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

const CONFLICT = [
  '# Notes',
  '',
  '<<<<<<< HEAD',
  'Ship on Monday.',
  '=======',
  'Ship on Friday.',
  '>>>>>>> feature/dates',
  '',
  '## After',
].join('\n')

function createState(doc: string, anchor = 0): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] }), mergeConflicts],
  })
}

function decorationClasses(state: EditorState, from: number, to: number): string[] {
  const classes: string[] = []
  buildLivePreviewDecorations({ state }).between(from, to, (_from, _to, decoration) => {
    const className = decoration.spec.class ?? decoration.spec.attributes?.class
    if (className) classes.push(className)
    if (decoration.spec.widget) classes.push('widget')
  })
  return classes
}

describe('finding merge conflicts', () => {
  it('finds a conflict with its three markers', () => {
    const [block] = findConflicts(Text.of(CONFLICT.split('\n')))
    expect(block).toMatchObject({ startLine: 3, baseLine: null, separatorLine: 5, endLine: 7 })
  })

  it('finds the common ancestor section written by the diff3 style', () => {
    const doc = Text.of(['<<<<<<< ours', 'a', '||||||| base', 'b', '=======', 'c', '>>>>>>> theirs'])
    expect(findConflicts(doc)).toMatchObject([{ startLine: 1, baseLine: 3, separatorLine: 5, endLine: 7 }])
  })

  it('leaves an example conflict inside a code block alone', () => {
    const example = ['```text', '<<<<<<< HEAD', 'a', '=======', 'b', '>>>>>>> x', '```']
    expect(findConflicts(Text.of(example))).toEqual([])
    expect(findConflicts(Text.of(['~~~', ...example.slice(1, -1), '~~~']))).toEqual([])
    // A closing fence of the other kind does not end the block.
    expect(findConflicts(Text.of(['````', '~~~', ...example.slice(1, -1), '````']))).toEqual([])
  })

  it('still finds a real conflict before, after or around a code block', () => {
    const conflict = ['<<<<<<< HEAD', 'a', '=======', 'b', '>>>>>>> x']
    expect(findConflicts(Text.of(['```', 'code', '```', ...conflict]))).toHaveLength(1)
    expect(findConflicts(Text.of([...conflict, '```', 'code', '```']))).toHaveLength(1)
    // One side adds a code block: the fence is part of the conflict.
    const addsFence = ['<<<<<<< HEAD', '```js', 'one()', '=======', 'two()', '>>>>>>> x', '```']
    expect(findConflicts(Text.of(addsFence))).toHaveLength(1)
  })

  it('ignores Markdown that only looks like part of a conflict', () => {
    expect(findConflicts(Text.of(['Title', '=======', '', '> quote']))).toEqual([])
    expect(findConflicts(Text.of(['<<<<<<< HEAD', 'a', '=======', 'b']))).toEqual([])
    expect(findConflicts(Text.of(['<<<<<<<< HEAD', 'a', '=======', 'b', '>>>>>>>> x']))).toEqual([])
  })
})

describe('resolving a merge conflict', () => {
  const doc = Text.of(CONFLICT.split('\n'))
  const [block] = findConflicts(doc)
  const apply = (edit: { from: number; to: number; insert: string }) =>
    doc.sliceString(0, edit.from) + edit.insert + doc.sliceString(edit.to)

  it('keeps the current side, the incoming side, or both', () => {
    expect(apply(resolveConflict(doc, block, 'current'))).toBe('# Notes\n\nShip on Monday.\n\n## After')
    expect(apply(resolveConflict(doc, block, 'incoming'))).toBe('# Notes\n\nShip on Friday.\n\n## After')
    expect(apply(resolveConflict(doc, block, 'both'))).toBe('# Notes\n\nShip on Monday.\nShip on Friday.\n\n## After')
  })

  it('removes the whole block when the chosen side is empty', () => {
    const empty = Text.of(['a', '<<<<<<< HEAD', '=======', 'b', '>>>>>>> x', 'c'])
    const [emptyBlock] = findConflicts(empty)
    const edit = resolveConflict(empty, emptyBlock, 'current')
    expect(empty.sliceString(0, edit.from) + edit.insert + empty.sliceString(edit.to)).toBe('a\nc')
  })

  it('leaves the base section out of every choice', () => {
    const diff3 = Text.of(['<<<<<<< ours', 'a', '||||||| base', 'b', '=======', 'c', '>>>>>>> theirs'])
    const [diff3Block] = findConflicts(diff3)
    expect(resolveConflict(diff3, diff3Block, 'both').insert).toBe('a\nc')
  })
})

describe('live preview around a merge conflict', () => {
  it('does not read the markers as a heading and nested quotes', () => {
    const state = createState(CONFLICT, CONFLICT.length)
    const [block] = findConflicts(state.doc)
    const classes = decorationClasses(state, block.from, block.to)
    expect(classes.some((name) => name.includes('heading'))).toBe(false)
    expect(classes.some((name) => name.includes('blockquote') || name.includes('hidden'))).toBe(false)
  })

  it('keeps the preview for the rest of the file', () => {
    const state = createState(CONFLICT, 3)
    const after = state.doc.line(9)
    expect(decorationClasses(state, after.from, after.to).some((name) => name.includes('inkline-h2-line'))).toBe(true)
  })

  it('leaves a paragraph that runs into the conflict as source too', () => {
    // No blank line: the parser would make "Intro" part of a Setext heading.
    const doc = ['Intro', '<<<<<<< HEAD', 'a', '=======', 'b', '>>>>>>> x'].join('\n')
    const state = createState(doc, doc.length)
    expect(decorationClasses(state, 0, 5).some((name) => name.includes('heading'))).toBe(false)
  })

  it('shows a table inside a conflict as its source rows', () => {
    cleanups.push(installDom())
    const doc = ['<<<<<<< HEAD', '| A |', '| - |', '| 1 |', '=======', '| A |', '| - |', '| 2 |', '>>>>>>> x', '', 'end'].join('\n')
    const { view } = createEditor(doc, [mergeConflicts, livePreview, tablePreview])
    view.dispatch({ selection: { anchor: doc.length } })
    expect(view.dom.querySelector('.inkline-table-preview')).toBeNull()
    expect(view.dom.querySelectorAll('.inkline-conflict-current').length).toBe(3)
    expect(view.dom.querySelectorAll('.inkline-conflict-incoming').length).toBe(3)
    view.destroy()
  })

  it('resolves the conflict from the buttons above it', () => {
    cleanups.push(installDom())
    const { view } = createEditor(CONFLICT, [mergeConflicts, livePreview])
    const buttons = [...view.dom.querySelectorAll<HTMLButtonElement>('.inkline-conflict-actions button')]
    expect(buttons.map((button) => button.textContent)).toEqual(['Accept Current', 'Accept Incoming', 'Accept Both'])
    buttons[1].click()
    expect(view.state.doc.toString()).toBe('# Notes\n\nShip on Friday.\n\n## After')
    expect(view.dom.querySelector('.inkline-conflict-actions')).toBeNull()
    view.destroy()
  })

  it('keeps the current side first for Accept Both, as Git and VS Code do', () => {
    cleanups.push(installDom())
    const doc = ['<<<<<<< HEAD', 'ours 1', 'ours 2', '=======', 'theirs 1', 'theirs 2', '>>>>>>> x'].join('\n')
    const { view } = createEditor(doc, [mergeConflicts])
    view.dom.querySelectorAll<HTMLButtonElement>('.inkline-conflict-actions button')[2].click()
    expect(view.state.doc.toString()).toBe('ours 1\nours 2\ntheirs 1\ntheirs 2')
    view.destroy()
  })

  it('restores the markers byte for byte with one undo, for every choice', () => {
    cleanups.push(installDom())
    const docs = [
      CONFLICT,
      ['a', '<<<<<<< HEAD', '=======', 'b', '>>>>>>> x', 'c'].join('\n'),
      ['<<<<<<< ours', 'a', '||||||| base', 'b', '=======', 'c', '>>>>>>> theirs'].join('\n'),
      ['x', '<<<<<<< HEAD', 'a', '=======', '>>>>>>> y'].join('\n'),
    ]
    for (const doc of docs) {
      for (const index of [0, 1, 2]) {
        const { view } = createEditor(doc, [history(), mergeConflicts])
        // Typing just before the click must stay a separate undo step.
        view.dispatch({ changes: { from: view.state.doc.length, insert: 'T' }, userEvent: 'input.type' })
        const before = view.state.doc.toString()
        view.dom.querySelectorAll<HTMLButtonElement>('.inkline-conflict-actions button')[index].click()
        expect(view.state.doc.toString()).not.toBe(before)
        undo(view)
        expect(view.state.doc.toString()).toBe(before)
        redo(view)
        undo(view)
        expect(view.state.doc.toString()).toBe(before)
        view.destroy()
      }
    }
  })
})
