import { create } from 'zustand'
import { createWsClient } from '../shared/lib/ws'
import type { WsEvent } from '../shared/lib/ws'
import { dispatchWsEvent } from './wsBridge'

interface WsState {
  connected: boolean
  lastEventAt: number | null
  connect: (url?: string, token?: string) => void
  disconnect: () => void
  setConnected: (b: boolean) => void
}

let client: ReturnType<typeof createWsClient> | null = null

export const useWsStore = create<WsState>((set) => ({
  connected: false,
  lastEventAt: null,
  connect: (url, token) => {
    const base = url ?? import.meta.env.VITE_WS_URL ?? `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws/streaming`
    const tk = token ?? (import.meta.env.VITE_WS_TOKEN as string | undefined)
    client?.disconnect()
    client = createWsClient({
      url: base,
      token: tk,
      onEvent: (e: WsEvent) => { set({ lastEventAt: Date.now() }); dispatchWsEvent(e) },
      onStatus: (s) => set({ connected: s === 'open' }),
    })
    client.connect()
  },
  disconnect: () => { client?.disconnect(); client = null; set({ connected: false }) },
  setConnected: (b) => set({ connected: b }),
}))
