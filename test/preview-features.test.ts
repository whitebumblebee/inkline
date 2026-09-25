import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { buildLivePreviewDecorations } from '../webview/src/editor/live-preview'

function createState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
  })
}

describe('source-preserving preview features', () => {
  it('supports tables, comments, highlights, and footnotes without replacement widgets', () => {
    const state = createState([
      '==highlight==',
      '',
      '| A | B |',
      '| --- | --- |',
      '| 1 | 2 |',
      '',
      '%% hidden note %%',
      '[^note] text',
      '',
      '[^note]: definition',
    ].join('\n'))
    const decorations = buildLivePreviewDecorations({ state })
    const widgets: unknown[] = []
    decorations.between(0, state.doc.length, (from, to, decoration) => {
      if (decoration.spec.widget) widgets.push({ from, to })
    })
    expect(widgets).toEqual([])
  })

  it('keeps opening and closing fences in the source document', () => {
    const text = '~~~typescript\nconst answer = 42\n~~~'
    const state = createState(text)
    const decorations = buildLivePreviewDecorations({ state })
    expect(state.doc.toString()).toBe(text)
    expect(decorations).toBeDefined()
  })

  it('uses source-preserving hidden syntax marks for contextual preview', () => {
    const text = '# Heading\n\nBody'
    const state = EditorState.create({
      doc: text,
      selection: { anchor: text.length },
      extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
    })
    const decorations = buildLivePreviewDecorations({ state })
    const hidden = [] as Array<{ from: number; to: number; className: string }>
    decorations.between(0, text.length, (from, to, decoration) => {
      if (decoration.spec.class === 'inkline-hidden-syntax') hidden.push({ from, to, className: decoration.spec.class })
    })
    expect(hidden).toEqual([{ from: 0, to: 2, className: 'inkline-hidden-syntax' }])
    expect(state.doc.toString()).toBe(text)
  })

  it('adds a live link arrow only while link syntax is concealed', () => {
    const text = '[Inkline](https://example.com) out'
    const inactive = EditorState.create({
      doc: text,
      selection: { anchor: text.length },
      extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
    })
    const inactiveDecorations = buildLivePreviewDecorations({ state: inactive })
    const inactiveWidgets: Array<{ from: number; to: number; className?: string }> = []
    inactiveDecorations.between(0, inactive.doc.length, (from, to, decoration) => {
      if (decoration.spec.widget) inactiveWidgets.push({ from, to, className: decoration.spec.widget.constructor.name })
    })
    expect(inactiveWidgets).toEqual([{ from: text.indexOf(']'), to: text.indexOf(']'), className: 'LinkIconWidget' }])

    const active = EditorState.create({
      doc: text,
      selection: { anchor: 4 },
      extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
    })
    const activeDecorations = buildLivePreviewDecorations({ state: active })
    const activeWidgets: unknown[] = []
    activeDecorations.between(0, active.doc.length, (_from, _to, decoration) => {
      if (decoration.spec.widget) activeWidgets.push(decoration.spec.widget)
    })
    expect(activeWidgets).toEqual([])
  })

  it('renders each formula in place of exactly its own source', () => {
    const text = 'Inline $x^2$ and $$\\n y = mx + b\\n$$'
    const state = createState(text)
    const decorations = buildLivePreviewDecorations({ state })
    const widgets: string[] = []
    decorations.between(0, state.doc.length, (from, to, decoration) => {
      if (decoration.spec.widget) widgets.push(text.slice(from, to))
    })

    expect(widgets).toEqual(['$x^2$', '$$\\n y = mx + b\\n$$'])
    expect(state.doc.toString()).toBe(text)
  })
})
