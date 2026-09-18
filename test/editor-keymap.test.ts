import { afterEach, describe, expect, it } from 'vitest'
import { inklineKeymap } from '../webview/src/editor/editor-keymap'
import type { EditorView } from '@codemirror/view'
import { installDom, createEditor } from './editor-test-utils'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

function pressEnter(doc: string, line: number, column: number): { doc: string; line: number; column: number } {
  cleanups.push(installDom())
  const { view } = createEditor(doc, [inklineKeymap])
  const target = view.state.doc.line(line)
  view.dispatch({ selection: { anchor: target.from + column } })
  view.contentDOM.dispatchEvent(
    new window.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }),
  )
  const head = view.state.selection.main.head
  const resultLine = view.state.doc.lineAt(head)
  const result = { doc: view.state.doc.toString(), line: resultLine.number, column: head - resultLine.from }
  view.destroy()
  return result
}

/**
 * The Markdown language ships its own Enter binding and is registered ahead of
 * ours, so these all silently fell through to the built-in until the keymap was
 * given the higher precedence. The trailing space matters: it is what pressing
 * Enter on a list item produces, so it is the case users actually hit.
 */
describe('Enter ends an empty list item', () => {
  it('removes a bullet marker that still has its trailing space', () => {
    expect(pressEnter('- item\n- ', 2, 2)).toEqual({ doc: '- item\n', line: 2, column: 0 })
  })

  it('removes a bullet marker without a trailing space', () => {
    expect(pressEnter('- item\n-', 2, 1)).toEqual({ doc: '- item\n', line: 2, column: 0 })
  })

  it('removes an empty ordered marker', () => {
    expect(pressEnter('1. a\n2. ', 2, 3)).toEqual({ doc: '1. a\n', line: 2, column: 0 })
  })

  it('removes an empty task marker', () => {
    expect(pressEnter('- [ ] ', 1, 6)).toEqual({ doc: '', line: 1, column: 0 })
  })

  it('outdents a nested empty item before ending the list', () => {
    expect(pressEnter('  - a\n  - ', 2, 4)).toEqual({ doc: '  - a\n- ', line: 2, column: 2 })
  })
})

describe('Enter continues list structure', () => {
  it('continues a bullet list', () => {
    expect(pressEnter('- item', 1, 6)).toEqual({ doc: '- item\n- ', line: 2, column: 2 })
  })

  it('numbers the next ordered item', () => {
    expect(pressEnter('1. first', 1, 8)).toEqual({ doc: '1. first\n2. ', line: 2, column: 3 })
  })

  it('starts the next task unchecked', () => {
    expect(pressEnter('- [x] done', 1, 10)).toEqual({ doc: '- [x] done\n- [ ] ', line: 2, column: 6 })
  })

  it('continues a blockquote', () => {
    expect(pressEnter('> quoted', 1, 8)).toEqual({ doc: '> quoted\n> ', line: 2, column: 2 })
  })

  it('stays inside a fenced code block', () => {
    expect(pressEnter('```js\nconst a = 1\n```', 2, 11)).toEqual({
      doc: '```js\nconst a = 1\n\n```',
      line: 3,
      column: 0,
    })
  })

  it('steps out past the closing fence', () => {
    expect(pressEnter('```js\nconst a = 1\n```', 3, 3)).toEqual({
      doc: '```js\nconst a = 1\n```\n\n',
      line: 5,
      column: 0,
    })
  })
})

/**
 * VS Code routes undo specially inside a webview. If CodeMirror reports the key
 * as unhandled - which the default binding does whenever the history is empty -
 * the workbench's own undo runs instead, and that one can revert an external
 * change to the file.
 */
describe('undo never escapes the editor', () => {
  /** Dispatches the platform's undo chord and reports whether the editor claimed it. */
  function undoHandled(doc: string, prepare?: (view: EditorView) => void): { claimed: boolean; doc: string } {
    cleanups.push(installDom())
    const { view } = createEditor(doc, [inklineKeymap])
    prepare?.(view)
    let claimed = false
    // "Mod-" resolves to Cmd or Ctrl depending on the platform jsdom reports.
    for (const modifiers of [{ metaKey: true }, { ctrlKey: true }]) {
      if (claimed) break
      const event = new window.KeyboardEvent('keydown', {
        key: 'z', code: 'KeyZ', bubbles: true, cancelable: true, ...modifiers,
      })
      view.contentDOM.dispatchEvent(event)
      claimed = event.defaultPrevented
    }
    const result = { claimed, doc: view.state.doc.toString() }
    view.destroy()
    return result
  }

  it('claims the keystroke even with an empty history', () => {
    expect(undoHandled('nothing to undo').claimed).toBe(true)
  })

  it('claims the keystroke and undoes the edit when there is history', () => {
    const result = undoHandled('start', (view) => {
      view.dispatch({ changes: { from: 5, insert: ' more' }, userEvent: 'input.type' })
    })
    expect(result.claimed).toBe(true)
    expect(result.doc).toBe('start')
  })
})
