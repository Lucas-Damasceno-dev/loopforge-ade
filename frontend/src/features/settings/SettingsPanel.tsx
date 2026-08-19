import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getConfig, patchConfig } from '../../shared/lib/api'
import type { AdeConfig, AdeMcpServer, DeepPartial } from '../../shared/lib/types'
import { Drawer } from '../../shared/ui/Drawer'
import { Button } from '../../shared/ui/Button'
import { Input } from '../../shared/ui/Input'
import { Toggle } from '../../shared/ui/Toggle'
import { SectionTitle } from '../../shared/ui/SectionTitle'
import { Alert } from '../../shared/ui/Alert'
import { Select } from '../../shared/ui/Select'

// Settings (Fase D/E9): GET /config → form local → PATCH /config com SOMENTE
// os campos alterados (PATCH parcial). O backend RECONSTRÓI sub-modelos
// (dicts) e listas inteiras (config.py patch_config: annotation(**value) /
// setattr) — então o patch envia sub-modelos COMPLETOS (budget, hitl,
// providers) e a lista mcp_servers inteira com o toggle alterado; enviar só
// um campo zeraria os defaults dos demais.

interface FormState {
  budgetMaxUsd: string
  hitlTimeout: string
  hitlOnTimeout: string
  providerPrimary: string
  ollamaBaseUrl: string
  servers: AdeMcpServer[]
}

function toForm(c: AdeConfig): FormState {
  return {
    budgetMaxUsd: c.budget?.max_usd !== undefined ? String(c.budget.max_usd) : '',
    hitlTimeout: c.hitl?.timeout_seconds !== undefined ? String(c.hitl.timeout_seconds) : '',
    hitlOnTimeout: c.hitl?.on_timeout ?? 'continue',
    providerPrimary: c.providers?.primary ?? '',
    ollamaBaseUrl: c.providers?.ollama_base_url ?? '',
    servers: (c.mcp_servers ?? []).map((s) => ({ ...s })),
  }
}

// Número → NaN se vazio/não-numérico (campo inválido fica FORA do patch; o
// backend responde 422 se o payload completo for inválido).
function numOrNan(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return NaN
  const v = Number(trimmed)
  return Number.isFinite(v) ? v : NaN
}

// Diff form → patch (sub-modelos completos — semântica de replace do backend).
function buildPatch(config: AdeConfig, form: FormState): DeepPartial<AdeConfig> {
  const patch: DeepPartial<AdeConfig> = {}
  const maxUsd = numOrNan(form.budgetMaxUsd)
  if (Number.isFinite(maxUsd) && maxUsd !== config.budget?.max_usd) {
    patch.budget = { max_usd: maxUsd }
  }
  const timeout = numOrNan(form.hitlTimeout)
  const onTimeout = form.hitlOnTimeout as AdeConfig['hitl']['on_timeout']
  if (
    Number.isFinite(timeout) &&
    (timeout !== config.hitl?.timeout_seconds || onTimeout !== config.hitl?.on_timeout)
  ) {
    patch.hitl = { timeout_seconds: timeout, on_timeout: onTimeout }
  }
  if (form.providerPrimary !== config.providers?.primary || form.ollamaBaseUrl !== config.providers?.ollama_base_url) {
    patch.providers = { primary: form.providerPrimary, ollama_base_url: form.ollamaBaseUrl }
  }
  const origServers = config.mcp_servers ?? []
  if (form.servers.some((s, i) => s.enabled !== origServers[i]?.enabled)) {
    // G1: envia os objetos AdeMcpServer COMPLETOS (command/args/tools_allowlist
    // preservados) — o backend valida TypeAdapter(list[AdeMcpServer]) e exige
    // `command`; enviar só {name, enabled} → 422.
    patch.mcp_servers = form.servers
  }
  return patch
}

