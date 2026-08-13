import { create } from 'zustand'
import { createWsClient } from '../shared/lib/ws'
import type { WsEvent } from '../shared/lib/ws'
import { getApiKey, getRunEvents } from '../shared/lib/api'
import { dispatchWsEvent } from './wsBridge'
import { useRunsStore } from './runsStore'

// Status da conexão WS (01b §3.11 — topbar persistente). `connected` deriva
// de status === 'open' (mantém compatibilidade com consumidores antigos).
export type WsStatus = 'connecting' | 'open' | 'closed' | 'error'

interface WsState {
  connected: boolean
  status: WsStatus
  lastEventAt: number | null
  // Último seq visto por run (E4): base do backfill no reconnect — eventos
  // após este seq são re-buscados e re-despachados (idempotente via after_seq).
  lastSeqByRun: Record<string, number>
  connect: (url?: string, token?: string) => void
  disconnect: () => void
  setConnected: (b: boolean) => void
}

let client: ReturnType<typeof createWsClient> | null = null

// E4 (backfill): true quando a conexão já abriu antes — o primeiro open não
// faz catch-up (nada a recuperar); opens subsequentes (reconnect) sim.
let hadOpen = false

const BACKFILL_LIMIT = 200

// Backfill de uma run: busca eventos desde after_seq e re-despacha. Paginação:
// enquanto a página vier cheia (== limit), continua buscando a partir de
// next_after_seq (token_delta pode estourar 200 eventos por disconnect).
function backfillRun(runId: string, afterSeq: number): void {
  getRunEvents(runId, afterSeq, BACKFILL_LIMIT)
    .then(({ events, next_after_seq }) => {
      for (const ev of events) {
        if (ev.run_id !== undefined && ev.seq !== undefined) {
          // Dedupe no momento do dispatch: eventos que chegaram LIVE durante o
          // fetch já foram despachados e estão no mapa — pula para não duplicar.
          if (useWsStore.getState().lastSeqByRun[ev.run_id as string] >= (ev.seq as number)) continue
          setLastSeq(ev.run_id as string, ev.seq as number)
        }
        dispatchWsEvent(ev)
      }
      if (events.length === BACKFILL_LIMIT && next_after_seq !== null) {
        backfillRun(runId, next_after_seq)
      }
    })
    .catch(() => { /* offline — backfill falha em silêncio */ })
}

function setLastSeq(runId: string, seq: number): void {
  useWsStore.setState((st) => ({
    lastSeqByRun: { ...st.lastSeqByRun, [runId]: Math.max(st.lastSeqByRun[runId] ?? 0, seq) },
  }))
}

export const useWsStore = create<WsState>((set) => ({
  connected: false,
  status: 'connecting',
  lastEventAt: null,
  lastSeqByRun: {},
  connect: (url, token) => {
    const base = url ?? import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/streaming`
    // M-03 fix: com auth ativa o backend rejeita WS sem token (403/1008). A key
    // da API (getApiKey) é o mesmo segredo — reusa como token se VITE_WS_TOKEN
    // não estiver definido.
    const tk = token ?? import.meta.env.VITE_WS_TOKEN ?? getApiKey()
    client?.disconnect()
    client = createWsClient({
      url: base,
      token: tk,
      onEvent: (e: WsEvent) => {
        set({ lastEventAt: Date.now() })
        // Rastreia o seq por run para o backfill do reconnect.
        if (e.run_id !== undefined && e.seq !== undefined) setLastSeq(e.run_id as string, e.seq as number)
        dispatchWsEvent(e)
      },
      onStatus: (s) => {
        set({ status: s, connected: s === 'open' })
        if (s === 'open') {
          if (hadOpen) {
            // Reconnect: busca o backlog de cada run ativa e re-despacha os
            // eventos perdidos (já normalizados v1). Falha silenciosa (offline).
            const runs = useRunsStore.getState().runs
            for (const run of runs) {
              backfillRun(run.id, useWsStore.getState().lastSeqByRun[run.id] ?? 0)
            }
          }
          hadOpen = true
        }
      },
    })
    set({ status: 'connecting' })
    client.connect()
  },
  disconnect: () => { client?.disconnect(); client = null; set({ connected: false, status: 'closed' }) },
  setConnected: (b) => set({ connected: b }),
}))

// Reset usado APENAS em testes: zera o flag module-level de reconnect e o mapa
// de seq — o store singleton persiste entre testes e o hadOpen viciaria o 1º
// open (backfill espúrio). Produção nunca chama.
export function __resetWsStoreForTest(): void {
  hadOpen = false
  client = null
  useWsStore.setState({ lastSeqByRun: {}, connected: false, status: 'connecting', lastEventAt: null })
}
