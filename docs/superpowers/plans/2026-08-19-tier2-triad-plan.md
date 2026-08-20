# Tríade Tier 2 (Worktree por Run, Token Streaming e Doom-Loop Guard) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar isolamento total de sandbox via Git Worktrees por run, transmissão universal de streaming de tokens LLM para a UI e detecção inteligente de Doom-Loop com escalonamento para HITL no LoopForge Engine e ADE SPA.

**Architecture:** 
- **Worktree**: `GitSandbox` gerencia worktrees isoladas em `.slim/worktrees/<run_id>`; `POST /api/v1/runs` cria a worktree e injeta no `initial_state`; endpoints de artefatos/AST/coverage/terminal roteiam para o path da worktree.
- **Streaming**: `TokenDeltaPublisher` é estendido para todos os nós (`cpo`→`devops` + `NodeFactory`); eventos `token_delta` são emitidos via EventBus/WS; frontend renderiza stream ao vivo no `ConsolePanel` e nós do `FlowCanvas`.
- **Doom-Loop**: `GraphState` armazena `retry_fingerprints` (SHA256 de AST + diff + output de teste); se 2 iterações consecutivas forem idênticas, `should_retry` pausa a run com gate HITL `doom_loop`, oferecendo opções de ajuste de prompt, override ou abort.

**Tech Stack:** Python 3.12, FastAPI, LangGraph, Git CLI, React 19, TypeScript, Tailwind CSS v4, Zustand, React Flow v12.

## DOIS REPOSITÓRIOS

| Repo | Path | Commits |
|---|---|---|
| loopforge-ade (frontend + docs) | `/home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade` | `feat(ade): …` / `feat(ui): …` |
| LoopForge (engine) | `/home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge` | `feat(engine): …` / `feat(api): …` |

## Global Constraints

- **BE Tests**: `OPENCODE_MOCK=1 uv run --extra dev pytest <alvos> -q`
- **FE Tests**: `npm --prefix frontend run test` e `npm --prefix frontend run build`
- Zero novas dependências de runtime.
- Mensagens de commit seguem o padrão convencional (`feat(...)`, `fix(...)`, `test(...)`).

---

### Task 1 (BE): Git Worktree Sandbox Lifecycle em Runs da API

**Files:**
- Modify: `agentes/LoopForge/src/lf/api/app.py`
- Modify: `agentes/LoopForge/src/lf/runner/git/sandbox.py`
- Modify: `agentes/LoopForge/src/lf/pipeline/state.py`
- Create: `agentes/LoopForge/tests/test_run_worktree_sandbox.py`

**Interfaces:**
- Produces: `sandbox_state = {"worktree_path": str, "branch": str, "task_id": str}` em `initial_state` de runs da API quando sandbox habilitado.
- `create_worktree(task_id: str)` garante criação de `.slim/worktrees/<task_id>` e fallback resiliente se git indisponível.

- [ ] **Step 1: Escrever teste falhando para criação de worktree em run da API**
  Criar `tests/test_run_worktree_sandbox.py` testando criação de run com sandbox worktree inicializada.
- [ ] **Step 2: Rodar teste para verificar falha**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge && OPENCODE_MOCK=1 uv run --extra dev pytest tests/test_run_worktree_sandbox.py -q`
- [ ] **Step 3: Implementar criação de worktree no endpoint e executor de runs**
  Modificar `src/lf/api/app.py` e `src/lf/runner/git/sandbox.py` para conectar `create_worktree` no dispatch de runs.
- [ ] **Step 4: Rodar teste para verificar aprovação**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge && OPENCODE_MOCK=1 uv run --extra dev pytest tests/test_run_worktree_sandbox.py -q`
- [ ] **Step 5: Commit (LoopForge)**
  `git add src/lf/ tests/test_run_worktree_sandbox.py && git commit -m "feat(engine): isolamento de run em git worktree sandbox"`

---

### Task 2 (BE): Roteamento de APIs de Inspeção para Worktree

**Files:**
- Modify: `agentes/LoopForge/src/lf/api/artifacts.py`
- Modify: `agentes/LoopForge/src/lf/api/ast_analyzer.py`
- Modify: `agentes/LoopForge/src/lf/api/coverage.py`
- Modify: `agentes/LoopForge/src/lf/api/terminal.py`
- Create: `agentes/LoopForge/tests/test_api_worktree_routing.py`

