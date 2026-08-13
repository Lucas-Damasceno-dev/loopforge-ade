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
        if (e.run_id !== undefined && e.seq !== undefined) {
          set((st) => ({
            lastSeqByRun: { ...st.lastSeqByRun, [e.run_id as string]: Math.max(st.lastSeqByRun[e.run_id as string] ?? 0, e.seq as number) },
          }))
        }
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
              const afterSeq = useWsStore.getState().lastSeqByRun[run.id] ?? 0
              getRunEvents(run.id, afterSeq)
                .then(({ events }) => {
                  for (const ev of events) {
                    if (ev.run_id !== undefined && ev.seq !== undefined) {
                      set((st) => ({
                        lastSeqByRun: { ...st.lastSeqByRun, [ev.run_id as string]: Math.max(st.lastSeqByRun[ev.run_id as string] ?? 0, ev.seq as number) },
                      }))
                    }
                    dispatchWsEvent(ev)
                  }
                })
                .catch(() => { /* offline — backfill falha em silêncio */ })
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
