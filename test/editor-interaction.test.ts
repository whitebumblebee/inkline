import { afterEach, describe, expect, it, vi } from 'vitest'
import { livePreview } from '../webview/src/editor/live-preview'
import { runSourceCommand } from '../webview/src/editor/editor-commands'
import { installDom, createEditor } from './editor-test-utils'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

describe('editor interactions', () => {
  it('preserves the selected range while applying local formatting', () => {
    cleanups.push(installDom())
    const { view } = createEditor('hello world')
    view.dispatch({ selection: { anchor: 6, head: 11 } })

    runSourceCommand(view, 'bold')

    expect(view.state.doc.toString()).toBe('hello **world**')
    expect(view.state.selection.main.from).toBe(8)
    expect(view.state.selection.main.to).toBe(13)
    view.destroy()
  })

  it('keeps fence source text directly addressable in the editor view', () => {
    cleanups.push(installDom())
    const text = '```js\nconst value = 1\n```\nafter'
    const { view } = createEditor(text)
    expect(view.state.doc.toString()).toBe(text)
    expect(view.dom.textContent).toContain('```js')
    expect([...view.dom.querySelectorAll('.cm-line')].map((line) => line.textContent)).toContain('```')
    expect([...view.dom.querySelectorAll('.cm-line')].map((line) => line.textContent)).toContain('after')
    view.destroy()
  })

  it('supports ordinary CodeMirror key handling inside a fence', () => {
    cleanups.push(installDom())
    const text = '```js\nconst value = 1\n```\nafter'
    const { view } = createEditor(text, [livePreview])
    const position = text.indexOf('value')
    view.dispatch({ selection: { anchor: position } })
    view.dispatch({ changes: { from: position, insert: 'answer' }, selection: { anchor: position + 6 } })
    expect(view.state.doc.toString()).toContain('const answervalue = 1')
    view.destroy()
  })

  it('maintains concealed source syntax without disruptive layout classes during mouse events', () => {
    cleanups.push(installDom())
    const { view } = createEditor('## Heading\n\n```js\nvalue\n```', [livePreview])
    const editor = view.dom
    const down = editor.ownerDocument.defaultView!.MouseEvent
      ? new editor.ownerDocument.defaultView!.MouseEvent('mousedown', { bubbles: true, clientX: 1, clientY: 1 })
      : editor.ownerDocument.createEvent('MouseEvent')
    editor.dispatchEvent(down)
    // The fence lines are wholly concealed, so each is a strut.
    expect(editor.querySelectorAll('.inkline-line-strut').length).toBe(2)

    editor.ownerDocument.defaultView!.dispatchEvent(new editor.ownerDocument.defaultView!.MouseEvent('mouseup', { bubbles: true }))
    view.destroy()
  })

  it('renders the live link arrow without replacing link source', () => {
    cleanups.push(installDom())
    const text = '[Inkline](https://example.com) out'
    const { view } = createEditor(text, [livePreview])
    view.dispatch({ selection: { anchor: text.length } })
    const icon = view.dom.querySelector('.inkline-live-link-icon')
    expect(icon?.textContent).toBe('↗')
    expect(icon?.getAttribute('data-url')).toBe('https://example.com')
    expect(view.state.doc.toString()).toBe(text)
    view.destroy()
  })

  it('opens a link when its live preview arrow is clicked', () => {
    cleanups.push(installDom())
    const postMessage = vi.fn()
    Object.defineProperty(window, 'inkline', { configurable: true, value: { postMessage } })
    const text = '[Inkline](https://example.com) out'
    const { view } = createEditor(text, [livePreview])
    view.dispatch({ selection: { anchor: text.length } })
    const icon = view.dom.querySelector('.inkline-live-link-icon') as HTMLElement | null
    expect(icon).toBeTruthy()
    icon?.dispatchEvent(new window.MouseEvent('click', { bubbles: true }))
    expect(postMessage).toHaveBeenCalledWith({ type: 'openLink', url: 'https://example.com' })
    view.destroy()
  })

  it('keeps cursor and edit offsets addressable across Markdown markers', () => {
    cleanups.push(installDom())
    const text = '# Heading\n\n```js\nconst value = 1\n```\n\n**bold** and $x$'
    const { view } = createEditor(text, [livePreview])
    const positions = [
      0,
      1,
      2,
      text.indexOf('```'),
      text.indexOf('js'),
      text.indexOf('value'),
      text.lastIndexOf('```'),
      text.indexOf('**bold**') + 1,
      text.indexOf('$x$') + 1,
      text.length,
    ]

    for (const position of positions) {
      view.dispatch({ selection: { anchor: position } })
      expect(view.state.selection.main.from).toBe(position)
      expect(view.state.selection.main.to).toBe(position)
    }

    const editPosition = text.indexOf('Heading')
    view.dispatch({ selection: { anchor: editPosition } })
    view.dispatch({ changes: { from: editPosition, insert: 'New ' }, selection: { anchor: editPosition + 4 } })
    expect(view.state.doc.toString()).toBe(text.replace('Heading', 'New Heading'))
    view.destroy()
  })
})
