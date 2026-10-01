import { afterEach, describe, expect, it } from 'vitest'
import { hasVisibleContent, htmlPreview, openingCaret, sanitizeHtml } from '../webview/src/editor/html-preview'
import { livePreview, refreshLivePreview } from '../webview/src/editor/live-preview'
import { mergeConflicts } from '../webview/src/editor/merge-conflicts'
import { resetImageStore, setResolvedImage } from '../webview/src/editor/image-store'
import { createEditor, installDom } from './editor-test-utils'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
  resetImageStore()
})

function clean(html: string): string {
  cleanups.push(installDom())
  const host = document.createElement('div')
  host.appendChild(sanitizeHtml(html))
  return host.innerHTML
}

describe('HTML sanitising', () => {
  it('keeps presentational markup', () => {
    expect(clean('<p align="center"><b>Bold</b> and <kbd>Ctrl</kbd></p>')).toBe('<p align="center"><b>Bold</b> and <kbd>Ctrl</kbd></p>')
    expect(clean('<details open><summary>More</summary>Hidden</details>')).toBe('<details open=""><summary>More</summary>Hidden</details>')
  })

  it('drops anything that could run, load or restyle the editor, with its content', () => {
    expect(clean('<script>alert(1)</script>ok')).toBe('ok')
    expect(clean('<style>body{display:none}</style>ok')).toBe('ok')
    expect(clean('<base href="https://evil.example/">ok')).toBe('ok')
    expect(clean('<iframe src="https://x"></iframe><svg><script>1</script></svg>ok')).toBe('ok')
  })

  it('drops event handlers and inline styles', () => {
    expect(clean('<p onclick="x()" style="color:red" title="t">Hi</p>')).toBe('<p title="t">Hi</p>')
  })

  it('keeps the text of tags it does not know', () => {
    expect(clean('<custom-el>inside</custom-el>')).toBe('inside')
  })

  it('never gives a link an href, and only keeps safe targets', () => {
    expect(clean('<a href="https://x.dev">x</a>')).toBe('<a data-url="https://x.dev" title="https://x.dev">x</a>')
    expect(clean('<a href="docs/guide.md">guide</a>')).toBe('<a data-url="docs/guide.md" title="docs/guide.md">guide</a>')
    expect(clean('<a href="javascript:alert(1)">bad</a>')).toBe('<a>bad</a>')
  })

  it('shows images from the workspace, and alt text for anything else', () => {
    cleanups.push(installDom())
    setResolvedImage('media/logo.png', 'vscode-resource://logo.png')
    const host = document.createElement('div')
    host.appendChild(sanitizeHtml('<img src="media/logo.png" width="96" alt="Logo" onerror="x()"><img src="https://img.shields.io/x.svg" alt="Badge">'))
    expect(host.innerHTML).toBe('<img width="96" alt="Logo" src="vscode-resource://logo.png"><span class="inkline-html-image-missing">Badge</span>')
  })

  it('knows a lone wrapper tag shows nothing', () => {
    expect(hasVisibleContent('<div align="center">')).toBe(false)
    expect(hasVisibleContent('</div>')).toBe(false)
    expect(hasVisibleContent('<p align="center"><img src="a.png"></p>')).toBe(true)
    expect(hasVisibleContent('<p>Text</p>')).toBe(true)
  })

  it('knows a script or style block shows nothing, so it stays as source', () => {
    expect(hasVisibleContent("<script>alert('x')</script>")).toBe(false)
    expect(hasVisibleContent('<style>\nbody { color: red }\n</style>')).toBe(false)
    expect(hasVisibleContent('<input type="checkbox"> Done')).toBe(true)
    expect(hasVisibleContent('<meta name="x"><p>Shown</p>')).toBe(true)
  })
})

const README = '<p align="center">\n  <img src="media/logo.png" width="96" alt="Inkline logo">\n</p>\n\n# Inkline\n\nText.'

