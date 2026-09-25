import type { EditorState } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

export function selectionTouchesRange(state: EditorState, from: number, to: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= to && range.to >= from) return true
  }
  return false
}

export function selectionTouchesLine(state: EditorState, lineStart: number, lineEnd: number): boolean {
  for (const range of state.selection.ranges) {
    if (range.from <= lineEnd && range.to >= lineStart) return true
  }
  return false
}

export interface HeadingRange {
  type: 'heading'
  level: string
  lineFrom: number
  hideFrom: number
  hideTo: number
  hidden: boolean
}

export interface LinkRange {
  type: 'link'
  from: number
  to: number
  openFrom: number
  openTo: number
  closeFrom: number
  url: string
  hidden: boolean
}

export interface CodeBlockRange {
  type: 'codeblock'
  from: number
  to: number
  firstLineFrom: number
  firstLineTo: number
  lastLineFrom: number
  lastLineTo: number
  firstLineNumber: number
  lastLineNumber: number
  language: string
  codeText: string
  active: boolean
  firstLineActive: boolean
  lastLineActive: boolean
}

export interface InlineFormatRange {
  type: 'bold' | 'italic' | 'strike' | 'inline-code'
  openFrom: number
  openTo: number
  closeFrom: number
  closeTo: number
  contentFrom: number
  contentTo: number
  hidden: boolean
}

export interface TaskRange {
  type: 'task'
  /** The `[ ]` / `[x]` marker. */
  from: number
  to: number
  /**
   * Start of what the checkbox stands in for: the bullet of a `-`, `*` or `+`
   * list item, so `- [x]` becomes a single box. Ordered items keep their number.
   */
  concealFrom: number
  lineTo: number
  checked: boolean
  hidden: boolean
}

export interface BlockquoteRange {
  type: 'blockquote'
  lineFrom: number
  className?: string
  markFrom?: number
  markTo?: number
  hidden: boolean
}

export interface WikiLinkRange {
  type: 'wikilink'
  from: number
  to: number
  target: string
  label: string
  hidden: boolean
}

export interface CalloutRange {
  type: 'callout'
  calloutType: 'note' | 'tip' | 'important' | 'warning' | 'caution'
  firstLineFrom: number
  firstLineTo: number
  firstLineNumber: number
  lastLineNumber: number
  /** `> [!TIP]` and the whitespace after it. */
  markFrom: number
  markTo: number
  /** Optional custom title written after the marker; empty when there is none. */
  title: string
  hidden: boolean
}

export interface HrRange {
  type: 'hr'
  from: number
  to: number
  hidden: boolean
}

export interface ImageRange {
  type: 'image'
  from: number
  to: number
  source: string
  alt: string
  hidden: boolean
}

export interface FrontmatterRange {
  type: 'frontmatter'
  from: number
  to: number
  firstLineNumber: number
  lastLineNumber: number
}

export type LivePreviewItem =
  | HeadingRange
  | LinkRange
  | WikiLinkRange
  | CodeBlockRange
  | InlineFormatRange
  | TaskRange
  | BlockquoteRange
  | CalloutRange
  | HrRange
  | ImageRange
  | FrontmatterRange

export interface ItemScope {
  from: number
  to: number
}

export interface CodeRange {
  from: number
  to: number
}

/**
 * Regions where Markdown is content rather than markup. The plain-text scanners
 * skip these, so a `==`, `[^1]` or `<!-- -->` written inside a code block is
 * left alone instead of being styled as if it were markup.
 */
export function findCodeRanges(state: EditorState, scope?: ItemScope): CodeRange[] {
  const doc = state.doc
  const from = scope ? doc.lineAt(Math.max(0, Math.min(scope.from, doc.length))).from : 0
  const to = scope ? doc.lineAt(Math.max(0, Math.min(scope.to, doc.length))).to : doc.length
  const ranges: CodeRange[] = []
  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (node.name === 'FencedCode' || node.name === 'CodeBlock' || node.name === 'InlineCode') {
        ranges.push({ from: node.from, to: node.to })
      }
    },
  })
  return ranges
}

