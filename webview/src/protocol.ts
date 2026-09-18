import type { HostToWebviewMessage, WebviewToHostMessage } from '../../src/protocol'

export type { HostToWebviewMessage, WebviewToHostMessage }

export function postMessage(message: WebviewToHostMessage): void {
  // No host is attached when the editor runs standalone or under test.
  if (typeof window === 'undefined' || !window.inkline) return
  window.inkline.postMessage(message)
}

declare global {
  interface Window {
    acquireVsCodeApi: () => { postMessage(message: WebviewToHostMessage): void }
    inkline: { postMessage(message: WebviewToHostMessage): void }
  }
}

export function initializeProtocol(): void {
  if (window.inkline) return
  window.inkline = window.acquireVsCodeApi
    ? window.acquireVsCodeApi()
    : { postMessage: () => undefined }
}
