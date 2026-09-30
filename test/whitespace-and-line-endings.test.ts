import { afterEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { DocumentSession, type SessionHost } from '../src/document-session'
import { inklineKeymap } from '../webview/src/editor/editor-keymap'
import { livePreview } from '../webview/src/editor/live-preview'
import { runSourceCommand } from '../webview/src/editor/editor-commands'
import { createEditor, installDom } from './editor-test-utils'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

/** Presses a key with the caret at `anchor`; returns the document and caret after. */
function press(doc: string, anchor: number, key: string): { doc: string; head: number } {
  cleanups.push(installDom())
  const { view } = createEditor(doc, [inklineKeymap, livePreview])
  view.dispatch({ selection: { anchor } })
  view.contentDOM.dispatchEvent(new window.KeyboardEvent('keydown', { key, code: key, bubbles: true, cancelable: true }))
  const result = { doc: view.state.doc.toString(), head: view.state.selection.main.head }
  view.destroy()
  return result
}

// Two trailing spaces are a hard line break: removing them changes the rendered
// output while the preview looks the same, so no edit may drop them silently.
describe('trailing spaces', () => {
  it('keeps a hard break when Enter continues a blockquote', () => {
    const doc = '> quote  \n> more'
    expect(press(doc, 9, 'Enter')).toEqual({ doc: '> quote  \n> \n> more', head: 12 })
  })

  it('keeps a hard break when Enter continues a list inside a quote', () => {
    const doc = '> - item  \n> - next'
    expect(press(doc, 10, 'Enter').doc).toBe('> - item  \n> - \n> - next')
  })

  it('keeps a hard break when Enter continues a list or a paragraph', () => {
    expect(press('- item  \n- next', 8, 'Enter').doc).toBe('- item  \n- \n- next')
    expect(press('one  \ntwo', 5, 'Enter').doc).toBe('one  \n\ntwo')
    expect(press('one  \ntwo', 2, 'Enter').doc).toBe('on\ne  \ntwo')
  })

  it('still ends a quote the usual way on an empty quoted line', () => {
    expect(press('> quote\n> ', 10, 'Enter').doc).toBe('> quote\n>\n> ')
  })

  it('keeps hard breaks on neighbouring lines when indenting or formatting', () => {
    expect(press('- item  \n- next', 3, 'Tab').doc).toBe('  - item  \n- next')
    cleanups.push(installDom())
    const { view } = createEditor('a  \nb  \nc', [inklineKeymap, livePreview])
    view.dispatch({ selection: { anchor: 4, head: 5 } })
    runSourceCommand(view, 'bold')
    expect(view.state.doc.toString()).toBe('a  \n**b**  \nc')
    view.destroy()
  })
})

function createDocument(text: string, eol: vscode.EndOfLine): vscode.TextDocument {
  return {
    uri: vscode.Uri.file('/workspace/notes.md'),
    version: 1,
    eol,
    getText: () => text,
    positionAt: (offset: number) => {
      const before = text.slice(0, offset).split('\n')
      return new vscode.Position(before.length - 1, before[before.length - 1].length)
    },
  } as unknown as vscode.TextDocument
}

function createHost(overrides: Partial<SessionHost>): SessionHost {
  return {
    postMessage: vi.fn(),
    applyEdit: vi.fn().mockResolvedValue(true),
    resolveImage: vi.fn(),
    openNative: vi.fn(),
    insertImage: vi.fn(),
    openLink: vi.fn().mockResolvedValue(true),
    ...overrides,
  }
}

describe('CRLF files', () => {
  const file = 'Title  \r\n\r\none\r\ntwo  \r\nthree\r\n'

  it('turns a one-word edit into a one-word change, with every line ending kept', async () => {
    const edits: { range: vscode.Range; text: string }[] = []
    const host = createHost({
      applyEdit: vi.fn().mockImplementation(async (edit: vscode.WorkspaceEdit) => {
        edits.push(...(edit as unknown as { edits: { range: vscode.Range; text: string }[] }).edits)
        return true
      }),
    })
    const session = new DocumentSession(createDocument(file, vscode.EndOfLine.CRLF), host)
    // The webview edits LF text: "one" becomes "one more".
    await session.handleMessage({ type: 'replaceDocument', baseVersion: 1, markdown: 'Title  \n\none more\ntwo  \nthree\n' })
    expect(edits).toHaveLength(1)
    expect(edits[0].text).toBe(' more')
    expect(edits[0].range.start).toEqual(new vscode.Position(2, 3))
    expect(edits[0].range.end).toEqual(new vscode.Position(2, 3))
  })

  it('writes new lines with the file\'s own line ending', async () => {
    const edits: { text: string }[] = []
    const host = createHost({
      applyEdit: vi.fn().mockImplementation(async (edit: vscode.WorkspaceEdit) => {
        edits.push(...(edit as unknown as { edits: { text: string }[] }).edits)
        return true
      }),
    })
    const session = new DocumentSession(createDocument(file, vscode.EndOfLine.CRLF), host)
    await session.handleMessage({ type: 'replaceDocument', baseVersion: 1, markdown: 'Title  \n\none\nnew\ntwo  \nthree\n' })
    expect(edits.map((edit) => edit.text).join('')).toBe('new\r\n')
  })

  it('shows the editor the text with its trailing spaces intact', () => {
    const postMessage = vi.fn()
    const session = new DocumentSession(createDocument(file, vscode.EndOfLine.CRLF), createHost({ postMessage }))
    session.initialize()
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ markdown: 'Title  \n\none\ntwo  \nthree\n' }))
  })
})
