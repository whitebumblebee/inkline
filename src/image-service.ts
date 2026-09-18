import * as path from 'node:path'
import * as vscode from 'vscode'
import { isPathInside, relativeMarkdownPath, resolveWorkspacePath } from './uri-utils'

const imageExtensions = new Set(['.avif', '.gif', '.jpeg', '.jpg', '.png', '.svg', '.webp'])

export interface ImageServiceHost {
  pickImage(): Thenable<vscode.Uri[] | undefined>
  copy(source: vscode.Uri, target: vscode.Uri): Thenable<void>
  createDirectory(uri: vscode.Uri): Thenable<void>
  getWorkspaceFolder(uri: vscode.Uri): vscode.WorkspaceFolder | undefined
  getConfiguration(): string
}

export async function insertImage(
  document: vscode.TextDocument,
  host: ImageServiceHost,
): Promise<{ markdown: string; source: string } | undefined> {
  const picked = await host.pickImage()
  const source = picked?.[0]
  if (!source) return undefined
  if (!imageExtensions.has(path.extname(source.fsPath).toLowerCase())) {
    void vscode.window.showErrorMessage('Inkline only supports common image files.')
    return undefined
  }

  const workspaceFolder = host.getWorkspaceFolder(document.uri)
  const root = workspaceFolder?.uri ?? vscode.Uri.file(path.dirname(document.uri.fsPath))
  const relativeDirectory = host.getConfiguration().trim() || '.inkline-assets'
  const assetDirectory = resolveWorkspacePath(root, relativeDirectory)
  if (!assetDirectory || !isPathInside(root, assetDirectory)) {
    void vscode.window.showErrorMessage('Inkline assets must stay inside the workspace.')
    return undefined
  }

  await host.createDirectory(assetDirectory)
  const fileName = path.basename(source.fsPath)
  const target = vscode.Uri.joinPath(assetDirectory, fileName)
  await host.copy(source, target)
  return {
    markdown: `![${path.parse(fileName).name}](${relativeMarkdownPath(document.uri, target)})`,
    source: relativeMarkdownPath(document.uri, target),
  }
}

export const vscodeImageService: ImageServiceHost = {
  pickImage: () => vscode.window.showOpenDialog({ canSelectMany: false, openLabel: 'Insert image', filters: { Images: [...imageExtensions].map((extension) => extension.slice(1)) } }),
  copy: (source, target) => vscode.workspace.fs.copy(source, target, { overwrite: false }),
  createDirectory: (uri) => vscode.workspace.fs.createDirectory(uri),
  getWorkspaceFolder: (uri) => vscode.workspace.getWorkspaceFolder(uri),
  getConfiguration: () => vscode.workspace.getConfiguration('inkline').get('assetsDirectory', '.inkline-assets'),
}
