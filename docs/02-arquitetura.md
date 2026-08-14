# 02 — Arquitetura técnica

## 1. Contexto de sistema

```mermaid
flowchart TB
    subgraph browser["Browser (127.0.0.1)"]
        SPA["SPA React 19<br/>(web/loopforge-ade → vendored em lf)"]
    end
    subgraph lf["Processo lf serve (FastAPI/Uvicorn)"]
        API["REST /api/v1/*<br/>WS /ws/runs/{id} · /ws/streaming"]
        BUS["EventBus<br/>(journal + broadcast) — ADR-0002 · api/events.py"]
        DISP["TaskDispatcher<br/>(writer canônico da run — M-07)"]
        GRAPH["LangGraph StateGraph<br/>9 nós de execução (NodeRegistry) + interrupt gates"]
        MCPR["MCPRegistry<br/>(stdio, deny-by-default)"]
        CB["CircuitBreaker<br/>(budget ADR-0005)"]
    end
    subgraph data[".loopforge/"]
        DB[("telemetry.sqlite<br/>runs·events·costs·decisions")]
        TRAJ[("trajectories.db<br/>checkpoints LangGraph")]
        YAML["ade.yaml"]
    end
    LLM["Providers LLM<br/>native→OpenCode→Mock (+Ollama)"]
    TOOLS["Servidores MCP<br/>(subprocessos stdio)"]

    SPA -- "REST + WS (X-API-Key / ?token=)" --> API
    API --> BUS
    API --> DISP
    DISP --> GRAPH
    DISP --> BUS
    GRAPH --> LLM
    DISP --> MCPR --> TOOLS
    BUS --> DB
    DISP --> DB
    GRAPH --> TRAJ
    API --> YAML
```

Decisões estruturais:
- **Backend embutido no `lf`** (E1) — a ADE é um modo de operação do engine, não
  um serviço separado. Um processo, um banco, um `ade.yaml`.
- **Pacote pip único** (ADR-0001) — SPA compilada servida por `StaticFiles` em
  `/app`; `lf serve` abre o browser na SPA.
- **Run = unidade primária, run↔thread 1:1 persistido** (E2, ADR-0003).
- **Fila com `max_concurrent_runs` (E3)** — `POST /runs` cria `queued`; a fila
  promove até `max_concurrent_runs` (default 2) em paralelo, sem lock de escrita
  (checkout atômico de tarefas fica no V2).

## 2. Camadas do backend (`src/lf/`)

| Camada | Módulos | Responsabilidade |
|---|---|---|
| HTTP/WS | `api/app.py`, `api/{trajectories, mcp, providers, config, costs, memory, evals, git, prompts, artifacts, terminal, ast_analyzer, coverage, docker_gen, rate_limit}.py`, `api/websocket_manager.py`, `api/spa.py` | Contratos de `03-contratos-api.md`; mount da SPA |
| Eventos | `api/events.py` (novo, M-05) | Persistir no journal + broadcast; único ponto de emissão |
| Orquestração | `orchestrator/task_dispatcher.py` | Dispatch/resume, gates HITL, upsert de run (M-07), enforcement de budget (M-08/10) |
| Pipeline | `pipeline/graph.py`, `pipeline/nodes/*`, `pipeline/llm_factory.py`, `pipeline/checkpointer.py` | DAG de 9 nós de execução (NodeRegistry), providers, checkpoints |
| MCP | `mcp/{client,registry,permissions,bridge}.py` | stdio, allowlist deny-by-default |
| Dados | `api/database.py`, `api/models.py`, `config/{schema,loader}.py` | SQLite async, schemas, `ade.yaml` |

Regras de dependência: API nunca chama LangGraph diretamente (passa pelo
dispatcher); dispatcher nunca escreve HTTP; nós do pipeline não conhecem a API;
`EventBus` é o único caminho de evento para fora do processo.

## 3. Arquitetura da SPA (`frontend/src/`)

Implementada em `frontend/` (19 features em `features/`):

```
app/            App.tsx, layout (3 colunas + fullscreen F11)
features/
  runs/         abas, fila, NewRunForm, demoMock (UX16)
  dag/          FlowCanvas (@xyflow/react), AgentNode, dagModel, InspectDrawer
  console/      ConsolePanel (filtros node/level/texto, autoscroll)
  timeline/     TimelineBar (slider + ghost + banner inspeção)
  hitl/         HitlDrawer (approve/retry/adjust_*/abort, audit trail)
  costs/        CostBar + modal override (dados reais — GET /runs/{id}/cost)
  mcp/          McpPlayground (lista tools; execução via POST tools)
  trajectories/ Fork/Export/Import dialogs + TrajectoriesPanel
  auth/         ApiKeyGate (tela 401, X-API-Key em sessionStorage)
  git/          GitPanel · evals/ · memory/ · prompts/ · artifacts/ (polling)
  terminal/     TerminalPanel · ast/ · docker/ · health/
  settings/     SettingsPanel (PATCH /api/v1/config)
shared/lib/     api.ts (REST), ws.ts (envelope v1, backoff), types.ts
shared/ui/      Button/Badge/Drawer/Banner/EmptyState/SplitPane
stores/         runsStore (undo/redo), canvasStore, consoleStore, wsStore, wsBridge
```

