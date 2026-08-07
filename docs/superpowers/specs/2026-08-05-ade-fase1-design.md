# Design Doc — ADE Fase 1: Backend LoopForge Extension

- **Data**: 2026-08-05
- **Status**: aprovado (v1.0) — revisão do usuário em 2026-08-05: WAL explícito na abertura, cache só com payload final do stream, HITL timeout gracioso
- **Base**: `web/loopforge-ade/BLUEPRINT.md` v5 (decisões D1-D7, UX1-UX20, E1-E15)
- **Escopo**: itens 1a, 1b, 1d, 1c da Fase 1 + config central `.loopforge/ade.yaml` (E9)
- **Repositório**: código backend entra em `agentes/LoopForge/src/lf/` (E1 — release conjunto, um repo, uma versão)

---

## 1. Objetivo

Criar a fundação de backend que a UI da ADE consumirá nas Fases 2-4, corrigindo as 5 premissas falsas auditadas do v1:

| Gap do v1 | Entregável desta fase |
|---|---|
| `AsyncSqliteSaver` + `.loopforge/trajectories.db` + rotas `trajectories` inexistentes | **1a** — checkpointer assíncrono + Trajectories API (checkpoints, export/import) |
| Zero código MCP no repo | **1b** — cliente MCP via SDK oficial + bridge LangGraph |
| Provider LLM nativo (streaming) inexistente (só OpenCode subprocess) | **1d** — provider nativo HTTP streaming + fallback nativo→OpenCode→Mock |
| Cliente Ollama / auto-descoberta `/api/tags` inexistentes; `lf serve --no-ui` inexistente | **1c** — provider Ollama + auto-descoberta + flag `--no-ui` |
| Sem config central da ADE | **E9** — `.loopforge/ade.yaml` (orçamento, MCP servers, providers, timeout HITL) |

Critério de sucesso: `lf run --mock` persiste trajetórias em `trajectories.db` recuperáveis/exportáveis via API; `lf serve --no-ui` serve API sem dashboard; cliente MCP lista/chama ferramentas de um servidor declarado no `ade.yaml`; provider nativo faz streaming token a token com fallback correto. **217+ testes existentes seguem passando; cobertura ≥75% (CI).**

## 2. Contexto — estado atual do LoopForge (fatos verificados)

- **Grafo**: `src/lf/pipeline/graph.py:83-171` — `build_graph(checkpointer, interrupt_after)`, 9 nós (`cpo, pm, tech_lead, test_writer, developer, qa, appsec, devops, parallel_audit`), `entry_router` + `should_retry`.
- **Checkpointer atual**: `SqliteSaver` **síncrono** (`langgraph.checkpoint.sqlite`) em `task_dispatcher.py:594` e `:661`, arquivo `.loopforge/checkpoints.sqlite`. `dispatch()` compila o grafo com ele; `resume()` via `graph.get_state(config)` + `graph.stream(None, config)`; `list_checkpoints()` lê `thread_id`s.
- **API**: `src/lf/api/app.py` `create_app()` — REST `/api/runs*`, `/decide`, `/decisions`, `/genome`, `/registry`, `/retro`; WS `/ws/streaming` e `/ws/runs/{id}` (app.py:93-125) com auth WS_1008 e broadcast (`pipeline_started`, `node_execution`, `pipeline_finished`, `run_created`, `human_decision_submitted`). Persistência SQLAlchemy async + aiosqlite em `.loopforge/telemetry.sqlite`.
- **Providers**: `LLMProviderRegistry` (llm_factory.py:338-355) — `OpenCodeCLIProvider` (default), `OpenRouterProvider`, `MockLLMProvider`. Fallback em `runner/opencode/llm.py:93-115` (`call_llm_via_opencode`): `OPENROUTER_API_KEY` → HTTP OpenRouter; falha → subprocess `opencode`. `CostTracker` (llm_factory.py:139-229) grava em `llm_costs`.
- **Cache**: `SQLiteLLMCache` (cache.py:31-72) — SHA256 de prompt normalizado; `compress_prompt()` (llm_factory.py:127-136).
- **Config**: `src/lf/config/loader.py` (JSON/YAML) + `schema.py` (Pydantic) — reutilizar para o `ade.yaml` (E9).
- **Testes**: 217 passed, 1 skipped, cobertura 77% (CI `--cov-fail-under=75`).

## 3. Decisões de design desta fase

