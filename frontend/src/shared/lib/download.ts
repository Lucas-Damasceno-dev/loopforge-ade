// Baixa um objeto como arquivo JSON (blob + object URL). Usado no export de
// trajetória (Fase C) — sem lib externa. No jsdom/testes, object URLs precisam
// de stub (URL.createObjectURL não é implementado pelo jsdom).
export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
