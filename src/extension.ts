import * as vscode from 'vscode'
import { MarkdownEditorProvider, viewType } from './markdown-editor-provider'

export function activate(context: vscode.ExtensionContext): void {
  const provider = new MarkdownEditorProvider(context)
  context.subscriptions.push(
    provider,
    vscode.window.registerCustomEditorProvider(viewType, provider, {
      supportsMultipleEditorsPerDocument: false,
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('inkline.open', async (resource?: vscode.Uri) => {
      const uri = resource ?? vscode.window.activeTextEditor?.document.uri
      if (uri) await vscode.commands.executeCommand('vscode.openWith', uri, viewType)
    }),
    vscode.commands.registerCommand('inkline.openNative', () => provider.openNative()),
    // Undo/redo inside Inkline belong to the editor in the webview, which always
    // handles them. VS Code forwards key events from a webview to the workbench
    // for keybinding resolution, and the workbench's own undo stack holds the
    // document reload that happens when a file changes on disk - so letting it
    // run would revert someone else's edit to the file. Binding the chords to a
    // command that does nothing keeps that stack out of it.
    vscode.commands.registerCommand('inkline.handledByEditor', () => undefined),
    vscode.commands.registerCommand('inkline.insertImage', () => provider.insertImage()),
  )
}

export function deactivate(): void {}
