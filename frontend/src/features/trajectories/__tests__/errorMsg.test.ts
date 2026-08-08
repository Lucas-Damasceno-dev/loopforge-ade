import { describe, it, expect } from 'vitest'
import { trajectoryErrorMessage } from '../errorMsg'

// trajectoryErrorMessage — mapeia erros da API de trajetórias para PT-BR.
describe('trajectoryErrorMessage', () => {
  it('404 with English "Run not found" maps to PT fallback', () => {
    expect(trajectoryErrorMessage({ status: 404, detail: 'Run not found' })).toBe('Run não encontrada (sem trajetória)')
  })
  it('404 with PT detail keeps the backend detail', () => {
    expect(trajectoryErrorMessage({ status: 404, detail: 'Run run-x não encontrada (sem trajetória)' })).toBe('Run run-x não encontrada (sem trajetória)')
  })
  it('404 with empty/whitespace detail falls back', () => {
    expect(trajectoryErrorMessage({ status: 404, detail: '  ' })).toBe('Run não encontrada (sem trajetória)')
    expect(trajectoryErrorMessage({ status: 404, detail: '' })).toBe('Run não encontrada (sem trajetória)')
  })
  it('409 uses detail or generic thread conflict message', () => {
    expect(trajectoryErrorMessage({ status: 409, detail: 'thread já existe' })).toBe('thread já existe')
    expect(trajectoryErrorMessage({ status: 409, detail: null })).toBe('Já existe uma trajetória com este id')
  })
  it('422 uses detail or generic invalid payload message', () => {
    expect(trajectoryErrorMessage({ status: 422, detail: 'campo inválido' })).toBe('campo inválido')
    expect(trajectoryErrorMessage({ status: 422, detail: null })).toBe('Payload de import inválido (schema 1.1)')
  })
  it('unknown status uses detail or generic status message', () => {
    expect(trajectoryErrorMessage({ status: 500, detail: 'internal' })).toBe('internal')
    expect(trajectoryErrorMessage({ status: 503, detail: null })).toBe('Erro 503 na API')
  })
  it('error without detail key is treated as non-API and falls back (shape check)', () => {
    // isApiError exige a chave `detail` — objeto só com status cai no fallback.
    expect(trajectoryErrorMessage({ status: 409 })).toBe('Falha na operação')
  })
  it('non-string detail (object) falls back per status', () => {
    expect(trajectoryErrorMessage({ status: 422, detail: { field: 'x' } })).toBe('Payload de import inválido (schema 1.1)')
  })
  it('plain Error uses its message', () => {
    expect(trajectoryErrorMessage(new Error('network down'))).toBe('network down')
  })
  it('non-Error, non-API values use the fallback', () => {
    expect(trajectoryErrorMessage('boom')).toBe('Falha na operação')
    expect(trajectoryErrorMessage(null)).toBe('Falha na operação')
    expect(trajectoryErrorMessage(undefined)).toBe('Falha na operação')
    expect(trajectoryErrorMessage({})).toBe('Falha na operação')
  })
  it('custom fallback is honored', () => {
    expect(trajectoryErrorMessage(null, 'custom')).toBe('custom')
  })
})