**Interfaces:**
- Produces: Resolução de caminho `_resolve_run_dir(run_id)` priorizando `.slim/worktrees/<run_id>` antes do diretório raiz/fallback.

- [ ] **Step 1: Escrever teste falhando para resolução de worktree em artifacts/ast/coverage/terminal**
  Criar `tests/test_api_worktree_routing.py`.
- [ ] **Step 2: Rodar teste para verificar falha**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge && OPENCODE_MOCK=1 uv run --extra dev pytest tests/test_api_worktree_routing.py -q`
- [ ] **Step 3: Atualizar resolução de diretórios nas rotas de inspeção**
  Ajustar `artifacts.py`, `ast_analyzer.py`, `coverage.py` e `terminal.py` para buscar primeiro em `.slim/worktrees/<run_id>`.
- [ ] **Step 4: Rodar teste para verificar aprovação**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge && OPENCODE_MOCK=1 uv run --extra dev pytest tests/test_api_worktree_routing.py -q`
- [ ] **Step 5: Commit (LoopForge)**
  `git add src/lf/api/ tests/test_api_worktree_routing.py && git commit -m "feat(api): roteamento de inspeção e terminal para git worktrees"`

---

### Task 3 (BE): Token Streaming em Todos os Nós do Grafo

**Files:**
- Modify: `agentes/LoopForge/src/lf/pipeline/nodes/cpo.py`
- Modify: `agentes/LoopForge/src/lf/pipeline/nodes/pm.py`
- Modify: `agentes/LoopForge/src/lf/pipeline/nodes/tech_lead.py`
- Modify: `agentes/LoopForge/src/lf/pipeline/nodes/test_writer.py`
- Modify: `agentes/LoopForge/src/lf/pipeline/nodes/qa.py`
- Modify: `agentes/LoopForge/src/lf/pipeline/nodes/appsec.py`
- Modify: `agentes/LoopForge/src/lf/pipeline/nodes/devops.py`
- Modify: `agentes/LoopForge/src/lf/pipeline/node_factory.py`
- Create: `agentes/LoopForge/tests/test_nodes_token_streaming.py`

**Interfaces:**
- Produces: `TokenDeltaPublisher` instanciado com `(run_id, node_name)` e repassado como `on_token_delta` em todas as chamadas LLM dos nós.

- [ ] **Step 1: Escrever teste falhando para emissão de deltas nos nós do grafo**
  Criar `tests/test_nodes_token_streaming.py`.
- [ ] **Step 2: Rodar teste para verificar falha**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge && OPENCODE_MOCK=1 uv run --extra dev pytest tests/test_nodes_token_streaming.py -q`
- [ ] **Step 3: Plugar TokenDeltaPublisher em todos os nós executores e no NodeFactory**
  Ajustar os nós para extrair `run_id` do config / thread e repassar `TokenDeltaPublisher`.
- [ ] **Step 4: Rodar teste para verificar aprovação**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge && OPENCODE_MOCK=1 uv run --extra dev pytest tests/test_nodes_token_streaming.py -q`
- [ ] **Step 5: Commit (LoopForge)**
  `git add src/lf/pipeline/ tests/test_nodes_token_streaming.py && git commit -m "feat(engine): token streaming em todos os nós do pipeline e node factory"`

---

### Task 4 (FE): Visualização de Token Streaming ao Vivo no Console & DAG

**Files:**
- Modify: `web/loopforge-ade/frontend/src/features/console/ConsolePanel.tsx`
- Modify: `web/loopforge-ade/frontend/src/features/dag/AgentNode.tsx`
- Modify: `web/loopforge-ade/frontend/src/features/console/__tests__/ConsolePanel.test.tsx`
- Modify: `web/loopforge-ade/frontend/src/features/dag/__tests__/AgentNode.test.tsx`

**Interfaces:**
- Produces: Stream buffer ativo renderizado no `ConsolePanel` com cursor ativo; `AgentNode` exibindo badge de streaming e indicador de atividade em tempo real.

- [ ] **Step 1: Escrever testes falhando para exibição do stream no Console e indicador no nó**
  Adicionar specs nos arquivos de teste do frontend.
