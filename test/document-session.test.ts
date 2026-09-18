import { describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { DocumentSession, type SessionHost } from '../src/document-session'

function createDocument(text: string, version = 1, eol = vscode.EndOfLine.LF): vscode.TextDocument {
  return {
    uri: vscode.Uri.file('/workspace/essay.md'),
    version,
    eol,
    lineCount: text.split('\n').length,
    lineAt: (line: number) => ({ text: text.split('\n')[line] }) as vscode.TextLine,
    getText: () => text,
    positionAt: (offset: number) => {
      const before = text.slice(0, offset).split('\n')
      return new vscode.Position(before.length - 1, before[before.length - 1].length)
    },
  } as unknown as vscode.TextDocument
}

function createMockHost(overrides: Partial<SessionHost> = {}): SessionHost {
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

describe('document session', () => {
  it('applies replacements without flipping saved status', async () => {
    const postMessage = vi.fn()
    const applyEdit = vi.fn().mockResolvedValue(true)
    const host = createMockHost({ postMessage, applyEdit })
    const session = new DocumentSession(createDocument('Before'), host)
    await session.handleMessage({ type: 'replaceDocument', baseVersion: 1, markdown: 'After' })
    expect(applyEdit).toHaveBeenCalledOnce()
    expect(postMessage).toHaveBeenCalledWith({ type: 'versionSync', documentVersion: 2 })
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'status', status: 'dirty' }))
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'status', status: 'saved' }))
  })

  it('applies later keystrokes even when the document version is stale', async () => {
    const postMessage = vi.fn()
    const applyEdit = vi.fn().mockResolvedValue(true)
    const host = createMockHost({ postMessage, applyEdit })
    const session = new DocumentSession(createDocument('Hello', 2), host)
    await session.handleMessage({ type: 'replaceDocument', baseVersion: 1, markdown: 'Hello\n' })
    expect(applyEdit).toHaveBeenCalledOnce()
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'documentChanged' }))
  })

  it('syncs version without rewriting webview content for host echoes', () => {
    const postMessage = vi.fn()
    const host = createMockHost({ postMessage })
    const session = new DocumentSession(createDocument('Same text', 3), host)
    session.onDocumentChanged(createDocument('Same text', 4))
    expect(postMessage).toHaveBeenCalledWith({ type: 'versionSync', documentVersion: 4 })
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'documentChanged' }))
  })

  it('marks pending content before applying so host echoes are not treated as external', async () => {
    const postMessage = vi.fn()
    let session: DocumentSession
    const host = createMockHost({
      postMessage,
      applyEdit: vi.fn().mockImplementation(async () => {
        session.onDocumentChanged(createDocument('After', 2))
        return true
      }),
    })
    session = new DocumentSession(createDocument('Before'), host)
    await session.handleMessage({ type: 'replaceDocument', baseVersion: 1, markdown: 'After' })
    expect(postMessage).not.toHaveBeenCalledWith(expect.objectContaining({ type: 'documentChanged' }))
  })

  it('delegates openLink message to the host', async () => {
    const openLink = vi.fn().mockResolvedValue(true)
    const host = createMockHost({ openLink })
    const session = new DocumentSession(createDocument('Text'), host)

    await session.handleMessage({ type: 'openLink', url: 'https://example.com' })
    expect(openLink).toHaveBeenCalledWith('https://example.com')
  })
})

describe('document session edits', () => {
  it('replaces only the span that changed, not the whole document', async () => {
    let captured: vscode.WorkspaceEdit | undefined
    const applyEdit = vi.fn().mockImplementation(async (edit: vscode.WorkspaceEdit) => {
      captured = edit
      return true
    })
    const host = createMockHost({ applyEdit })
    const session = new DocumentSession(createDocument('line one\nline two\nline three'), host)
    await session.handleMessage({
      type: 'replaceDocument',
      baseVersion: 1,
      markdown: 'line one\nline TWO\nline three',
    })
    const edits = (captured as unknown as { edits: { range: unknown; text: string }[] }).edits
    expect(edits).toHaveLength(1)
    expect(edits[0].text).toBe('TWO')
    const range = edits[0].range as vscode.Range
    expect(range.start).toMatchObject({ line: 1, character: 5 })
    expect(range.end).toMatchObject({ line: 1, character: 8 })
  })

  it('hands over a debounced edit before a save and waits for it', async () => {
    const posted: unknown[] = []
    const host = createMockHost({ postMessage: vi.fn((message) => { posted.push(message); return undefined }) })
    const session = new DocumentSession(createDocument('Before'), host)

    const flushed = session.flushPendingEdits()
    const request = posted.find((m): m is { type: string; requestId: string } =>
      typeof m === 'object' && m !== null && (m as { type?: string }).type === 'flushEdits')
    expect(request).toBeDefined()

    await session.handleMessage({ type: 'replaceDocument', baseVersion: 1, markdown: 'Before and after' })
    await session.handleMessage({ type: 'editsFlushed', requestId: request!.requestId })
    await flushed
    expect(host.applyEdit).toHaveBeenCalledOnce()
  })

  it('does not block a save forever when the webview never answers', async () => {
    const host = createMockHost()
    const session = new DocumentSession(createDocument('Before'), host)
    const flushed = session.flushPendingEdits()
    session.dispose()
    await expect(flushed).resolves.toBeUndefined()
  })

  it('writes back CRLF documents without rewriting their line endings', async () => {
    let captured: vscode.WorkspaceEdit | undefined
    const applyEdit = vi.fn().mockImplementation(async (edit: vscode.WorkspaceEdit) => {
      captured = edit
      return true
    })
    const host = createMockHost({ applyEdit })
    const session = new DocumentSession(createDocument('one\r\ntwo\r\nthree', 1, vscode.EndOfLine.CRLF), host)
    // the webview only ever sees and sends "\n"
    await session.handleMessage({ type: 'replaceDocument', baseVersion: 1, markdown: 'one\ntwo\nthree\nfour' })
    const edits = (captured as unknown as { edits: { text: string }[] }).edits
    expect(edits[0].text).toBe('\r\nfour')
  })

  it('sends the webview LF text even when the file uses CRLF', () => {
    const postMessage = vi.fn()
    const host = createMockHost({ postMessage })
    const session = new DocumentSession(createDocument('a\r\nb', 1, vscode.EndOfLine.CRLF), host)
    session.initialize()
    expect(postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: 'initialize', markdown: 'a\nb' }))
  })
})