interface ApiLikeError {
  status: number
  detail: unknown
}
function isApiError(e: unknown): e is ApiLikeError {
  return (
    typeof e === 'object' &&
    e !== null &&
    typeof (e as { status?: unknown }).status === 'number' &&
    'detail' in e
  )
}
// Detail do backend pode vir verbatim (PT) — loga no console, mostra mensagem
// EN amigável na UI; 422 pydantic é array de erros → mensagem EN genérica;
// fallback EN por status.
function settingsErrorMessage(e: unknown): string {
  if (isApiError(e)) {
    const detail = e.detail
    if (Array.isArray(detail)) return 'Invalid configuration value (422)'
    if (typeof detail === 'string' && detail.trim().length > 0) {
      console.error('Settings save rejected by API:', detail)
      return `The server rejected the settings (HTTP ${e.status})`
    }
    return `API error ${e.status}`
  }
  return e instanceof Error && e.message ? e.message : 'Failed to save settings'
}

// Erro de LOAD (getConfig) — mesmo padrão: loga detail, mostra EN honesto.
function settingsLoadErrorMessage(e: unknown): string {
  if (isApiError(e)) {
    if (typeof e.detail === 'string' && e.detail.trim().length > 0) {
      console.error('Settings load failed:', e.detail)
    }
    return `Failed to load settings (HTTP ${e.status})`
  }
  return e instanceof Error && e.message ? e.message : 'Failed to load settings'
}

// Validação inline do budget: vazio = manter atual (ok); não-numérico ou
// negativo = inválido → hint no input + Save bloqueado (não "salva" mentindo).
function budgetError(text: string): string | null {
  const trimmed = text.trim()
  if (trimmed === '') return null
  const v = Number(trimmed)
  if (!Number.isFinite(v)) return 'Must be a number'
  if (v < 0) return 'Must be 0 or greater'
  return null
}

const ON_TIMEOUT_OPTIONS = ['continue', 'abort', 'pause'] as const

// Drawer de configuração (E9): budget, HITL, providers e toggles por server
// MCP. Load via getConfig, save via patchConfig com o diff; feedback saved
// (role=status) / erro (role=alert); botão disabled enquanto salva e quando
// não há mudanças.
export function SettingsPanel({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Drawer open={open} title="Settings" onClose={onClose}>
      <SettingsPanelContent />
    </Drawer>
  )
}

