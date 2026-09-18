import { describe, expect, it } from 'vitest'
import { countCharacters, countWords, normalizeMarkdown } from '../webview/src/editor/serializer'

describe('serializer helpers', () => {
  it('handles Unicode and empty documents', () => {
    expect(normalizeMarkdown('')).toBe('')
    expect(countWords('')).toBe(0)
    expect(countCharacters('नमस्ते दुनिया')).toBe(13)
  })

  it('does not count Markdown punctuation as prose words', () => {
    expect(countWords('**Hello**, [world](https://example.com)')).toBe(2)
  })
})
