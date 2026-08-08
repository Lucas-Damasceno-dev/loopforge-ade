import { create } from 'zustand'
import { createWsClient } from '../shared/lib/ws'
import type { WsEvent } from '../shared/lib/ws'
import { dispatchWsEvent } from './wsBridge'

// Status da conexão WS (01b §3.11 — topbar persistente). `connected` deriva
// de status === 'open' (mantém compatibilidade com consumidores antigos).
export type WsStatus = 'connecting' | 'open' | 'closed' | 'error'

interface WsState {
  connected: boolean
  status: WsStatus
  lastEventAt: number | null
  connect: (url?: string, token?: string) => void
  disconnect: () => void
  setConnected: (b: boolean) => void
}

let client: ReturnType<typeof createWsClient> | null = null

export const useWsStore = create<WsState>((set) => ({
  connected: false,
  status: 'connecting',
  lastEventAt: null,
  connect: (url, token) => {
    const base = url ?? import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/streaming`
    const tk = token ?? (import.meta.env.VITE_WS_TOKEN as string | undefined)
    client?.disconnect()
    client = createWsClient({
      url: base,
      token: tk,
      onEvent: (e: WsEvent) => { set({ lastEventAt: Date.now() }); dispatchWsEvent(e) },
      onStatus: (s) => set({ status: s, connected: s === 'open' }),
    })
    set({ status: 'connecting' })
    client.connect()
  },
  disconnect: () => { client?.disconnect(); client = null; set({ connected: false, status: 'closed' }) },
  setConnected: (b) => set({ connected: b }),
}))
