import type { WsEvent } from '../shared/lib/ws'

// Barramento de eventos WS: stores de features registram handlers aqui
// (canvasStore na Task 6, consoleStore na Task 8) e o wsStore despacha.
let handlers: ((e: WsEvent) => void)[] = []

export function registerWsHandler(f: (e: WsEvent) => void): () => void {
  handlers.push(f)
  return () => {
    handlers = handlers.filter((h) => h !== f)
  }
}

export function dispatchWsEvent(e: WsEvent): void {
  handlers.forEach((h) => h(e))
}
