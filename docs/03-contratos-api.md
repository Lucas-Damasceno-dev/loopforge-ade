# 03 — Contratos de API (REST + WebSocket)

> Contratos **implementados** (verificado no código, atualizado 2026-08-13 —
> pós-MVP). Onde divergem de decisões históricas, ver
> `09-mudancas-sobre-o-existente.md` (IDs M-xx).
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
| POST | `/api/v1/runs` | Cria run e enfileira (E3/M-21: fila até `max_concurrent_runs`, default 2) | `{idea, stack="python", routing_mode="full", mock_llm=false, interactive=false}` → `201 Run`. ⚠️ **`interactive` tem 2 defaults**: API = `false` (`schemas.py:16`); SPA = **`true`** — o NewRunForm envia o checkbox "Modo interativo (HITL)" default ON (`NewRunForm.tsx:51`) |
| GET | `/api/v1/runs` | Lista paginada | → `{items: [Run], total}` |
| GET | `/api/v1/runs/queue` | **Estado da fila E3** (implementado pós-MVP) | → `{max_concurrent, active_count, active: [Run], queued: [Run]}` |
| GET | `/api/v1/runs/{id}` | Detalhe | → `Run` |
| DELETE | `/api/runs/{id}` | Remove run (não toca checkpoints) — **só legado** (sem variante v1; 204) | → `204` |
| POST | `/api/runs/{id}/execute` | (Re)dispara run `pending`/`failed` — **só legado** (sem variante v1) | → `202 Run` |
| POST | `/api/v1/runs/{id}/resume` | Resume do último checkpoint (usa `thread_id` persistido — M-01); passa pela **fila E3** (não roda fora dela); `mock_llm` vem do **checkpoint** (run mock persiste `mock_llm=true` no estado); re-entra em gates HITL pendentes; preserva `degraded` e usa o `pipeline_snapshot` imutável | → `202 Run` |
| POST | `/api/v1/runs/{id}/cancel` | **Cancela run** (C8): `queued` → remove da fila + `failed`; `running` → cancela a task asyncio + `failed`; `paused` → `failed`; `completed`/`failed` → `409` `run not cancellable`; run inexistente → `404`; emite `run_updated` `{status:"failed", reason:"cancelado pelo usuário"}` | → `200 Run` (status `failed`) |
| GET | `/api/v1/runs/{id}/events` | **Backfill do journal** (M-06) | `?after_seq=0&limit=200` → `{run_id, events: [Envelope], next_after_seq}` |
| GET | `/api/v1/runs/{id}/timeline` | **Timeline unificada** (C5/M-02): eventos + checkpoints intercalados | `?after_seq=0&limit=100` → `{run_id, timeline: [{seq, type, timestamp, node, data}], total_count, has_more, next_after_seq}` |
| GET | `/api/v1/runs/{id}/cost` | **Agregado de custo** (M-08) + **breakdown por nó** (D1) | → `CostResponse` (abaixo) |
| POST | `/api/v1/runs/{id}/cost/override` | Override de budget efetivo e resume (M-10; **em memória**, por processo) | `{max_usd: float\|null}` → `200 CostResponse` |

```jsonc
// Run (response)
{
  "id": "…", "idea": "…", "stack": "python",
  "status": "pending|queued|running|paused|completed|failed",
  "current_node": "developer|null",
  "thread_id": "run-…",            // ADR-0003 — aditivo (schemas.py:38)
  "parent_run_id": null,           // preenchido em forks (M-13)
  "logs": "…", "duration_seconds": 0.0,
  "created_at": "…", "updated_at": "…"
}
// Status PERSISTIDO (PipelineRun): `pending` (default DB, models.py:28) |
// `queued` | `running` | `paused` | `completed` | `failed`. Legados
// `waiting_decision|decision_expired|budget_exceeded|aborted` NÃO são status
// de run no código atual — `decision_expired` só aparece como `run_status` no
// payload do evento `human_decision_expired` (task_dispatcher.py:1133) e
// `budget_exceeded` é flag do CircuitBreaker (circuit_breaker.py:123); a SPA
// modela apenas `pending/queued/running/paused/completed/failed` e trata
// status desconhecido como `pending` (wsBridge.ts:40-53).
// `queued`: criada e na fila E3 (M-21).
// `paused`: DUAS ORIGENS — (1) hard-stop de budget (M-10): a run NÃO falha; o
// grafo fica interrompido no nó pendente (checkpoint com next != []); (2) gate
// HITL (interactive=true): a run pausa no gate esperando decisão humana
// (evento `hitl_gate_reached` → drawer abre; dedup por (run, nó)).

// CostResponse (GET /cost e POST /cost/override — verificado em costs.py/schemas.py)
{
  "run_id": "…",
  "spent_usd": 1.234,              // soma de llm_costs da run
  "estimated": true,               // true se QUALQUER linha é estimada (subprocess OpenCode)
  "budget": { "max_usd": 10.0, "percent_used": 0.1234 },
  "budget_warning": false,         // percent_used >= 0.80 (M-10)
  "nodes": [                       // breakdown por nó (D1/Fase D) — campo ADITIVO
    { "node": "developer", "spent_usd": 0.9, "estimated": true }
  ]
}
```

