import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { findLivePreviewItems } from '../webview/src/editor/live-preview-ranges'

function createState(doc: string, cursorOffset = 0): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor: cursorOffset },
    extensions: [
      markdown({
        base: markdownLanguage,
        extensions: [GFM],
      }),
    ],
  })
}

describe('live preview range detection', () => {
  it('hides heading hashes when cursor is on another line', () => {
    const text = '## Heading\n\nSecond line with cursor'
    // Place cursor on line 2 (offset 15)
    const state = createState(text, 15)
    const items = findLivePreviewItems(state)

    const heading = items.find((i) => i.type === 'heading')
    expect(heading).toBeDefined()
    expect(heading?.hidden).toBe(true)
    if (heading && heading.type === 'heading') {
      expect(heading.level).toBe('2')
      expect(heading.hideFrom).toBe(0)
      expect(heading.hideTo).toBe(3) // "## " length 3
    }
  })

  it('keeps heading hashes visible when cursor is on the heading line', () => {
    const text = '## Heading\n\nSecond line'
    // Place cursor on line 1 inside heading (offset 5)
    const state = createState(text, 5)
    const items = findLivePreviewItems(state)

    const heading = items.find((i) => i.type === 'heading')
    expect(heading).toBeDefined()
    expect(heading?.hidden).toBe(false)
  })

  it('hides heading hashes when the cursor moves away from the heading', () => {
    const text = '## Heading\n\nSecond line'
    const state = createState(text, text.length)
    const heading = findLivePreviewItems(state).find((item) => item.type === 'heading')
    expect(heading?.type).toBe('heading')
    if (heading?.type === 'heading') expect(heading.hidden).toBe(true)
  })

  it('hides link brackets and reveals link when cursor is outside', () => {
    const text = 'Check [my link](https://example.com) out'
    // Cursor at the very end
    const state = createState(text, text.length)
    const items = findLivePreviewItems(state)

    const link = items.find((i) => i.type === 'link')
    expect(link).toBeDefined()
    expect(link?.hidden).toBe(true)
    if (link && link.type === 'link') {
      expect(link.openFrom).toBe(6)
      expect(link.openTo).toBe(7)
      expect(link.closeFrom).toBe(14)
      expect(link.url).toBe('https://example.com')
    }
  })

  it('reveals full link syntax when cursor touches the link', () => {
    const text = 'Check [my link](https://example.com) out'
    // Cursor inside link (offset 10)
    const state = createState(text, 10)
    const items = findLivePreviewItems(state)

    const link = items.find((i) => i.type === 'link')
    expect(link).toBeDefined()
    expect(link?.hidden).toBe(false)
  })

  it('tucks backticks away and marks code block collapsed when cursor is outside', () => {
    const text = '```python\ndef hello():\n    print("world")\n```\n\nAfter'
    // Cursor outside code block (at the end)
    const state = createState(text, text.length)
    const items = findLivePreviewItems(state)

    const codeblock = items.find((i) => i.type === 'codeblock')
    expect(codeblock).toBeDefined()
    if (codeblock && codeblock.type === 'codeblock') {
      expect(codeblock.active).toBe(false)
      expect(codeblock.language).toBe('python')
      expect(codeblock.codeText).toBe('def hello():\n    print("world")')
    }
  })

  it('shows raw backticks when cursor is inside the code block', () => {
    const text = '```python\ndef hello():\n    print("world")\n```\n\nAfter'
    // Cursor inside code block (offset 15)
    const state = createState(text, 15)
    const items = findLivePreviewItems(state)

    const codeblock = items.find((i) => i.type === 'codeblock')
    expect(codeblock).toBeDefined()
    if (codeblock && codeblock.type === 'codeblock') {
      expect(codeblock.active).toBe(true)
    }
  })

  it('detects task markers and marks them collapsed when cursor is outside', () => {
    const text = '- [ ] Todo item\n- [x] Done item'
    const state = createState(text, text.length)
    const items = findLivePreviewItems(state).filter((i) => i.type === 'task')

    expect(items.length).toBe(2)
    if (items[0].type === 'task' && items[1].type === 'task') {
      expect(items[0].checked).toBe(false)
      expect(items[0].hidden).toBe(true)
      expect(items[1].checked).toBe(true)
      expect(items[1].hidden).toBe(true)
    }
  })

  it('keeps fence markers editable for both backtick and tilde fences', () => {
    for (const marker of ['```', '~~~']) {
      const text = `${marker}js\nconst value = 1\n${marker}\nAfter`
      const state = createState(text, text.indexOf('const'))
      const codeblock = findLivePreviewItems(state).find((item) => item.type === 'codeblock')
      expect(codeblock?.type).toBe('codeblock')
      expect(text.slice(codeblock?.firstLineFrom ?? 0, codeblock?.firstLineTo ?? 0)).toContain(marker)
      expect(text.slice(codeblock?.lastLineFrom ?? 0, codeblock?.lastLineTo ?? 0)).toContain(marker)
    }
  })

  it('detects inline bold, italic, and inline code formatting', () => {
    const text = '**bold** and *italic* and `code` at end'
    const state = createState(text, text.length)
    const items = findLivePreviewItems(state)

    const bold = items.find((i) => i.type === 'bold')
    const italic = items.find((i) => i.type === 'italic')
    const code = items.find((i) => i.type === 'inline-code')

    expect(bold).toBeDefined()
    expect(italic).toBeDefined()
    expect(code).toBeDefined()

    if (bold && bold.type === 'bold') expect(bold.hidden).toBe(true)
    if (italic && italic.type === 'italic') expect(italic.hidden).toBe(true)
    if (code && code.type === 'inline-code') expect(code.hidden).toBe(true)
  })
})
