import { useEffect, useState, type FormEvent } from 'react'
import { Modal } from '../../shared/ui/Modal'
import { Input } from '../../shared/ui/Input'
import { Button } from '../../shared/ui/Button'
import {
  getApiKey,
  setApiKey,
  onUnauthorized,
  retryUnauthorizedRequests,
  rejectPendingUnauthorized,
} from '../../shared/lib/api'

// Gate de API key (B2/M-20): overlay quando QUALQUER chamada retorna 401 ou
// quando não há key salva ao entrar. Salvar reexecuta a chamada pendente
// (retryUnauthorizedRequests); dispensar sem key rejeita as pendentes — o
// modo demo (runDemo, sem backend) segue funcional sem chave.
export function ApiKeyGate() {
  const [open, setOpen] = useState(false)
  const [key, setKey] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // Sem key salva → mostra a tela ao entrar (dispensável p/ demo).
    if (!getApiKey()) setOpen(true)
    return onUnauthorized(() => setOpen(true))
  }, [])

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const trimmed = key.trim()
    if (!trimmed) {
      setError('Informe a API key')
      return
    }
    setApiKey(trimmed)
    setOpen(false)
    setKey('')
    setError(null)
    retryUnauthorizedRequests() // reexecuta a chamada pendente com a nova key
  }

  const dismiss = () => {
    setOpen(false)
    setKey('')
    setError(null)
    rejectPendingUnauthorized() // sem key → pendentes falham (modo demo/sem backend)
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
