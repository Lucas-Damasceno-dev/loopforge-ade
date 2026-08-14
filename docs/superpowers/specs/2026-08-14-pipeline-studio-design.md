# Design — Pipeline Studio + Layout Híbrido (LoopForge ADE)

Data: 2026-08-14 · Status: proposto (aguardando review do usuário) · Escopo: frontend + backend

## 1. Contexto

- **Frontend** (`frontend/`): React 19 + Tailwind v4 + React Flow. Pipeline hoje é **fixo** — `dagModel.ts` hardcoda `PIPELINE_ORDER` (entry → cpo → pm → tech_lead → test_writer → developer → qa → parallel_audit), nó virtual `retry`, `parallel_audit` = 1 nó que executa 2 agentes (appsec + devops).
- **Engine** (`agentes/LoopForge/src/lf/`): LangGraph `StateGraph`, 9 nós reais (cpo, pm, tech_lead, test_writer, developer, qa, appsec, devops, parallel_audit). `NodeRegistry.register()` e `EdgeRegistry.register()` (graph.py:132-159) já permitem registro dinâmico. Nós = funções Python com prompt via `get_effective_prompt()` (`prompt_overrides.py`). `PlanSchema` (config/schema.py:75-92) já modela tasks + `graph: dict[str, list[str]]` (dependências). `AdeConfig` tem budget (`AdeBudget`), `mcp_servers` com `tools_allowlist` (deny-by-default), `runner` (timeout, max_concurrent_runs).
- **Blueprint** já lista direção alinhada: Grafos Dinâmicos (Fase 2), Hooks & Custom Nodes (item 8), Execução paralela real + doom-loop detection (item 24), Telemetria E10.

## 2. Objetivo

1. Layout híbrido do workspace (mockup 5-hybrid → implementação real, com auditoria de identidade visual).
2. CRUD de agentes (biblioteca de templates reutilizáveis, campos avançados).
3. Editor visual de pipelines (linear ou grafo com ciclo de retry), no mesmo canvas, modo edição.
4. Split paralelo visível no DAG (2 nós empilhados em vez de 1 nó com 2 agentes).

## 3. Decisões (consolidadas com o usuário)

| # | Decisão | Escolha |
|---|---------|---------|
| 1 | Persistência | Backend API (LoopForge) |
| 2 | Modelo de agente | Biblioteca de templates, pipeline referencia por ID |
| 3 | Semântica de ciclo | Retry/feedback loop com teto (doom-loop guard) |
| 4 | Run ↔ pipeline | Pipeline central; run = executar pipeline escolhido |
| 5 | Superfície do editor | Mesmo canvas, toggle Edit/Live |
| 6 | Tipos de nó | Completo: agent, split/parallel, merge, input, output, gate condicional, merge N-de-M, aresta retry |
| 7 | Campos do agente | Avançado (C): temperature, max_retries, timeout, env_vars, permissões deny-by-default, budget |
| 8 | Escopo | Frontend + backend juntos |
| 9 | Versão de pipeline | Snapshot imutável por run (grafo congelado no start; sem UI de versionamento) |
| 10 | New Run | Fallback automático: campo Pipeline opcional no form; sem seleção, engine monta automaticamente como hoje |

## 4. Subsistemas

### S1 — Layout híbrido (frontend only)

Mockup de referência: `/tmp/opencode/layout-proposals/5-hybrid.html`. Elementos:
- Topbar 44px: marca + trigger central `⌘K` + Connected.
- Rail 48px icon-only (Runs, Prompt, Agents, Pipelines, MCP, Memory, Health, Settings) com tooltip; clique expande sub-sidebar 260px (uma por vez, colapsável) — reusa padrão Drawer não-modal.
- Sub-sidebar **Prompt** = NewRunForm completo (textareas, presets, stack chips, routing select, Run) — fluxo atual preservado.
- Sub-sidebar **Agents** e **Pipelines** = views novas (S2/S3).
- RunTabs no topo da área principal (monograma stack, dot status, underline accent, "+ New Run").
- Inspector direito 300px colapsável: run details + budget/cost. **Sem** console.
- Panel bottom ~190px com tabs ícone-only (console/terminal/problems/output) + tooltip; ativo = accent. Não usar labels de texto (evitar cara de VS Code).
- Budget pill flutuante bottom-left do canvas ($0.42/$1.00 + mini-meter).
- Palette ⌘K: comandos (Run demo, Toggle sidebar, navegação ⌘1-3, Toggle console, Focus canvas, Override budget, New pipeline).

**Fase 0 — Auditoria de identidade visual:** mockup é referência conceitual, não pixel-perfect. Antes/ durante a implementação, o designer reconcilia os componentes novos com o design system real (tokens.css, Drawer, SectionTitle, EmptyState, monogramas) e revisa os já alterados p/ coerência (espaçamento, tipografia, estados). Critério de aceite: coerência visual da interface inteira, não do mockup.

