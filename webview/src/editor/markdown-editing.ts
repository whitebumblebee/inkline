export type SourceCommand =
  | 'heading'
  | 'bold'
  | 'italic'
  | 'highlight'
  | 'bulleted-list'
  | 'numbered-list'
  | 'quote'
  | 'code'

export interface TextSelection {
  value: string
  start: number
  end: number
}

export interface TextEditResult {
  value: string
  start: number
  end: number
}

function selectedOr(value: string, start: number, end: number, fallback: string): string {
  return start === end ? fallback : value.slice(start, end)
}

export function wrapSelection(selection: TextSelection, before: string, after = before, fallback = 'text'): TextEditResult {
  const content = selectedOr(selection.value, selection.start, selection.end, fallback)
  const text = `${before}${content}${after}`
  const value = selection.value.slice(0, selection.start) + text + selection.value.slice(selection.end)
  return {
    value,
    start: selection.start + before.length,
    end: selection.start + before.length + content.length,
  }
}

export function prefixSelectedLines(
  selection: TextSelection,
  prefix: string | ((index: number) => string),
  fallback = 'text',
): TextEditResult {
  const source = selectedOr(selection.value, selection.start, selection.end, fallback)
  const text = source
    .split('\n')
    .map((line, index) => `${typeof prefix === 'string' ? prefix : prefix(index)}${line}`)
    .join('\n')
  const value = selection.value.slice(0, selection.start) + text + selection.value.slice(selection.end)
  return {
    value,
    start: selection.start,
    end: selection.start + text.length,
  }
}

export function applySourceCommand(selection: TextSelection, command: SourceCommand): TextEditResult {
  switch (command) {
    case 'heading':
      return prefixSelectedLines(selection, '## ')
    case 'bold':
      return wrapSelection(selection, '**')
    case 'italic':
      return wrapSelection(selection, '*')
    case 'highlight':
      return wrapSelection(selection, '==')
    case 'bulleted-list':
      return prefixSelectedLines(selection, '- ')
    case 'numbered-list':
      return prefixSelectedLines(selection, (index) => `${index + 1}. `)
    case 'quote':
      return prefixSelectedLines(selection, '> ')
    case 'code':
      return wrapSelection(selection, '`', '`', 'code')
  }
}

export function indentMarkdownLine(lineText: string): string | null {
  const numMatch = lineText.match(/^(\s*)(\d+)([.)])(?:\s+(.*)|$)/)
  if (numMatch) {
    const indent = numMatch[1] + '   '
    const delim = numMatch[3]
    const rest = numMatch[4] !== undefined ? ' ' + numMatch[4] : ' '
    return `${indent}1${delim}${rest}`
  }
  const bulletMatch = lineText.match(/^(\s*)([-*+])(?:\s+(.*)|$)/)
  if (bulletMatch) {
    const indent = bulletMatch[1] + '  '
    const bullet = bulletMatch[2]
    const rest = bulletMatch[3] !== undefined ? ' ' + bulletMatch[3] : ' '
    return `${indent}${bullet}${rest}`
  }
  return null
}

export function outdentMarkdownLine(lineText: string, prevLineText?: string): string | null {
  const numMatch = lineText.match(/^(\s*)(\d+)([.)])(?:\s+(.*)|$)/)
  if (numMatch && numMatch[1].length > 0) {
    const currentIndent = numMatch[1]
    const removeCount = currentIndent.length >= 3 ? 3 : currentIndent.length >= 2 ? 2 : 1
    const newIndent = currentIndent.slice(0, currentIndent.length - removeCount)
    const delim = numMatch[3]
    const rest = numMatch[4] !== undefined ? ' ' + numMatch[4] : ' '

    let targetNum = 1
    if (prevLineText) {
      const prevNumMatch = prevLineText.match(/^(\s*)(\d+)[.)](?:\s+|$)/)
      if (prevNumMatch && prevNumMatch[1].length === newIndent.length) {
        targetNum = Number(prevNumMatch[2]) + 1
      }
    }
    return `${newIndent}${targetNum}${delim}${rest}`
  }

  const bulletMatch = lineText.match(/^(\s*)([-*+])(?:\s+(.*)|$)/)
  if (bulletMatch && bulletMatch[1].length > 0) {
    const currentIndent = bulletMatch[1]
    const removeCount = currentIndent.length >= 2 ? 2 : 1
    const newIndent = currentIndent.slice(0, currentIndent.length - removeCount)
    const bullet = bulletMatch[2]
    const rest = bulletMatch[3] !== undefined ? ' ' + bulletMatch[3] : ' '
    return `${newIndent}${bullet}${rest}`
  }

  return null
}
