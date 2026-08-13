import { beforeEach, describe, expect, it } from 'vitest'
import { useBudgetOverrideStore } from '../budgetOverrideStore'

describe('useBudgetOverrideStore', () => {
  beforeEach(() => {
    useBudgetOverrideStore.setState({ open: false, runId: null })
  })

  it('openOverride define open + runId', () => {
    useBudgetOverrideStore.getState().openOverride('r1')
    expect(useBudgetOverrideStore.getState()).toMatchObject({ open: true, runId: 'r1' })
  })

  it('closeOverride limpa open + runId', () => {
    useBudgetOverrideStore.getState().openOverride('r1')
    useBudgetOverrideStore.getState().closeOverride()
    expect(useBudgetOverrideStore.getState()).toMatchObject({ open: false, runId: null })
  })
})
