import { describe, it, expect, beforeEach } from 'vitest'
import { useViewStore } from '../viewStore'

describe('viewStore', () => {
  beforeEach(() => {
    useViewStore.setState({ activeView: null })
  })

  it('openView seta a view ativa', () => {
    useViewStore.getState().openView('memory')
    expect(useViewStore.getState().activeView).toBe('memory')
  })

  it('openView da view já ativa fecha (null)', () => {
    useViewStore.getState().openView('memory')
    useViewStore.getState().openView('memory')
    expect(useViewStore.getState().activeView).toBeNull()
  })

  it('openView troca de view', () => {
    useViewStore.getState().openView('memory')
    useViewStore.getState().openView('git')
    expect(useViewStore.getState().activeView).toBe('git')
  })

  it('closeView zera a view ativa', () => {
    useViewStore.getState().openView('memory')
    useViewStore.getState().closeView()
    expect(useViewStore.getState().activeView).toBeNull()
  })
})
