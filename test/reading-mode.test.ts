import { afterEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { Transaction } from '@codemirror/state'
import type { EditorView } from '@codemirror/view'
import { DocumentSession, type SessionHost } from '../src/document-session'
import { livePreview } from '../webview/src/editor/live-preview'
import { tablePreview } from '../webview/src/editor/table-preview'
import { htmlPreview } from '../webview/src/editor/html-preview'
import { mathBlockPreview } from '../webview/src/editor/math-preview'
import { mergeConflicts } from '../webview/src/editor/merge-conflicts'
import { inklineKeymap } from '../webview/src/editor/editor-keymap'
import { isReading, readingMode, setReadingMode } from '../webview/src/editor/reading-mode'
import { createEditor, installDom } from './editor-test-utils'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

const DOC = [
  '# Heading',
  '',
  'Some **bold** text and a [link](https://example.com).',
  '',
  '- [ ] A task',
  '',
  '| a | b |',
  '| - | - |',
  '| 1 | 2 |',
  '',
  '<p align="center">HTML</p>',
  '',
  '$$',
  'x^2',
  '$$',
  '',
  'End',
].join('\n')

function open(doc = DOC, extensions = [livePreview, tablePreview, htmlPreview, mathBlockPreview, inklineKeymap]): EditorView {
  cleanups.push(installDom())
  const { view } = createEditor(doc, [...extensions, readingMode])
  view.dispatch({ effects: setReadingMode.of(true) })
  return view
}

function hidden(view: EditorView): string[] {
  return [...view.dom.querySelectorAll('.inkline-hidden-syntax')].map((node) => node.textContent ?? '')
}

describe('reading mode', () => {
  it('keeps everything drawn wherever the selection is', () => {
    const view = open()
    for (const text of ['# Heading', 'bold', 'link', '| 1 |', 'HTML', 'x^2']) {
      view.dispatch({ selection: { anchor: DOC.indexOf(text) + 1 } })
      expect(hidden(view)).toContain('# ')
      expect(hidden(view)).toContain('**')
      expect(view.dom.querySelector('.inkline-task-checkbox')).not.toBeNull()
      expect(view.dom.querySelector('.inkline-table-preview')).not.toBeNull()
      expect(view.dom.querySelector('.inkline-html-block')).not.toBeNull()
      expect(view.dom.querySelector('.inkline-math-block-preview')).not.toBeNull()
    }
    view.destroy()
  })

  it('blocks every kind of edit: typing, keys, checkboxes and commands', () => {
    const view = open()
    view.dispatch({ changes: { from: 0, insert: 'typed ' }, userEvent: 'input.type' })
    view.dispatch({ changes: { from: 0, insert: 'pasted ' }, userEvent: 'input.paste' })
    view.dispatch({ changes: { from: 0, to: 2 } })
    view.dispatch({ selection: { anchor: DOC.indexOf('A task') } })
    view.contentDOM.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }))
    view.dom.querySelector('.inkline-task-checkbox')!.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(view.state.doc.toString()).toBe(DOC)
    view.destroy()
  })

  it('blocks accepting a merge conflict', () => {
    const doc = '<<<<<<< HEAD\nours\n=======\ntheirs\n>>>>>>> x\n'
    const view = open(doc, [mergeConflicts, livePreview])
    view.dom.querySelector<HTMLButtonElement>('.inkline-conflict-actions button')!.click()
    expect(view.state.doc.toString()).toBe(doc)
    view.destroy()
  })

  it('still shows changes made to the file elsewhere', () => {
    const view = open()
    view.dispatch({ changes: { from: DOC.length, insert: '\nAdded on disk.' }, annotations: Transaction.remote.of(true) })
    expect(view.state.doc.toString()).toBe(DOC + '\nAdded on disk.')
    view.destroy()
  })

  it('opens a link in an HTML block with a plain click', () => {
    const post = vi.fn()
    const view = open('<p><a href="https://x.dev">site</a></p>\n\nEnd', [htmlPreview])
    window.inkline = { postMessage: post }
    view.dom.querySelector('.inkline-html-block [data-url]')!.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(post).toHaveBeenCalledWith({ type: 'openLink', url: 'https://x.dev' })
    view.destroy()
  })

  it('goes back to normal editing when switched off', () => {
    const view = open()
    view.dispatch({ effects: setReadingMode.of(false) })
    expect(isReading(view.state)).toBe(false)
    view.dispatch({ selection: { anchor: 2 } })
    expect(hidden(view)).not.toContain('# ')
    view.dispatch({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type' })
    expect(view.state.doc.toString()).toBe('x' + DOC)
    view.destroy()
  })
})

describe('switching from VS Code', () => {
  it('tells the editor to switch', () => {
    const postMessage = vi.fn()
    const document = {
      uri: vscode.Uri.file('/notes/a.md'),
      version: 1,
      eol: vscode.EndOfLine.LF,
      getText: () => '# Hi',
      positionAt: () => new vscode.Position(0, 0),
    } as unknown as vscode.TextDocument
    const host: SessionHost = {
      postMessage,
      applyEdit: vi.fn().mockResolvedValue(true),
      resolveImage: vi.fn(),
      openNative: vi.fn(),
      insertImage: vi.fn(),
      openLink: vi.fn().mockResolvedValue(true),
    }
    new DocumentSession(document, host).toggleReadingMode()
    expect(postMessage).toHaveBeenCalledWith({ type: 'toggleReadingMode' })
  })
})
