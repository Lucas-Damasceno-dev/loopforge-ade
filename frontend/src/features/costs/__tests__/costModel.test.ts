import { budgetPercent, costForNode, formatUsd, hardStopLevel, parseMaxUsd } from '../costModel'
import type { CostNode } from '../../../shared/lib/types'

const NODES: CostNode[] = [
  { node: 'developer', spent_usd: 0.12, estimated: true },
  { node: 'qa', spent_usd: 0.5, estimated: false },
]

it('budgetPercent computes ratio', () => { expect(budgetPercent(8, 10)).toBe(80) })
it('budgetPercent guards non-positive max_usd', () => {
  expect(budgetPercent(5, 0)).toBe(0)
  expect(budgetPercent(5, -10)).toBe(0)
  expect(budgetPercent(0, 0)).toBe(0)
})
it('hardStopLevel escalates', () => {
  expect(hardStopLevel(50)).toBe('ok')
  expect(hardStopLevel(80)).toBe('warn')
  expect(hardStopLevel(100)).toBe('blocked')
})
it('hardStopLevel boundaries (79 ok, 99 warn, 101 blocked)', () => {
  expect(hardStopLevel(79)).toBe('ok')
  expect(hardStopLevel(99)).toBe('warn')
  expect(hardStopLevel(101)).toBe('blocked')
})
it('costForNode returns spent_usd for matching node and 0 otherwise (Fase D)', () => {
  expect(costForNode(NODES, 'developer')).toBe(0.12)
  expect(costForNode(NODES, 'qa')).toBe(0.5)
  expect(costForNode(NODES, 'cpo')).toBe(0) // nó sem custo → sem chip
  expect(costForNode(undefined, 'developer')).toBe(0) // nodes ausente (V1)
  expect(costForNode([], 'developer')).toBe(0)
})
it('formatUsd renders 2 decimals with $ prefix', () => {
  expect(formatUsd(0.12)).toBe('$0.12')
  expect(formatUsd(5)).toBe('$5.00')
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
it('parseMaxUsd rejects Infinity and accepts exponent/whitespace', () => {
  expect(parseMaxUsd('Infinity')).toHaveProperty('error')
  expect(parseMaxUsd('NaN')).toHaveProperty('error')
  expect(parseMaxUsd('   ')).toHaveProperty('error')
  expect(parseMaxUsd('1e3')).toEqual({ value: 1000 })
  expect(parseMaxUsd(' 0.0001 ')).toEqual({ value: 0.0001 })
})
it('formatUsd handles zero and larger values', () => {
  expect(formatUsd(0)).toBe('$0.00')
  expect(formatUsd(1234.5)).toBe('$1234.50')
})
