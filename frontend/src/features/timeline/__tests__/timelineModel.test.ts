import { deriveSteps, ghostState } from '../timelineModel'
it('derives steps from non-pending nodes in order', () => {
  const statuses = { entry: { status: 'approved' as const, attemptCount: 1 }, cpo: { status: 'running' as const, attemptCount: 1 }, developer: { status: 'pending' as const, attemptCount: 0 } }
  const steps = deriveSteps(statuses, ['entry', 'cpo', 'developer'])
  expect(steps.map(s => s.node)).toEqual(['entry', 'cpo'])
})
it('ghostState maps live (null) to full length', () => {
  const steps = [{ index: 0, node: 'entry' as const, status: 'approved' as const }]
  expect(ghostState(null, steps)).toEqual({ ghostToStep: null })
})
it('deriveSteps returns [] for empty statuses or all-pending', () => {
  expect(deriveSteps({}, ['entry', 'cpo'])).toEqual([])
  expect(deriveSteps(
    { entry: { status: 'pending' as const, attemptCount: 0 }, cpo: { status: 'pending' as const, attemptCount: 0 } },
    ['entry', 'cpo'],
  )).toEqual([])
})
it('ghostState clamps negative and overflow steps', () => {
  const steps = [{ index: 0, node: 'entry' as const, status: 'approved' as const }]
  expect(ghostState(0, steps)).toEqual({ ghostToStep: 0 })
  expect(ghostState(-1, steps)).toEqual({ ghostToStep: 0 }) // clamp inferior
  expect(ghostState(999, steps)).toEqual({ ghostToStep: 1 }) // clamp ao nº de steps
  expect(ghostState(0, [])).toEqual({ ghostToStep: 0 }) // sem steps
})
