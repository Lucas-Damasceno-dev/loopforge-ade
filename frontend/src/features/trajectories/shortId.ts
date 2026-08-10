// Id curto para exibição de runs/checkpoints (mesma convenção do RunTabs):
// demo-{4 últimos} para ids demo-* longos (demo-<epoch>), #{6 últimos} para
// ids longos (uuid do backend), id intacto caso contrário. Ids demo-* curtos
// (não-epoch) não são truncados — slice(-4) incondicional geraria lixo
// (ex.: demo-1 → demo-mo-1).
export function shortId(id: string): string {
  if (id.startsWith('demo-') && id.length > 10) return `demo-${id.slice(-4)}`
  return id.length > 10 ? `#${id.slice(-6)}` : id
}
