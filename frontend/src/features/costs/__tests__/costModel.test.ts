import { budgetPercent, costForNode, hardStopLevel, parseMaxUsd } from '../costModel'
it('budgetPercent computes ratio', () => { expect(budgetPercent(8, 10)).toBe(80) })
it('hardStopLevel escalates', () => {
  expect(hardStopLevel(50)).toBe('ok')
  expect(hardStopLevel(80)).toBe('warn')
  expect(hardStopLevel(100)).toBe('blocked')
})
it('costForNode returns 0 in V1 (no cost telemetry in the wire)', () => {
  expect(costForNode({})).toBe(0)
})
it('parseMaxUsd accepts positive numbers', () => {
  expect(parseMaxUsd('20')).toEqual({ value: 20 })
  expect(parseMaxUsd(' 0.01 ')).toEqual({ value: 0.01 })
})
it('parseMaxUsd rejects empty, non-numeric and non-positive values', () => {
  expect(parseMaxUsd('')).toHaveProperty('error')
  expect(parseMaxUsd('abc')).toHaveProperty('error')
  expect(parseMaxUsd('0')).toHaveProperty('error')
  expect(parseMaxUsd('-5')).toHaveProperty('error')
})
