import { afterEach, describe, expect, it, vi } from 'vitest'
import { parseProperties, frontmatterPreview } from '../webview/src/editor/frontmatter-preview'
import { livePreview } from '../webview/src/editor/live-preview'
import { readingMode, setReadingMode } from '../webview/src/editor/reading-mode'
import { openingCaret } from '../webview/src/editor/html-preview'
import {
  FRONTMATTER_TEMPLATES, buildFrontmatter, frontmatterInsert, hasFrontmatter, titleFor, today, yamlString,
} from '../src/frontmatter-templates'
import { createEditor, installDom } from './editor-test-utils'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

describe('reading frontmatter', () => {
  it('reads values, quoted strings, inline and block lists', () => {
    expect(parseProperties([
      'title: "Hello: world"',
      "author: 'O''Brien'",
      'date: 2026-11-24',
      'tags: [writing, "a, b"]',
      'draft: false',
      'aliases:',
      '  - one',
      '  - two',
      'empty:',
      'rating: 5 # out of 5',
    ])).toEqual([
      { key: 'title', value: 'Hello: world' },
      { key: 'author', value: "O'Brien" },
      { key: 'date', value: '2026-11-24' },
      { key: 'tags', value: ['writing', 'a, b'] },
      { key: 'draft', value: 'false' },
      { key: 'aliases', value: ['one', 'two'] },
      { key: 'empty', value: [] },
      { key: 'rating', value: '5' },
    ])
  })

  it('gives up on YAML it cannot draw faithfully', () => {
    expect(parseProperties(['author:', '  name: Me'])).toBeNull()
    expect(parseProperties(['summary: |', '  Long text'])).toBeNull()
    expect(parseProperties(['meta: {a: 1}'])).toBeNull()
    expect(parseProperties(['not yaml at all'])).toBeNull()
    expect(parseProperties([])).toBeNull()
  })
})

const NOTE = '---\ntitle: Morning pages\ndate: 2026-11-24\ntags: [writing, habits]\ndraft: true\n---\n\n# Morning pages\n\nText.'

describe('the frontmatter card', () => {
  function open(doc = NOTE) {
    cleanups.push(installDom())
    return createEditor(doc, [livePreview, frontmatterPreview, readingMode]).view
  }

  it('draws properties as a card while the caret is elsewhere, and the YAML while it is inside', () => {
    const view = open()
    view.dispatch({ selection: { anchor: NOTE.length } })
    const card = view.dom.querySelector('.inkline-properties')!
    expect([...card.querySelectorAll('dt')].map((node) => node.textContent)).toEqual(['title', 'date', 'tags', 'draft'])
    expect([...card.querySelectorAll('.inkline-properties-chip')].map((node) => node.textContent)).toEqual(['writing', 'habits'])
    expect(card.querySelector('.inkline-properties-flag')?.textContent).toBe('Yes')
    view.dispatch({ selection: { anchor: 6 } })
    expect(view.dom.querySelector('.inkline-properties')).toBeNull()
    expect(view.state.doc.toString()).toBe(NOTE)
    view.destroy()
  })

  it('opens the YAML when clicked, and stays a card while reading', () => {
    const view = open()
    view.dispatch({ selection: { anchor: NOTE.length } })
    view.dom.querySelector('.inkline-properties')!.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true, cancelable: true }))
    expect(view.dom.querySelector('.inkline-properties')).toBeNull()
    view.dispatch({ effects: setReadingMode.of(true) })
    expect(view.dom.querySelector('.inkline-properties')).not.toBeNull()
    view.destroy()
  })

  it('leaves complex YAML as source', () => {
    const doc = '---\nauthor:\n  name: Me\n---\n\nText.'
    const view = open(doc)
    view.dispatch({ selection: { anchor: doc.length } })
    expect(view.dom.querySelector('.inkline-properties')).toBeNull()
    view.destroy()
  })

  it('opens a file with the card drawn, the caret just after it', () => {
    const view = open()
    expect(view.state.doc.sliceString(openingCaret(view.state)).startsWith('\n# Morning pages')).toBe(true)
    view.destroy()
  })
})

describe('adding frontmatter', () => {
  it('fills in the title and date', () => {
    const blog = FRONTMATTER_TEMPLATES.find((template) => template.id === 'blog')!
    expect(buildFrontmatter(blog, 'Morning pages', '2026-11-24')).toBe(
      '---\ntitle: Morning pages\ndescription: ""\ndate: 2026-11-24\ntags: []\ndraft: false\n---\n',
    )
  })

  it('quotes a title only when YAML needs it', () => {
    expect(yamlString('Morning pages')).toBe('Morning pages')
    expect(yamlString('Notes: part 1')).toBe('"Notes: part 1"')
    expect(yamlString('true')).toBe('"true"')
    expect(yamlString('2026 plans')).toBe('"2026 plans"')
    expect(yamlString('#hashtag')).toBe('"#hashtag"')
  })

  it('takes the title from the first heading, or the file name', () => {
    expect(titleFor('Intro\n\n# The **real** title\n', 'x.md')).toBe('The real title')
    expect(titleFor('No heading here', 'my-first_post.md')).toBe('My first post')
  })

  it('knows whether a file has frontmatter, and leaves a blank line before content', () => {
    expect(hasFrontmatter(NOTE)).toBe(true)
    expect(hasFrontmatter('# Title\n\n---\n')).toBe(false)
    expect(frontmatterInsert('# Title', '---\ntitle: T\n---\n')).toBe('---\ntitle: T\n---\n\n')
    expect(frontmatterInsert('', '---\ntitle: T\n---\n')).toBe('---\ntitle: T\n---\n')
  })

  it('dates in local time', () => {
    expect(today(new Date(2026, 0, 5, 23, 30))).toBe('2026-01-05')
  })

  it('makes frontmatter the card can draw, for every template', () => {
    for (const template of FRONTMATTER_TEMPLATES) {
      const lines = buildFrontmatter(template, 'A title: with colon', '2026-11-24').split('\n').slice(1, -2)
      expect(parseProperties(lines)?.map((property) => property.key)).toEqual(template.properties.map(([key]) => key))
    }
  })
})

describe('copying a code block', () => {
  it('copies just the code, through the editor', () => {
    cleanups.push(installDom())
    const post = vi.fn()
    window.inkline = { postMessage: post }
    window.acquireVsCodeApi = (() => ({ postMessage: post })) as never
    const doc = 'Intro\n\n```js\nconst a = 1\nconst b = 2\n```\n\nEnd'
    const { view } = createEditor(doc, [livePreview])
    view.dispatch({ selection: { anchor: doc.length } })
    const button = view.dom.querySelector<HTMLButtonElement>('.inkline-copy-code')!
    button.click()
    expect(post).toHaveBeenCalledWith({ type: 'copyText', text: 'const a = 1\nconst b = 2' })
    expect(button.textContent).toBe('Copied')
    view.destroy()
  })

  it('has no button on an empty block', () => {
    cleanups.push(installDom())
    const doc = 'Intro\n\n```\n```\n\nEnd'
    const { view } = createEditor(doc, [livePreview])
    expect(view.dom.querySelector('.inkline-copy-code')).toBeNull()
    view.destroy()
  })
})