| # | Decisão | Justificativa |
|---|---|---|
| F1-1 | **1a — `AsyncSqliteSaver`** (`langgraph.checkpoint.sqlite.aio`) gravando em `.loopforge/trajectories.db`; **migração**, não duplicação: `dispatch()`/`resume()` passam a usar o async saver quando chamados do contexto async da API; o caminho CLI síncrono usa `asyncio.run()` para o mesmo saver | Uma fonte de verdade; preserva compatibilidade com o `SqliteSaver` em migração (tabela `checkpoints` compatível) |
| F1-2 | **Rotas**: `GET /api/v1/trajectories/{thread_id}/checkpoints` (metadados: step, timestamp, resumo do estado) · `GET /api/v1/trajectories/{thread_id}/checkpoints/{checkpoint_id}` (estado completo) · `GET /api/v1/trajectories/{thread_id}/export` (JSON completo) · `POST /api/v1/trajectories/import` (cria thread) · `POST /api/v1/trajectories/{thread_id}/fork` (deriva nova run — base do time-travel D4/UX7) | Contrato estável para Fase 3; `fork` prepara UX7 sem depender da UI |
| F1-3 | **Export/import com schema versionado**: envelope `{schema_version: "1.0", thread_id, created_at, steps: [{node, ts, state_in, state_out, tokens, cost_usd, decision?}], events}` | Importável/replayável; campos `tokens/cost` já semeiam a telemetria E10 |
| F1-4 | **Sem prune no V1 (E11)** | dev solo + localhost; TTL configurável fica no V2 |
| F1-5 | **1b — SDK oficial `mcp` (Python)** para transporte (stdio por padrão; HTTP/SSE fica para V2) | D5: não reimplementar spec em evolução |
| F1-6 | **Bridge**: `loopforge/mcp/client.py` — conecta servidores declarados no `ade.yaml`, lista tools (`tools/list`), converte JSON Schema → Pydantic Tool Definitions, expõe call com **permissões deny-by-default** (allowlist por server no `ade.yaml`; tool não permitida → erro `MCPPermissionDenied`) | Segurança local (E5); base do MCP manager (Fase 4) |
| F1-7 | **1d — `NativeLLMProvider`**: HTTP streaming token a token ao provider (OpenRouter/Zen), registrado como primário na `LLMProviderRegistry`; cadeia **nativo → OpenCode CLI → Mock** | D3; habilita token streaming (Fase 2) e granularidade de estado (Fase 3) |
| F1-8 | **Streaming**: interface `stream(messages, model, ...) -> AsyncIterator[str]` no provider; o consumer (Fase 2) decide o consumo visual (UX4 — sóbrio por evento) | Separa transporte de apresentação |
| F1-9 | **1c — `OllamaProvider`**: HTTP `GET {base}/api/tags` (auto-descoberta) + `POST /api/chat` (stream); base URL configurável no `ade.yaml` | Fecha o gap "Ollama é só string de config" |
| F1-10 | **`lf serve --no-ui`**: flag para servir API sem dashboard/SPA | SPA chega na Fase 2; o flag já estabiliza a interface CLI |
| F1-11 | **Config central `ade.yaml` (E9)**: schema Pydantic em `config/schema.py`; carregado pelo loader existente; seções `budget`, `mcp.servers[]`, `providers` (primary/fallback/ollama.base_url), `hitl.timeout_seconds`; **override via API** `GET/PATCH /api/v1/config` | Transversal a 1b/1d/1c, Fase 3 (timeout) e Fase 4 (orçamento) |
| F1-12 | **`run` é a unidade (E2)**: trajectories indexadas por `thread_id`, mas o endpoint `/fork` expõe derivação de run; mapeamento run↔thread fica documentado no contrato | UI (Fase 2+) usa `/api/runs` como unidade primária |
| F1-13 | **HITL timeout gracioso (E9)**: nó pausado que expira `hitl.timeout_seconds` → run transita para estado `decision_expired` (evento WS `human_decision_expired`); decisão tardia via `/decide` continua aceita (com aviso no log); usuário pode abortar ou resumir; notificação OS/webhook se configurada (UX10) | UX10 (Fase 3) consome o estado; nada expira silenciosamente — rastreável via E10 |

## 4. Componentes (responsabilidade · interface · dependências)

