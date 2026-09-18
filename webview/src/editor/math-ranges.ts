export interface MathRange {
  from: number
  to: number
  block: boolean
  latex: string
}

function skipFence(text: string, start: number): number {
  const marker = text.startsWith('```', start) ? '```' : text.startsWith('~~~', start) ? '~~~' : null
  if (!marker) return start
  const close = text.indexOf(marker, start + marker.length)
  return close === -1 ? text.length : close + marker.length
}

function skipInlineCode(text: string, start: number): number {
  if (text[start] !== '`') return start
  let ticks = 1
  while (start + ticks < text.length && text[start + ticks] === '`') ticks += 1
  const close = text.indexOf('`'.repeat(ticks), start + ticks)
  return close === -1 ? text.length : close + ticks
}

export function findMathRanges(text: string): MathRange[] {
  const ranges: MathRange[] = []
  const length = text.length
  let index = 0

  while (index < length) {
    if (text.startsWith('```', index) || text.startsWith('~~~', index)) {
      index = skipFence(text, index)
      continue
    }

    if (text[index] === '`') {
      index = skipInlineCode(text, index)
      continue
    }

    if (text.startsWith('$$', index)) {
      const close = text.indexOf('$$', index + 2)
      if (close !== -1) {
        ranges.push({
          from: index,
          to: close + 2,
          block: true,
          latex: text.slice(index + 2, close).trim(),
        })
        index = close + 2
        continue
      }
      // Unterminated block delimiter: step over both dollars so the second one
      // cannot start a bogus inline range.
      index += 2
      continue
    }

    if (text[index] === '$') {
      const previous = index === 0 ? '' : text[index - 1]
      const next = text[index + 1] ?? ''
      if (!/\d/u.test(previous) && next !== '$' && next !== ' ' && next !== '\n') {
        let cursor = index + 1
        while (cursor < length && text[cursor] !== '$' && text[cursor] !== '\n') cursor += 1
        if (text[cursor] === '$' && cursor > index + 1 && text[cursor - 1] !== ' ') {
          ranges.push({
            from: index,
            to: cursor + 1,
            block: false,
            latex: text.slice(index + 1, cursor),
          })
          index = cursor + 1
          continue
        }
      }
    }

    index += 1
  }

  return ranges
}

export function rangeTouchesSelection(range: MathRange, from: number, to: number): boolean {
  return from <= range.to && to >= range.from
}