## 3. REST — HITL

| Método | Path | Descrição | Body → Resposta |
|---|---|---|---|
| POST | `/api/v1/runs/{id}/decide` | Registra decisão humana | `HumanDecisionCreate` → `201 HumanDecisionResponse` |
| GET | `/api/v1/runs/{id}/decisions` | Audit trail (quem/quando/o quê/com qual estado) — variante v1 existe desde a Fase A (M-18) | → `[HumanDecisionResponse]` |
| GET | `/api/runs/{id}/decisions` | Alias legado do audit trail | → `[HumanDecisionResponse]` |

> Nota (M-18): o audit trail tem **duas variantes** — `/api/v1/runs/{id}/decisions`
> e o alias legado `/api/runs/{id}/decisions`; ambas respondem hoje.

```jsonc
// HumanDecisionCreate (M-12 adiciona adjust_state)
{
  "gate_node": "developer",
  "action": "approve | retry | adjust_prompt | adjust_state | abort",
  "feedback_category": "bug|style|missing_feature|general",  // enviado em TODAS as actions (SPA envia default 'general' — HitlDrawer.tsx:179)
  "feedback_message": "…",
  "state_patch": { "error": null, "…": "…" },                // adjust_state (merge sobre channel_values)
  "user": "human_operator"
}
```

Regras: decisão tardia (após `decision_expired`) é aceita e logada; `abort` encerra
a run; `adjust_state` valida que as chaves existem no `GraphState` antes de aplicar
via `aupdate_state` (422 caso contrário).

Validação no POST `/decide` (verificado — `app.py:_record_decision_impl`):
- `404` se a run não existe (`app.py:747-748`).
- `409` se a run não está em `running`/`paused` (`app.py:750-754`) **ou** se
  `gate_node` não é um gate REALMENTE pendente no checkpoint (`app.py:759-764` —
  antes aceitava qualquer gate e poluía o audit trail).
- Consumo por **(run_id, gate_node)**: o polling do dispatcher busca
  `consumed=0 AND run_id=? AND gate_node=?` (`task_dispatcher.py:560-605`) e
  marca `consumed=1` ao aplicar (`task_dispatcher.py:607-622`) — decisão stale
  não re-aplica em gate subsequente.

## 4. REST — Trajectories (time-travel)

| Método | Path | Descrição |
|---|---|---|
| GET | `/api/v1/trajectories/{thread_id}/checkpoints` | **Existe a thread?** → `[{thread_id}]` (filtro de existência) ou `[]` — a listagem rica por run está no `timeline` |
| GET | `/api/v1/trajectories/{thread_id}/checkpoints/{checkpoint_id}` | Estado completo (`channel_values`) naquele ponto → `{thread_id, checkpoint_id, state}` |
| GET | `/api/v1/trajectories/{thread_id}/diff` | **Diff estruturado entre checkpoints** (time-travel profundo, Fase C) | `?from=<checkpoint_id>&to=<checkpoint_id>` → `{thread_id, from, to, added: {key: preview}, removed: {key: preview}, changed: [{key, before, after}]}` (previews JSON-safe truncados a 500 chars; `404` thread/checkpoint ausente, `422` from/to faltando) |
| POST | `/api/v1/trajectories/export/{run_id}` | Export **enriquecido v1.1** (M-14) pela run (thread canônica `run-{run_id}`) → `TrajectoryExport` |
| GET | `/api/v1/trajectories/{thread_id}/export` | Alias compat do export (mesmo payload enriquecido) |
| POST | `/api/v1/trajectories/import` | Importa envelope; `422` schema inválido (exige `schema_version: "1.1"`); `409` thread já existe (sem merge no V1) → `201 {run_id, thread_id, checkpoints_imported}` |
| POST | `/api/v1/trajectories/{thread_id}/fork` | **Fork real** (M-13) do head da thread: copia checkpoints byte-a-byte e cria run filha. `404` origem sem trajetória; `409` sem checkpoint copiável → `201 {fork_run_id, thread_id, checkpoint_id}` |

