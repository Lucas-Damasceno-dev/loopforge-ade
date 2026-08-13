# Spec — Endpoint de Artifacts + Resume UI (2026-08-12)

## Contexto

Recon comparou capacidades do motor LoopForge v6 (repo `agentes/LoopForge`) com a interface web (repo `loopforge-ade`). Achados:

1. **Resume sem UI** — `POST /api/v1/runs/{id}/resume` existe; `resumeRun` em `api.ts:101` é código morto. Run `paused` (budget hard-stop) vira beco sem saída na interface.
2. **InspectDrawer mente** — seções Inputs/Outputs, Tokens/Context e Parallel Audit mostram placeholders "No payload recorded (V1)", mas o motor produz `epic`, `user_stories`, `tech_spec`, `contract_tests`, `code`, `test_report`, `security_report`, `devops_report` (canais do `GraphState`, persistidos nos checkpoints) e `llm_costs` (tokens + custo por nó).
3. **Sem endpoint de artifacts** — artifacts só alcançáveis via `GET /trajectories/{thread}/checkpoints/{cp_id}` (channel_values brutos).

Decisões do usuário:
- Adicionar **novo endpoint no motor** (não ler checkpoints crus no FE).
- Resume: **toolbar + banner**.
- **Incluir tokens** (prompt/completion por nó) no novo endpoint.

## Objetivo

1. Motor: `GET /api/v1/runs/{id}/artifacts` — artifacts por nó + tokens + degraded + circuit_breaker + lessons.
2. FE: Resume UI (toolbar + banner + WS `pipeline_resumed`) e InspectDrawer com dados reais.

## Design — Motor

### Novo módulo `src/lf/api/artifacts.py`

Router `APIRouter` incluído em `src/lf/api/app.py` (junto aos demais routers, ~app.py:729-778). Auth: `verify_authentication` (viewer basta para GET).

**Rota**: `GET /api/v1/runs/{id}/artifacts`

**Comportamento**:
- Run inexistente → 404 (padrão `GET /runs/{id}`).
- Thread canônica: `run-{id}` (ADR-0003). Busca último checkpoint via `AsyncSqliteSaver` (`.loopforge/trajectories.db`) — mesmo mecanismo de `trajectories.py`.
- Sem checkpoint ainda → 200 com `node_artifacts: {}`, `tokens: []`, `circuit_breaker: null`, `lessons: []`.
- Tokens: query em `llm_costs` (`.loopforge/telemetry.sqlite`) GROUP BY node — reusa padrão de `costs.py::_node_cost_breakdown`, estendido com `SUM(prompt_tokens)`, `SUM(completion_tokens)`, `MAX(estimated)`, e modelo (último por nó). Filtro por `run_id`.
- Lessons: `MemoryManager` filtrando `run_id` (tabela `lessons`).

**Response** (models em `src/lf/api/schemas.py`):

```json
{
  "run_id": "…",
  "node_artifacts": {
    "cpo":          {"output": {"epic": {}}},
    "pm":           {"output": {"user_stories": []}},
    "tech_lead":    {"output": {"tech_spec": "…", "stack_rationale": "…"}},
    "test_writer":  {"output": {"contract_tests": "…"}},
    "developer":    {"output": {"code": "…"}},
    "qa":           {"output": {"test_report": {}}},
    "parallel_audit":{"output": {
      "security_review": {}, "devops_manifest": {},
      "security_report_md": "…", "devops_report_md": "…"
    }}
  },
  "tokens": [
    {"node": "developer", "model": "…", "prompt_tokens": 1234,
     "completion_tokens": 567, "cost_usd": 0.02, "estimated": false}
  ],
  "degraded": false,
  "degraded_reason": null,
  "circuit_breaker": {
    "state": "closed", "consecutive_failures": 0, "total_iterations": 0,
    "total_cost": 0.0, "max_consecutive_failures": 5, "max_iterations": 20,
    "max_total_cost": 10.0, "cost_per_iteration": 0.05, "reset_timeout": 300,
    "last_failure_time": null
  },
  "lessons": [{"id": 1, "run_id": "…", "lesson_text": "…", "created_at": 0.0}]
}
```

