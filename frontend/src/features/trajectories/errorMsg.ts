// Fallbacks EN para erros da API de trajetórias (Fase C). O backend responde
// `detail` em português na maioria dos casos (ex.: fork 404/409, import 422) —
// usa o detail quando string (mantém o texto do backend como veio); senão, um
// texto genérico EN por status. Exceção: GET timeline 404 responde "Run not
// found" (inglês) — o mapa cobre o caso conhecido.
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

export function trajectoryErrorMessage(e: unknown, fallback = 'Operation failed'): string {
  if (isApiError(e)) {
    const detail = typeof e.detail === 'string' && e.detail.trim().length > 0 ? e.detail : null
    switch (e.status) {
      case 404:
        return detail && detail !== 'Run not found' ? detail : 'Run not found (no trajectory)'
      case 409:
        return detail ?? 'A trajectory with this id already exists'
      case 422:
        return detail ?? 'Invalid import payload (schema 1.1)'
      default:
        return detail ?? `API error ${e.status}`
    }
  }
  return e instanceof Error && e.message ? e.message : fallback
}