- [ ] **Step 2: Rodar testes para verificar falha**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade/frontend && npx vitest run src/features/console/__tests__/ src/features/dag/__tests__/`
- [ ] **Step 3: Implementar renderização de stream com cursor no ConsolePanel e badge no AgentNode**
  Ajustar `ConsolePanel.tsx` e `AgentNode.tsx`.
- [ ] **Step 4: Rodar testes e build do frontend**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade/frontend && npx vitest run && npm run build`
- [ ] **Step 5: Commit (loopforge-ade)**
  `git add frontend/ && git commit -m "feat(ui): renderização de streaming de tokens ao vivo no console e nós do DAG"`

---

### Task 5 (BE): Doom-Loop Guard & Detecção de Estagnação no Retentador

**Files:**
- Modify: `agentes/LoopForge/src/lf/pipeline/state.py`
- Modify: `agentes/LoopForge/src/lf/pipeline/graph.py`
- Modify: `agentes/LoopForge/src/lf/pipeline/pipeline_graph.py`
- Modify: `agentes/LoopForge/src/lf/pipeline/nodes/qa.py`
- Create: `agentes/LoopForge/tests/test_doom_loop_guard.py`

**Interfaces:**
- Produces: `GraphState["retry_fingerprints"] = list[str]`; `should_retry` avalia hashes e transiciona para `doom_loop` quando 2 tentativas consecutivas forem idênticas.

- [ ] **Step 1: Escrever teste falhando para detecção de doom loop em repetição de falhas**
  Criar `tests/test_doom_loop_guard.py`.
- [ ] **Step 2: Rodar teste para verificar falha**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge && OPENCODE_MOCK=1 uv run --extra dev pytest tests/test_doom_loop_guard.py -q`
- [ ] **Step 3: Implementar fingerprinting de retries e guarda de doom-loop no should_retry**
  Ajustar `state.py`, `qa.py`, `graph.py` e `pipeline_graph.py`.
- [ ] **Step 4: Rodar teste para verificar aprovação**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge && OPENCODE_MOCK=1 uv run --extra dev pytest tests/test_doom_loop_guard.py -q`
- [ ] **Step 5: Commit (LoopForge)**
  `git add src/lf/ tests/test_doom_loop_guard.py && git commit -m "feat(engine): doom-loop guard com detecção de estagnação e pausa HITL"`

---

### Task 6 (FE): HITL Banner e Intervenção de Doom-Loop no Frontend

**Files:**
- Modify: `web/loopforge-ade/frontend/src/features/hitl/HitlGateBanner.tsx`
- Modify: `web/loopforge-ade/frontend/src/features/hitl/HitlDrawer.tsx`
- Modify: `web/loopforge-ade/frontend/src/features/hitl/__tests__/HitlGateBanner.test.tsx`
- Modify: `web/loopforge-ade/frontend/src/features/hitl/__tests__/HitlDrawer.test.tsx`

**Interfaces:**
- Produces: Tratamento específico do gate `doom_loop` com sugestões de intervenção (Ajustar Prompt / Override / Abort).

- [ ] **Step 1: Escrever testes falhando para banner e drawer com gate doom_loop**
  Atualizar specs em `HitlGateBanner.test.tsx` e `HitlDrawer.test.tsx`.
- [ ] **Step 2: Rodar testes para verificar falha**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade/frontend && npx vitest run src/features/hitl/__tests__/`
- [ ] **Step 3: Implementar UI e ações para o gate doom_loop**
  Ajustar `HitlGateBanner.tsx` e `HitlDrawer.tsx`.
- [ ] **Step 4: Rodar testes e sincronizar build final para o engine**
  `cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade/frontend && npx vitest run && npm run build && cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge && python3 scripts/sync_dist.py /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade/frontend/dist`
- [ ] **Step 5: Commit (ambos os repos)**
  `loopforge-ade`: `git add frontend/ && git commit -m "feat(ui): suporte a intervenção de doom-loop no HITL banner e drawer"`
  `LoopForge`: `git add src/lf/ade/static/dist && git commit -m "feat(ade): sincroniza bundle com visualização de streaming e doom-loop"`

---

## Critérios de Conclusão do Plano
1. Todos os testes unitários do engine (`LoopForge`) e frontend (`loopforge-ade`) passando.
2. Builds limpos sem quebra de regressão.
3. Bundle da SPA sincronizado em `agentes/LoopForge/src/lf/ade/static/dist/`.