### 4.1 `src/lf/pipeline/checkpointer.py` (1a)
- **O que faz**: factory `create_async_checkpointer(path) -> AsyncSqliteSaver` (aiosqlite) e compat `create_sync_checkpointer(path)` para o caminho de migração. **Na abertura de `.loopforge/trajectories.db`, a factory executa explicitamente `PRAGMA journal_mode=WAL`** (antes do `setup()`), garantindo leitura/escrita concorrentes sem lock durante chamadas da API.
- **Como se usa**: `build_graph(checkpointer=...)`; chamado por `task_dispatcher.dispatch()/resume()`.
- **Depende de**: `langgraph.checkpoint.sqlite.aio`, `aiosqlite`; grava `.loopforge/trajectories.db`.

### 4.2 `src/lf/api/trajectories.py` (1a)
- **O que faz**: router FastAPI com as rotas F1-2; serialização do envelope F1-3; validação no import (schema_version + tipos).
- **Como se usa**: `app.include_router(trajectories_router, prefix="/api/v1/trajectories")` em `create_app()`.
- **Depende de**: checkpointer (4.1), `task_dispatcher.list_checkpoints()`, `models.py` (Pydantic schemas).

### 4.3 `src/lf/mcp/` (1b) — pacote novo
- `client.py`: `MCPClient` (stdio, `mcp` SDK) — `connect()/disconnect()`, `list_tools()`, `call_tool(name, args)`; lifecycle por servidor.
- `bridge.py`: `tools_to_langgraph(tools) -> list[BaseTool]` (JSON Schema → Pydantic `create_model`), registradas para o orquestrador.
- `permissions.py`: allowlist por server/tool lida do `ade.yaml`; lança `MCPPermissionDenied`.
- `registry.py`: `MCPRegistry` — dono dos clientes ativos (start/stop por server), listado via `GET /api/v1/mcp/servers` e `GET /api/v1/mcp/servers/{name}/tools`.
- **Depende de**: `mcp` (SDK oficial), `config/loader.py` (E9), `httpx`/`anyio`.

### 4.4 `src/lf/pipeline/llm_factory.py` (1d)
- **O que faz**: adiciona `NativeLLMProvider` ao `LLMProviderRegistry`; `stream()` com SSE parse (`data: {delta...}`), reuso do caminho OpenRouter (`call_openrouter_api`) estendido p/ streaming; integra `CostTracker` (tokens/custo por stream) e `SQLiteLLMCache` — **o cache armazena apenas o payload final consolidado do stream; deltas intermediários nunca são persistidos** (stream consulta o cache antes de iniciar e grava somente após o término, sem corrupção por gravação parcial).
- **Como se usa**: provider primário na cadeia; `registry.resolve(primary="native")`.
- **Depende de**: `httpx`, `circuit_breaker.py`, `CostTracker`, `SQLiteLLMCache`.

### 4.5 `src/lf/pipeline/providers/ollama.py` (1c)
- **O que faz**: `OllamaProvider` com `discover_models()` (`GET /api/tags`) e `chat()`/`stream()` (`POST /api/chat`); base URL de `ade.yaml`/env `OLLAMA_HOST`.
- **Como se usa**: registrado no registry; `lf init --llm-provider ollama` passa a funcionar de verdade.
- **Depende de**: `httpx`; auto-descoberta exposta em `GET /api/v1/providers/ollama/models`.

### 4.6 `src/lf/cli/commands/serve.py` (1c)
- **O que faz**: adiciona `--no-ui` (não serve dashboard HTML/SPA, só API).
- **Depende de**: `create_app()`; a SPA será servida por padrão na Fase 2.

### 4.7 `src/lf/config/schema.py` + `api/config.py` (E9)
- **O que faz**: schema Pydantic do `ade.yaml`; router `GET/PATCH /api/v1/config` (leitura/escrita do arquivo, override via API).
- **Depende de**: `config/loader.py` (JSON/YAML existente).

## 5. Fluxo de dados (resumo)

1. **Run**: `POST /api/runs` (ou `lf run`) → `dispatch()` com async saver → cada step grava checkpoint em `trajectories.db` → WS broadcast (`node_execution`) → (Fase 2) UI backfill E4.
2. **Time-travel (Fase 3)**: `GET .../checkpoints` → UI navega; `POST .../fork` cria thread derivada; `POST /api/runs/{id}/resume` retoma.
3. **MCP**: orquestrador → `MCPRegistry` → `permissions.py` (allowlist) → `MCPClient.call_tool()` → stdio server → resultado volta como tool result.
4. **LLM**: `NativeLLMProvider.stream()` → SSE → tokens → `CostTracker` grava `llm_costs` → falha → OpenCode CLI → Mock.

