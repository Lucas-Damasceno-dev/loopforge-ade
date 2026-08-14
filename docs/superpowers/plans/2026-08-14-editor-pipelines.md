# Editor de Pipelines — Implementation Plan (Spec S3)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pipelines como cidadãos de primeira classe: CRUD no backend LoopForge (schema pydantic + tabela + validação + compilação para StateGraph + runs executando pipelines com snapshot imutável) e editor visual no frontend (lista na sub-sidebar + grafo editável no mesmo canvas com toggle Edit/Live + execução de pipeline via NewRunForm).

**Architecture:** BE segue o padrão do S2 (agents.py: schemas no router file, ORM em models.py, CRUD com auth no include, pytest). `build_pipeline_graph` reusa `NodeRegistry`/`EdgeRegistry` (graph.py:132-162) + `NodeFactory` do S2 (node_factory.py: compile/register_agent_node) para compilar StateGraph a partir do schema; validação (ciclos/teto retry/refs) em módulo próprio. Run com `pipeline_id` grava **snapshot imutável** (JSON na pipeline_runs, migração aditiva) e executa o grafo compilado; sem `pipeline_id` → comportamento atual (entry_router). FE espelha o S2 (types+api+store) e adiciona o editor: draft em store, serialização pipeline↔dagModel, paleta + drag/connect no React Flow, config de edge, validate via API.

