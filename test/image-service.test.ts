import { describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'
import { insertImage, type ImageServiceHost } from '../src/image-service'

describe('image service', () => {
  it('copies an image and returns a relative Markdown reference', async () => {
    const host: ImageServiceHost = {
      pickImage: vi.fn().mockResolvedValue([vscode.Uri.file('/tmp/photo.png')]),
      copy: vi.fn().mockResolvedValue(undefined),
      createDirectory: vi.fn().mockResolvedValue(undefined),
      getWorkspaceFolder: () => ({ uri: vscode.Uri.file('/workspace') } as vscode.WorkspaceFolder),
      getConfiguration: () => '.inkline-assets',
    }
    const document = { uri: vscode.Uri.file('/workspace/essay.md') } as vscode.TextDocument
    const result = await insertImage(document, host)
    expect(result?.markdown).toBe('![photo](./.inkline-assets/photo.png)')
    expect(host.copy).toHaveBeenCalledOnce()
  })
})
