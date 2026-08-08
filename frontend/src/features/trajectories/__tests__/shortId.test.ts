import { describe, it, expect } from 'vitest'
import { shortId } from '../shortId'

// shortId — exibição compacta de ids de runs/checkpoints (RunTabs/ForkDialog).
describe('shortId', () => {
  it('keeps demo- prefix and shows the last 4 chars', () => {
    expect(shortId('demo-1730000000000')).toBe('demo-0000')
    expect(shortId('demo-abc123')).toBe('demo-c123')
  })
  it('shortens long ids to # + last 6 chars', () => {
    expect(shortId('550e8400-e29b-41d4-a716-446655440000')).toBe('#440000')
    expect(shortId('abcdefghijk')).toBe('#fghijk')
  })
  it('keeps short ids unchanged (length <= 10)', () => {
    expect(shortId('r1')).toBe('r1')
    expect(shortId('1234567890')).toBe('1234567890') // exatamente 10
  })
  it('handles empty string', () => {
    expect(shortId('')).toBe('')
  })
  it('demo- always keeps the last 4 chars, even for absurdly short ids', () => {
    // Comportamento atual: slice(-4) incondicional — ids demo reais são
    // sempre demo-<epoch> (longos), então o caso abaixo não ocorre em produção.
    expect(shortId('demo-1')).toBe('demo-mo-1')
    expect(shortId('demo-1234')).toBe('demo-1234')
  })
})