// Conteúdo inline (T3 — sub-sidebar): mesma UI do drawer, sem wrapper.
export function SettingsPanelContent() {
  const queryClient = useQueryClient()
  const { data: config, isError, error } = useQuery({ queryKey: ['config'], queryFn: getConfig })
  const [form, setForm] = useState<FormState | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Popula o form quando o config carrega.
  useEffect(() => {
    if (config) setForm(toForm(config))
  }, [config])

  const patch = config && form ? buildPatch(config, form) : {}
  const hasChanges = Object.keys(patch).length > 0
  const loading = !config
  const budgetInvalid = form ? budgetError(form.budgetMaxUsd) : null

  const save = async () => {
    if (!config || !hasChanges) return
    setSaving(true)
    setSaved(false)
    setSaveError(null)
    try {
      await patchConfig(patch)
      setSaved(true)
      queryClient.invalidateQueries({ queryKey: ['config'] })
    } catch (e) {
      setSaveError(settingsErrorMessage(e))
    } finally {
      setSaving(false)
    }
  }

  const setField = (partial: Partial<FormState>) => {
    setForm((f) => (f ? { ...f, ...partial } : f))
    setSaved(false)
    setSaveError(null)
  }

  return (
    <>
      {isError ? (
        <Alert tone="err">{settingsLoadErrorMessage(error)}</Alert>
      ) : loading ? (
        <div role="status" aria-label="Loading settings" className="space-y-5">
          <div className="space-y-1.5">
            <div className="h-3 w-24 animate-pulse rounded bg-[var(--bg-elev-2)]" />
            <div className="h-8 animate-pulse rounded-md bg-[var(--bg-elev-2)]" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-28 animate-pulse rounded bg-[var(--bg-elev-2)]" />
            <div className="h-8 animate-pulse rounded-md bg-[var(--bg-elev-2)]" />
          </div>
          <div className="space-y-1.5">
            <div className="h-3 w-20 animate-pulse rounded bg-[var(--bg-elev-2)]" />
            <div className="h-8 animate-pulse rounded-md bg-[var(--bg-elev-2)]" />
          </div>
        </div>
      ) : form ? (
        <div className="space-y-5">
          {saveError && (
            <Alert tone="err">{saveError}</Alert>
          )}
          {saved && (
            <Alert tone="ok">Saved</Alert>
          )}

          <section>
            <SectionTitle className="mb-1">Budget</SectionTitle>
            <label htmlFor="settings-budget" className="mb-0.5 block text-xs text-[var(--text-dim)]">
              Max USD per run
            </label>
            <Input
              id="settings-budget"
              aria-label="Budget max USD"
              inputMode="decimal"
              aria-invalid={budgetInvalid !== null}
              value={form.budgetMaxUsd}
              onChange={(e) => setField({ budgetMaxUsd: e.target.value })}
            />
            {budgetInvalid && (
              <p className="mt-1 text-xs text-[var(--err-text)]" data-testid="settings-budget-error">
                {budgetInvalid}
              </p>
            )}
          </section>

          <section>
            <SectionTitle className="mb-1">Human in the loop</SectionTitle>
            <label htmlFor="settings-hitl-timeout" className="mb-0.5 block text-xs text-[var(--text-dim)]">
              Gate timeout (seconds)
            </label>
            <Input
              id="settings-hitl-timeout"
              aria-label="HITL timeout seconds"
              inputMode="numeric"
              value={form.hitlTimeout}
              onChange={(e) => setField({ hitlTimeout: e.target.value })}
            />
            <label htmlFor="settings-hitl-timeout-mode" className="mb-0.5 mt-2 block text-xs text-[var(--text-dim)]">
              On timeout
            </label>
            <Select
              id="settings-hitl-timeout-mode"
              aria-label="HITL on timeout"
              value={form.hitlOnTimeout}
              onChange={(e) => setField({ hitlOnTimeout: e.target.value })}
              className="w-full"
            >
              {ON_TIMEOUT_OPTIONS.map((o) => (
                <option key={o} value={o}>{o}</option>
              ))}
            </Select>
          </section>

          <section>
            <SectionTitle className="mb-1">Providers</SectionTitle>
            <label htmlFor="settings-provider" className="mb-0.5 block text-xs text-[var(--text-dim)]">
              Primary provider
            </label>
            <Input
              id="settings-provider"
              aria-label="LLM provider"
              value={form.providerPrimary}
              onChange={(e) => setField({ providerPrimary: e.target.value })}
              placeholder="native"
            />
            <label htmlFor="settings-ollama" className="mb-0.5 mt-2 block text-xs text-[var(--text-dim)]">
              Ollama base URL
            </label>
            <Input
              id="settings-ollama"
              aria-label="Ollama base URL"
              value={form.ollamaBaseUrl}
              onChange={(e) => setField({ ollamaBaseUrl: e.target.value })}
              placeholder="http://localhost:11434"
            />
          </section>

          <section>
            <SectionTitle className="mb-1">MCP servers</SectionTitle>
            {form.servers.length === 0 ? (
              <p className="text-sm text-[var(--text-dim)]">No MCP servers configured</p>
            ) : (
              <ul className="space-y-1.5">
                {form.servers.map((s) => (
                  <li
                    key={s.name}
                    className="flex items-center justify-between gap-2 rounded-md border border-[var(--border)] bg-[var(--bg-elev)] px-3 py-2"
                  >
                    <span className="font-mono text-xs">{s.name}</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="text-xs text-[var(--text-dim)]">{s.enabled ? 'enabled' : 'disabled'}</span>
                      <Toggle
                        checked={s.enabled}
                        onChange={(enabled) =>
                          setField({ servers: form.servers.map((x) => (x.name === s.name ? { ...x, enabled } : x)) })
                        }
                        label={`MCP server ${s.name}`}
                      />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="flex justify-end">
            <Button size="sm" variant="primary" disabled={saving || !hasChanges || budgetInvalid !== null} onClick={save}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        </div>
      ) : null}
    </>
  )
}
