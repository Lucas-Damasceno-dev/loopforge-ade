// Id curto para exibição de runs/checkpoints (mesma convenção do RunTabs):
// demo-{4 últimos} ou #{6 últimos} para ids longos (uuid do backend).
export function shortId(id: string): string {
  if (id.startsWith('demo-')) return `demo-${id.slice(-4)}`
  return id.length > 10 ? `#${id.slice(-6)}` : id
}