```jsonc
// TrajectoryExport (schema_version "1.1" — aceito apenas pelo POST /import)
{
  "schema_version": "1.1",
  "run_id": "…", "thread_id": "run-…", "exported_at": "…", "idea": "…",
  "checkpoints": [{ "checkpoint_id": "…", "parent_checkpoint_id": null,
                    "checkpoint_ns": "", "ts": "…", "step": 0, "node": "developer",
                    "state": { "…": "…" }, "state_summary": null, "metadata": {} }],
  "steps": [{ "checkpoint_id": "…", "node": "developer", "step": 0, "ts": "…" }],
  "events": [ /* Envelope v1 (mesmo do WS/backfill) */ ],
  "costs": { "total_usd": 1.2, "estimated": false, "rows": [{ "model": "…",
             "prompt_tokens": 0, "completion_tokens": 0, "cost_usd": 0.0,
             "node": "developer", "estimated": false, "created_at": "…" }] }
}
```

## 5. REST — Config / MCP / Providers (já existentes na Fase 1)

- `GET /api/v1/config` / `PATCH /api/v1/config` — lê/escreve `.loopforge/ade.yaml`
  (merge profundo; sub-modelos aninhados `budget`/`hitl`/`providers` reconstruídos
  com validação pydantic; **`mcp_servers` validado via `TypeAdapter(list[AdeMcpServer])`
  desde a D3** — antes itens inválidos eram descartados em silêncio). Inválido → `422`; **auth a partir de M-03.**
- `GET /api/v1/mcp/servers` → `[{name, status}]`; `GET /api/v1/mcp/servers/{name}/tools` → tools do server (`503` se server não conectado).
- `POST /api/v1/mcp/servers/{name}/tools/{tool}` — **Fase D (D2)**: executa a tool
  MCP respeitando a `tools_allowlist` (deny-by-default). Body `{arguments: {...}}`
  (opcional, default `{}`) → `200` resultado do tool (dict); `403` tool fora da
  allowlist (`MCPPermissionDenied`); `404` server não declarado no `ade.yaml`;
  `503` server não conectado.
- `GET /api/v1/providers/ollama/models` — auto-discovery (503 se Ollama fora).

### 5.1 Routers auxiliares (implementados — pós-MVP)

| Prefixo | Endpoints |
|---|---|
| `/api/v1/costs` | `GET /runs/{run_id}/cost`, `POST /runs/{run_id}/cost/override` (mesmos contratos da seção 2) |
| `/api/v1/memory` | `GET /lessons`, `POST /lessons`, `PATCH /lessons/{lesson_id}`, `DELETE /lessons/{lesson_id}` |
| `/api/v1/evals` | `GET /summary`, `GET /leaderboard` |
| `/api/v1/git` | `GET /{run_id}` (status git da run), `POST /{run_id}/publish-pr` |
| `/api/v1/prompts` | `PATCH /{node}`, `DELETE /{node}` (edita prompt de um nó) |
| `/api/v1/artifacts` | `GET /runs/{run_id}/artifacts`, `GET /runs/{run_id}/files`, `GET /runs/{run_id}/export` |
| `/api/v1/terminal` | `GET /{run_id}/info`, `POST /{run_id}/exec` (executa comando no dir da run) |
| `/api/v1/ast` | `GET /{run_id}` (árvore AST do código gerado) |
| `/api/v1/coverage` | `GET /{run_id}` (resultado de cobertura de testes) |
| `/api/v1/docker` | `GET /{run_id}`, `POST /{run_id}/save` (snapshot do dir da run) |

Todos os routers acima exigem auth (`X-API-Key`), exceto `GET /health` e
`GET /api/genome|registry|retro`.

### 5.2 Rate limiting (HTTP)

Middleware `RateLimitMiddleware` (`api/rate_limit.py`) ativo quando
`LF_API_RATE_LIMIT_PER_MIN > 0` (default **300 req/min**; `0` desliga). Aplica-se
apenas a requisições HTTP (não a WebSockets); limite excedido → `429`.

