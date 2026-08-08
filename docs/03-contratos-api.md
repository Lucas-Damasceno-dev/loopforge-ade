# 03 — Contratos de API (REST + WebSocket)

> Estado alvo do MVP. Onde difere do implementado, ver `09-mudancas-sobre-o-existente.md` (IDs M-xx).
> Prefixo canônico: `/api/v1`. Legado `/api/runs*` responde com `Sunset` + `Deprecation` (M-18).

## 1. Convenções

- **Auth**: header `X-API-Key: <key>` (ou HTTP Basic) em **todas** as rotas `/api/*` (M-03).
  Exceções: `GET /health`, `GET /api/genome|registry|retro`.
- **WS auth**: query `?token=<key>`; falha → close `1008` (policy violation).
- **Erros**: FastAPI padrão `{ "detail": "..." }`; códigos: `401` auth, `403`
  permissão MCP, `404` recurso, `409` conflito (ex.: import de thread existente),
  `422` validação, `503` dependência indisponível (MCP/Ollama/sqlite lock).
- **Paginação**: `?skip=&limit=` (default `0/20`, max `100`) → `{items, total}`.
- **Timestamps**: ISO-8601 UTC. **IDs**: `run_id` (uuid) é a chave pública;
  `thread_id` (`run-{run_id}`, ADR-0003) é exposto para trajectories/time-travel.

## 2. REST — Runs

| Método | Path | Descrição | Body → Resposta |
|---|---|---|---|
| POST | `/api/v1/runs` | Cria run e enfileira (E3: 1 ativa + fila) | `{idea, stack="python", routing_mode="full", mock_llm=false, interactive=false}` → `201 Run` |
| GET | `/api/v1/runs` | Lista paginada | → `{items: [Run], total}` |
| GET | `/api/v1/runs/{id}` | Detalhe | → `Run` |
| DELETE | `/api/v1/runs/{id}` | Remove run (não toca checkpoints) | → `204` |
| POST | `/api/v1/runs/{id}/execute` | (Re)dispara run `pending`/`failed` | → `202 Run` |
| POST | `/api/v1/runs/{id}/resume` | Resume do último checkpoint (usa `thread_id` persistido — M-01) | → `202 Run` |
| GET | `/api/v1/runs/{id}/events` | **Backfill do journal** (M-06) | `?after_seq=0&limit=200` → `{items: [EventEnvelope], last_seq}` |
| GET | `/api/v1/runs/{id}/cost` | **Agregado de custo** (M-08) | → `{run_id, budget_usd, spent_usd, pct, per_node: [{node, cost_usd, estimated}], hard_stopped}` |
| POST | `/api/v1/runs/{id}/budget-override` | Override de budget e resume (M-10) | `{new_max_usd}` → `200 {budget_usd}` |

```jsonc
// Run (response)
{
  "id": "…", "idea": "…", "stack": "python",
  "status": "pending|running|waiting_decision|decision_expired|budget_exceeded|completed|failed|aborted",
  "current_node": "developer|null",
  "thread_id": "run-…",            // ADR-0003
  "parent_run_id": null,           // preenchido em forks (M-13)
  "logs": "…", "duration_seconds": 0.0,
  "created_at": "…", "updated_at": "…"
}
```

## 3. REST — HITL

| Método | Path | Descrição | Body → Resposta |
|---|---|---|---|
| POST | `/api/v1/runs/{id}/decide` | Registra decisão humana | ver abaixo → `201` |
| GET | `/api/v1/runs/{id}/decisions` | Audit trail (quem/quando/o quê/com qual estado) | → `[Decision]` |

```jsonc
// HumanDecisionCreate (M-12 adiciona adjust_state)
{
  "gate_node": "developer",
  "action": "approve | retry | adjust_prompt | adjust_state | abort",
  "feedback_category": "bug|style|missing_feature|general",  // adjust_prompt
  "feedback_message": "…",
  "state_patch": { "error": null, "…": "…" },                // adjust_state (merge sobre channel_values)
  "user": "human_operator"
}
```

Regras: decisão tardia (após `decision_expired`) é aceita e logada; `abort` encerra
a run; `adjust_state` valida que as chaves existem no `GraphState` antes de aplicar
via `aupdate_state` (422 caso contrário).