Padrões:
- **Server state** (runs, config, custo, checkpoints) → TanStack Query.
- **Live state** (status de nó, console, conexão) → Zustand alimentado pelo
  `wsBridge` (normalize envelope v1 → dispatch para stores).
- **Backfill**: ao abrir run → `GET events?after_seq=0` → aplica → conecta WS
  filtrado → dedup por `seq` (M-06). Reconexão usa `after_seq=último conhecido`.
- **Ids de nó canônicos = ids do backend** (`developer`, `tech_lead`,
  `parallel_audit`…); labels de exibição em `NODE_LABELS` (M-19) — elimina a
  camada de normalização de nomes que o branch precisou criar.
- Sem router no V1 (abas de runs substituem navegação por URL).

## 4. Fluxos-chave

### 4.1 Ciclo de vida de uma run

```mermaid
sequenceDiagram
    participant U as SPA
    participant A as API
    participant D as Dispatcher
    participant G as LangGraph
    participant B as EventBus/Journal
    U->>A: POST /runs {idea, stack}
    A->>D: dispatch(run_id)
    D->>B: run_created / pipeline_started (seq 1..n)
    loop por nó
        G->>D: nó concluído
        D->>B: node_execution + upsert pipeline_runs
        B-->>U: WS (live) / GET events (backfill)
    end
    D->>B: pipeline_finished
```

### 4.2 Gate HITL (com ADR-0006)

1. LangGraph interrompe após nó com gate → dispatcher publica `hitl_gate_reached`
   e status `waiting_decision`; UI abre o drawer (não-modal, UX8).
2. Operador decide via `POST /runs/{id}/decide` → API grava em
   `human_decisions` (com `run_id` = uuid da run) + publica
   `human_decision_submitted` → dispatcher consome via polling (~0,5 s) e aplica
   (`approve` continua; `retry` limpa erro; `adjust_prompt`/`adjust_state`
   atualizam estado; `abort` encerra).
   **Estado real (verificado no código)**: **M-22 implementado na Fase A** — o
   dispatcher consulta `human_decisions WHERE run_id = <uuid da run>` (extraído
   do `thread_id` no formato `run-{uuid}` do ADR-0003) e a decisão remota é
   consumida ponta a ponta (aceite E2E HITL na Fase A). O polling existe em
   `_poll_remote_decision_once` (`task_dispatcher.py`), chamado no loop a cada
   ~0,5 s.
3. Timeout (`hitl.timeout_seconds`, default 300s): emite `human_decision_expired`;
   comportamento conforme `hitl.on_timeout` — `continue` = prossegue graciosamente
   (default), `pause` = segue aguardando, `abort` = falha com `hitl_timeout_abort`.

### 4.3 Time-travel e fork

- **Inspeção**: timeline lista checkpoints (`GET .../checkpoints`); slider
  seleciona → `GET .../checkpoints/{cid}` → UI entra em modo inspeção (ghost nos
  nós futuros + banner fixo, UX5/6). Read-only.
- **Fork** (M-13): `POST .../fork {checkpoint_id?}` → servidor copia tuples do
  checkpoint escolhido para `run-{novo_id}` → cria run filha (`parent_run_id`) →
  `fork_created` → aba nova na UI vinculada à origem (UX7). A run original é
  intocada (D4: time-travel = estado do grafo, sem rollback de filesystem).

## 4.4 Budget (ADR-0005)

`CostTracker.track(run_id, node, ...)` a cada chamada LLM → dispatcher soma
`llm_costs` da run → ≥80%: `budget_warning`; ≥100% (com buffer 10% em estimados):
status `paused` (hard-stop, M-10) + evento `circuit_breaker_changed`;
`POST /runs/{id}/cost/override` → resume.

## 5. Comunicação — resumo de escolhas

| Preocupação | Escolha | Por quê |
|---|---|---|
| Live updates | WS com envelope v1 + seq | Já existente; seq fecha gap de reconexão |
| Backfill | REST journal (`after_seq`) | Simples, testável, separado do lifecycle do socket |
| Token streaming | Fora do MVP | ADR-0007 |
| Estado do grafo | Checkpoints LangGraph (read-only) + `aupdate_state` em HITL | Não reinventar persistência |
| Server state na UI | TanStack Query | Cache/poll declarativo |
| Live state na UI | Zustand + wsBridge | Já implementado; undo/redo |

## 6. Não-objetivos arquiteturais (V2+)

Execução paralela real com checkout atômico; worktrees isolados por lane; RBAC;
evals; token streaming; MCP sobre HTTP/SSE; prune/TTL; tema claro/i18n.