**Tech Stack:** BE: FastAPI, SQLAlchemy async, pydantic v2, pytest (uv). FE: React 19, React Flow v12.6, Zustand, vitest, Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-08-14-pipeline-studio-design.md` §S3 (decisões 3-C ciclo retry com teto, 4-B pipeline central, 5-A mesmo canvas toggle Edit/Live, 6-C tipos completos, 9-C snapshot imutável, 10-A fallback automático).

## DOIS REPOSITÓRIOS (crítico — igual S2)

| Repo | Path | Commits |
|---|---|---|
| loopforge-ade (frontend + docs) | `/home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade` | `feat(ade): …` |
| LoopForge (engine) | `/home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge` | `feat(engine): …` |

- Tasks BE: cwd engine, git add só `src/lf/` + `tests/`, commit `feat(engine): …`. Tasks FE: cwd loopforge-ade, git add só `frontend/`, commit `feat(ade): …`.
- NUNCA commitar docs do usuário (loopforge-ade: docs/*, BLUEPRINT.md, STATUS-IMPLEMENTACAO.md; engine: PROJECT_SUMMARY.md, README.md, docs/* — modificados pelo checkpoint automático do loopforge).
- Verificação BE: `uv run pytest <alvos> -q`. FE: `cd frontend && npx vitest run` + `npx tsc -b --noEmit` + `npm run build`.
- RACE checkpoint do engine: antes de QUALQUER `git reset`, checar `git log -1 --format=%s` (reset SÓ se for `checkpoint:`); commitar com cadeia `git reset HEAD~1 && git add <só seus arquivos> && git commit` quando necessário; `git log -1` depois.

## Global Constraints

- Baseline: FE 425 testes + build ok; engine pytest 39 agents-related + suite existente verde.
- Zero dependências novas (pydantic v2, JSON cols já usados; React Flow já no FE).
- Texto UI em EN; tokens; sem emoji; monogramas/ícones inline.
- Campos PipelineSchema (verbatim spec §S3): `id, name, description, nodes: [{id, type: agent|split|merge|input|output|gate, agent_id?, config?}], edges: [{source, target, type: sequential|parallel|conditional|retry, condition?, max_retries?}], created_at, updated_at`.
- Nós especiais (developer/qa/parallel_audit/appsec/devops/cpo/pm/tech_lead/test_writer) resolvidos por `agent_id` = id especial conhecido (S2: AgentTemplate uuid OU id de nó especial — ver T4 contrato). Nós especiais continuam hardcoded (spec §7); NodeFactory cobre agentes da biblioteca.
- Snapshot imutável: JSON da pipeline gravado no start da run; edições posteriores da pipeline NÃO afetam a run (decisão 9-C).
- 422 pydantic FE → mensagem amigável EN (padrão SettingsPanel/S2).
- Brief conflitando com código real → siga o código real, documente divergência no report.

---

### Task 1 (BE): PipelineSchema + PipelineTemplate ORM

**Files (repo engine):**
- Create: `src/lf/api/pipelines.py` (schemas pydantic — padrão agents.py S2)
- Modify: `src/lf/api/models.py` (PipelineTemplate ORM)
- Test: `tests/test_pipelines_schema.py`

**Interfaces:**
- Produces (pydantic v2, padrão agents.py):
  - `class PipelineNode(BaseModel)` — `id: str (min 1), type: Literal["agent","split","merge","input","output","gate"], agent_id: str | None = None, config: dict[str, Any] = {}`
  - `class PipelineEdge(BaseModel)` — `source: str, target: str, type: Literal["sequential","parallel","conditional","retry"] = "sequential", condition: str | None = None (obrigatório se type=="conditional"), max_retries: int = 2 (ge 0, usado se type=="retry")`
  - `class PipelineBase(BaseModel)` — `name: str (min 1), description: str = "", nodes: list[PipelineNode] = [], edges: list[PipelineEdge] = []`
  - `class PipelineCreate(PipelineBase)`; `class PipelineUpdate(BaseModel)` — todos `| None = None` (PATCH-style PUT, padrão S2)
  - `class PipelineResponse(PipelineBase)` — + `id: str, created_at: datetime, updated_at: datetime`
  - `class PipelineTemplate(Base)` — `__tablename__ = "pipeline_templates"`, id String(36) pk uuid, name unique=True, description Text default "", nodes/edges como `mapped_column(JSON, default=list)` (precedente events.py S2), created_at/updated_at (padrão models.py)
- Validação semântica (ciclos etc.) NÃO aqui — é Task 3 (validate). Aqui só shape pydantic.

- [ ] **Step 1: Testes falham primeiro** — `tests/test_pipelines_schema.py`: defaults (nodes/edges []), name vazio falha, edge conditional sem condition falha (validator `model_validator` ou Field condicional), retry max_retries default 2, types inválidos falham, PipelineUpdate campos None válido, Response inclui id/timestamps, ORM cria/consulta (fixture padrão S2). Rodar → FAIL.
- [ ] **Step 2: Implementar** — pipelines.py + PipelineTemplate em models.py.
- [ ] **Step 3: Rodar** — PASS + regressão `uv run pytest tests/test_agents_schema.py tests/test_run_model.py -q`.
- [ ] **Step 4: Commit (engine)** — `feat(engine): PipelineSchema + modelo PipelineTemplate (S3)`.

---

### Task 2 (BE): Router CRUD /api/v1/pipelines

**Files (repo engine):**
- Modify: `src/lf/api/pipelines.py` (endpoints — padrão agents.py T2 S2)
- Modify: `src/lf/api/app.py` (include_router com auth)
- Test: `tests/test_pipelines_api.py`

**Interfaces:**
- Consumes: Task 1 schemas + PipelineTemplate; `get_session`; `verify_authentication` (include).
- Produces: `pipelines_router = APIRouter(prefix="/api/v1/pipelines", tags=["Pipelines"])`:
  - `GET /` → list[PipelineResponse] ordenado por name (vazio `[]`)
  - `POST /` → 201 (uuid; name dup → 422 "name already exists"; IntegrityError backstop + rollback)
  - `GET /{pipeline_id}` → 404 "Pipeline not found"
  - `PUT /{pipeline_id}` → PATCH-style (exclude_unset + setattr não-None; None mantém; dup ignorando próprio id)
  - `DELETE /{pipeline_id}` → `{"deleted": true}` | 404
- (validate entra na Task 3 — este router ganha `POST /{pipeline_id}/validate` lá.)

- [ ] **Step 1: Testes falham primeiro** — `tests/test_pipelines_api.py` (fixture padrão test_memory_api.py/test_agents_api.py): CRUD flow, lista vazia, 404s, name dup POST+PUT, PUT com None explícitos, fixture limpa por teste. Rodar → FAIL.
- [ ] **Step 2: Implementar** — endpoints + include com auth.
- [ ] **Step 3: Rodar** — PASS + regressão `uv run pytest tests/test_agents_api.py tests/test_api.py -q`.
- [ ] **Step 4: Commit (engine)** — `feat(engine): CRUD /api/v1/pipelines (S3)`.

---

### Task 3 (BE): Validador de pipeline (ciclos/teto/refs) + endpoint validate

**Files (repo engine):**
- Create: `src/lf/api/pipeline_validator.py`
- Modify: `src/lf/api/pipelines.py` (POST /{id}/validate)
- Test: `tests/test_pipeline_validator.py`

**Interfaces:**
- Consumes: PipelineSchema (Task 1); agent lookup via `get_session` (query AgentTemplate por id).
- Produces:
  - `def validate_pipeline(pipeline: PipelineBase, known_agents: set[str]) -> list[str]` — retorna lista de erros (vazia = válida):
    - todo `edge.source`/`edge.target` ∈ ids de nodes
    - `edge.type == "conditional"` exige `condition` não-vazia
    - `edge.type == "retry"` exige max_retries >= 1 (teto — doom-loop guard)
    - todo `node.type == "agent"` com `agent_id` ∈ known_agents (ids da biblioteca OU ids especiais: cpo, pm, tech_lead, test_writer, developer, qa, appsec, devops, parallel_audit)
    - pelo menos 1 node `input` e 1 node `output` (ou documentado: se ausentes, entrada = 1º node e saída = END — DECIDA e teste; recomendo exigir input/output explícitos na v1)
    - ciclos: DFS detecta ciclo; permitido SÓ se o ciclo contém ≥1 edge `retry` (teto) — qualquer outro ciclo = erro "cycle detected (non-retry)"
    - nós órfãos: todo node alcançável do input (BFS); nós sem path → erro
    - merge com <2 targets ou split com <2 sources → erro "merge requires >=2 incoming" / "split requires >=2 outgoing"
    - nodes sem edges de saída que não sejam output → erro (dead-end) — exceto gate? Decida e teste (recomendo: exigir saída ou output)
  - `POST /api/v1/pipelines/{pipeline_id}/validate` → `{"valid": bool, "errors": list[str]}` (200 sempre; 404 se pipeline não existe)

- [ ] **Step 1: Testes falham primeiro** — `tests/test_pipeline_validator.py` (puro, sem DB — known_agents passado): pipeline válida minimal (input→agent→output) → []; edge com target inexistente → erro; conditional sem condition → erro; retry sem teto (max_retries 0) → erro; ciclo não-retry → erro; ciclo com retry edge → ok; nó órfão → erro; split com 1 saída → erro; merge com 1 entrada → erro; agent_id desconhecido → erro. Rodar → FAIL.
- [ ] **Step 2: Implementar** — pipeline_validator.py + endpoint (busca agentes no DB: ids de PipelineTemplate + ids especiais constantes; query `SELECT id FROM agent_templates`).
- [ ] **Step 3: Rodar** — PASS + regressão `uv run pytest tests/test_pipelines_api.py -q`.
- [ ] **Step 4: Commit (engine)** — `feat(engine): validação de pipelines (ciclos/teto/refs) (S3)`.

---

### Task 4 (BE): build_pipeline_graph — compila StateGraph do schema

**Files (repo engine):**
- Create: `src/lf/pipeline/pipeline_graph.py`
- Test: `tests/test_pipeline_graph.py`

**Interfaces:**
- Consumes: PipelineSchema (Task 1); `NodeRegistry.register/get_all`, `EdgeRegistry.register/get_edges` (graph.py:132-162); `register_agent_node`/`compile_agent_node` (node_factory.py S2); `GraphState`, `build_graph` (graph.py:166-212) como REFERÊNCIA de assembly; nós especiais importáveis (developer/qa/parallel_audit/appsec/devops/cpo/pm/tech_lead/test_writer — siga imports reais do graph.py).
- Produces:
  - `SPECIAL_AGENT_IDS: set[str]` = {cpo, pm, tech_lead, test_writer, developer, qa, appsec, devops, parallel_audit}
  - `def build_pipeline_graph(pipeline: PipelineBase, agent_templates: dict[str, AgentBase]) -> CompiledStateGraph`:
    - Resolve nodes: type "agent" → (a) agent_id ∈ SPECIAL_AGENT_IDS → função do nó real (import direto, mesmo do build_graph default); (b) senão agent_id ∈ agent_templates (dict id→AgentBase do DB) → `register_agent_node(agent)` e usa o node; agente ausente → ValueError (validate já pega antes, aqui é assert defensivo)
    - type "split" → nó vazio `def _split(state): return {}` registrado; fan-out = edges split→cada target (parallel)
    - type "merge" → nó vazio `def _merge(state): return {}`; fan-in = edges de cada source→merge
    - type "gate" → router condicional: edges type "conditional" do gate usam `condition` (avaliada sobre state — v1: dict lookup simples `state.get(condition)` truthy → target; documente)
    - type "input"/"output" → input = ponto de entrada (entry point da StateGraph — mapeia p/ o primeiro node após input); output = END (edges output→END)
    - Edges: sequential/parallel → add_edge; conditional → add_conditional_edges(gate, router_gate, {condition→target}); retry → add_edge source→target + teto via contador em state (reuse padrão attempt_counts/max_retries do GraphState; edge retry = volta ao source com incremento; teto = max_retries do edge → quando estourado, vai ao próximo edge normal)
    - Compila com checkpointer default (mesmo fluxo do build_graph: `workflow.compile(checkpointer=..., interrupt_after=...)` — reutilize os parâmetros reais do build_graph)
  - Limite v1: gates com condição simples; retry teto via attempt_counts existente; SEM nós custom runtime.

- [ ] **Step 1: Testes falham primeiro** — `tests/test_pipeline_graph.py` (mock LLM onde necessário — compile NÃO executa): pipeline minimal compila (input→agent→output) e StateGraph tem nodes esperados; split gera fan-out (edges paralelas); merge fan-in; gate com conditional router; retry edge registrado com teto (attempt_counts incrementa no state mock); agente da biblioteca registrado via register_agent_node (patch); agente especial (developer) usa função real; pipeline inválida (agent ausente) → ValueError. Rodar → FAIL.
- [ ] **Step 2: Implementar** — pipeline_graph.py (grounding real: graph.py assembly completo + EdgeRegistry.get_edges usage + como build_graph default encadeia entry_router/should_retry).
- [ ] **Step 3: Rodar** — PASS + regressão `uv run pytest tests/test_node_factory.py tests/test_pipeline_e2e.py tests/test_decoupling_registries.py -q` (ou alvos que existam).
- [ ] **Step 4: Commit (engine)** — `feat(engine): build_pipeline_graph compila StateGraph do schema (S3)`.

---

### Task 5 (BE): Runs com pipeline_id + snapshot imutável

**Files (repo engine):**
- Modify: `src/lf/api/schemas.py` (RunCreate += pipeline_id?; RunResponse += pipeline_id/pipeline_name?)
- Modify: `src/lf/api/models.py` (PipelineRun += pipeline_snapshot JSON col — migração aditiva no padrão _apply_pipeline_runs_additive_migration)
- Modify: `src/lf/api/app.py` (_create_run_impl + _execute_pipeline_in_background: resolver pipeline → snapshot + compilar via build_pipeline_graph quando pipeline_id; senão fluxo atual)
- Modify: `src/lf/api/database.py` (migração aditiva da coluna)
- Test: `tests/test_pipeline_runs.py`

**Interfaces:**
- Consumes: Task 1-4 (PipelineTemplate lookup, build_pipeline_graph, validate_pipeline chamado no start — pipeline salva é assumida válida, mas revalidar é defensivo barato: erro 422 se inválida), `_execute_pipeline_in_background` real.
- Produces:
  - `RunCreate.pipeline_id: str | None = None` (Field description "Pipeline a executar; ausente = montagem automática atual")
  - `RunResponse` += `pipeline_id: str | None`, `pipeline_name: str | None` (join no read)
  - `PipelineRun.pipeline_snapshot: dict | None = None` (JSON col; migração aditiva: `ALTER TABLE pipeline_runs ADD COLUMN pipeline_snapshot TEXT` + converter via json.dumps no write — SQLite JSON não é nativo p/ ALTER; siga o padrão dos eventos/costs do repo, documente)
  - `_create_run_impl`: se pipeline_id → carrega PipelineTemplate; revalida (422 "pipeline invalid: <erros>" se falhar); grava `run.pipeline_snapshot = pipeline.model_dump()` (snapshot IMUTÁVEL no start); passa ao executor
  - Executor: se pipeline_id → `build_pipeline_graph(snapshot_pydantic, agent_templates)` e roda o grafo compilado; senão build_graph default (comportamento atual intacto)
  - agent_templates: query AgentTemplate por agent_id referenciado (resolve na execução — se agente foi deletado depois do snapshot, 422/erro claro: documente comportamento: falha na execução com erro "agent <id> not found"; snapshot preserva os ids)

- [ ] **Step 1: Testes falham primeiro** — `tests/test_pipeline_runs.py` (mock do executor/LLM): POST /runs com pipeline_id válido → 201 + pipeline_id/pipeline_name na response + snapshot gravado (consulta DB); POST com pipeline_id inválido/inexistente → 404 "Pipeline not found"; pipeline inválida salva → 422; sem pipeline_id → comportamento atual (sem snapshot); execução usa build_pipeline_graph (spy/patch). Rodar → FAIL.
- [ ] **Step 2: Implementar** — schema/model/migração/app wiring (grounding real no _execute_pipeline_in_background — leia o corpo antes).
- [ ] **Step 3: Rodar** — PASS + regressão `uv run pytest tests/test_resume_api_e2e.py tests/test_api.py tests/test_pipeline_e2e.py -q` (runs atuais intactos — sem pipeline_id = mesmo fluxo).
- [ ] **Step 4: Commit (engine)** — `feat(engine): runs executam pipelines com snapshot imutável (S3)`.

---

### Task 6 (FE): types + API client pipelines

**Files (repo loopforge-ade):**
- Modify: `frontend/src/shared/lib/types.ts` (seção `// ─── Pipelines (S3) ───`)
- Modify: `frontend/src/shared/lib/api.ts`
- Test: `frontend/src/shared/lib/__tests__/api.test.ts` (+ casos)

