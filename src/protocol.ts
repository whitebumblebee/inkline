export type HostToWebviewMessage =
  | {
      type: 'initialize'
      documentVersion: number
      markdown: string
    }
  | {
      type: 'documentChanged'
      documentVersion: number
      markdown: string
      reason: 'external'
    }
  | { type: 'versionSync'; documentVersion: number }
  | {
      type: 'imageResolved'
      requestId: string
      source: string
      uri: string
    }
  | {
      type: 'status'
      status: 'saved' | 'saving' | 'dirty' | 'resynced' | 'error'
      message?: string
    }
  | { type: 'error'; message: string }
  /** Asks the webview to push any debounced edit immediately, before a save. */
  | { type: 'flushEdits'; requestId: string }

export type WebviewToHostMessage =
  | { type: 'ready' }
  | {
      type: 'replaceDocument'
      baseVersion: number
      markdown: string
    }
  | { type: 'insertImage'; requestId: string }
  | { type: 'resolveImage'; requestId: string; source: string }
  | { type: 'openNative' }
  | { type: 'openLink'; url: string }
  | { type: 'editsFlushed'; requestId: string }

export function isWebviewToHostMessage(value: unknown): value is WebviewToHostMessage {
  if (!value || typeof value !== 'object' || !('type' in value)) return false
  const type = (value as { type?: unknown }).type
  return (
    type === 'ready' ||
    type === 'replaceDocument' ||
    type === 'insertImage' ||
    type === 'resolveImage' ||
    type === 'openNative' ||
    type === 'openLink' ||
    type === 'editsFlushed'
  )
}
