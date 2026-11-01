import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { DocumentSession, type SessionHost } from '../src/document-session'
import { EditSync } from '../webview/src/edit-sync'

describe('what the editor sends to VS Code', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('sends nothing before the file is loaded, whatever happens', () => {
    const send = vi.fn()
    const sync = new EditSync(send)
    sync.flush()
    sync.edit('')
    vi.runAllTimers()
    sync.flush()
    expect(send).not.toHaveBeenCalled()
  })

  it('sends nothing on a blur or a save when nothing was edited', () => {
    const send = vi.fn()
    const sync = new EditSync(send)
    sync.load('500 lines of notes', 3)
    sync.flush()
    sync.external('changed on disk', 4)
    sync.flush()
    expect(send).not.toHaveBeenCalled()
  })

  it('sends an edit once, after a pause or at once on a flush', () => {
    const send = vi.fn()
    const sync = new EditSync(send)
    sync.load('Hello', 3)
    sync.edit('Hello!')
    vi.advanceTimersByTime(300)
    expect(send).toHaveBeenCalledWith({ type: 'replaceDocument', baseVersion: 3, markdown: 'Hello!' })
    sync.synced(4)
    sync.edit('Hello!!')
    sync.flush()
    expect(send).toHaveBeenLastCalledWith({ type: 'replaceDocument', baseVersion: 4, markdown: 'Hello!!' })
    vi.runAllTimers()
    sync.flush()
    expect(send).toHaveBeenCalledTimes(2)
  })
})

describe('what VS Code accepts from the editor', () => {
  const FILE = Array.from({ length: 500 }, (_, i) => `Line ${i + 1}`).join('\n')

  function session() {
    const applyEdit = vi.fn().mockResolvedValue(true)
    const host: SessionHost = {
      postMessage: vi.fn(),
      applyEdit,
      resolveImage: vi.fn(),
      openNative: vi.fn(),
      insertImage: vi.fn(),
      openLink: vi.fn().mockResolvedValue(true),
    }
    const document = {
      uri: vscode.Uri.file('/notes/x.md'),
      version: 7,
      eol: vscode.EndOfLine.LF,
      getText: () => FILE,
      positionAt: (offset: number) => {
        const before = FILE.slice(0, offset).split('\n')
        return new vscode.Position(before.length - 1, before[before.length - 1].length)
      },
    } as unknown as vscode.TextDocument
    return { session: new DocumentSession(document, host), applyEdit }
  }

  it('ignores an editor that has not been given the file yet: reopening must not empty it', async () => {
    const { session: s, applyEdit } = session()
    await s.handleMessage({ type: 'replaceDocument', baseVersion: 0, markdown: '' })
    expect(applyEdit).not.toHaveBeenCalled()
  })

  it('ignores an edit based on an older version than the editor was given', async () => {
    const { session: s, applyEdit } = session()
    s.initialize()
    await s.handleMessage({ type: 'replaceDocument', baseVersion: 0, markdown: '' })
    await s.handleMessage({ type: 'replaceDocument', baseVersion: 6, markdown: 'stale' })
    expect(applyEdit).not.toHaveBeenCalled()
  })

  it('applies a real edit once the editor has the file', async () => {
    const { session: s, applyEdit } = session()
    s.initialize()
    await s.handleMessage({ type: 'replaceDocument', baseVersion: 7, markdown: FILE + '\nLine 501' })
    expect(applyEdit).toHaveBeenCalledTimes(1)
  })
})
