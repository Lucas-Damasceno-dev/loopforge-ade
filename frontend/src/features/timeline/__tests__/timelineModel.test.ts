import { deriveSteps, ghostState } from '../timelineModel'
it('derives steps from non-pending nodes in order', () => {
  const statuses = { entry: { status: 'approved' as const, attemptCount: 1 }, cpo: { status: 'running' as const, attemptCount: 1 }, dev: { status: 'pending' as const, attemptCount: 0 } }
  const steps = deriveSteps(statuses, ['entry', 'cpo', 'dev'])
  expect(steps.map(s => s.node)).toEqual(['entry', 'cpo'])
})
it('ghostState maps live (null) to full length', () => {
  const steps = [{ index: 0, node: 'entry' as const, status: 'approved' as const }]
  expect(ghostState(null, steps)).toEqual({ ghostToStep: null })
})
