import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { GFM } from '@lezer/markdown'
import { findTableBlocks, splitCells } from '../webview/src/editor/table-preview'

function createState(doc: string): EditorState {
  return EditorState.create({
    doc,
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
  })
}

describe('splitCells', () => {
  it('drops the optional outer pipes and trims', () => {
    expect(splitCells('| a | b | c |')).toEqual(['a', 'b', 'c'])
    expect(splitCells('a | b | c')).toEqual(['a', 'b', 'c'])
  })

  it('keeps an escaped pipe inside a cell', () => {
    expect(splitCells('| a \\| b | c |')).toEqual(['a | b', 'c'])
  })

  it('preserves empty cells between pipes', () => {
    expect(splitCells('| a |  | c |')).toEqual(['a', '', 'c'])
  })
})

describe('findTableBlocks', () => {
  it('needs a delimiter row, so prose containing a pipe is not a table', () => {
    expect(findTableBlocks(createState('a | b is just text\n\nmore text'))).toHaveLength(0)
  })

  it('spans the header and every body row', () => {
    const blocks = findTableBlocks(createState('intro\n\n| A | B |\n| - | - |\n| 1 | 2 |\n| 3 | 4 |\n\nafter'))
    expect(blocks).toHaveLength(1)
    expect(blocks[0].firstLineNumber).toBe(3)
    expect(blocks[0].lastLineNumber).toBe(6)
    // the delimiter row is not a rendered row
    expect(blocks[0].rows).toEqual(['| A | B |', '| 1 | 2 |', '| 3 | 4 |'])
  })

  it('accepts a header-only table', () => {
    const blocks = findTableBlocks(createState('| A | B |\n| - | - |\n'))
    expect(blocks).toHaveLength(1)
    expect(blocks[0].rows).toEqual(['| A | B |'])
  })

  it('reads column alignment from the delimiter row', () => {
    const blocks = findTableBlocks(createState('| A | B | C | D |\n| :-- | --: | :-: | --- |\n| 1 | 2 | 3 | 4 |'))
    expect(blocks[0].align).toEqual(['left', 'right', 'center', null])
  })

  it('accepts short delimiter cells, which GFM allows', () => {
    expect(findTableBlocks(createState('| A | B |\n| :- | -: |\n| 1 | 2 |'))).toHaveLength(1)
  })

  it('finds several tables in one document', () => {
    const doc = '| A |\n| - |\n| 1 |\n\ntext\n\n| B |\n| - |\n| 2 |'
    const blocks = findTableBlocks(createState(doc))
    expect(blocks).toHaveLength(2)
    expect(blocks[1].firstLineNumber).toBe(7)
  })

  it('stops the table at a blank line', () => {
    const blocks = findTableBlocks(createState('| A |\n| - |\n| 1 |\n\n| not | part |'))
    expect(blocks[0].lastLineNumber).toBe(3)
  })

  it('does not run past the end of the document', () => {
    expect(() => findTableBlocks(createState('| A | B |'))).not.toThrow()
    expect(findTableBlocks(createState('| A | B |'))).toHaveLength(0)
  })
})