describe('HTML blocks in the editor', () => {
  it('draws a README header as HTML, and shows its source while the caret is in it', () => {
    cleanups.push(installDom())
    const { view } = createEditor(README, [livePreview, htmlPreview])
    view.dispatch({ selection: { anchor: README.length } })
    expect(view.dom.querySelector('.inkline-html-block p[align="center"]')).not.toBeNull()
    view.dispatch({ selection: { anchor: 5 } })
    expect(view.dom.querySelector('.inkline-html-block')).toBeNull()
    expect(view.state.doc.toString()).toBe(README)
    view.destroy()
  })

  it('shows the image once the host resolves it', () => {
    cleanups.push(installDom())
    const { view } = createEditor(README, [livePreview, htmlPreview])
    view.dispatch({ selection: { anchor: README.length } })
    expect(view.dom.querySelector('.inkline-html-block .inkline-html-image-missing')?.textContent).toBe('Inkline logo')
    setResolvedImage('media/logo.png', 'vscode-resource://logo.png')
    view.dispatch({ effects: refreshLivePreview.of(null) })
    expect(view.dom.querySelector('.inkline-html-block img')?.getAttribute('src')).toBe('vscode-resource://logo.png')
    view.destroy()
  })

  it('leaves wrapper tags, nested HTML and conflicts as source', () => {
    cleanups.push(installDom())
    const docs = [
      '<div align="center">\n\n# Title\n\n</div>\n\nEnd',
      '- item\n\n  <p>nested</p>\n\nEnd',
      '<<<<<<< HEAD\n<p>ours</p>\n=======\n<p>theirs</p>\n>>>>>>> x\n\nEnd',
    ]
    for (const doc of docs) {
      const { view } = createEditor(doc, [mergeConflicts, livePreview, htmlPreview])
      view.dispatch({ selection: { anchor: doc.length } })
      expect(view.dom.querySelector('.inkline-html-block')).toBeNull()
      view.destroy()
    }
  })

  it('opens the source when the drawn block is clicked', () => {
    cleanups.push(installDom())
    const { view } = createEditor(README, [livePreview, htmlPreview])
    view.dispatch({ selection: { anchor: README.length } })
    const block = view.dom.querySelector('.inkline-html-block')!
    block.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(view.state.selection.main.head).toBe(0)
    expect(view.dom.querySelector('.inkline-html-block')).toBeNull()
    view.destroy()
  })
})

describe('inline HTML tags', () => {
  function styles(doc: string, anchor: number): { hidden: string[]; styled: string[] } {
    cleanups.push(installDom())
    const { view } = createEditor(doc, [livePreview])
    view.dispatch({ selection: { anchor } })
    const result = {
      hidden: [...view.dom.querySelectorAll('.inkline-hidden-syntax')].map((node) => node.textContent ?? ''),
      styled: [...view.dom.querySelectorAll('[class*="inkline-html-"]')].map((node) => `${node.className}:${node.textContent}`),
    }
    view.destroy()
    return result
  }

  it('hides formatting tags and styles their text while the caret is elsewhere', () => {
    const doc = 'Press <kbd>Cmd</kbd>+<kbd>F</kbd>, H<sub>2</sub>O and <mark>this</mark>.\n\nEnd'
    const away = styles(doc, doc.length)
    expect(away.hidden).toEqual(['<kbd>', '</kbd>', '<kbd>', '</kbd>', '<sub>', '</sub>', '<mark>', '</mark>'])
    expect(away.styled).toEqual(['inkline-html-kbd:Cmd', 'inkline-html-kbd:F', 'inkline-html-sub:2', 'inkline-html-mark:this'])
    // The caret in the first <kbd> shows only that pair's tags.
    expect(styles(doc, 8).hidden).toEqual(['<kbd>', '</kbd>', '<sub>', '</sub>', '<mark>', '</mark>'])
  })

  it('leaves unknown, unpaired and self-closing tags as source', () => {
    const doc = 'A <span>span</span>, a <kbd>lone tag and <br/> here.\n\nEnd'
    expect(styles(doc, doc.length).hidden).toEqual([])
  })
})

describe('where the caret starts', () => {
  it('starts after a README header, so the header opens drawn', () => {
    cleanups.push(installDom())
    const { view } = createEditor(README, [livePreview, htmlPreview])
    const caret = openingCaret(view.state)
    expect(view.state.doc.sliceString(caret, caret + 9)).toBe('\n# Inklin')
    view.dispatch({ selection: { anchor: caret } })
    expect(view.dom.querySelector('.inkline-html-block')).not.toBeNull()
    view.destroy()
  })

  it('starts after a table at the top too, and at the start otherwise', () => {
    cleanups.push(installDom())
    const caretIn = (doc: string): string => {
      const { view } = createEditor(doc)
      const rest = view.state.doc.sliceString(openingCaret(view.state))
      view.destroy()
      return rest
    }
    expect(caretIn('| a | b |\n| - | - |\n| 1 | 2 |\n\nText')).toBe('\nText')
    for (const doc of ['# Title\n\nText', '<div align="center">\n\n# Title', '<script>x</script>\n\nText', '<p>Only</p>']) {
      expect(caretIn(doc)).toBe(doc)
    }
  })
})
