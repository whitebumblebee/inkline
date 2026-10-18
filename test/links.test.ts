import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveLink } from '../src/link-target'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { followLink, headingAnchors, linkAt, linkClicks, slugify } from '../webview/src/editor/links'
import { autolinkTarget } from '../webview/src/editor/live-preview-ranges'
import { buildLivePreviewDecorations, livePreview } from '../webview/src/editor/live-preview'
import { readingMode, setReadingMode } from '../webview/src/editor/reading-mode'
import { createEditor, installDom } from './editor-test-utils'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

describe('heading anchors', () => {
  it('match the anchors GitHub gives headings', () => {
    expect(slugify('8. Known limitations (read before using it for real)')).toBe('8-known-limitations-read-before-using-it-for-real')
    expect(slugify('Part 1 — Manual for everyone (non-technical)')).toBe('part-1--manual-for-everyone-non-technical')
    expect(slugify('3. Digilocker — your document vault')).toBe('3-digilocker--your-document-vault')
    expect(slugify('Café déjà vu 🎉')).toBe('café-déjà-vu-')
    expect(slugify('snake_case and kebab-case')).toBe('snake_case-and-kebab-case')
  })

  it('use the text a heading shows, and number repeats', () => {
    cleanups.push(installDom())
    const { view } = createEditor('# The **bold** `code` [link](x.md)\n\n## Setup\n\n## Setup\n\nTitle\n=====\n')
    expect(headingAnchors(view.state).map((anchor) => anchor.slug)).toEqual(['the-bold-code-link', 'setup', 'setup-1', 'title'])
    view.destroy()
  })
})

describe('the link under the pointer', () => {
  it('is the one clicked, not the first on the line', () => {
    const line = 'See [one](a.md) and [two](b.md "Title") and [three](<c d.md>).'
    expect(linkAt(line, 6)).toBe('a.md')
    expect(linkAt(line, 25)).toBe('b.md')
    expect(linkAt(line, 50)).toBe('c d.md')
    expect(linkAt(line, 2)).toBeNull()
  })
})

describe('following a link', () => {
  it('jumps to a heading in the same file without leaving Inkline', () => {
    cleanups.push(installDom())
    const post = vi.fn()
    window.inkline = { postMessage: post }
    const doc = 'See [limits](#8-known-limitations-read-first).\n\n## 7. Other\n\n## 8. Known limitations (read first)\n\nText'
    const { view } = createEditor(doc)
    followLink(view, '#8-known-limitations-read-first')
    expect(view.state.selection.main.head).toBe(doc.indexOf('## 8.'))
    followLink(view, '#no-such-heading')
    expect(view.state.selection.main.head).toBe(doc.indexOf('## 8.'))
    expect(post).not.toHaveBeenCalled()
    followLink(view, 'other.md#section')
    expect(post).toHaveBeenCalledWith({ type: 'openLink', url: 'other.md#section' })
    view.destroy()
  })
})

describe('long files', () => {
  it('find a heading near the end before the file is fully parsed', () => {
    cleanups.push(installDom())
    const doc = 'Jump to [the end](#the-end).\n\n' + 'A paragraph of filler text.\n\n'.repeat(4000) + '## The end\n'
    const { view } = createEditor(doc)
    followLink(view, '#the-end')
    expect(view.state.selection.main.head).toBe(doc.indexOf('## The end'))
    view.destroy()
  })
})

describe('where a link points', () => {
  const folder = path.resolve('/repo/docs')
  const files = new Set([path.resolve('/repo/docs/other.md'), path.resolve('/repo/docs/my notes.md'), path.join('/repo', '/guide/a.md')])
  const exists = async (filePath: string) => files.has(filePath)
  const resolve = (url: string) => resolveLink(url, folder, '/repo', exists)

  it('leaves in-page anchors to the editor', async () => {
    expect(await resolve('#8-known-limitations')).toEqual({ kind: 'none' })
  })

  it('opens a file, without its #section or ?query', async () => {
    expect(await resolve('other.md#section')).toEqual({ kind: 'file', path: path.resolve('/repo/docs/other.md') })
    expect(await resolve('./other.md?plain=1')).toEqual({ kind: 'file', path: path.resolve('/repo/docs/other.md') })
    expect(await resolve('my%20notes.md')).toEqual({ kind: 'file', path: path.resolve('/repo/docs/my notes.md') })
  })

  it('reads /path as the workspace root, as GitHub does', async () => {
    expect(await resolve('/guide/a.md')).toEqual({ kind: 'file', path: path.join('/repo', '/guide/a.md') })
  })

  it('reports a missing file instead of looking it up on the web', async () => {
    expect(await resolve('notes.md')).toEqual({ kind: 'missing', path: path.resolve('/repo/docs/notes.md') })
    expect(await resolve('../images/shot.png')).toMatchObject({ kind: 'missing' })
  })

  it('opens web pages, including a bare domain', async () => {
    expect(await resolve('https://example.com/a#b')).toEqual({ kind: 'external', url: 'https://example.com/a#b' })
    expect(await resolve('mailto:hi@example.com')).toEqual({ kind: 'external', url: 'mailto:hi@example.com' })
    expect(await resolve('example.com/page')).toEqual({ kind: 'external', url: 'https://example.com/page' })
  })
})