export function insideCodeRange(ranges: readonly CodeRange[], from: number, to: number): boolean {
  for (const range of ranges) if (from < range.to && to > range.from) return true
  return false
}

/** YAML frontmatter is not part of the Markdown grammar, so it is matched by shape. */
export function findFrontmatter(state: EditorState): FrontmatterRange | null {
  const doc = state.doc
  if (doc.lines < 2) return null
  if (!/^---\s*$/u.test(doc.line(1).text)) return null
  for (let lineNo = 2; lineNo <= doc.lines; lineNo += 1) {
    const line = doc.line(lineNo)
    if (/^(?:---|\.\.\.)\s*$/u.test(line.text)) {
      return { type: 'frontmatter', from: 0, to: line.to, firstLineNumber: 1, lastLineNumber: lineNo }
    }
    // Frontmatter is a contiguous block at the very top; a blank line ends the search.
    if (line.text.trim() === '' && lineNo > 2) return null
  }
  return null
}

export function findLivePreviewItems(state: EditorState, scope?: ItemScope): LivePreviewItem[] {
  const items: LivePreviewItem[] = []
  const doc = state.doc
  const scanFrom = scope ? doc.lineAt(Math.max(0, Math.min(scope.from, doc.length))).from : 0
  const scanTo = scope ? doc.lineAt(Math.max(0, Math.min(scope.to, doc.length))).to : doc.length

  syntaxTree(state).iterate({
    from: scanFrom,
    to: scanTo,
    enter(node) {
      // 1. Headings
      if (node.name.startsWith('ATXHeading')) {
        const level = node.name.replace('ATXHeading', '')
        const line = doc.lineAt(node.from)
        const touches = selectionTouchesLine(state, line.from, line.to)
        const match = line.text.match(/^(#{1,6}\s+)/)
        const markLen = match ? match[1].length : 0

        items.push({
          type: 'heading',
          level,
          lineFrom: line.from,
          hideFrom: line.from,
          hideTo: line.from + markLen,
          hidden: !touches,
        })
      }

      // 1b. Setext headings ("Title" over "===" or "---")
      else if (node.name === 'SetextHeading1' || node.name === 'SetextHeading2') {
        const level = node.name === 'SetextHeading1' ? '1' : '2'
        const textLine = doc.lineAt(node.from)
        const underlineLine = doc.lineAt(Math.min(node.to, doc.length))
        if (underlineLine.number > textLine.number) {
          const touches = selectionTouchesLine(state, node.from, node.to)
          items.push({
            type: 'heading',
            level,
            lineFrom: textLine.from,
            // Nothing to conceal on the text line itself; the underline carries the syntax.
            hideFrom: textLine.from,
            hideTo: textLine.from,
            hidden: !touches,
          })
          items.push({
            type: 'heading',
            level,
            lineFrom: underlineLine.from,
            hideFrom: underlineLine.from,
            hideTo: underlineLine.to,
            hidden: !touches,
          })
        }
      }

      // 2. Links
      else if (node.name === 'Link') {
        const touches = selectionTouchesRange(state, node.from, node.to)
        let openBracket: { from: number; to: number } | null = null
        let closeBracket: { from: number; to: number } | null = null
        let urlNode: { from: number; to: number } | null = null

        let child = node.node.firstChild
        while (child) {
          if (child.name === 'LinkMark') {
            const markText = doc.sliceString(child.from, child.to)
            if (markText === '[' && !openBracket) {
              openBracket = { from: child.from, to: child.to }
            } else if (markText === ']' && !closeBracket) {
              closeBracket = { from: child.from, to: child.to }
            }
          } else if (child.name === 'URL') {
            urlNode = { from: child.from, to: child.to }
          }
          child = child.nextSibling
        }

        if (urlNode && openBracket && closeBracket && openBracket.to <= closeBracket.from) {
          const url = doc.sliceString(urlNode.from, urlNode.to)
          items.push({
            type: 'link',
            from: node.from,
            to: node.to,
            openFrom: openBracket.from,
            openTo: openBracket.to,
            closeFrom: closeBracket.from,
            url,
            hidden: !touches,
          })
        }
      }

      // 3. Fenced Code Blocks
      else if (node.name === 'FencedCode') {
        const cursorInCode = selectionTouchesRange(state, node.from, node.to)
        const firstLine = doc.lineAt(node.from)
        const lastLine = doc.lineAt(Math.min(node.to, doc.length))
        const firstLineActive = selectionTouchesLine(state, firstLine.from, firstLine.to)
        const lastLineActive = selectionTouchesLine(state, lastLine.from, lastLine.to)

        let language = ''
        let codeText = ''
        let child = node.node.firstChild
        while (child) {
          if (child.name === 'CodeInfo') {
            language = doc.sliceString(child.from, child.to).trim()
          } else if (child.name === 'CodeText') {
            codeText = doc.sliceString(child.from, child.to)
          }
          child = child.nextSibling
        }

        items.push({
          type: 'codeblock',
          from: node.from,
          to: node.to,
          firstLineFrom: firstLine.from,
          firstLineTo: firstLine.to,
          lastLineFrom: lastLine.from,
          lastLineTo: lastLine.to,
          firstLineNumber: firstLine.number,
          lastLineNumber: lastLine.number,
          language,
          codeText,
          active: cursorInCode,
          firstLineActive,
          lastLineActive,
        })
      }

      // 4. Bold
      else if (node.name === 'StrongEmphasis') {
        const touches = selectionTouchesRange(state, node.from, node.to)
        if (node.to - node.from >= 4) {
          items.push({
            type: 'bold',
            openFrom: node.from,
            openTo: node.from + 2,
            closeFrom: node.to - 2,
            closeTo: node.to,
            contentFrom: node.from + 2,
            contentTo: node.to - 2,
            hidden: !touches,
          })
        }
      }

      // 5. Italic
      else if (node.name === 'Emphasis') {
        const touches = selectionTouchesRange(state, node.from, node.to)
        if (node.to - node.from >= 2) {
          items.push({
            type: 'italic',
            openFrom: node.from,
            openTo: node.from + 1,
            closeFrom: node.to - 1,
            closeTo: node.to,
            contentFrom: node.from + 1,
            contentTo: node.to - 1,
            hidden: !touches,
          })
        }
      }

      // 6. Strikethrough
      else if (node.name === 'Strikethrough') {
        const touches = selectionTouchesRange(state, node.from, node.to)
        if (node.to - node.from >= 4) {
          items.push({
            type: 'strike',
            openFrom: node.from,
            openTo: node.from + 2,
            closeFrom: node.to - 2,
            closeTo: node.to,
            contentFrom: node.from + 2,
            contentTo: node.to - 2,
            hidden: !touches,
          })
        }
      }

      // 7. Inline Code
      else if (node.name === 'InlineCode') {
        const touches = selectionTouchesRange(state, node.from, node.to)
        if (node.to - node.from >= 2) {
          items.push({
            type: 'inline-code',
            openFrom: node.from,
            openTo: node.from + 1,
            closeFrom: node.to - 1,
            closeTo: node.to,
            contentFrom: node.from + 1,
            contentTo: node.to - 1,
            hidden: !touches,
          })
        }
      }

      // 8. Task Markers
      else if (node.name === 'TaskMarker') {
        const listMark = node.node.parent?.parent?.firstChild
        const bullet = listMark?.name === 'ListMark' && /^[-*+]$/u.test(doc.sliceString(listMark.from, listMark.to))
        const concealFrom = bullet && listMark ? listMark.from : node.from
        const markerText = doc.sliceString(node.from, node.to)
        items.push({
          type: 'task',
          from: node.from,
          to: node.to,
          concealFrom,
          lineTo: doc.lineAt(node.to).to,
          checked: markerText.toLowerCase().includes('x'),
          hidden: !selectionTouchesRange(state, concealFrom, node.to),
        })
      }

      // 9. Blockquote / Callouts
      else if (node.name === 'Blockquote') {
        const firstLine = doc.lineAt(node.from)
        const lastLine = doc.lineAt(Math.min(node.to, doc.length))
        const calloutMatch = firstLine.text.match(/^(\s*)>\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i)

        if (calloutMatch) {
          const calloutType = calloutMatch[2].toLowerCase() as CalloutRange['calloutType']
          const cursorOnFirstLine = selectionTouchesLine(state, firstLine.from, firstLine.to)
          const markStart = firstLine.from + calloutMatch[1].length
          const title = calloutMatch[3].trim()
          const markEnd = title ? firstLine.to - calloutMatch[3].length : firstLine.to

          items.push({
            type: 'callout',
            calloutType,
            firstLineFrom: firstLine.from,
            firstLineTo: firstLine.to,
            firstLineNumber: firstLine.number,
            lastLineNumber: lastLine.number,
            markFrom: markStart,
            markTo: markEnd,
            title,
            hidden: !cursorOnFirstLine,
          })

          for (let lineNo = firstLine.number + 1; lineNo <= lastLine.number; lineNo += 1) {
            const line = doc.line(lineNo)
            const cursorOnLine = selectionTouchesLine(state, line.from, line.to)
            const match = line.text.match(/^(\s*)(> ?)/)
            items.push({
              type: 'blockquote',
              lineFrom: line.from,
              className: `inkline-callout-line inkline-callout-${calloutType}`,
              markFrom: match ? line.from + match[1].length : undefined,
              markTo: match ? line.from + match[1].length + match[2].length : undefined,
              hidden: !cursorOnLine,
            })
          }
        } else {
          for (let lineNo = firstLine.number; lineNo <= lastLine.number; lineNo += 1) {
            const line = doc.line(lineNo)
            const cursorOnLine = selectionTouchesLine(state, line.from, line.to)
            const match = line.text.match(/^(\s*)(> ?)/)
            items.push({
              type: 'blockquote',
              lineFrom: line.from,
              className: 'inkline-blockquote-line',
              markFrom: match ? line.from + match[1].length : undefined,
              markTo: match ? line.from + match[1].length + match[2].length : undefined,
              hidden: !cursorOnLine,
            })
          }
        }
      }

      // 9b. Images
      else if (node.name === 'Image') {
        const touches = selectionTouchesRange(state, node.from, node.to)
        let urlNode: { from: number; to: number } | null = null
        let child = node.node.firstChild
        while (child) {
          if (child.name === 'URL') urlNode = { from: child.from, to: child.to }
          child = child.nextSibling
        }
        const text = doc.sliceString(node.from, node.to)
        const altMatch = text.match(/^!\[([^\]]*)\]/u)
        if (urlNode) {
          items.push({
            type: 'image',
            from: node.from,
            to: node.to,
            source: doc.sliceString(urlNode.from, urlNode.to).trim(),
            alt: altMatch ? altMatch[1] : '',
            hidden: !touches,
          })
        }
      }

      // 10. Horizontal Rule
      else if (node.name === 'HorizontalRule') {
        const line = doc.lineAt(node.from)
        const cursorOnLine = selectionTouchesLine(state, line.from, line.to)
        items.push({
          type: 'hr',
          from: line.from,
          to: line.to,
          hidden: !cursorOnLine,
        })
      }
    },
  })

  // 11. WikiLinks ([[target]] or [[target|alias]])
  const docText = doc.sliceString(scanFrom, scanTo)
  const wikiRegex = /\[\[([^\]|\n]+)(?:\|([^\]\n]+))?\]\]/g
  let wikiMatch: RegExpExecArray | null
  while ((wikiMatch = wikiRegex.exec(docText)) !== null) {
    const from = scanFrom + wikiMatch.index
    const to = from + wikiMatch[0].length
    const touches = selectionTouchesRange(state, from, to)
    const target = wikiMatch[1].trim()
    const label = (wikiMatch[2] ? wikiMatch[2] : wikiMatch[1]).trim()
    items.push({
      type: 'wikilink',
      from,
      to,
      target,
      label,
      hidden: !touches,
    })
  }

  return items
}
