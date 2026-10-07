import * as path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { resolveLink } from '../src/link-target'
import { followLink, headingAnchors, linkAt, slugify } from '../webview/src/editor/links'
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