**Interfaces:**
- Consumes: `apiFetch<T>`; padrão S2 (Agent/AgentInput).
- Produces:
  - `interface PipelineNode { id: string; type: 'agent'|'split'|'merge'|'input'|'output'|'gate'; agent_id?: string | null; config?: Record<string, unknown> }`
  - `interface PipelineEdge { source: string; target: string; type: 'sequential'|'parallel'|'conditional'|'retry'; condition?: string | null; max_retries?: number }`
  - `interface Pipeline { id; name; description; nodes: PipelineNode[]; edges: PipelineEdge[]; created_at; updated_at }`
  - `type PipelineInput = Omit<Pipeline, 'id'|'created_at'|'updated_at'>` (update usa `Partial<PipelineInput>`)
  - `interface ValidateResult { valid: boolean; errors: string[] }`
  - `listPipelines()`, `getPipeline(id)`, `createPipeline(input)`, `updatePipeline(id, Partial<PipelineInput>)`, `deletePipeline(id)`, `validatePipeline(id): Promise<ValidateResult>`

- [ ] **Step 1: Testes falham primeiro** — api.test.ts: 6 clients (paths/methods/body/422) no padrão S2 + validatePipeline POST. Rodar → FAIL.
- [ ] **Step 2: Implementar** — types + api.ts.
- [ ] **Step 3: Rodar** — api.test PASS + `npx vitest run src/shared/lib`.
- [ ] **Step 4: Commit (loopforge-ade)** — `feat(ade): API client e tipos de pipelines (S3)`.

