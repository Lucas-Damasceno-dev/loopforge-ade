import { create } from 'zustand'
import { createWsClient, normalizeWsEvent } from '../shared/lib/ws'
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

// E4 (backfill): o PRIMEIRO open também faz catch-up — um reload da página
// perde os eventos do gap (B5). A base do after_seq é lastSeqByRun (persistido
// em memória do store) ou 0 para runs nunca vistas nesta sessão.

// Watermark por run por reconnect (E4 fix round 3): MENOR seq despachado LIVE
// após o último onopen, CHAVEADO POR run_id — seq é por run (tabela event_seq,
// uma row por run_id), então o teto de "já visto" de uma run não pode vazar p/
// outra (senão misses de uma run seriam false-skipped pelo live de outra).
// O guard do backfill pula eventos >= watermark (já entregues via live, em
// ordem); eventos < watermark (perdidos no gap) SEMPRE despacham.
// Reset do MAP a cada open — eventos live de um reconnect anterior não valem.
let firstLiveSeqByRun: Record<string, number> = {}

const BACKFILL_LIMIT = 200

// Backfill de uma run: busca eventos desde after_seq e re-despacha. Paginação:
// enquanto a página vier cheia (== limit), continua buscando a partir de
// next_after_seq (token_delta pode estourar 200 eventos por disconnect).
function backfillRun(runId: string, afterSeq: number): void {
  getRunEvents(runId, afterSeq, BACKFILL_LIMIT)
    .then(({ events, next_after_seq }) => {
      for (const raw of events) {
        // B6: mesmo caminho do live (createWsClient normaliza antes do onEvent)
        // — backfill precisa normalizar ANTES de despachar, senão eventos v1
        // com payload flat (task_id fora do payload) quebram os handlers.
        const ev = normalizeWsEvent(raw)
        if (!ev) continue
        // Dedupe por WATERMARK por run, não high-water mark: o mapa pode ter
        // avançado por eventos live durante o fetch; guardar por >= seq do mapa
        // false-skip o batch inteiro (o cenário que o backfill existe p/ recuperar).
        // Só pula o que chega live em ordem (seq >= primeiro live deste reconnect
        // NA MESMA RUN).
        if (ev.seq !== undefined && firstLiveSeqByRun[runId] !== undefined && ev.seq >= firstLiveSeqByRun[runId]) continue
        if (ev.run_id !== undefined && ev.seq !== undefined) setLastSeq(ev.run_id, ev.seq)
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
        if (e.run_id !== undefined && e.seq !== undefined) {
          setLastSeq(e.run_id as string, e.seq as number)
          // Watermark por run: menor seq live desta run desde o reconnect.
          const runId = e.run_id as string
          if (firstLiveSeqByRun[runId] === undefined || (e.seq as number) < firstLiveSeqByRun[runId]) {
            firstLiveSeqByRun[runId] = e.seq as number
          }
        }
        dispatchWsEvent(e)
      },
      onStatus: (s) => {
        set({ status: s, connected: s === 'open' })
        if (s === 'open') {
          // TODO open (primeiro OU reconnect) → watermark por run reset
          // (eventos live de um open anterior não valem) e backfill das runs
          // ATIVAS a partir do último seq conhecido (B5: reload perde eventos
          // do gap; runs encerradas não têm o que recuperar).
          firstLiveSeqByRun = {}
          const runs = useRunsStore.getState().runs
          for (const run of runs) {
            if (run.status === 'running' || run.status === 'queued' || run.status === 'paused') {
              backfillRun(run.id, useWsStore.getState().lastSeqByRun[run.id] ?? 0)
            }
          }
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
// de seq — o store singleton persiste entre testes e o lastSeqByRun viciaria o
// 1º open (backfill espúrio). Produção nunca chama.
export function __resetWsStoreForTest(): void {
  firstLiveSeqByRun = {}
  client = null
  useWsStore.setState({ lastSeqByRun: {}, connected: false, status: 'connecting', lastEventAt: null })
}
