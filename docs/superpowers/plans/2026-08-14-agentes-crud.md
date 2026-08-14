# CRUD de Agentes — Implementation Plan (Spec S2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Biblioteca de templates de agentes com CRUD completo — backend LoopForge (schema pydantic + tabela SQLite + API REST + NodeFactory data-driven) e frontend ADE (view Agents na sub-sidebar com lista + form de campos avançados).

**Architecture:** Backend segue o padrão dos routers existentes (APIRouter prefix, auth no include, SQLAlchemy async + SQLite, models.py ORM). NodeFactory compila nó LangGraph genérico a partir do AgentSchema (mesmos primitivos dos nós atuais) e registra no NodeRegistry — registrado, ainda não usado por runs (uso real chega no S3). Frontend: api.ts client + agentsStore Zustand + AgentsPanel narrow na sidebar (padrão NewRunForm narrow), validação 422 amigável (padrão SettingsPanel).

**Tech Stack:** BE: FastAPI, SQLAlchemy async, pydantic v2, pytest (uv). FE: React 19, Zustand, vitest, Tailwind v4 tokens.

**Spec:** `docs/superpowers/specs/2026-08-14-pipeline-studio-design.md` §S2 (decisões 2-A biblioteca, 7-C campos avançados, 8 FE+BE).

## DOIS REPOSITÓRIOS (crítico)

| Repo | Path | Commits BE | Commits FE |
|---|---|---|---|
| loopforge-ade (frontend + docs) | `/home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade` | — | `feat(ade): …` |
| LoopForge (engine) | `/home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge` | `feat(engine): …` | — |

