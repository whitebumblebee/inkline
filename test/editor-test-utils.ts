import { JSDOM } from 'jsdom'
import { EditorState, type Extension } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorView } from '@codemirror/view'
import { GFM } from '@lezer/markdown'

export function installDom(): () => void {
  const dom = new JSDOM('<!doctype html><html><body></body></html>')
  const previousWindow = globalThis.window
  const previousDocument = globalThis.document
  const previousNavigator = globalThis.navigator
  const previousWindowConstructor = globalThis.Window
  const previousMutationObserver = globalThis.MutationObserver
  const previousAnimationFrame = globalThis.requestAnimationFrame
  const previousCancelAnimationFrame = globalThis.cancelAnimationFrame
  dom.window.requestAnimationFrame = (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0) as unknown as number
  dom.window.cancelAnimationFrame = (handle: number) => clearTimeout(handle)
  Object.defineProperties(globalThis, {
    window: { configurable: true, value: dom.window },
    document: { configurable: true, value: dom.window.document },
    Window: { configurable: true, value: dom.window.Window },
    navigator: { configurable: true, value: dom.window.navigator },
    MutationObserver: { configurable: true, value: dom.window.MutationObserver },
    requestAnimationFrame: {
      configurable: true,
      value: (callback: FrameRequestCallback) => setTimeout(() => callback(Date.now()), 0),
    },
    cancelAnimationFrame: { configurable: true, value: (handle: number) => clearTimeout(handle) },
  })
  return () => {
    Object.defineProperties(globalThis, {
      window: { configurable: true, value: previousWindow },
      document: { configurable: true, value: previousDocument },
      Window: { configurable: true, value: previousWindowConstructor },
      navigator: { configurable: true, value: previousNavigator },
      MutationObserver: { configurable: true, value: previousMutationObserver },
      requestAnimationFrame: { configurable: true, value: previousAnimationFrame },
      cancelAnimationFrame: { configurable: true, value: previousCancelAnimationFrame },
    })
    dom.window.close()
  }
}

export function createEditor(doc: string, extensions: Extension[] = []): { view: EditorView; host: HTMLDivElement } {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc,
      extensions: [
        markdown({ base: markdownLanguage, extensions: [GFM], addKeymap: true }),
        ...extensions,
      ],
    }),
  })
  return { view, host }
}
