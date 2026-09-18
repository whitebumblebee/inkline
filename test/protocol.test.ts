import { describe, expect, it } from 'vitest'
import { isWebviewToHostMessage } from '../src/protocol'

describe('protocol validation', () => {
  it('accepts known message types', () => {
    expect(isWebviewToHostMessage({ type: 'ready' })).toBe(true)
    expect(isWebviewToHostMessage({ type: 'replaceDocument' })).toBe(true)
  })

  it('rejects unknown and removed mode messages', () => {
    expect(isWebviewToHostMessage(null)).toBe(false)
    expect(isWebviewToHostMessage({ type: 'unknown' })).toBe(false)
    expect(isWebviewToHostMessage({ type: 'setMode' })).toBe(false)
  })
})