## 6. Tratamento de erros

- **Checkpointer**: falha de escrita → retry com backoff curto; WAL ativo (PRAGMA explícito na abertura — ver 4.1); erro de lock → erro claro na API (503) com hint de processo concorrente.
- **HITL timeout (F1-13)**: nó pausado com `hitl.timeout_seconds` expirado → run vai para estado `decision_expired` com evento WS `human_decision_expired`; decisão tardia via `/decide` ainda aceita (aviso no log); abort/resume disponíveis; notificação OS/webhook se configurada (UX10). Estado explícito e auditável (E10) — nenhuma pausa expira silenciosamente.
- **Import**: schema_version desconhecido → 422 com lista de erros; ids de thread conflitantes → 409 com mensagem clara; **sem merge no V1** (merge fica para uma versão futura, se houver demanda).
- **MCP**: servidor não responde no `connect()` → server marcado `unavailable`, tool call → 503 com nome do server; tool não permitida → 403 `MCPPermissionDenied`; parse inválido de schema → tool descartada com warning no log (não derruba o servidor).
- **LLM streaming**: timeout/erro mid-stream → encerra generator com erro → fallback para o próximo provider da cadeia; circuito aberto (circuit_breaker) → pula direto para o fallback.
- **Config**: `ade.yaml` inválido → startup falha com mensagem apontando a linha (schema Pydantic); `PATCH /config` valida antes de escrever (atomic write).

## 7. Testes e verificação

| Item | Teste |
|---|---|
| 1a | round-trip: `dispatch()` com mock → `list_checkpoints()` → `resume()`; export → import → export idêntico; fork cria thread derivada; corrida leve com WAL (PRAGMA explícito na abertura, sem lock concorrente) |
| 1b | servidor MCP fictício (stdio, in-process) → list_tools converte schema correto; call com permissão → ok; sem permissão → 403; server morto → 503 |
| 1d | SSE mockado (httpx MockTransport) → `stream()` emite tokens na ordem; custo gravado; **cache só recebe o payload final consolidado (deltas intermediários nunca persistidos)**; falha → fallback OpenCode → Mock; circuito aberto → fallback direto |
| 1c | Ollama mockado → `discover_models()` parseia `/api/tags`; `chat()` streama; `--no-ui` não monta rota de dashboard |
| E9 | `ade.yaml` inválido → erro claro no startup; `PATCH /api/v1/config` persiste e reload reflete; **HITL: nó pausado com timeout expirado → `decision_expired` + evento WS; decisão tardia aceita; abort/resume funcionam** |

Verificação final: `pytest tests/ --cov=src/lf --cov-fail-under=75` (217 existentes + novos testes desta fase), `lf run --mock` + curl nas rotas novas, `lf serve --no-ui` + `GET /health`. **Não há UI nesta fase** — nada de Playwright aqui (E13 vale para a Fase 2).

## 8. Fora de escopo (desta fase)

Fase 2 (SPA React, DAG panel, WS backfill E4, CORS E5, console filtrável E6), Fase 3 (time-travel UI, drawer HITL, fork UI), Fase 4 (dashboard custos/hard-stop, telemetria E10 completa, MCP hub/playground), evals V2 (Tier 2 item 23), paralelismo real (Tier 2 item 24), prune TTL (E11 V2), transporte MCP HTTP/SSE (V2), toggle air-gapped na UI (V2). Gemini permanece fora da matriz de fallback (apenas string de config).

## 9. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| **1b é o maior risco** (zero código MCP, spec em evolução) | SDK oficial cuida do transporte (D5); allowlist deny-by-default evita superfície de segurança; servidor fictício nos testes isola dependência externa |
| Migração sync→async pode vazar chamadas síncronas no event loop | `asyncio.run()` explícito no caminho CLI; teste que garante que `dispatch()` async não bloqueia o loop |
| Streaming SSE: formatos variados de providers | Parser tolerante (trata `data: [DONE]`, campos `delta`/`choices`); testes com fixtures de OpenRouter e Zen |
| `trajectories.db` compartilhado com `checkpoints.sqlite` legado | Migração: copiar tabela `checkpoints` existente uma vez; documento de migração no PR |

---

*Próximo passo após aprovação deste spec: skill `writing-plans` para o plano de implementação da Fase 1.*