- Tarefas BE commitam SÓ no engine (cwd `agentes/LoopForge`), git add só `src/lf/` + `tests/` novos. Tarefas FE commitam SÓ no loopforge-ade, git add só `frontend/`.
- NUNCA commitar docs do usuário (docs/*, BLUEPRINT.md, STATUS-IMPLEMENTACAO.md no loopforge-ade; docs/superpowers ficam no loopforge-ade).
- Verificação BE: `uv run pytest <tests-alvo> -q` (repo engine). Verificação FE: `cd frontend && npx vitest run` + `npx tsc -b --noEmit` + `npm run build`.

## Global Constraints

- Baseline: FE 401 testes + build ok; engine suíte pytest existente verde (não rodar full obrigatoriamente — rodar alvos + smoke `test_api.py` se rápido).
- Zero dependências novas (pydantic v2 já no engine; sem libs novas no FE).
- Texto UI em EN; tokens do design system; sem emoji; monogramas/ícones inline.
- Campos do agente (verbatim do spec §S2): `id, name, description, prompt, model, temperature, max_retries, timeout_seconds, env_vars: dict[str,str], tools_allowlist: list[str] (MCP deny-by-default), permissions: deny-by-default, stack, budget_usd: float, created_at, updated_at`.
- Permissões deny-by-default = `permissions: list[str] = []` (lista vazia = nada permitido além do default; campo evolui no S3).
- 422 pydantic no FE → mensagem amigável EN (padrão SettingsPanel: "The server rejected the agents (HTTP <status>)", detail só console.error; branch array pydantic mantido).
- Brief conflitando com código real → siga o código real, documente divergência no report.

---

### Task 1 (BE): AgentSchema + AgentTemplate ORM

**Files (repo engine):**
- Create: `src/lf/api/agents.py` (schemas pydantic — padrão memory.py: schemas no próprio router file)
- Modify: `src/lf/api/models.py` (AgentTemplate ORM)
- Test: `tests/test_agents_schema.py`

**Interfaces:**
- Produces:
  - `class AgentBase(BaseModel)` — `name: str (min 1), description: str = "", prompt: str (min 1), model: str = "default", temperature: float = 0.7 (ge 0 le 2), max_retries: int = 2 (ge 0), timeout_seconds: int = 300 (ge 1), env_vars: dict[str,str] = {}, tools_allowlist: list[str] = [], permissions: list[str] = [], stack: str = "python", budget_usd: float = 0.0 (ge 0)`
  - `class AgentCreate(AgentBase)`; `class AgentUpdate(BaseModel)` — todos os campos `| None = None` (PATCH-style no PUT: campos omitidos mantêm valor)
  - `class AgentResponse(AgentBase)` — + `id: str, created_at: datetime, updated_at: datetime`
  - `class AgentTemplate(Base)` — `__tablename__ = "agent_templates"`, id String(36) pk uuid (padrão _generate_uuid), colunas espelhando AgentBase (env_vars/tools_allowlist/permissions como JSON — sqlalchemy `JSON` é ok no SQLite; se o repo evita JSON em modelos, serializar Text+json.loads e documentar), created_at/updated_at (padrão models.py _now_utc). `name` com constraint unique (SQLite: `unique=True`).

- [ ] **Step 1: Testes falham primeiro** — `tests/test_agents_schema.py`: AgentCreate valida name vazio (422/validation error), temperature fora de [0,2] falha, defaults corretos (temperature 0.7, max_retries 2, permissions []), AgentUpdate com campos None = válido, AgentResponse inclui id/timestamps. Rodar: `uv run pytest tests/test_agents_schema.py -q` → FAIL (módulo não existe).
- [ ] **Step 2: Implementar** — `agents.py` (schemas) + `AgentTemplate` em models.py.
- [ ] **Step 3: Rodar** — testes PASS + `uv run pytest tests/test_run_model.py tests/test_api.py -q` (regressão básica, output real no report).
- [ ] **Step 4: Commit (repo engine)** — `git add src/lf/api/agents.py src/lf/api/models.py tests/test_agents_schema.py` → `git commit -m "feat(engine): AgentSchema + modelo AgentTemplate (S2)"`.

---

### Task 2 (BE): Router CRUD /api/v1/agents

**Files (repo engine):**
- Modify: `src/lf/api/agents.py` (endpoints)
- Modify: `src/lf/api/app.py` (include_router com auth — padrão config/costs routers)
- Test: `tests/test_agents_api.py`

**Interfaces:**
- Consumes: Task 1 schemas + `AgentTemplate`; `get_session` (database.py); `verify_authentication` (auth.py, aplicada no include como config_router/costs_router).
- Produces: `agents_router = APIRouter(prefix="/api/v1/agents", tags=["Agents"])` com:
  - `GET /` → `list[AgentResponse]` (ordenado por name; vazio = `[]`, não 404)
  - `POST /` → 201 `AgentResponse` (uuid id; name duplicado → `HTTPException 422, detail="name already exists"`)
  - `GET /{agent_id}` → `AgentResponse` | 404 "Agent not found"
  - `PUT /{agent_id}` → `AgentResponse` atualizado (AgentUpdate: campos None mantêm; 404 se não existe; name dup → 422)
  - `DELETE /{agent_id}` → `{"deleted": true}` | 404
  - Erro de banco → 500 genérico (padrão repo). Sessão async `session: AsyncSession = Depends(get_session)` (padrão app.py/artifacts.py).

- [ ] **Step 1: Testes falham primeiro** — `tests/test_agents_api.py` (padrão test_memory_api.py — confira como monta client/fixture de DB): CRUD completo (create→get→list→update→delete), 404 paths, name duplicado 422, update parcial mantém campos. Rodar → FAIL.
- [ ] **Step 2: Implementar** — endpoints em agents.py (async, padrão artifacts.py/coverage.py com session) + include em app.py junto dos outros routers com `dependencies=[Depends(verify_authentication)]`.
- [ ] **Step 3: Rodar** — testes PASS + regressão `uv run pytest tests/test_auth_v1_routers.py tests/test_api.py -q`.
- [ ] **Step 4: Commit (engine)** — `feat(engine): CRUD /api/v1/agents (S2)`.

---

### Task 3 (BE): NodeFactory — nó genérico a partir do AgentSchema

**Files (repo engine):**
- Create: `src/lf/pipeline/node_factory.py`
- Test: `tests/test_node_factory.py`

**Interfaces:**
- Consumes: `AgentSchema` (Task 1 — use o pydantic, não o ORM); primitivos existentes (grounding OBRIGATÓRIO do implementador): `NodeRegistry.register()`/`EdgeRegistry.register()` (graph.py:132-159), `get_effective_prompt()` (prompt_overrides.py), `resolve_model(state)` (llm_factory.py), `call_llm_via_opencode` (mesmo primitivo dos nós atuais — siga o import exato de um nó real, ex. src/lf/pipeline/nodes/), padrão de nó atual (assinatura `async def node(state: GraphState) -> dict` — confira num nó real, ex. cpo.py ou appsec.py).
- Produces:
  - `def compile_agent_node(agent: AgentSchema) -> Callable` — closure async node(state) que: resolve modelo (agent.model), monta prompt efetivo (prompt do agente + contexto do state no mesmo estilo get_effective_prompt), chama LLM via call_llm_via_opencode, retorna patch mínimo com `next_agent`/`feedback` no padrão dos nós genéricos atuais (espelhe o retorno de um nó real — ex. appsec) e respeita `max_retries`/`timeout_seconds` do agente (timeout via mecanismo que o repo já usa em LLM calls, se houver; senão doc).
  - `def register_agent_node(agent: AgentSchema) -> str` — compila + `NodeRegistry.register(f"agent:{agent.name-slug}", node)`; re-registro com mesmo key = substitui (idempotente — confira semântica do NodeRegistry). Retorna a key.
- NÃO executar LLM em teste — mockar call_llm_via_opencode/patch.

- [ ] **Step 1: Testes falham primeiro** — `tests/test_node_factory.py`: register_agent_node registra key `agent:<slug>` (NodeRegistry.get/contains — confira API real); re-registro idempotente (mesma key sobrescreve sem erro); node compilado chama LLM mockado com prompt do agente + model resolvido; max_retries/timeout refletidos (se expostos no node, senão assert no comportamento de retry via state mock); slug sanitizado (espaços/upper → kebab). Rodar → FAIL.
- [ ] **Step 2: Implementar** — node_factory.py (grounding real nos arquivos acima; NÃO refatore nós existentes).
- [ ] **Step 3: Rodar** — testes PASS + regressão `uv run pytest tests/test_decoupling_registries.py tests/test_pipeline_nodes_coverage.py -q`.
- [ ] **Step 4: Commit (engine)** — `feat(engine): NodeFactory data-driven registra nós de agentes (S2)`.

---

### Task 4 (FE): types + API client agents

**Files (repo loopforge-ade):**
- Modify: `frontend/src/shared/lib/types.ts` (Agent + AgentInput, espelhando AgentResponse/AgentCreate)
- Modify: `frontend/src/shared/lib/api.ts` (client)
- Test: `frontend/src/shared/lib/__tests__/api.test.ts` (+ casos)

**Interfaces:**
- Consumes: `apiFetch<T>` (api.ts:104 — lança ApiError {status, detail}).
- Produces:
  - `interface Agent { id: string; name: string; description: string; prompt: string; model: string; temperature: number; max_retries: number; timeout_seconds: number; env_vars: Record<string, string>; tools_allowlist: string[]; permissions: string[]; stack: string; budget_usd: number; created_at: string; updated_at: string }`
  - `interface AgentInput` = Agent sem `id/created_at/updated_at`
  - `listAgents(): Promise<Agent[]>` (GET `/agents`); `getAgent(id)`: GET `/agents/{id}`; `createAgent(input: AgentInput): Promise<Agent>` POST; `updateAgent(id, input: Partial<AgentInput>): Promise<Agent>` PUT; `deleteAgent(id): Promise<void>` DELETE

- [ ] **Step 1: Testes falham primeiro** — api.test.ts: listAgents GET `/api/v1/agents`; createAgent POST body JSON + content-type; updateAgent PUT parcial; deleteAgent DELETE; 422 propagado como ApiError{status:422}. Rodar: `cd frontend && npx vitest run src/shared/lib/__tests__/api.test.ts` → FAIL (client não existe).
- [ ] **Step 2: Implementar** — types + api.ts (padrão dos clients existentes, apiFetch).
- [ ] **Step 3: Rodar** — api.test PASS + `npx vitest run src/shared/lib` (outros testes de lib intactos).
- [ ] **Step 4: Commit (loopforge-ade)** — `git add frontend/...` → `feat(ade): API client e tipos de agentes (S2)`.

---

### Task 5 (FE): agentsStore

**Files (repo loopforge-ade):**
- Create: `frontend/src/stores/agentsStore.ts`
- Create: `frontend/src/stores/__tests__/agentsStore.test.ts`

**Interfaces:**
- Consumes: Task 4 client (listAgents/createAgent/updateAgent/deleteAgent).
- Produces (Zustand, padrão dos stores do repo — confira runsStore/canvasStore):
  - `{ agents: Agent[]; loading: boolean; error: string | null; fetchAgents(): Promise<void>; createAgent(input: AgentInput): Promise<Agent>; updateAgent(id, input): Promise<Agent>; deleteAgent(id): Promise<void> }`
  - create/update/delete atualizam `agents` localmente após sucesso (sem refetch); erro → `error` com mensagem amigável (EN; 422 → "The server rejected the agent (HTTP 422)" + detail pydantic no console.error — padrão SettingsPanel); delete sem agentes → no-op.

- [ ] **Step 1: Testes falham primeiro** — store test: fetchAgents popula; createAgent append + limpa error; updateAgent substitui; deleteAgent remove; erro 422 seta error string friendly e NÃO muta lista; loading flips. Mock do módulo api (vi.mock). Rodar → FAIL.
- [ ] **Step 2: Implementar** — agentsStore.
- [ ] **Step 3: Rodar** — store test PASS + `npx vitest run src/stores` (regressão).
- [ ] **Step 4: Commit (loopforge-ade)** — `feat(ade): agentsStore (S2)`.

---

### Task 6 (FE): AgentsPanel + sidebar inline (designer)

**Files (repo loopforge-ade):**
- Create: `frontend/src/features/agents/AgentsPanel.tsx`
- Create: `frontend/src/features/agents/__tests__/AgentsPanel.test.tsx`
- Modify: `frontend/src/shared/ui/SidebarHost.tsx` (agents: INLINE_VIEWS — remove placeholder "coming in a later phase" + desc; light view direto)
- Modify: `frontend/src/shared/lib/views.ts` (se necessário p/ INLINE_VIEWS)

**Interfaces:**
- Consumes: Task 5 store; SidebarHost INLINE_VIEWS (light) — padrão NewRunForm narrow (236px, form compacto); SettingsPanel 422 pattern.
- Produces: `<AgentsPanel />` narrow (sidebar):
  - Lista da biblioteca: nome + monograma (padrão), stack chip, model, budget chip; clique seleciona p/ editar; botão "+ New agent" (vazio → EmptyState compacto "No agents yet" + CTA)
  - Form CRUD (narrow, scroll): name*, description, prompt* (textarea autosize), model, temperature (number), max_retries, timeout_seconds, stack, budget_usd, env_vars (textarea key=value por linha), tools_allowlist (comma-separated), permissions (comma-separated); Save/Cancel; validação local (name/prompt required); 422 → alert friendly inline EN; delete com confirm inline (estado, não window.confirm); estado editing/saving/error
  - Acessível: labels, aria-live no erro, botões nativos; zero emoji; tokens
- SidebarHost: `agents` sai de SUMMARY_VIEWS/placeholder → INLINE_VIEWS (componente leve com fetchAgents no mount — ou o painel faz; padrão do repo); canExpand não se aplica mais a agents. Confira SidebarHost.test existente (testes de placeholder agents/pipelines:335-344) → atualizar: agents agora renderiza painel real; pipelines segue placeholder.

- [ ] **Step 1: Testes falham primeiro** — AgentsPanel.test.tsx (mock agentsStore): lista renderiza agentes (nome/stack/model); vazio → EmptyState + CTA; "+ New agent" abre form; submit cria (createAgent chamado, form reseta); editar preenche form + update; 422 mostra mensagem amigável inline; delete confirma + remove. SidebarHost.test: agents abre AgentsPanel (sem placeholder); pipelines ainda placeholder.
- [ ] **Step 2: Implementar** — AgentsPanel + SidebarHost/views.
- [ ] **Step 3: Rodar** — testes novos PASS + `npx vitest run` (full — baseline 401, deve subir) + tsc + build.
- [ ] **Step 4: Commit (loopforge-ade)** — `feat(ade): painel de agentes na sub-sidebar (S2)`.

---

### Task 7 (FE): extrair runStatus.ts (carry-over)

**Files (repo loopforge-ade):**
- Create: `frontend/src/shared/lib/runStatus.ts`
- Modify: `frontend/src/features/runs/RunTabs.tsx`, `frontend/src/features/dag/RunInspector.tsx`, `frontend/src/shared/ui/SidebarHost.tsx` (RunsSummary) — consumir a fonte única
- Test: ajustar asserts se necessário

**Interfaces:**
- Consumes: RunStatus (types.ts); 3 cópias atuais de STATUS_TONE/statusLabel (RunTabs.tsx:8-21, RunInspector, SidebarHost.RunsSummary — podem ter divergido).
- Produces: `runStatus.ts` com `RUN_STATUS_TONE: Record<RunStatus, string>` (classes tailwind tone) + `runStatusLabel(status): string` — fonte única; 3 consumidores usam; zero duplicação.

- [ ] **Step 1: Verificar divergência** — compare as 3 cópias (diff real); a fonte única usa a versão mais recente/correta; documente divergências.
- [ ] **Step 2: Implementar** — runStatus.ts + 3 consumidores (import trocado, sem mudar visual).
- [ ] **Step 3: Rodar** — testes dos 3 arquivos + `npx vitest run` full + tsc.
- [ ] **Step 4: Commit (loopforge-ade)** — `refactor(ade): fonte única runStatus (S2)`.

---

### Task 8: Verificação integrada + revisão visual

**Files:** — (commits só se houver defeito)

- [ ] **Step 1: FE full** — `cd frontend && npx vitest run` (baseline 401 + novos T4-T7, zero fail) + `npx tsc -b --noEmit` + `npm run build`.
- [ ] **Step 2: BE** — `uv run pytest tests/test_agents_schema.py tests/test_agents_api.py tests/test_node_factory.py tests/test_api.py -q` (engine) — output real.
- [ ] **Step 3: Revisão visual (designer)** — app rodando + playwright: sidebar Agents (lista + form narrow + erro 422 simulado via devtools/mock), screenshot; coerência com shell S1; ajustes visuais SÓ de defeitos reais (commit `fix(ade): …` se necessário).
- [ ] **Step 4: Smoke** — playwright smoke existente (2 specs) passa; fluxo agents CRUD com backend real se disponível (senão mock documentado).
- [ ] **Step 5: Commit final (se houver ajustes)** — loopforge-ade.

---

## Self-review notes

- **Spec coverage:** §S2 completo — AgentSchema (T1), CRUD REST (T2), NodeFactory (T3), client+types (T4), store (T5), view Agents na sub-sidebar (T6), carry-over runStatus (T7), integração (T8). Decisão 7-C campos avançados todos presentes; deny-by-default; 422 friendly.
- **Não quebra:** fluxos de run/drawer/shell intactos; NodeFactory registra mas NÃO altera o grafo padrão (runs atuais seguem entry_router; uso real só no S3); tabela nova via create_all (init_db importa models — AgentTemplate precisa entrar no import de models.py; sem migração aditiva necessária).
- **Riscos:** 2 repos (commits separados por task — dispatch instrui cwd exato); pytest engine lento → alvos + test_api.py como regressão; nó genérico NÃO deve imitar nós especiais (developer/qa/parallel_audit) — só LLM+tools padrão (spec §7).
- **Fora de escopo:** uso do agente em runs/pipelines (S3), permissões RBAC runtime, prompts templates library (YAGNI).
