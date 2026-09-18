import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { buildLivePreviewDecorations } from '../webview/src/editor/live-preview'
import { findFrontmatter, findLivePreviewItems } from '../webview/src/editor/live-preview-ranges'

function createState(doc: string, anchor = 0): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
  })
}

function classesOnLine(state: EditorState, lineNumber: number): string[] {
  const line = state.doc.line(lineNumber)
  const classes: string[] = []
  buildLivePreviewDecorations({ state }).between(line.from, line.from, (from, to, decoration) => {
    if (from === line.from && to === line.from && decoration.spec.class) classes.push(decoration.spec.class)
  })
  return classes.join(' ').split(/\s+/u).filter(Boolean)
}

function marksIn(state: EditorState, from: number, to: number): string[] {
  const found: string[] = []
  buildLivePreviewDecorations({ state }).between(from, to, (start, end, decoration) => {
    if (start !== end && decoration.spec.class) found.push(decoration.spec.class)
  })
  return found
}

/**
 * The scanners for syntax the grammar does not model run over raw text, so a
 * `==`, `[^1]` or `<!-- -->` written inside a code block used to be styled as
 * if it were markup.
 */
describe('code blocks are not treated as markup', () => {
  const doc = [
    '```js',
    'const eq = a ==b== c;',
    'const note = "[^1]";',
    '// <!-- comment -->',
    'const pct = "%% obsidian %%";',
    'const math = "$x^2$";',
    '```',
    '',
    'Real ==highlight==, a [^2] note, <!-- real comment --> and $y^2$.',
  ].join('\n')

  it('leaves plain-text syntax alone inside a fence', () => {
    const state = createState(doc)
    const fence = state.doc.line(7)
    expect(marksIn(state, 0, fence.to).filter((c) => /highlight|footnote|comment|math/.test(c))).toEqual([])
  })

  it('still styles the same syntax outside the fence', () => {
    const state = createState(doc)
    const prose = state.doc.line(9)
    const found = marksIn(state, prose.from, prose.to)
    expect(found.some((c) => c.includes('inkline-highlight'))).toBe(true)
    expect(found.some((c) => c.includes('inkline-footnote'))).toBe(true)
    expect(found.some((c) => c.includes('inkline-comment'))).toBe(true)
    expect(found.some((c) => c.includes('inkline-math'))).toBe(true)
  })

  it('ignores markup inside inline code', () => {
    const state = createState('Text with `a ==b== c` inline.')
    expect(marksIn(state, 0, state.doc.length).some((c) => c.includes('inkline-highlight'))).toBe(false)
  })
})

describe('frontmatter', () => {
  const doc = '---\ntitle: Note\ntags: [a, b]\n---\n\nBody text.\n'

  it('is recognised as a metadata block', () => {
    const state = createState(doc)
    const found = findFrontmatter(state)
    expect(found?.firstLineNumber).toBe(1)
    expect(found?.lastLineNumber).toBe(4)
  })

  it('styles every line of the block', () => {
    const state = createState(doc)
    for (const line of [1, 2, 3, 4]) expect(classesOnLine(state, line)).toContain('inkline-frontmatter-line')
    expect(classesOnLine(state, 1)).toContain('inkline-frontmatter-first')
    expect(classesOnLine(state, 4)).toContain('inkline-frontmatter-last')
  })

  it('keeps the parser from reading its fences as headings or rules', () => {
    const state = createState(doc)
    for (const line of [1, 2, 3, 4]) {
      expect(classesOnLine(state, line)).not.toContain('inkline-heading-line')
      expect(classesOnLine(state, line)).not.toContain('inkline-horizontal-rule-line')
    }
  })

  it('is not claimed when there is no closing fence', () => {
    expect(findFrontmatter(createState('---\ntitle: Note\n\nBody\n'))).toBeNull()
    expect(findFrontmatter(createState('# Heading\n\nBody\n'))).toBeNull()
  })
})

describe('Setext headings', () => {
  it('styles the text line and conceals the underline', () => {
    const state = createState('Title\n=====\n\nSub\n---\n\nBody', 24)
    expect(classesOnLine(state, 1)).toContain('inkline-h1-line')
    expect(classesOnLine(state, 2)).toContain('inkline-h1-line')
    expect(classesOnLine(state, 4)).toContain('inkline-h2-line')
    expect(classesOnLine(state, 5)).toContain('inkline-h2-line')
    const underline = state.doc.line(2)
    expect(marksIn(state, underline.from, underline.to)).toContain('inkline-hidden-syntax')
  })
})

describe('tables', () => {
  const doc = 'Intro\n\n| Name | Qty |\n| :--- | --: |\n| Apple | 3 |\n| Pear | 12 |\n\nOutro'

  it('styles every row of the block, including short delimiter cells', () => {
    const state = createState(doc)
    for (const line of [3, 4, 5, 6]) expect(classesOnLine(state, line)).toContain('inkline-table-line')
    expect(classesOnLine(state, 4)).toContain('inkline-table-delimiter')
  })

  it('marks the first and last row so the block reads as one card', () => {
    const state = createState(doc)
    expect(classesOnLine(state, 3)).toContain('inkline-table-first')
    expect(classesOnLine(state, 6)).toContain('inkline-table-last')
    expect(classesOnLine(state, 4)).not.toContain('inkline-table-first')
  })

  it('leaves ordinary prose containing a pipe alone', () => {
    const state = createState('a | b is not a table\n\nplain text')
    expect(classesOnLine(state, 1)).not.toContain('inkline-table-line')
  })
})

describe('horizontal rules', () => {
  it('conceals the marker and draws the rule when the cursor is elsewhere', () => {
    const state = createState('Above\n\n---\n\nBelow', 0)
    expect(classesOnLine(state, 3)).toContain('inkline-horizontal-rule-line')
    const rule = state.doc.line(3)
    expect(marksIn(state, rule.from, rule.to)).toContain('inkline-hidden-syntax')
  })

  it('shows the marker again while the cursor is on it', () => {
    const doc = 'Above\n\n---\n\nBelow'
    const state = createState(doc, doc.indexOf('---') + 1)
    const rule = state.doc.line(3)
    expect(marksIn(state, rule.from, rule.to)).toContain('inkline-horizontal-rule')
  })
})

describe('images', () => {
  it('reports the source and alt text of a local image', () => {
    const state = createState('![the mark](media/icon.png)')
    const image = findLivePreviewItems(state).find((item) => item.type === 'image')
    expect(image).toMatchObject({ type: 'image', source: 'media/icon.png', alt: 'the mark' })
  })

  it('keeps showing Markdown source until the host resolves the file', () => {
    const state = createState('Text\n\n![a](media/icon.png)\n', 0)
    const line = state.doc.line(3)
    expect(marksIn(state, line.from, line.to)).toContain('inkline-image-source')
  })

  it('does not treat an image inside a code fence as an image', () => {
    const state = createState('```js\nconst s = "![a](b.png)";\n```')
    expect(findLivePreviewItems(state).some((item) => item.type === 'image')).toBe(false)
  })
})
