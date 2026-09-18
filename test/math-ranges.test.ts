import { describe, expect, it } from 'vitest'
import { findMathRanges, rangeTouchesSelection } from '../webview/src/editor/math-ranges'

describe('math ranges', () => {
  it('finds inline and block latex', () => {
    const text = 'Energy $E=mc^2$ and\n$$\na^2+b^2=c^2\n$$'
    expect(findMathRanges(text)).toEqual([
      { from: 7, to: 15, block: false, latex: 'E=mc^2' },
      { from: 20, to: text.length, block: true, latex: 'a^2+b^2=c^2' },
    ])
  })

  it('ignores dollar signs inside code', () => {
    expect(findMathRanges('use `$value` and\n```js\nconst x = "$"\n```')).toEqual([])
  })

  it('does not treat currency as math', () => {
    expect(findMathRanges('It costs $12 tomorrow')).toEqual([])
  })

  it('knows when the cursor is inside a formula', () => {
    expect(rangeTouchesSelection({ from: 4, to: 10, block: false, latex: 'x' }, 5, 5)).toBe(true)
    expect(rangeTouchesSelection({ from: 4, to: 10, block: false, latex: 'x' }, 11, 11)).toBe(false)
  })
})