### S2 — CRUD de agentes (backend + frontend)

**Backend (LoopForge):**
- `AgentSchema` (pydantic, estende o padrão `TaskSchema`):
  `id, name, description, prompt, model, temperature, max_retries, timeout_seconds, env_vars: dict[str,str], tools_allowlist: list[str] (MCP deny-by-default), permissions: deny-by-default, stack, budget_usd: float, created_at, updated_at`
- `NodeFactory` data-driven: compila um nó LangGraph a partir do `AgentSchema` (usa `call_llm_via_opencode`, `resolve_model`, `get_effective_prompt` — mesmos primitivos dos nós atuais) e registra via `NodeRegistry.register()`.
- Endpoints: `GET/POST/PUT/DELETE /api/v1/agents`.

**Frontend:**
- View Agents na sub-sidebar: lista (biblioteca) + form CRUD com campos avançados; validação espelhando o schema (422 pydantic → mensagem amigável, padrão SettingsPanel).
- Store Zustand `agentsStore` + API client estendido.

### S3 — Editor de pipelines (backend + frontend)

**Backend:**
- `PipelineSchema`: `id, name, description, nodes: [{id, type: agent|split|merge|input|output|gate, agent_id?, config?}], edges: [{source, target, type: sequential|parallel|conditional|retry, condition?, max_retries?}], created_at, updated_at`.
- `build_pipeline_graph(pipeline)`: compila `StateGraph` a partir do schema (nodes via NodeFactory, edges via EdgeRegistry.register; split → fan-out paralelo; gate → router condicional; retry → aresta de volta com teto).
- `POST /api/v1/pipelines/{id}/validate`: valida ciclos (retry com teto, doom-loop guard), referências de agente, nós órfãos, merge N-de-M.
- Endpoints: `GET/POST/PUT/DELETE /api/v1/pipelines`.
- `POST /api/v1/runs` estendido: `{ pipeline_id?, input, budget_override, agent_overrides? }`; sem `pipeline_id` → comportamento atual (entry_router). Run grava **snapshot imutável** do pipeline no start.

**Frontend:**
- View Pipelines: lista (CRUD) + editor no mesmo canvas com toggle **Edit/Live**. Modo edição no `dagModel`: paleta de nós, drag/connect/disconnect, config de edge (tipo, condição, retry), validação via API.
- Run snapshot: Inspector mostra o grafo congelado da run.

### S4 — Split paralelo no DAG (frontend; engine já executa paralelo)

- `dagModel.ts`: `parallel_audit` (1 nó) → **nó split** (badge "2× parallel") + **2 filhos empilhados** (appsec, devops) + **merge**. Aresta de retry com curva custom (bezier, arrowhead fora do nó — aprendizado do mockup).
- Status por filho (running/retry ×1) refletido do estado da run; Inspector por filho.
- `PIPELINE_ORDER`/`buildNodes`/`buildEdges` evoluem p/ suportar sub-grafos (só na representação; contrato com engine inalterado até S3).

## 5. Ordem de entrega

| Fase | Escopo | Lanes |
|------|--------|-------|
| 0 | Auditoria de identidade visual | designer |
| 1 | Layout híbrido (rail/sub-sidebar/topbar/inspector/panel bottom/pills) | designer + fixers |
| 2 | Split paralelo visual (dagModel/FlowCanvas/AgentNode) | fixer(s) |
| 3 | CRUD agentes (BE schema+API+NodeFactory → FE view+form) | fixer BE + fixer FE |
| 4 | Editor pipelines (BE compile+validate+runs → FE modo edição) | fixer BE + fixer FE |
| 5 | Palette ⌘K + polish | designer + fixer |

Cada fase: testes (vitest + e2e) e build verdes antes de avançar. Não quebrar fluxos atuais (322 testes como baseline).

## 6. Fora de escopo (YAGNI)

Versionamento semântico de pipelines (UI v1/v2/diff), central de prompts com diff/rollback, hooks custom TS, comparador A/B split-screen, evals por task-completion, BYOA. Revisitar em fases futuras.

## 7. Riscos

- Nós atuais = funções Python com lógica própria (scanner, slices, HITL); `NodeFactory` genérico cobre o caso padrão (LLM + tools), nós especiais (developer/qa/parallel_audit) continuam hardcoded na 1ª versão do S3.
- Doom-loop: ciclo retry exige teto + guard no `validate` e no runtime (budget CircuitBreaker já existe).
- Schema/API novos no engine exigem compatibilidade com runs existentes (snapshot resolve).
- `dagModel` é puro e coberto por testes (dagModel.test.ts) — mudanças de geometria precisam de testes novos.