## 4. REST — Trajectories (time-travel)

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/trajectories/{id}/checkpoints` | Lista checkpoints da run (aceita `run_id` ou `thread_id` — M-02) → `[{checkpoint_id, ts, step, node}]` |
| GET | `/api/v1/trajectories/{id}/checkpoints/{checkpoint_id}` | Estado completo (`channel_values`) naquele ponto |
| GET | `/api/v1/trajectories/{id}/export` | Envelope **enriquecido** (M-14): `steps` (por nó: ts, state_in/out, tokens, cost_usd, decision) + `events` (journal) |
| POST | `/api/v1/trajectories/import` | Importa envelope; `409` thread existente (sem merge no V1); `422` schema inválido |
| POST | `/api/v1/trajectories/{id}/fork` | **Fork real** (M-13): `{checkpoint_id?}` → copia checkpoints para nova thread e cria run filha → `201 {run_id, thread_id, parent_run_id}` |

## 5. REST — Config / MCP / Providers (já existentes na Fase 1)

- `GET /api/v1/config` / `PATCH /api/v1/config` — lê/escreve `.loopforge/ade.yaml`
  (merge profundo, validado antes de escrita atômica, 422 inválido). **Auth a partir de M-03.**
- `GET /api/v1/mcp/servers` → `[{name, status}]`; `GET /api/v1/mcp/servers/{name}/tools` → tools do server.
- `POST /api/v1/mcp/servers/{name}/tools/{tool}` — **novo na Fase D**: executa tool
  respeitando allowlist (403 `MCPPermissionDenied`); body = JSON dos args; resposta = resultado do tool.
- `GET /api/v1/providers/ollama/models` — auto-discovery (503 se Ollama fora).

## 6. WebSocket — envelope v1 (ADR-0002)

**Toda** mensagem server→cliente (live e backfill):

```jsonc
{
  "schema_version": "1",
  "event": "node_execution",
  "run_id": "…", "thread_id": "run-…",
  "seq": 17,                        // por run, monotônico (gap detection)
  "ts": "2026-08-07T12:00:00Z",
  "payload": { "…": "…" }           // específico por evento
}
```

- `/ws/runs/{run_id}` — canal **filtrado** da run (M-06).
- `/ws/streaming` — feed global (lista de runs, todos os eventos).
- Heartbeat: cliente `{"type":"ping"}` → servidor `{"type":"pong"}` (mensagens de
  controle, fora do envelope).
- Fluxo de conexão da SPA: `GET events?after_seq=0` → conecta WS → descarta live
  com `seq <= last_seq` do backfill → aplica o resto em ordem. Em reconexão:
  `GET events?after_seq=<último seq conhecido>` → repete.

## 7. Conjunto canônico de nós (SPA × backend)

Os **ids de execução** são os do backend — `NodeRegistry`
(`pipeline/graph.py:83-93`, verificado no código):

`cpo`, `pm`, `tech_lead`, `test_writer`, `developer`, `qa`, `appsec`, `devops`,
`parallel_audit`.

Regras de reconciliação (M-19):

1. **Eventos e estado só usam ids do backend.** A SPA renomeia seu tipo `dev`
   para `developer` (elimina a camada de normalização `normalizeNodeName`).
2. **`entry` e `retry` são nós virtuais de apresentação** — existem só no canvas:
   - `entry`: âncora visual de início; nenhum evento/estado a referencia.
   - `retry`: representação do loop developer↔qa; derivada de `attempt_count > 0`
     nos eventos de `developer`/`qa`. Nenhum evento carrega `node: "retry"`.
3. **`appsec` e `devops`** executam dentro de `parallel_audit`
   (`ThreadPoolExecutor`, `parallel_audit.py`) e não emitem `node_execution`
   próprio no V1 — aparecem como sub-cards expandíveis do nó Parallel Audit (UX3).
4. **`lessons` não é nó** — é a função `generate_lessons_md()` invocada dentro de
   `parallel_audit`; seus artefatos (`lessons.md`, `PROJECT_SUMMARY.md`) aparecem
   no inspect drawer do Parallel Audit. Nunca id de evento, nunca coluna do canvas.

| id canônico | label na UI | natureza |
|---|---|---|
| `entry` | Entry | virtual (apresentação) |
| `cpo` / `pm` / `tech_lead` / `test_writer` / `developer` / `qa` | CPO / PM / Tech Lead / Test Writer / Developer / QA | execução (backend) |
| `parallel_audit` | Parallel Audit (sub-cards: AppSec, DevOps) | execução (backend) |
| `appsec` / `devops` | AppSec / DevOps (sub-cards de Parallel Audit) | execução interna de `parallel_audit` (sem `node_execution` próprio no V1) |
| `retry` | Retry | virtual (derivado de `attempt_count`) |
| — | Lessons | artefato de `parallel_audit`, não nó |

## 8. Catálogo de eventos (payload dentro de `payload`)

| event | payload | emissor |
|---|---|---|
| `run_created` | `{idea, stack, status}` | API |
| `run_updated` | `{status, current_node}` | dispatcher (M-07) |
| `pipeline_started` | `{idea, node}` | dispatcher |
| `node_execution` | `{node, status:"completed", next_agent, attempt_count, duration_s?, cost_usd?}` | dispatcher |
| `pipeline_finished` | `{status, duration_seconds}` | dispatcher |
| `pipeline_failed` / `pipeline_error` | `{status?, error}` | dispatcher / API |
| `pipeline_resumed` | `{resuming_from_node}` | dispatcher |
| `hitl_gate_reached` | `{node, timeout_seconds}` | dispatcher (novo — abre o drawer na UI) |
| `human_decision_submitted` | `{gate_node, action, feedback_category?, user}` | API |
| `human_decision_expired` | `{node, timeout_seconds, on_timeout}` | dispatcher |
| `budget_warning` | `{spent_usd, budget_usd, pct}` | dispatcher (M-10) |
| `budget_exceeded` | `{spent_usd, budget_usd}` | dispatcher (M-10) |
| `fork_created` | `{parent_run_id, run_id, checkpoint_id}` | API (M-13) |

`node_execution` **não** carrega texto/tokens (UX4, ADR-0007); logs por nó ficam
no journal como `payload.log_excerpt` (máx. ~2 KB) e no `run.logs` agregado.

## 9. Versionamento

- REST: prefixo `/api/v{n}`; mudança quebradora ⇒ novo prefixo, antigo com
  `Sunset` por pelo menos uma major do `lf`.
- WS: `schema_version` no envelope; cliente ignora eventos desconhecidos
  (forward-compatible) e rejeita `schema_version` maior que a suportada com erro
  visível (força upgrade da UI).
- Envelope de export de trajectories: `schema_version: "1.0"` (já existente) —
  versionado independentemente; import aceita `1.0` apenas (V1).