## 6. WebSocket — envelope v1 (ADR-0002)

**Toda** mensagem server→cliente (live e backfill) — envelope serializado real
(`EventBus._to_envelope`, verificado no código):

```jsonc
{
  "seq": 17,                        // por run, monotônico 1-based (gap detection)
  "event": "node_execution",
  "run_id": "…",
  "timestamp": "2026-08-07T12:00:00Z",
  "payload": { "…": "…", "task_id": "…" }   // específico por evento; task_id preservado (B1)
}
```

> O `schema_version` é **implícito (v1, ADR-0002/M-05)** — não é serializado no
> envelope atual; o `thread_id` derivado é `run-{run_id}` (ADR-0003), quando
> necessário vem dentro do `payload` (ex.: `hitl_gate_reached`).

- `/ws/runs/{run_id}` — canal **filtrado** da run (M-06).
- `/ws/streaming` — feed global (lista de runs, todos os eventos).
- Heartbeat: o servidor envia `{"type":"ping"}` após ~30s de inatividade do
  cliente (`WS_HEARTBEAT_INTERVAL = 30.0`, `asyncio.wait_for(receive_json, ...)`
  em `app.py`); o cliente responde `{"type":"pong"}` (`ws.ts:275-276`). O cliente
  também pode pingar: `{"type":"ping"}` → servidor responde `{"type":"pong"}`
  (`app.py:287-288`). Mensagens de controle, fora do envelope.
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
| `run_updated` | `{status, current_node, degraded?, degraded_reason?}` | dispatcher (M-07) / **API** (cancel `app.py:871-875`; crash recovery no startup `app.py:91-97`) |
| `pipeline_started` | `{idea, node}` | dispatcher |
| `node_execution` | `{node, status:"completed", next_agent, attempt_count, duration_s?, cost_usd?}` | dispatcher |
| `pipeline_finished` | `{status, duration_seconds}` | dispatcher |
| `pipeline_failed` / `pipeline_error` | `{status?, error}` | dispatcher / API |
| `pipeline_resumed` | `{resuming_from_node}` | dispatcher |
| `hitl_gate_reached` | `{gate_node, thread_id, run_id, timeout_seconds, on_timeout, ts}` | dispatcher (novo — abre o drawer na UI; dedup por (run, nó)) |
| `human_decision_submitted` | `{gate_node, action, feedback_category?, user, state_patch?}` | API |
| `human_decision_expired` | `{node, timeout_seconds, run_status}` | dispatcher |
| `fork_created` | `{parent_run_id, fork_run_id, checkpoint_id}` | API (M-13) |
| `circuit_breaker_changed` | snapshot do CB: `{state, max_total_cost, spent_usd, consecutive_failures, iteration, reset_at, …}` (~10 campos) | dispatcher (implementado pós-MVP — surfacing CB na SPA) |
| `token_delta` | `{node?, tokens, …}` — **callback `on_token_delta`** no provider nativo (`runner/opencode/llm.py`); backend publica via `llm_factory.py:480`; **UI V1 CONSUME**: `wsBridge.ts:67-71` → `consoleStore.appendStream` (buffer por nó, flush no `node_execution` — ADR-0007) | runner (ADR-0007) |

> **Budget não emite evento WS**: `budget_warning`/`budget_exceeded` (M-10) não
> existem como eventos — o estado vem do `GET /runs/{id}/cost` (`budget_warning`
> field) e o hard-stop é detectado pelo checkpoint pendente (status da run
> `paused`; verificado no código — `app.py:_run_pipeline`).

`node_execution` **não** carrega texto/tokens (UX4, ADR-0007); logs por nó ficam
no journal como `payload.log_excerpt` (máx. ~2 KB) e no `run.logs` agregado.

## 9. Versionamento

- REST: prefixo `/api/v{n}`; mudança quebradora ⇒ novo prefixo, antigo com
  `Sunset` por pelo menos uma major do `lf`.
- WS: `schema_version` **implícito (v1)** no envelope (não serializado hoje);
  cliente ignora eventos desconhecidos (forward-compatible) e rejeita versão maior
  que a suportada com erro visível (força upgrade da UI).
- Envelope de export de trajectories: `schema_version: "1.1"` (M-14, enriquecido
  com `steps`/`events`/`costs`) — versionado independentemente; import aceita
  `1.1` apenas (V1).