---

### Task 7 (FE): pipelinesStore

**Files (repo loopforge-ade):**
- Create: `frontend/src/stores/pipelinesStore.ts` + `frontend/src/stores/__tests__/pipelinesStore.test.ts`

**Interfaces:**
- Consumes: Task 6 client.
- Produces (Zustand, padrão agentsStore S2 — MESMOS contratos de erro/404-swallow):
  - `{ pipelines: Pipeline[]; loading: boolean; error: string | null; fetchPipelines(); createPipeline(input); updatePipeline(id, input); deletePipeline(id) }` — mutação local após sucesso; 422 → "The server rejected the pipeline (HTTP 422)" + detail console.error; deleteAgent-style 404-swallow + short-circuit (COPIE o padrão corrigido da T5 S2: `if (!get().pipelines.some(...)) return` antes da API + 404 engole + 500 re-throw; limpe `error: null` no 404-swallow — inclua o fix do minor S2).

- [ ] **Step 1: Testes falham primeiro** — store test (padrão agentsStore.test): fetch popula; create append; update replace; delete remove; 404-swallow limpa error stale (inclua o caso do minor S2: error pré-existente + delete 404 → error null); short-circuit sem chamada; 500 re-throw; 422 error friendly. Rodar → FAIL.
- [ ] **Step 2: Implementar** — pipelinesStore.
- [ ] **Step 3: Rodar** — PASS + `npx vitest run src/stores`.
- [ ] **Step 4: Commit (loopforge-ade)** — `feat(ade): pipelinesStore (S3)`.

