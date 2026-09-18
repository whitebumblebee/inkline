import { describe, expect, it } from 'vitest'
import {
  applySourceCommand,
  indentMarkdownLine,
  outdentMarkdownLine,
  wrapSelection,
} from '../webview/src/editor/markdown-editing'

describe('markdown editing', () => {
  it('wraps the current selection in bold markers', () => {
    expect(wrapSelection({ value: 'hello world', start: 6, end: 11 }, '**')).toEqual({
      value: 'hello **world**',
      start: 8,
      end: 13,
    })
  })

  it('prefixes selected lines as a numbered list', () => {
    expect(applySourceCommand({ value: 'one\ntwo', start: 0, end: 7 }, 'numbered-list')).toEqual({
      value: '1. one\n2. two',
      start: 0,
      end: 13,
    })
  })

  it('indents a numbered list item by 3 spaces (CommonMark standard) and restarts numbering at 1', () => {
    expect(indentMarkdownLine('2. second item')).toBe('   1. second item')
    expect(indentMarkdownLine('10. tenth item')).toBe('   1. tenth item')
    expect(indentMarkdownLine('   3. nested item')).toBe('      1. nested item')
    expect(indentMarkdownLine('      1. level three')).toBe('         1. level three')
    expect(indentMarkdownLine('         1. level four')).toBe('            1. level four')
    expect(indentMarkdownLine('1) with paren')).toBe('   1) with paren')
    expect(indentMarkdownLine('1.')).toBe('   1. ')
    expect(indentMarkdownLine('1. ')).toBe('   1. ')
  })

  it('indents an unordered bullet item by 2 spaces', () => {
    expect(indentMarkdownLine('- bullet')).toBe('  - bullet')
    expect(indentMarkdownLine('* asterisk')).toBe('  * asterisk')
    expect(indentMarkdownLine('  - nested')).toBe('    - nested')
    expect(indentMarkdownLine('    - deep')).toBe('      - deep')
  })

  it('returns null when trying to indent a non-list line', () => {
    expect(indentMarkdownLine('Just a regular paragraph')).toBeNull()
    expect(indentMarkdownLine('---')).toBeNull()
  })

  it('outdents a nested numbered item and restores sequential numbering from previous line', () => {
    expect(outdentMarkdownLine('   1. sub-item', '1. parent')).toBe('2. sub-item')
    expect(outdentMarkdownLine('   1. sub-item', '4. parent')).toBe('5. sub-item')
    expect(outdentMarkdownLine('   1. standalone item')).toBe('1. standalone item')
    expect(outdentMarkdownLine('      1. level three', '   2. level two')).toBe('   3. level three')
    expect(outdentMarkdownLine('  1. legacy two space', '1. parent')).toBe('2. legacy two space')
  })

  it('outdents a nested bullet item', () => {
    expect(outdentMarkdownLine('  - sub-bullet')).toBe('- sub-bullet')
    expect(outdentMarkdownLine('    * deeply nested')).toBe('  * deeply nested')
  })

})
