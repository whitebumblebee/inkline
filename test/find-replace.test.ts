import { afterEach, describe, expect, it } from 'vitest'
import { SearchQuery, findNext, getSearchQuery, replaceAll, searchPanelOpen, setSearchQuery } from '@codemirror/search'
import { runScopeHandlers } from '@codemirror/view'
import { livePreview } from '../webview/src/editor/live-preview'
import { inklineKeymap } from '../webview/src/editor/editor-keymap'
import { createEditor, installDom } from './editor-test-utils'

const cleanups: Array<() => void> = []

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

function press(view: Parameters<typeof runScopeHandlers>[0], key: string, modifiers: KeyboardEventInit = {}): boolean {
  return runScopeHandlers(view, new window.KeyboardEvent('keydown', { key, ...modifiers }), 'editor')
}

describe('find and replace', () => {
  it('opens the find panel with Mod-f', () => {
    cleanups.push(installDom())
    const { view } = createEditor('hello', [inklineKeymap])
    // Mod is Cmd on macOS and Ctrl elsewhere; one of the two is claimed.
    const handled = press(view, 'f', { metaKey: true }) || press(view, 'f', { ctrlKey: true })
    expect(handled).toBe(true)
    expect(searchPanelOpen(view.state)).toBe(true)
    view.destroy()
  })

  it('replaces in the source text, including syntax the preview hides', () => {
    cleanups.push(installDom())
    const text = 'See [the docs](https://old.example.com/docs) and **old** notes.\n'
    const { view } = createEditor(text, [inklineKeymap, livePreview])
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'old', replace: 'new' })) })
    expect(getSearchQuery(view.state).search).toBe('old')
    replaceAll(view)
    expect(view.state.doc.toString()).toBe('See [the docs](https://new.example.com/docs) and **new** notes.\n')
    view.destroy()
  })

  it('reveals the Markdown around a match hidden by the preview', () => {
    cleanups.push(installDom())
    const text = 'Intro\n\nSee [the docs](https://example.com/guide) today.\n'
    const { view } = createEditor(text, [inklineKeymap, livePreview])
    const hiddenText = () => [...view.dom.querySelectorAll('.inkline-hidden-syntax')].map((node) => node.textContent).join('')
    view.dispatch({ selection: { anchor: 0 } })
    expect(hiddenText()).toContain('example.com/guide')
    view.dispatch({ effects: setSearchQuery.of(new SearchQuery({ search: 'guide' })) })
    findNext(view)
    const { from, to } = view.state.selection.main
    expect(view.state.sliceDoc(from, to)).toBe('guide')
    expect(hiddenText()).not.toContain('example.com/guide')
    view.destroy()
  })
})