---

### Task 8 (FE): PipelinesPanel + sidebar inline (designer)

**Files (repo loopforge-ade):**
- Create: `frontend/src/features/pipelines/PipelinesPanel.tsx` + `__tests__/PipelinesPanel.test.tsx`
- Modify: `frontend/src/shared/ui/SidebarHost.tsx` (pipelines: INLINE_VIEWS — placeholder "coming in a later phase" removido)
- Modify: `frontend/src/shared/lib/views.ts` (se necessário)

**Interfaces:**
- Consumes: Task 7 store; padrão AgentsPanel S2 (narrow, monograma, chips, EmptyState, delete confirm inline, 422 inline).
- Produces: `<PipelinesPanel />` narrow:
  - Lista: monograma + name + counts (N nodes / M edges) + description truncada; clique seleciona → **edita no editor** (dispara `editorStore.open(pipeline)` — Task 9; nesta task o clique só seta `selectedPipelineId` no pipelinesStore e mostra hint "Edit in canvas" se editor ainda não existe — SEM dead-end: comente o wire p/ T9)
  - "+ New pipeline" → cria draft vazio no editorStore (T9; nesta task: placeholder botão que seta selectedPipelineId='new' — documente)
  - Form de metadados (name*, description) + Delete + 422 inline EN (o grafo em si é editado no canvas — T9)
  - EmptyState "No pipelines yet" + CTA
