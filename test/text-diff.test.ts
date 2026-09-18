import { describe, expect, it } from 'vitest'
import { diffRange } from '../src/text-diff'

describe('diffRange', () => {
  it('narrows a keystroke to the character that changed', () => {
    expect(diffRange('hello world', 'hello brave world')).toEqual({ from: 6, to: 6, insert: 'brave ' })
  })

  it('reports a deletion as an empty insert', () => {
    expect(diffRange('hello brave world', 'hello world')).toEqual({ from: 6, to: 12, insert: '' })
  })

  it('handles a replacement in the middle', () => {
    expect(diffRange('one two three', 'one TWO three')).toEqual({ from: 4, to: 7, insert: 'TWO' })
  })

  it('returns an empty span for identical text', () => {
    expect(diffRange('same', 'same')).toEqual({ from: 4, to: 4, insert: '' })
  })

  it('handles growth at either end', () => {
    expect(diffRange('middle', 'start middle')).toEqual({ from: 0, to: 0, insert: 'start ' })
    expect(diffRange('middle', 'middle end')).toEqual({ from: 6, to: 6, insert: ' end' })
  })

  it('handles empty documents in both directions', () => {
    expect(diffRange('', 'new')).toEqual({ from: 0, to: 0, insert: 'new' })
    expect(diffRange('old', '')).toEqual({ from: 0, to: 3, insert: '' })
  })

  it('keeps repeated text from collapsing the span', () => {
    const span = diffRange('aaa', 'aaaa')
    expect('aaa'.slice(0, span.from) + span.insert + 'aaa'.slice(span.to)).toBe('aaaa')
  })
})
