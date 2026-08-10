// Mensagens PT-BR para erros da API de trajetórias (Fase C). O backend já
// responde `detail` em português na maioria dos casos (ex.: fork 404/409,
// import 422) — usa o detail quando string; senão, um texto genérico por
// status. Exceção: GET timeline 404 responde "Run not found" (inglês) — o
// mapa cobre o caso conhecido.
//
// Duck-typing em vez de `instanceof ApiError`: os testes mockam o módulo de
// api inteiro (ApiError vira undefined) e os erros de fetch são rejeições com
// shape {status, detail} — a checagem por shape é imune a isso.
interface ApiLikeError {
  status: number
  detail?: unknown
}

function isApiError(e: unknown): e is ApiLikeError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { status?: unknown }).status === 'number'
  )
}

export function trajectoryErrorMessage(e: unknown, fallback = 'Falha na operação'): string {
  if (isApiError(e)) {
    const detail = typeof e.detail === 'string' && e.detail.trim().length > 0 ? e.detail : null
    switch (e.status) {
      case 404:
        return detail && detail !== 'Run not found' ? detail : 'Run não encontrada (sem trajetória)'
      case 409:
        return detail ?? 'Já existe uma trajetória com este id'
      case 422:
        return detail ?? 'Payload de import inválido (schema 1.1)'
      default:
        return detail ?? `Erro ${e.status} na API`
    }
  }
  return e instanceof Error && e.message ? e.message : fallback
}