Observações:
- `node_artifacts` só contém nós cujo artifact existe no checkpoint (dicionário esparso).
- Canais estruturados: `security_review: dict` ({vulnerabilities_found: [{severity, type, description}]}) e `devops_manifest: dict` ({deployability_score, status, dockerfile_created, ci_workflow_created, recommendations}) — usados nos cards AppSec/DevOps. Canais markdown: `security_report: NotRequired[str]` e `devops_report: NotRequired[str]` — expostos como `security_report_md`/`devops_report_md` no output (sufixo `_md` evita colisão com o nome canônico do canal estruturado na resposta).
- `circuit_breaker` serializa o snapshot do canal (dataclass → dict; se ausente no checkpoint, `null`).
- `degraded`/`degraded_reason` vêm dos canais homônimos (default `false`/`null`).

### Testes (motor)

Novo arquivo em `tests/` seguindo padrão existente (ex.: `tests/test_artifacts_api.py` ou similar já usado para routers):
- 404 run inexistente.
- 200 com checkpoint mock → node_artifacts espelhando canais.
- tokens agrupados por nó a partir de `llm_costs` semeado.
- sem checkpoint → 200 vazio.

## Design — FE (loopforge-ade)

### 1. Resume UI

- `RunsWorkspace.tsx`: quando run ativa tem `status === 'paused'`, exibir banner acima do canvas: "Run paused — budget hard-stop reached. Adjust budget or resume." com botões `Resume` e `Budget override`.
  - `Resume` → `resumeRun(run.id)` → `upsertRun(resposta)` → invalidar query `['run-cost', id]`.
  - `Budget override` → abre modal de override existente no `CostBar`. Implementação: promover o estado de abertura do modal (`overrideOpen`/`setOverrideOpen`) do estado local do `CostBar` para um store zustand dedicado (`useBudgetOverrideStore`) — banner e CostBar consomem o mesmo estado; evita evento custom e prop-drilling.
- Toolbar (`RunsWorkspace` linha 65-70): botão `Resume` visível quando `activeRun.status === 'paused'`, ao lado do NewRunForm.
- `wsBridge.ts`: evento `pipeline_resumed` → `upsertRun({id, status: 'running'})` (hoje é log-only).

### 2. InspectDrawer real

- Nova fn `getRunArtifacts(runId)` em `api.ts` + tipos em `types.ts` (`ArtifactsResponse`, `NodeArtifact`, `ArtifactTokens`, `CircuitBreakerSnapshot`).
- Fetch via react-query quando drawer aberto (queryKey `['run-artifacts', runId]`, staleTime curto; revalidar em `node_execution` do nó).
- Seção **Inputs / Outputs**: output do nó selecionado em `<pre>` mono, `max-h` + scroll, JSON.stringify formatado. `code` truncado a ~2000 chars com toggle expandir. Sem dados → "No data recorded" (substitui "No payload recorded (V1)").
- Seção **Tokens / Context**: linha por nó a partir de `tokens[]` — `{prompt_tokens}/{completion_tokens} tokens · $cost`; vazio → "No token data".
- Seção **Parallel Audit** (nó `parallel_audit`):
  - AppSec: lista `vulnerabilities_found` — badge de severidade (tone: critical/high=err, medium=warn, low/info=neutral), tipo e descrição. Vazio → "No vulnerabilities found".
  - DevOps: `deployability_score`, `status`, flags `dockerfile_created`/`ci_workflow_created`, lista `recommendations`. Vazio → "No DevOps report".
- Seção **Degraded / Circuit Breaker**: chip "degraded" quando `degraded === true` (+ motivo via title); CB state badge (`closed`/`open`/`half-open`) quando `circuit_breaker` presente.

### Testes (FE)

- Vitest: InspectDrawer com `getRunArtifacts` mockado (payload real por nó, estado vazio, audit com vulns); banner + botão Resume em RunsWorkspace (status paused); `pipeline_resumed` → status running no wsBridge.
- Playwright smoke: sem mudanças obrigatórias; garantir que smoke existente segue verde.

## Critérios de pronto

1. Motor: `ruff check --select E,F,W,I,N,UP,SIM src/lf tests` limpo; `mypy src/lf` limpo; `pytest tests/` verde (incluindo novos testes).
2. FE: `vitest` verde; playwright 4/4.
3. Manual: `lf serve` → run mock → InspectDrawer mostra epic/tech_spec/code/test_report reais; após parallel_audit, AppSec/DevOps com dados; run `paused` → banner + toolbar Resume funcional; resume → status `running` via WS.

## Fora de escopo

- WS backfill E4, endpoint de fila E3, degraded no RunResponse, eventos de circuit breaker no WS (P1/P2 — próximos ciclos).
- Limpeza de `getRun`/`updateLesson` mortos (P2).
