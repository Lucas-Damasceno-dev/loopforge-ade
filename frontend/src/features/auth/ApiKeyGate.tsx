import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../../shared/ui/Modal'
import { Input } from '../../shared/ui/Input'
import { Button } from '../../shared/ui/Button'
import { onUnauthorized } from '../../shared/lib/api'
import { useAuthStore } from '../../stores/authStore'

// Gate de API key (B2/M-20): overlay quando QUALQUER chamada retorna 401 ou
// quando não há identidade salva ao entrar (RBAC T4: valida a key via
// /auth/me no submit — login() do store persiste o principal e reexecuta as
// pendentes; erro inline em 401/403). Dispensar sem key rejeita as pendentes
// via logout() — o modo demo (runDemo, sem backend) segue funcional.
export function ApiKeyGate() {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Sem principal salvo → mostra a tela ao entrar (dispensável p/ demo).
    if (!useAuthStore.getState().principal) setOpen(true)
    return onUnauthorized(() => setOpen(true))
  }, [])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const trimmed = key.trim()
    if (!trimmed) {
      setError('Informe a API key')
      return
    }
    setError(null)
    try {
      await useAuthStore.getState().login(trimmed)
      setOpen(false)
      setKey('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'API key inválida')
    }
  }

  const dismiss = () => {
    setOpen(false)
    setKey('')
    setError(null)
    useAuthStore.getState().logout() // sem key → limpa credencial e rejeita pendentes (modo demo/sem backend)
  }

  return (
    <Modal open={open} title="API key required" onClose={dismiss} maxWidth={420}>
      <div className="p-4">
        <h2 className="text-lg font-semibold text-[var(--text)]">API key required</h2>
        <p className="mt-1 text-sm text-[var(--text-dim)]">
          The backend requires an <code className="font-mono">X-API-Key</code> (printed by <code className="font-mono">lf serve</code>).
          It is stored locally to authenticate API calls.
        </p>
        <form onSubmit={submit} className="mt-4">
          <Input
            aria-label="API key"
            type="password"
            value={key}
            onChange={(e) => { setKey(e.target.value); setError(null) }}
            placeholder="lf_api_key…"
            autoFocus
            invalid={error !== null}
            className="w-full"
          />
          {error ? (
            <p role="alert" className="mt-1 text-xs text-[var(--err-text)]">{error}</p>
          ) : null}
          <div className="mt-4 flex justify-end gap-2">
            <Button size="sm" variant="ghost" onClick={dismiss}>
              Continue without backend
            </Button>
            <Button size="sm" variant="primary" type="submit" disabled={!key.trim()}>
              Save &amp; retry
            </Button>
          </div>
        </form>
      </div>
    </Modal>
  )
}
