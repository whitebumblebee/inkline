import { StateField, type EditorState, type Extension, type Range } from '@codemirror/state'
import { Decoration, type DecorationSet, EditorView, WidgetType } from '@codemirror/view'
import { findFrontmatter, selectionTouchesRange } from './live-preview-ranges'
import { readingChanged } from './reading-mode'

/**
 * YAML frontmatter drawn as a card of properties - title, date, tags as
 * chips - instead of raw YAML. Like tables, it shows its source while the
 * caret is in it. Only plain `key: value` lists are drawn; anything more
 * (nested maps, multi-line strings) stays as source, so nothing is hidden or
 * shown wrongly.
 */

export interface Property {
  key: string
  /** A single value, or the items of a list. */
  value: string | string[]
}

const KEY = /^([A-Za-z_][\w.-]*)\s*:(?:\s+(.*)|\s*)$/u
const LIST_ITEM = /^\s+-\s+(.*)$/u

/** A scalar as YAML reads it: quotes removed, and a trailing ` # comment` dropped. */
function scalar(raw: string): string {
  const text = raw.trim()
  if (/^"(?:[^"\\]|\\.)*"$/u.test(text)) {
    try {
      return JSON.parse(text) as string
    } catch {
      return text.slice(1, -1)
    }
  }
  if (/^'.*'$/u.test(text)) return text.slice(1, -1).replace(/''/gu, "'")
  return text.replace(/\s+#.*$/u, '')
}

/** `[a, "b, c", d]` as its items. */
function inlineList(raw: string): string[] | null {
  const text = raw.trim()
  if (!text.startsWith('[') || !text.endsWith(']')) return null
  const inner = text.slice(1, -1).trim()
  if (!inner) return []
  const items: string[] = []
  let current = ''
  let quote: string | null = null
  for (const char of inner) {
    if (quote) {
      current += char
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
      current += char
    } else if (char === ',') {
      items.push(scalar(current))
      current = ''
    } else if (char === '[' || char === '{') {
      return null
    } else {
      current += char
    }
  }
  if (quote) return null
  items.push(scalar(current))
  return items
}

/** The properties in frontmatter's lines (between the `---` fences), or null if it is not a plain list of them. */
export function parseProperties(lines: string[]): Property[] | null {
  const properties: Property[] = []
  for (const line of lines) {
    if (line.trim() === '' || /^\s*#/u.test(line)) continue
    const key = KEY.exec(line)
    if (key) {
      const raw = key[2] ?? ''
      if (/^[|>{&*!]/u.test(raw.trim())) return null
      const list = inlineList(raw)
      properties.push({ key: key[1], value: list ?? (raw.trim() === '' ? [] : scalar(raw)) })
      continue
    }
    const item = LIST_ITEM.exec(line)
    const last = properties[properties.length - 1]
    if (item && last && Array.isArray(last.value) && !/^[[{]|:\s/u.test(item[1].trim())) {
      last.value.push(scalar(item[1]))
      continue
    }
    return null
  }
  return properties.length > 0 ? properties : null
}

class FrontmatterWidget extends WidgetType {
  constructor(readonly properties: Property[], readonly editAt: number) {
    super()
  }

  eq(other: FrontmatterWidget): boolean {
    return JSON.stringify(this.properties) === JSON.stringify(other.properties)
  }

  toDOM(view: EditorView): HTMLElement {
    const card = document.createElement('div')
    card.className = 'inkline-properties'
    const list = document.createElement('dl')
    for (const property of this.properties) {
      const key = document.createElement('dt')
      key.textContent = property.key
      const value = document.createElement('dd')
      if (Array.isArray(property.value)) {
        if (property.value.length === 0) value.className = 'inkline-properties-empty'
        for (const item of property.value) {
          const chip = document.createElement('span')
          chip.className = 'inkline-properties-chip'
          chip.textContent = item
          value.appendChild(chip)
        }
        if (property.value.length === 0) value.textContent = 'none'
      } else if (property.value === 'true' || property.value === 'false') {
        value.className = `inkline-properties-flag is-${property.value}`
        value.textContent = property.value === 'true' ? 'Yes' : 'No'
      } else if (property.value === '') {
        value.className = 'inkline-properties-empty'
        value.textContent = 'empty'
      } else {
        value.textContent = property.value
      }
      list.append(key, value)
    }
    card.appendChild(list)
    // Clicking the card opens its YAML, like a table opens its rows.
    card.addEventListener('mousedown', (event) => {
      if (!view.state.facet(EditorView.editable)) return
      event.preventDefault()
      view.dispatch({ selection: { anchor: Math.min(this.editAt, view.state.doc.length) } })
      view.focus()
    })
    return card
  }

  ignoreEvent(): boolean {
    return true
  }
}

interface FrontmatterBlock {
  from: number
  to: number
  properties: Property[]
  editAt: number
}

function findBlock(state: EditorState): FrontmatterBlock | null {
  const range = findFrontmatter(state)
  if (!range) return null
  const lines: string[] = []
  for (let lineNo = range.firstLineNumber + 1; lineNo < range.lastLineNumber; lineNo += 1) lines.push(state.doc.line(lineNo).text)
  const properties = parseProperties(lines)
  if (!properties) return null
  const second = state.doc.line(Math.min(range.firstLineNumber + 1, range.lastLineNumber))
  return { from: range.from, to: range.to, properties, editAt: second.from }
}

function decorate(state: EditorState, block: FrontmatterBlock | null): DecorationSet {
  if (!block || selectionTouchesRange(state, block.from, block.to)) return Decoration.none
  const ranges: Range<Decoration>[] = [
    Decoration.replace({ widget: new FrontmatterWidget(block.properties, block.editAt), block: true }).range(block.from, block.to),
  ]
  return Decoration.set(ranges)
}

const frontmatterField = StateField.define<{ block: FrontmatterBlock | null; decorations: DecorationSet }>({
  create(state) {
    const block = findBlock(state)
    return { block, decorations: decorate(state, block) }
  },
  update(value, transaction) {
    if (transaction.docChanged) {
      const block = findBlock(transaction.state)
      return { block, decorations: decorate(transaction.state, block) }
    }
    if (!transaction.selection && !readingChanged(transaction)) return value
    return { block: value.block, decorations: decorate(transaction.state, value.block) }
  },
})

export const frontmatterPreview: Extension = [
  frontmatterField,
  EditorView.decorations.from(frontmatterField, (value) => value.decorations),
]