describe('addresses written as links', () => {
  function linkMarks(doc: string, anchor = doc.length): { text: string; url: string }[] {
    const state = EditorState.create({ doc, selection: { anchor }, extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })] })
    const found: { text: string; url: string }[] = []
    buildLivePreviewDecorations({ state }).between(0, doc.length, (from, to, decoration) => {
      if (decoration.spec.class === 'inkline-live-link') found.push({ text: doc.slice(from, to), url: decoration.spec.attributes.title })
    })
    return found
  }

  it('opens www. addresses on the web and email addresses in mail', () => {
    expect(autolinkTarget('https://x.dev')).toBe('https://x.dev')
    expect(autolinkTarget('www.github.com')).toBe('https://www.github.com')
    expect(autolinkTarget('me@example.com')).toBe('mailto:me@example.com')
    expect(autolinkTarget('mailto:me@example.com')).toBe('mailto:me@example.com')
  })

  it('draws bare URLs and emails as links, leaving trailing punctuation out', () => {
    expect(linkMarks('Visit https://example.com/page, www.github.com or me@example.com.\n\nEnd')).toEqual([
      { text: 'https://example.com/page', url: 'https://example.com/page' },
      { text: 'www.github.com', url: 'https://www.github.com' },
      { text: 'me@example.com', url: 'mailto:me@example.com' },
    ])
  })

  it('finds them in headings, lists and table cells too', () => {
    const doc = '# Docs at https://x.dev\n\n- see https://y.dev\n\n| Site |\n| --- |\n| https://z.dev |\n\nEnd'
    expect(linkMarks(doc).map((link) => link.text)).toEqual(['https://x.dev', 'https://y.dev', 'https://z.dev'])
  })

  it('hides the brackets of <https://…> until the caret reaches them', () => {
    const doc = 'See <https://x.dev> here.\n\nEnd'
    const state = (anchor: number) => EditorState.create({ doc, selection: { anchor }, extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })] })
    const hiddenText = (anchor: number) => {
      const hidden: string[] = []
      buildLivePreviewDecorations({ state: state(anchor) }).between(0, doc.length, (from, to, decoration) => {
        if (decoration.spec.class === 'inkline-hidden-syntax') hidden.push(doc.slice(from, to))
      })
      return hidden
    }
    expect(linkMarks(doc)).toEqual([{ text: 'https://x.dev', url: 'https://x.dev' }])
    expect(hiddenText(doc.length)).toEqual(['<', '>'])
    expect(hiddenText(8)).toEqual([])
  })

  it('leaves [text](url) links, images and code alone', () => {
    const doc = '[site](https://x.dev) ![img](https://y.dev/a.png) `https://z.dev`\n\n```\nhttps://w.dev\n```\n\nEnd'
    expect(linkMarks(doc)).toEqual([{ text: 'site', url: 'https://x.dev' }])
  })

  it('opens a pasted URL with one click in reading mode, without changing the file', () => {
    cleanups.push(installDom())
    const post = vi.fn()
    const doc = 'Docs: https://example.com/guide\n\nEnd'
    const { view } = createEditor(doc, [livePreview, linkClicks, readingMode])
    view.dispatch({ effects: setReadingMode.of(true) })
    window.inkline = { postMessage: post }
    view.dom.querySelector('.inkline-live-link')!.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0 }))
    expect(post).toHaveBeenCalledWith({ type: 'openLink', url: 'https://example.com/guide' })
    expect(view.state.doc.toString()).toBe(doc)
    view.destroy()
  })
})
