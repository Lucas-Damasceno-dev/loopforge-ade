import { describe, it, expect } from 'vitest'
import { trajectoryErrorMessage } from '../errorMsg'

// trajectoryErrorMessage — mapeia erros da API de trajetórias: fallback EN
// por status; detail do backend (PT) é preservado quando presente.
describe('trajectoryErrorMessage', () => {
  it('404 with English "Run not found" maps to EN fallback', () => {
    expect(trajectoryErrorMessage({ status: 404, detail: 'Run not found' })).toBe('Run not found (no trajectory)')
  })
  it('404 with PT detail keeps the backend detail', () => {
    expect(trajectoryErrorMessage({ status: 404, detail: 'Run run-x não encontrada (sem trajetória)' })).toBe('Run run-x não encontrada (sem trajetória)')
  })
  it('404 with empty/whitespace detail falls back', () => {
    expect(trajectoryErrorMessage({ status: 404, detail: '  ' })).toBe('Run not found (no trajectory)')
    expect(trajectoryErrorMessage({ status: 404, detail: '' })).toBe('Run not found (no trajectory)')
  })
  it('409 uses detail or generic thread conflict message', () => {
    expect(trajectoryErrorMessage({ status: 409, detail: 'thread já existe' })).toBe('thread já existe')
    expect(trajectoryErrorMessage({ status: 409, detail: null })).toBe('A trajectory with this id already exists')
  })
  it('422 uses detail or generic invalid payload message', () => {
    expect(trajectoryErrorMessage({ status: 422, detail: 'campo inválido' })).toBe('campo inválido')
    expect(trajectoryErrorMessage({ status: 422, detail: null })).toBe('Invalid import payload (schema 1.1)')
  })
  it('unknown status uses detail or generic status message', () => {
    expect(trajectoryErrorMessage({ status: 500, detail: 'internal' })).toBe('internal')
    expect(trajectoryErrorMessage({ status: 503, detail: null })).toBe('API error 503')
  })
  it('error without detail key is still recognized as API error (detail optional)', () => {
    // isApiError não exige mais a chave `detail` — objeto só com status usa o
    // fallback por status.
    expect(trajectoryErrorMessage({ status: 409 })).toBe('A trajectory with this id already exists')
    expect(trajectoryErrorMessage({ status: 503 })).toBe('API error 503')
    expect(trajectoryErrorMessage({ status: 404 })).toBe('Run not found (no trajectory)')
  })
  it('non-string detail (object) falls back per status', () => {
    expect(trajectoryErrorMessage({ status: 422, detail: { field: 'x' } })).toBe('Invalid import payload (schema 1.1)')
  })
  it('plain Error uses its message', () => {
    expect(trajectoryErrorMessage(new Error('network down'))).toBe('network down')
  })
  it('non-Error, non-API values use the fallback', () => {
    expect(trajectoryErrorMessage('boom')).toBe('Operation failed')
    expect(trajectoryErrorMessage(null)).toBe('Operation failed')
    expect(trajectoryErrorMessage(undefined)).toBe('Operation failed')
    expect(trajectoryErrorMessage({})).toBe('Operation failed')
  })
  it('custom fallback is honored', () => {
    expect(trajectoryErrorMessage(null, 'custom')).toBe('custom')
  })
})
