import { budgetPercent, costForNode, hardStopLevel } from '../costModel'
it('budgetPercent computes ratio', () => { expect(budgetPercent(8, 10)).toBe(80) })
it('hardStopLevel escalates', () => {
  expect(hardStopLevel(50)).toBe('ok')
  expect(hardStopLevel(80)).toBe('warn')
  expect(hardStopLevel(100)).toBe('blocked')
})
it('costForNode returns 0 in V1 (no cost telemetry in the wire)', () => {
  expect(costForNode({})).toBe(0)
})
