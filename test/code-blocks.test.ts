import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { buildLivePreviewDecorations, livePreview } from '../webview/src/editor/live-preview'
import { tablePreview } from '../webview/src/editor/table-preview'
import { createEditor, installDom } from './editor-test-utils'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

describe('Markdown written inside code', () => {
  it('leaves wikilinks in inline code and code blocks alone', () => {
    const doc = 'A [[real link]] and `[[not one]]`.\n\n```\n[[nor this]]\n```\n'
    const state = EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })] })
    const links: string[] = []
    buildLivePreviewDecorations({ state }).between(0, doc.length, (from, to, decoration) => {
      if (decoration.spec.class === 'inkline-live-wikilink') links.push(doc.slice(from, to))
    })
    expect(links).toEqual(['[[real link]]'])
  })

  it('keeps a table inside a code block as code', () => {
    cleanups.push(installDom())
    const doc = 'Intro\n\n```md\n| a | b |\n| - | - |\n| 1 | 2 |\n```\n\nEnd'
    const { view } = createEditor(doc, [livePreview, tablePreview])
    view.dispatch({ selection: { anchor: doc.length } })
    expect(view.dom.querySelector('.inkline-table-preview')).toBeNull()
    expect(view.dom.querySelector('.inkline-table-line')).toBeNull()
    view.destroy()
  })

  it('still draws a table outside code, inline code in its cells included', () => {
    cleanups.push(installDom())
    const doc = '| a | `b` |\n| - | - |\n| 1 | 2 |\n\nEnd'
    const { view } = createEditor(doc, [livePreview, tablePreview])
    view.dispatch({ selection: { anchor: doc.length } })
    expect(view.dom.querySelector('.inkline-table-preview')).not.toBeNull()
    view.destroy()
  })
})
