import { beforeEach, describe, it, expect } from 'vitest'
import { useHitlGateStore } from '../hitlGateStore'

beforeEach(() => {
  useHitlGateStore.setState({ gates: [] })
})

describe('hitlGateStore', () => {
  it('push adds the newest gate first (banner mostra o mais recente)', () => {
    useHitlGateStore.getState().push({ gateNode: 'qa', runId: 'r1' })
    useHitlGateStore.getState().push({ gateNode: 'developer', runId: 'r2' })
    const gates = useHitlGateStore.getState().gates
    expect(gates).toHaveLength(2)
    expect(gates[0].gateNode).toBe('developer')
  })
  it('same gate on the same run replaces instead of stacking (C3)', () => {
    useHitlGateStore.getState().push({ gateNode: 'qa', runId: 'r1', timeoutSeconds: 300 })
    const id = useHitlGateStore.getState().gates[0].id
    useHitlGateStore.getState().push({ gateNode: 'qa', runId: 'r1', timeoutSeconds: 120, onTimeout: 'pause' })
    const gates = useHitlGateStore.getState().gates
    expect(gates).toHaveLength(1)
    expect(gates[0].id).toBe(id)
    expect(gates[0].timeoutSeconds).toBe(120)
    expect(gates[0].onTimeout).toBe('pause')
  })
  it('same gate node on DIFFERENT runs stacks (gates independentes)', () => {
    useHitlGateStore.getState().push({ gateNode: 'qa', runId: 'r1' })
    useHitlGateStore.getState().push({ gateNode: 'qa', runId: 'r2' })
    expect(useHitlGateStore.getState().gates).toHaveLength(2)
  })
  it('dismiss removes a single gate; clear empties all', () => {
    useHitlGateStore.getState().push({ gateNode: 'qa', runId: 'r1' })
    useHitlGateStore.getState().push({ gateNode: 'pm', runId: 'r2' })
    const first = useHitlGateStore.getState().gates[0].id
    useHitlGateStore.getState().dismiss(first)
    expect(useHitlGateStore.getState().gates).toHaveLength(1)
    useHitlGateStore.getState().clear()
    expect(useHitlGateStore.getState().gates).toHaveLength(0)
  })
})
