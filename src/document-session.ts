import * as vscode from 'vscode'
import {
  isWebviewToHostMessage,
  type HostToWebviewMessage,
  type WebviewToHostMessage,
} from './protocol'
import { diffRange } from './text-diff'

export interface SessionHost {
  postMessage(message: HostToWebviewMessage): Thenable<boolean> | undefined
  applyEdit(edit: vscode.WorkspaceEdit): Thenable<boolean>
  resolveImage(document: vscode.TextDocument, source: string, requestId: string): Thenable<void>
  openNative(document: vscode.TextDocument): Thenable<void>
  insertImage(document: vscode.TextDocument): Thenable<void>
  openLink(url: string): Thenable<boolean>
}

/** How long a save waits for the webview to hand over its debounced edit. */
const FLUSH_TIMEOUT_MS = 1500

/** The webview always works in `\n`; the document keeps whatever it had. */
function toEditorText(text: string): string {
  return text.replace(/\r\n/gu, '\n').replace(/\r/gu, '\n')
}

function toDocumentText(text: string, eol: vscode.EndOfLine): string {
  return eol === vscode.EndOfLine.CRLF ? text.replace(/\n/gu, '\r\n') : text
}

export class DocumentSession implements vscode.Disposable {
  private disposed = false
  private applyingFromWebview = false
  private currentDocument: vscode.TextDocument
  private lastWebviewContent: string
  /** Messages are handled one at a time so a save never observes a half-applied edit. */
  private queue: Promise<void> = Promise.resolve()
  private pendingFlush: { requestId: string; resolve: () => void } | undefined
  private flushCounter = 0

  constructor(
    document: vscode.TextDocument,
    private readonly host: SessionHost,
  ) {
    this.currentDocument = document
    this.lastWebviewContent = toEditorText(document.getText())
  }

  get document(): vscode.TextDocument {
    return this.currentDocument
  }

  initialize(): void {
    this.lastWebviewContent = toEditorText(this.currentDocument.getText())
    this.post({
      type: 'initialize',
      documentVersion: this.currentDocument.version,
      markdown: this.lastWebviewContent,
    })
  }

  /**
   * Asks the webview to hand over any debounced edit and waits for it to land.
   * Without this a save started within the webview's debounce window writes the
   * previous revision to disk and leaves the document dirty immediately after.
   */
  flushPendingEdits(): Promise<void> {
    if (this.disposed) return Promise.resolve()
    this.pendingFlush?.resolve()
    const requestId = `flush-${(this.flushCounter += 1)}`
    return new Promise<void>((resolve) => {
      let settled = false
      const finish = () => {
        if (settled) return
        settled = true
        clearTimeout(timer)
        if (this.pendingFlush?.requestId === requestId) this.pendingFlush = undefined
        // Let any edit that arrived with the flush finish applying.
        void this.queue.then(resolve, resolve)
      }
      const timer = setTimeout(finish, FLUSH_TIMEOUT_MS)
      this.pendingFlush = { requestId, resolve: finish }
      this.post({ type: 'flushEdits', requestId })
    })
  }

  handleMessage(value: unknown): Promise<void> {
    if (this.disposed || !isWebviewToHostMessage(value)) return Promise.resolve()
    const next = this.queue.then(() => this.dispatchMessage(value as WebviewToHostMessage))
    this.queue = next.catch(() => undefined)
    return next
  }

  private async dispatchMessage(message: WebviewToHostMessage): Promise<void> {
    switch (message.type) {
      case 'ready':
      case 'insertImage':
        return
      case 'editsFlushed':
        if (this.pendingFlush?.requestId === message.requestId) this.pendingFlush.resolve()
        return
      case 'replaceDocument':
        await this.replaceDocument(message)
        return
      case 'resolveImage':
        await this.host.resolveImage(this.currentDocument, message.source, message.requestId)
        return
      case 'openNative':
        await this.host.openNative(this.currentDocument)
        return
      case 'openLink':
        await this.host.openLink(message.url)
        return
    }
  }

  onDocumentChanged(document: vscode.TextDocument): void {
    if (this.disposed || document.uri.toString() !== this.currentDocument.uri.toString()) return

    this.currentDocument = document
    const markdown = toEditorText(document.getText())
    if (this.applyingFromWebview || markdown === this.lastWebviewContent) {
      this.post({ type: 'versionSync', documentVersion: document.version })
      return
    }

    this.lastWebviewContent = markdown
    this.post({
      type: 'documentChanged',
      documentVersion: document.version,
      markdown,
      reason: 'external',
    })
  }

  onDocumentSaved(_document: vscode.TextDocument): void {
    return
  }

  private async replaceDocument(message: Extract<WebviewToHostMessage, { type: 'replaceDocument' }>): Promise<void> {
    const currentMarkdown = toEditorText(this.currentDocument.getText())
    if (message.markdown === currentMarkdown) {
      this.lastWebviewContent = message.markdown
      this.post({ type: 'versionSync', documentVersion: this.currentDocument.version })
      return
    }

    const stale = message.baseVersion !== this.currentDocument.version
    const changedElsewhere = currentMarkdown !== this.lastWebviewContent
    if (stale && changedElsewhere) {
      this.post({
        type: 'documentChanged',
        documentVersion: this.currentDocument.version,
        markdown: currentMarkdown,
        reason: 'external',
      })
      return
    }

    const span = diffRange(currentMarkdown, message.markdown)
    const eol = this.currentDocument.eol ?? vscode.EndOfLine.LF
    const edit = new vscode.WorkspaceEdit()
    edit.replace(
      this.currentDocument.uri,
      new vscode.Range(
        this.currentDocument.positionAt(this.toDocumentOffset(currentMarkdown, span.from, eol)),
        this.currentDocument.positionAt(this.toDocumentOffset(currentMarkdown, span.to, eol)),
      ),
      toDocumentText(span.insert, eol),
    )

    const previous = this.lastWebviewContent
    this.applyingFromWebview = true
    this.lastWebviewContent = message.markdown
    let applied = false
    try {
      applied = await this.host.applyEdit(edit)
    } finally {
      this.applyingFromWebview = false
    }
    if (!applied) {
      this.lastWebviewContent = previous
      this.post({ type: 'status', status: 'error', message: 'Inkline could not apply that edit.' })
      return
    }

    this.currentDocument = await vscode.workspace.openTextDocument(this.currentDocument.uri)
    this.post({ type: 'versionSync', documentVersion: this.currentDocument.version })
  }

  /** Offsets differ from the webview's when the file on disk uses CRLF. */
  private toDocumentOffset(editorText: string, offset: number, eol: vscode.EndOfLine): number {
    if (eol !== vscode.EndOfLine.CRLF) return offset
    let newlines = 0
    for (let index = 0; index < offset; index += 1) if (editorText.charCodeAt(index) === 10) newlines += 1
    return offset + newlines
  }

  private post(message: HostToWebviewMessage): void {
    if (!this.disposed) this.host.postMessage(message)
  }

  dispose(): void {
    this.disposed = true
    this.pendingFlush?.resolve()
    this.pendingFlush = undefined
  }
}
