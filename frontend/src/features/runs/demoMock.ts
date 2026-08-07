import { PIPELINE_ORDER } from '../dag/dagModel'
import { useRunsStore } from '../../stores/runsStore'
import { dispatchWsEvent } from '../../stores/wsBridge'

// Demo mock (UX16): run sintética LOCAL (sem backend), id `demo-<ts>`, custo
// zero. Agenda via setTimeout os eventos REAIS na ordem do pipeline e dispara
// via dispatchWsEvent — exercita o mesmo wiring do WS ao vivo (canvasStore
// ganha approved, runsStore ganha status/upsert).
const NODE_DELAY_MS = 300

let demoTimers: ReturnType<typeof setTimeout>[] = []
function clearDemoTimers() {
  demoTimers.forEach((t) => clearTimeout(t))
  demoTimers = []
}

export function runDemo(): void {
  clearDemoTimers() // evita demos sobrepostos em cliques repetidos
  const id = `demo-${Date.now()}`
  useRunsStore.getState().addRun({
    id,
    idea: 'Demo task',
    stack: '',
    status: 'running',
    current_node: 'entry',
  })

  // Por nó: pipeline_started → node_execution (delay 300ms acumulado).
  PIPELINE_ORDER.forEach((node, i) => {
    const delay = NODE_DELAY_MS * (i + 1)
    const nextAgent = PIPELINE_ORDER[i + 1]
    demoTimers.push(setTimeout(() => {
      dispatchWsEvent({ event: 'pipeline_started', payload: { idea: 'Demo task', node } })
      dispatchWsEvent({
        event: 'node_execution',
        payload: { node, status: 'completed', next_agent: nextAgent, attempt_count: 1 },
      })
    }, delay))
  })

  // Fim: pipeline_finished → wiring marca a run completed; E3 mantém 1 ativa
  // (sem ativa vira ativa; com ativa vai para a fila).
  const total = NODE_DELAY_MS * PIPELINE_ORDER.length
  demoTimers.push(setTimeout(() => {
    dispatchWsEvent({ event: 'pipeline_finished', run_id: id, status: 'completed', duration_seconds: total / 1000 })
    const state = useRunsStore.getState()
    if (state.activeRunId === null) state.selectRun(id)
    else if (state.activeRunId !== id) state.enqueue(id)
  }, total))
}
