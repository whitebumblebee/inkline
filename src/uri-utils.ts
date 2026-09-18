import * as path from 'node:path'
import * as vscode from 'vscode'

export function isPathInside(parent: vscode.Uri, candidate: vscode.Uri): boolean {
  const parentPath = path.resolve(parent.fsPath)
  const candidatePath = path.resolve(candidate.fsPath)
  const relative = path.relative(parentPath, candidatePath)
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative))
}

export function relativeMarkdownPath(from: vscode.Uri, to: vscode.Uri): string {
  const relative = path.relative(path.dirname(from.fsPath), to.fsPath)
  const normalized = relative.split(path.sep).join('/')
  return normalized.startsWith('./') || normalized.startsWith('../') ? normalized : `./${normalized}`
}

export function resolveWorkspacePath(workspaceRoot: vscode.Uri, relativePath: string): vscode.Uri | undefined {
  if (!relativePath || path.isAbsolute(relativePath)) return undefined
  const candidate = vscode.Uri.file(path.resolve(workspaceRoot.fsPath, relativePath))
  return isPathInside(workspaceRoot, candidate) ? candidate : undefined
}