- SidebarHost: pipelines → INLINE_VIEWS; placeholder removido; SidebarHost.test atualizado (pipelines renderiza painel real; agents permanece real)

- [ ] **Step 1: Testes falham primeiro** — PipelinesPanel.test (lista/vazio/name edit/delete/422) + SidebarHost.test (pipelines real). Rodar → FAIL.
- [ ] **Step 2: Implementar** — painel + sidebar/views.
- [ ] **Step 3: Rodar** — PASS + full suite + tsc + build.
- [ ] **Step 4: Commit (loopforge-ade)** — `feat(ade): painel de pipelines na sub-sidebar (S3)`.

---

### Task 9 (FE): Editor — Edit/Live no canvas + paleta + drag/connect + edge config (fixer)

**Files (repo loopforge-ade):**
- Create: `frontend/src/features/pipelines/editorStore.ts` + `__tests__/editorStore.test.ts`
- Create: `frontend/src/features/pipelines/editorModel.ts` + `__tests__/editorModel.test.ts` (serialização pipeline↔dagModel)
- Create: `frontend/src/features/pipelines/NodePalette.tsx` + `__tests__/NodePalette.test.tsx`
- Create: `frontend/src/features/pipelines/EdgeConfigDrawer.tsx` + teste
- Modify: `frontend/src/features/dag/FlowCanvas.tsx` (modo edição: nodesDraggable, onConnect, paleta overlay, delete key) — MÍNIMO, sem quebrar o modo live
- Modify: `frontend/src/app/App.tsx` (toggle Edit/Live no canvasRegion; wire editorStore)

