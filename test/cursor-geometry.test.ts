import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { buildLivePreviewDecorations } from '../webview/src/editor/live-preview'

const stylesheet = readFileSync(resolve(__dirname, '../webview/src/styles/editor.css'), 'utf8')

function createState(doc: string, anchor = 0): EditorState {
  return EditorState.create({
    doc,
    selection: { anchor },
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
  })
}

/** Selectors in the stylesheet that set a vertical margin and match `scope`. */
function marginOffenders(scope: RegExp): string[] {
  const offenders: string[] = []
  const rulePattern = /([^{}]+)\{([^}]*)\}/gu
  let match: RegExpExecArray | null
  while ((match = rulePattern.exec(stylesheet)) !== null) {
    const selector = match[1].trim()
    if (!scope.test(selector)) continue
    if (/(^|[;\s])margin(-top|-bottom|-block[a-z-]*)?\s*:/u.test(match[2])) offenders.push(selector)
  }
  return offenders
}

function lineClasses(state: EditorState, lineNumber: number): string[] {
  const line = state.doc.line(lineNumber)
  const classes: string[] = []
  buildLivePreviewDecorations({ state }).between(line.from, line.from, (from, to, decoration) => {
    if (from === line.from && to === line.from && decoration.spec.class) classes.push(decoration.spec.class)
  })
  return classes.join(' ').split(/\s+/u).filter(Boolean)
}

/**
 * CodeMirror builds its height map from the border box of each `.cm-line`, and
 * resolves a click by looking the y coordinate up in that map. A margin is
 * outside the border box, so CodeMirror never sees it: every line below one is
 * painted lower than CodeMirror believes it is, and clicks land on the wrong
 * line - by a whole line per code block, accumulating down the document.
 */
describe('line geometry stays measurable', () => {
  it('declares no margin on any .cm-line rule', () => {
    expect(marginOffenders(/\.cm-line\b/u)).toEqual([])
  })

  /**
   * A block widget is measured the same way a line is, so a margin on one is
   * just as invisible to the height map.
   */
  it('declares no margin on a block widget wrapper', () => {
    expect(marginOffenders(/^\.inkline-(table-preview|image-preview)\b/u)).toEqual([])
  })

  /**
   * Concealed syntax must contribute no client rects at all. A zero-width or
   * zero-height inline box still reports a (degenerate) rect, which derails the
   * coordinate search CodeMirror runs over the characters of a line: every
   * click past the first concealed marker collapses onto that marker.
   */
  it('removes concealed syntax from layout rather than shrinking it', () => {
    const rule = /\.inkline-hidden-syntax\s*\{([^}]*)\}/u.exec(stylesheet)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/display\s*:\s*none/u)
    expect(rule![1]).not.toMatch(/font-size\s*:\s*0/u)
  })

  /**
   * A line with nothing but concealed syntax gives CodeMirror nothing to map a
   * click onto, and it throws. Such a line is replaced whole by one widget.
   */
  it('replaces lines whose whole content is concealed with a single strut', () => {
    const doc = 'intro\n\n```bash\ncode\n```\n\n> quote\n>\n> more\n\n---\n\noutro'
    const state = createState(doc, doc.length)
    const wholeLines: string[] = []
    const hiddenLeft: string[] = []
    buildLivePreviewDecorations({ state }).between(0, doc.length, (from, to, decoration) => {
      if (decoration.spec.widget && from < to) wholeLines.push(doc.slice(from, to))
      if (decoration.spec.class === 'inkline-hidden-syntax') hiddenLeft.push(doc.slice(from, to))
    })
    expect(wholeLines).toEqual(['```bash', '```', '>', '---'])
    // Partly concealed lines keep their ordinary hidden markers.
    expect(hiddenLeft).toEqual(['> ', '> '])
    expect(stylesheet).toMatch(/\.inkline-line-strut\s*\{[^}]*display\s*:\s*inline-block/u)
  })
})

describe('block spacing is carried by neighbouring lines', () => {
  it('pads the lines around a fenced code block instead of margining the block', () => {
    const state = createState('intro\n\n```js\ncode\n```\n\noutro')
    expect(lineClasses(state, 2)).toContain('inkline-space-below')
    expect(lineClasses(state, 6)).toContain('inkline-space-above')
    expect(lineClasses(state, 3)).toContain('inkline-codeblock-first')
    expect(lineClasses(state, 5)).toContain('inkline-codeblock-last')
  })

  it('pads the lines around a callout', () => {
    const state = createState('intro\n\n> [!NOTE]\n> body\n\noutro')
    expect(lineClasses(state, 2)).toContain('inkline-space-below')
    expect(lineClasses(state, 5)).toContain('inkline-space-above')
  })

  it('omits spacing that would fall outside the document', () => {
    const state = createState('```js\ncode\n```')
    expect(lineClasses(state, 1)).not.toContain('inkline-space-above')
    expect(lineClasses(state, 3)).not.toContain('inkline-space-below')
  })
})

describe('decoration scanning honours a viewport', () => {
  it('still decorates everything a full-document scan would, within the scope', () => {
    const body = Array.from({ length: 400 }, (_, i) => `## Heading ${i}\n\ntext **bold** ${i}\n`).join('\n')
    const state = createState(body, body.length - 1)
    const full: string[] = []
    buildLivePreviewDecorations({ state }).between(0, state.doc.length, (from, to, d) => {
      full.push(`${from}:${to}:${d.spec.class ?? 'widget'}`)
    })
    const scoped: string[] = []
    const viewport = { from: 2000, to: 4000 }
    buildLivePreviewDecorations({ state, viewport }).between(viewport.from, viewport.to, (from, to, d) => {
      scoped.push(`${from}:${to}:${d.spec.class ?? 'widget'}`)
    })
    const expected = full.filter((entry) => {
      const from = Number(entry.split(':')[0])
      return from >= viewport.from && from <= viewport.to
    })
    expect(scoped).toEqual(expected)
  })

  it('scans a bounded amount of the document', () => {
    const body = Array.from({ length: 4000 }, (_, i) => `line ${i} with **bold**`).join('\n')
    const state = createState(body)
    const started = performance.now()
    for (let i = 0; i < 20; i += 1) buildLivePreviewDecorations({ state, viewport: { from: 40000, to: 42000 } })
    const scoped = performance.now() - started
    const fullStarted = performance.now()
    buildLivePreviewDecorations({ state })
    const full = performance.now() - fullStarted
    expect(scoped / 20).toBeLessThan(full)
  })
})
