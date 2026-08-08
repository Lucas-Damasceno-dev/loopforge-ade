import { PIPELINE_ORDER } from '../dag/dagModel'
import { useRunsStore } from '../../stores/runsStore'
import { dispatchWsEvent } from '../../stores/wsBridge'

// Demo mock (UX16): run sintética LOCAL (sem backend), id `demo-<ts>`, custo
// zero. Agenda via setTimeout os eventos REAIS na ordem do pipeline e dispara
// via dispatchWsEvent — exercita o mesmo wiring do WS ao vivo (canvasStore
// ganha approved, runsStore ganha status/upsert). Os eventos usam o ENVELOPE
// v1 (seq/run_id/timestamp/payload) como o EventBus do backend.
const NODE_DELAY_MS = 300

// entry/retry são virtuais (sem node_execution próprio — contrato 03 §7);
// a demo só emite execução para os nós de execução.
const EXECUTION_ORDER = PIPELINE_ORDER.filter((n) => n !== 'entry' && n !== 'retry')

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

  // E3 imediato: se já há run ativa, a demo vai para a fila AGORA — o rótulo
  // "queued" vale durante toda a execução (~2.7s). Sem ativa: nada muda, a
  // demo roda e o selectRun acontece no fim (caso sancionado).
  const afterAdd = useRunsStore.getState()
  if (afterAdd.activeRunId !== null && afterAdd.activeRunId !== id) afterAdd.enqueue(id)

  // Por nó: pipeline_started → node_execution (delay 300ms acumulado).
  EXECUTION_ORDER.forEach((node, i) => {
    const delay = NODE_DELAY_MS * (i + 1)
    const nextAgent = PIPELINE_ORDER[PIPELINE_ORDER.indexOf(node) + 1]
    demoTimers.push(setTimeout(() => {
      dispatchWsEvent({ event: 'pipeline_started', run_id: id, timestamp: Date.now(), seq: i + 1, payload: { idea: 'Demo task', node } })
      dispatchWsEvent({
        event: 'node_execution',
        run_id: id,
        timestamp: Date.now(),
        seq: i + 2,
        payload: { node, status: 'completed', next_agent: nextAgent, attempt_count: 1, task_id: `demo-${id}-${node}` },
      })
    }, delay))
  })

  // Fim: pipeline_finished → wiring marca a run completed; E3 mantém 1 ativa
  // (sem ativa vira ativa; com ativa vai para a fila).
  const total = NODE_DELAY_MS * EXECUTION_ORDER.length
  demoTimers.push(setTimeout(() => {
    dispatchWsEvent({ event: 'pipeline_finished', run_id: id, timestamp: Date.now(), payload: { status: 'completed', duration_seconds: total / 1000 } })
    const state = useRunsStore.getState()
    if (state.activeRunId === null) state.selectRun(id)
    else if (state.activeRunId !== id) state.enqueue(id)
  }, total))
}
