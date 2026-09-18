import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { isPathInside, relativeMarkdownPath, resolveWorkspacePath } from '../src/uri-utils'

describe('URI utilities', () => {
  const root = vscode.Uri.file('/workspace')

  it('keeps relative paths inside the workspace', () => {
    expect(resolveWorkspacePath(root, '.inkline-assets/image.png')?.fsPath).toBe('/workspace/.inkline-assets/image.png')
    expect(resolveWorkspacePath(root, '../outside.png')).toBeUndefined()
  })

  it('creates portable Markdown paths', () => {
    const document = vscode.Uri.file('/workspace/notes/essay.md')
    const image = vscode.Uri.file('/workspace/.inkline-assets/photo.png')
    expect(relativeMarkdownPath(document, image)).toBe('../.inkline-assets/photo.png')
    expect(isPathInside(root, image)).toBe(true)
  })
})