**Interfaces:**
- Consumes: dagModel (buildNodes/buildEdges, DISPLAY_ORDER, DagNodeData — p/ mapear pipeline→grafo), React Flow (onConnect, nodesDraggable, deleteKeyCode), Task 6-8 (PipelineInput, validatePipeline, pipelinesStore).
- Produces:
  - `editorStore`: `{ draft: PipelineInput | null; editingId: string | null; live: boolean; open(pipeline | 'new'); close(); setLive(v); updateNode/updateEdge/addNode/removeNode/addEdge/removeEdge (mutam draft); }`
  - `editorModel.ts` (PURO): `pipelineToNodes(pipeline): DagNodeData[]` (input→primeiro nó, output→nó final, agent→AgentNode data com label do agente, split/merge/gate → tipos existentes S4; positions em grade), `pipelineToEdges(pipeline): DagEdge[]` (mapeia types: sequential/parallel→normal, retry→dashed), `nodesToPipeline(nodes, edges): PipelineInput` (inverso — valida ids únicos); testes de round-trip
  - FlowCanvas modo edição (`live=false`): nodesDraggable, onConnect → editorStore.addEdge (source/target/handle), deleteKeyCode, clique edge → EdgeConfigDrawer (tipo/condition/max_retries), NodePalette overlay (lado esquerdo: agentes da biblioteca (agentsStore) + split/merge/gate/input/output; drag p/ canvas via onDragStart dataTransfer ou clique-add — escolha a mais simples e teste)
  - Toggle Edit/Live: botão no canvasRegion (topo, padrão TopbarAction icon+label): live → render atual (buildNodes/buildEdges do dagModel com run data); edit → render do draft (editorModel) com paleta; dirty state → botão Save (create/update via pipelinesStore) + Validate (validatePipeline, erros inline)
  - App: wire editorStore no canvasRegion; modo edição desabilita clique→inspector (onNodeClick só em live)
  - Não quebrar: run demo/live flow intactos (live = comportamento atual 1:1)

- [ ] **Step 1: Testes falham primeiro** — editorModel.test (round-trip pipeline→nodes→pipeline; mapeamento de types; ids únicos), editorStore.test (open/close/add/remove/mutate draft/setLive), NodePalette.test (render agents+tipos, clique/drag adiciona). Rodar → FAIL.
- [ ] **Step 2: Implementar** — editorStore + editorModel.
- [ ] **Step 3: Implementar** — NodePalette + EdgeConfigDrawer + FlowCanvas modo edição + App wire (TDD: FlowCanvas.test modo edição — connect cria edge, delete remove, paleta abre).
- [ ] **Step 4: Rodar** — testes novos PASS + full suite + tsc + build.
- [ ] **Step 5: Commit (loopforge-ade)** — `feat(ade): editor de pipelines no canvas (Edit/Live) (S3)`.

---

### Task 10 (FE): NewRunForm pipeline select + inspector badge

**Files (repo loopforge-ade):**
- Modify: `frontend/src/features/runs/NewRunForm.tsx` (campo Pipeline opcional — decisão 10-A)
- Modify: `frontend/src/features/dag/RunInspector.tsx` (badge pipeline)
- Modify: `frontend/src/shared/lib/types.ts` (RunResponse += pipeline_id/pipeline_name — espelhar T5 BE)
- Test: ajustes/novos

