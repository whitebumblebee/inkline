import * as path from 'node:path'
import * as vscode from 'vscode'
import { DocumentSession, type SessionHost } from './document-session'
import { insertImage, vscodeImageService } from './image-service'
import type { HostToWebviewMessage } from './protocol'
import { isPathInside, resolveWorkspacePath } from './uri-utils'
import { resolveLink } from './link-target'
import { DEFAULT_THEME, THEMES, type Appearance } from './themes'
import { runThemePicker, type ThemeItem } from './theme-picker'

export const viewType = 'inkline.markdownEditor'

export class MarkdownEditorProvider implements vscode.CustomTextEditorProvider, vscode.Disposable {
  private readonly sessions = new Map<string, DocumentSession>()
  private readonly disposables: vscode.Disposable[] = []
  private activeSession: DocumentSession | undefined
  /** Which open tabs are in reading mode; the title-bar button shows the active tab's. */
  private readonly reading = new WeakMap<DocumentSession, boolean>()

  constructor(private readonly context: vscode.ExtensionContext) {
    this.disposables.push(
      vscode.workspace.onDidChangeTextDocument((event) => {
        this.sessions.get(event.document.uri.toString())?.onDocumentChanged(event.document)
      }),
      vscode.workspace.onDidSaveTextDocument((document) => {
        this.sessions.get(document.uri.toString())?.onDocumentSaved(document)
      }),
      // A save started inside the webview's debounce window would otherwise
      // write the previous revision and leave the document dirty straight after.
      vscode.workspace.onWillSaveTextDocument((event) => {
        const session = this.sessions.get(event.document.uri.toString())
        if (session) event.waitUntil(session.flushPendingEdits())
      }),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (event.affectsConfiguration('inkline.theme') || event.affectsConfiguration('inkline.appearance')) {
          const { theme, appearance } = themeSettings()
          this.showTheme(theme, appearance)
        }
      }),
    )
  }

  /** Shows a theme in every open Inkline tab. */
  private showTheme(theme: string, appearance: Appearance): void {
    for (const session of this.sessions.values()) session.showTheme(theme, appearance)
  }

  /**
   * Lists the themes and shows each one in the open Inkline tabs as it is
   * highlighted. Choosing one saves it; closing the list puts back the theme
   * that was set before.
   */
  chooseTheme(): void {
    const { theme: saved, appearance } = themeSettings()
    runThemePicker(
      vscode.window.createQuickPick<ThemeItem>(),
      saved,
      (theme) => this.showTheme(theme, appearance),
      (theme) => vscode.workspace.getConfiguration('inkline').update('theme', theme, vscode.ConfigurationTarget.Global),
    )
  }

  async resolveCustomTextEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
  ): Promise<void> {
    webviewPanel.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview'),
        ...(vscode.workspace.getWorkspaceFolder(document.uri)?.uri ? [vscode.workspace.getWorkspaceFolder(document.uri)!.uri] : []),
        vscode.Uri.file(path.dirname(document.uri.fsPath)),
      ],
    }
    webviewPanel.webview.html = this.getHtml(webviewPanel.webview)

    const key = document.uri.toString()
    const sessionHost: SessionHost = {
      postMessage: (message) => webviewPanel.webview.postMessage(message),
      applyEdit: (edit) => vscode.workspace.applyEdit(edit),
      resolveImage: (target, source, requestId) => this.resolveImage(target, source, requestId, webviewPanel.webview),
      openNative: (target) => vscode.commands.executeCommand('vscode.openWith', target.uri, 'default'),
      insertImage: () => this.insertImage(),
      openLink: async (rawUrl: string) => {
        try {
          const target = await resolveLink(
            rawUrl,
            path.dirname(document.uri.fsPath),
            vscode.workspace.getWorkspaceFolder(document.uri)?.uri.fsPath,
            async (filePath) => {
              try {
                await vscode.workspace.fs.stat(vscode.Uri.file(filePath))
                return true
              } catch {
                return false
              }
            },
          )
          if (target.kind === 'file') {
            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(target.path))
            return true
          }
          if (target.kind === 'external') return await vscode.env.openExternal(vscode.Uri.parse(target.url))
          if (target.kind === 'missing') {
            void vscode.window.showWarningMessage(`Inkline couldn't find ${vscode.workspace.asRelativePath(target.path)}.`)
          }
          return false
        } catch {
          return false
        }
      },
    }
    const session = new DocumentSession(document, sessionHost)
    this.sessions.set(key, session)
    this.activeSession = session
    this.updateReadingContext()

    let initialized = false
    const editorDisposables: vscode.Disposable[] = [
      webviewPanel.webview.onDidReceiveMessage(async (message) => {
        if (message?.type === 'ready' && !initialized) {
          initialized = true
          session.initialize()
        }
        if (message?.type === 'readingMode') {
          this.reading.set(session, message.reading === true)
          if (this.activeSession === session) this.updateReadingContext()
          return
        }
        await session.handleMessage(message)
      }),
      webviewPanel.onDidChangeViewState(() => {
        if (webviewPanel.active) {
          this.activeSession = session
          this.updateReadingContext()
        }
      }),
    ]

    webviewPanel.onDidDispose(() => {
      for (const disposable of editorDisposables) disposable.dispose()
      session.dispose()
      this.sessions.delete(key)
      if (this.activeSession === session) this.activeSession = undefined
    })
  }

  /** Lets the title bar show "read" or "edit" for the active tab. */
  private updateReadingContext(): void {
    const reading = this.activeSession ? this.reading.get(this.activeSession) === true : false
    void vscode.commands.executeCommand('setContext', 'inkline.readingMode', reading)
  }

  toggleReadingMode(): void {
    this.activeSession?.toggleReadingMode()
  }

  openNative(): Thenable<void> {
    const document = this.activeSession?.document
    return document ? vscode.commands.executeCommand('vscode.openWith', document.uri, 'default') : Promise.resolve()
  }

  async insertImage(): Promise<void> {
    const session = this.activeSession
    if (!session) return
    const result = await insertImage(session.document, vscodeImageService)
    if (!result) return
    const doc = session.document
    const edit = new vscode.WorkspaceEdit()
    const lastLine = doc.lineAt(doc.lineCount - 1)
    const appendText = (lastLine.text.length > 0 ? '\n\n' : '\n') + result.markdown + '\n'
    edit.insert(doc.uri, new vscode.Position(doc.lineCount - 1, lastLine.text.length), appendText)
    await vscode.workspace.applyEdit(edit)
  }

  private async resolveImage(
    document: vscode.TextDocument,
    source: string,
    requestId: string,
    webview: vscode.Webview,
  ): Promise<void> {
    if (/^(?:https?:|data:)/u.test(source)) return
    if (source.startsWith('/') || source.startsWith('\\')) return

    let decodedSource: string
    try {
      decodedSource = decodeURIComponent(source.split(/[?#]/u, 1)[0])
    } catch {
      return
    }

    const workspaceRoot = vscode.workspace.getWorkspaceFolder(document.uri)?.uri
    const root = workspaceRoot ?? vscode.Uri.file(path.dirname(document.uri.fsPath))
    const candidate = vscode.Uri.file(path.resolve(path.dirname(document.uri.fsPath), decodedSource))
    if (!isPathInside(root, candidate)) return

    const relativeToRoot = path.relative(root.fsPath, candidate.fsPath).split(path.sep).join('/')
    const approved = resolveWorkspacePath(root, relativeToRoot)
    if (!approved) return

    await webview.postMessage({
      type: 'imageResolved',
      requestId,
      source,
      uri: webview.asWebviewUri(approved).toString(),
    } satisfies HostToWebviewMessage)
  }

  private getHtml(webview: vscode.Webview): string {
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview', 'assets', 'index.js'))
    const nonce = getNonce()
    // The theme is written into the page so its first paint is already in the right colours.
    const { theme, appearance } = themeSettings()
    return `<!doctype html>
<html lang="en" data-inkline-theme="${theme}" data-inkline-appearance="${appearance}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}' ${webview.cspSource};">
<title>Inkline</title>
</head>
<body>
<div id="root"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`
  }

  dispose(): void {
    for (const session of this.sessions.values()) session.dispose()
    this.sessions.clear()
    this.activeSession = undefined
    for (const disposable of this.disposables) disposable.dispose()
  }
}

function getNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let value = ''
  for (let index = 0; index < 32; index += 1) value += alphabet[Math.floor(Math.random() * alphabet.length)]
  return value
}

/** The theme settings, limited to known values (they are written into the page). */
function themeSettings(): { theme: string; appearance: Appearance } {
  const config = vscode.workspace.getConfiguration('inkline')
  const theme = config.get<string>('theme', DEFAULT_THEME)
  const appearance = config.get<string>('appearance', 'auto')
  return {
    theme: THEMES.some((known) => known.id === theme) ? theme : DEFAULT_THEME,
    appearance: appearance === 'light' || appearance === 'dark' ? appearance : 'auto',
  }
}