**Interfaces:**
- Consumes: pipelinesStore (lista p/ select), runsStore/createRun (payload += pipeline_id), T5 BE contract.
- Produces:
  - NewRunForm: select "Pipeline (optional)" com biblioteca (narrow: select full-width); vazio → fallback automático (comportamento atual — sem pipeline_id no payload); payload `createRun({...input, pipeline_id?})` (confira o client de runs existente)
  - RunInspector: se run.pipeline_id → badge mono "Pipeline: <name>" na seção Run details (fallback id shortId se sem name); sem mudança visual se ausente
  - RunTabs tooltip? — não (YAGNI)

- [ ] **Step 1: Testes falham primeiro** — NewRunForm.test (select renderiza pipelines do store; sem seleção → createRun sem pipeline_id; com seleção → pipeline_id no payload), RunInspector.test (badge quando pipeline_id, ausente quando não). Rodar → FAIL.
- [ ] **Step 2: Implementar** — form + inspector + types.
- [ ] **Step 3: Rodar** — PASS + full suite + tsc + build.
- [ ] **Step 4: Commit (loopforge-ade)** — `feat(ade): executar pipeline a partir do New Run (S3)`.

---

### Task 11: Verificação integrada + revisão visual (designer)

**Files:** — (commits só se defeito)

- [ ] **Step 1: FE full** — `cd frontend && npx vitest run` (baseline 425 + novos T6-T10, zero fail) + tsc + build.
- [ ] **Step 2: BE** — `uv run pytest tests/test_pipelines_schema.py tests/test_pipelines_api.py tests/test_pipeline_validator.py tests/test_pipeline_graph.py tests/test_pipeline_runs.py tests/test_api.py -q` (engine).
- [ ] **Step 3: Revisão visual (designer)** — playwright: (a) sidebar Pipelines (lista + form metadados); (b) editor: toggle Edit/Live, paleta, arrastar nó, conectar, edge config, validate errors inline, salvar; (c) NewRunForm com pipeline select; screenshots em `/tmp/opencode/shots/s3-*.png`; coerência shell S1/S2; corrigir defeitos visuais reais (commit `fix(ade): …` se necessário)
- [ ] **Step 4: Smoke** — playwright smoke existente passa; s3-verify temporário (spec removido depois) com backend real SE disponível (engine up + vite) — fluxo: criar pipeline no editor → salvar → New Run com pipeline → run executa (mock_llm) → inspector mostra badge
- [ ] **Step 5: Commit final (se houver)** — loopforge-ade.

---

## Self-review notes

- **Spec coverage:** §S3 completo — PipelineSchema/CRUD (T1-T2), validate (T3), build_pipeline_graph (T4), runs+pipeline_id+snapshot (T5), FE client/store (T6-T7), view Pipelines (T8), editor Edit/Live+paleta+connect+edge config (T9), New Run com pipeline + fallback (T10), integração (T11). Decisões 3-C (retry teto no validate + edge), 4-B (pipeline central), 5-A (toggle), 6-C (tipos completos), 9-C (snapshot), 10-A (fallback).
- **Não quebra:** sem pipeline_id → fluxo atual byte-idêntico (entry_router); live mode do canvas intacto; nós especiais hardcoded (spec §7); NodeFactory S2 reusado sem refactor.
- **Riscos:** T4 é o coração (assembly LangGraph) — grounding obrigatório no build_graph real; retry teto via attempt_counts existente (GraphState já tem); gate condicional v1 = lookup simples (documentado); snapshot JSON em SQLite via coluna Text+json (migração aditiva padrão); checkpoint do engine nas tasks BE (regra reset).
- **Carry-over S2 integrado:** delete 404-swallow com error:null no pipelinesStore (T7); slug collision → T4 nota (validate rejeita? não — documentado como risco conhecido; agents name case-sensitive); validação de campos do form (T8).
- **Fora de escopo (YAGNI):** agent_overrides no POST /runs (spec menciona; v1 sem), grafo congelado renderizado no Inspector (v1: badge nome; render do snapshot em plano futuro), versionamento (decisão 9), hooks custom TS, merge N-de-M condicional.
