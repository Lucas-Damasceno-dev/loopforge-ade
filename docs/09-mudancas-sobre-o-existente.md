# 09 — Mudanças propostas sobre o que já existe

Registro único de tudo que este planejamento propõe **alterar, corrigir ou
reverter** no código e nas decisões já implementadas/aprovadas. Cada item tem
justificativa, impacto e referência ao plano (`06-plano-de-implementacao.md`,
fases A–D) e aos ADRs (`adr/`).

Legenda de impacto: **B** = backend (`agentes/LoopForge`), **S** = SPA
(`web/loopforge-ade`, branch `feature/ade-fase2`), **D** = docs, **C** = contrato
(API/WS/DB).

## Correções de bugs vivos

| ID | Mudança | Justificativa | Impacto | Fase |
|---|---|---|---|---|
| M-01 | **`POST /api/runs/{id}/resume` usa `pipeline_runs.thread_id`** em vez de reconstruir a string (`project_id="project"`) | Bug vivo: dispatch cria thread `run-{id}-task-{id[:8]}` e resume procura `project-run-{id}` → resume via API nunca funciona (`app.py:226` vs `app.py:513`) | B, C (comportamental) | A |
| M-02 | **Colunas `thread_id` + `parent_run_id` em `pipeline_runs`**; thread simplificado para `run-{run_id}`; backfill `run-' || id` | Elimina a classe de bugs de mapeamento por convenção de string; torna fork/time-travel endereçáveis pela UI | B, C (schema aditivo) | A |
| M-03 | **`verify_authentication` em todos os routers `/api/v1/*`** | Gap de segurança: config write e trajectory export abertos; `lf serve` sempre gera key → rota aberta é incoerente | B, C (clientes passam a precisar de key) | A |
| M-04 | **CORS restrito** (`LF_CORS_ORIGINS`, default Vite) e fim de `allow_origins=["*"]` com `allow_credentials=True` | Combinação atual é insegura e inválida para browsers; E5 já mandava restringir | B, C | A |
| M-22 | **Fix HITL remoto via API (bug vivo)**: dispatcher passa a consultar `human_decisions` pelo **uuid da run** (extraído do `thread_id` no formato `run-{uuid}`, ADR-0003); remoção do código morto `_check_remote_decision` (`task_dispatcher.py:272`) | Bug vivo confirmado: `POST /decide` grava `run_id = uuid` (`app.py:357`) mas o polling usa `run_id = thread_id` (`task_dispatcher.py:336`) — **nunca casa; decisão via API nunca é consumida no gate**. O polling ativo é ~0,5 s (`:465` + `:176`), não 2 s. Nenhum teste cobre o loop completo | B, C (comportamental) | A (task A9, aceite E2E obrigatório) |

## Contratos e fundação de eventos

| ID | Mudança | Justificativa | Impacto | Fase |
|---|---|---|---|---|
| M-05 | **`EventBus` único + tabela `events` (journal) + envelope v1** (`schema_version/event/run_id/thread_id/seq/ts/payload`) | Eventos hoje são fire-and-forget com dois formatos; sem journal não há E4 (backfill), E14 (reconexão) nem E6 (console) de verdade | B, C (**quebra de envelope WS**), D | A |
| M-06 | **`/ws/runs/{id}` filtrado por run** + backfill REST `GET /api/v1/runs/{id}/events?after_seq=` | Hoje os dois paths WS são o mesmo broadcast global; a UI não tem como montar o passado de uma run | B, C | A |
| M-07 | **Dispatcher = escritor canônico do estado da run** (upsert em `pipeline_runs` no dispatch e a cada nó, inclusive runs CLI) | Runs `lf run` não aparecem na UI hoje (UX17 impossível); estado da run escrito por dois donos (API e background task) | B, C | A |
| M-21 | **Fila de execução (E3) real**: 1 run ativa + fila `queued`; `POST /runs` não dispara `asyncio.create_task` quando há run `running`; worker promove a próxima ao término | E3 é Tier-1 prometido (00/03/08) e **não existe**: hoje todo POST dispara task concorrente (`app.py:165-175`) — paralelismo não intencional, exatamente o que E3 queria evitar; SPA já modela `queue` no `runsStore` | B, C (status novo `queued`) | A (task A8) |
| M-18 | **Rotas canônicas `/api/v1/runs*`**; legado `/api/runs*` com header `Sunset`/`Deprecation` até a próxima major | Prefixo inconsistente (`/api/*` vs `/api/v1/*`); versionamento prepara evolução | B, C | A |

## Custos (diretriz 1 do BLUEPRINT)

| ID | Mudança | Justificativa | Impacto | Fase |
|---|---|---|---|---|
| M-08 | **Budget com fonte única**: `ade.yaml budget.max_usd` alimenta o `CircuitBreaker` (remove literal `10.0` do dispatcher); `llm_costs` +`run_id,node,estimated`; novo `GET /api/v1/runs/{id}/cost` | Quatro pontos de config desconectados (CB default 50 / literal 10 no dispatcher / `budget_limit_usd` só CLI / `AdeBudget` nunca lido) e ledger sem dimensão de run/nó tornam UX12/UX13 impossíveis; enforcement hoje só existe no nó developer | B, C (schema aditivo + endpoint) | A |
| M-09 | **Custo estimado no path OpenCode subprocess** (tiktoken/chars, `estimated=1`; buffer 10% no limite) | O path sem chave OpenRouter não registra custo — o hard-stop fica cego exatamente quando mais importa | B, C | A |
| M-10 | **Hard-stop = pausa (`budget_exceeded`) + `POST /api/v1/runs/{id}/budget-override`**; evento `budget_warning` aos 80% | Abort destrutivo desperdiça checkpoints; UX13 descreve pausa + override | B, C | A (backend) / D (UI real) |

## HITL e time-travel (features centrais do MVP)

| ID | Mudança | Justificativa | Impacto | Fase |
|---|---|---|---|---|
| M-11 | **`hitl.on_timeout: pause\|continue`** (default `pause`) | F1-13 (`continue`) é fail-open num feature de governança; `AGENTS.md` diz `abort` (drift); UX10 diz "permanece pausada". Config resolve; default fail-safe | B, C, D | C |
| M-12 | **Ação `adjust_state`** no `/decide`: `state_patch` (JSON merge) aplicado via `aupdate_state` antes de continuar | BLUEPRINT Layer 3/UX9; SPA já tem o drawer; backend hoje só tem `adjust_prompt` (commit `644782a` alinhou a UI ao gap) | B, C | C |
| M-13 | **Fork real**: copia checkpoint tuples para a nova thread e cria run filha (`parent_run_id`) | Stub atual retorna id sem copiar nada — time-travel "executar daqui" é o coração do produto | B, C | C |
| M-14 | **Export enriquecido**: `steps/events` reais a partir dos checkpoints + journal + custos | Envelope hoje é vazio (gap §3.3-b da spec Fase 2); export é o backup/sharing do E11 | B, C | C |

## Distribuição e empacotamento

| ID | Mudança | Justificativa | Impacto | Fase |
|---|---|---|---|---|
| M-15 | **Pacote pip único** (ADR-0001): SPA vendored em `lf/src/lf/ade/static/`; **`pyproject.toml` do branch `feature/ade-fase2` removido**; script `sync-dist` | E1 dizia "um pacote, uma versão" mas criava dois pacotes com dependência `file://` não publicável | B, S (packaging), D | B |
| M-16 | **Dashboard HTML legado**: fix mínimo do WS sem token + banner de deprecação; remoção na próxima major | Sob `lf serve` o WS do dashboard fecha 1008 (key sempre gerada); SPA o substitui | B, D | B (fix) / major seguinte (remoção) |

## SPA (branch `feature/ade-fase2` → `main`)

| ID | Mudança | Justificativa | Impacto | Fase |
|---|---|---|---|---|
| M-19 | **Reconciliar o branch**: merge para `main` com ajustes — `normalizeWsEvent` para o envelope v1 (M-05); **ids de nó canônicos = ids do backend** (`developer`, não `dev`; token CSS `--node-dev` → `--node-developer`); nós virtuais `entry`/`retry` documentados como apresentação e `lessons` como artefato de `parallel_audit` (conjunto canônico em `03-contratos-api.md` §7); `getCheckpoints` tipado pelo contrato real; timeline por `run_id` via coluna `thread_id` (M-02) | O branch implementa T1–T11 contra contratos de 2026-08-06 que esta documentação altera; ids divergentes (`dev` vs `developer`) já exigiram camada de normalização; SPA lista `entry`/`retry` como nós e tratava `lessons` como nó — backend não tem nenhum dos três como nó de execução | S, C | B |
| M-20 | **`NewRunForm` com campo `stack`** (e `routing_mode` opcional) | `POST /api/runs` já aceita `stack`; o plano F2 removeu o campo por leitura incompleta do schema — empobrece a UX sem necessidade | S | B |

## Higiene do engine (não funcional)

| ID | Mudança | Justificativa | Impacto | Fase |
|---|---|---|---|---|
| M-17 | **Cleanup**: remover remanescentes TypeScript mortos em `src/` (`cli/*.ts`, `config/*.ts`, `harness/`, `llm/`); documentar `checkpoints.sqlite` (69 MB) como legado descartável; corrigir `AGENTS.md` (path de checkpoints, HITL timeout, contagem de testes); nota sobre mypy desabilitado (`ignore_errors=true`) com meta de reativação gradual no V2 | Drift documental e código morto induzem erro em quem lê o repo (inclusive agentes) | B, D | A |

## Reversões de decisões anteriores (consolidado)

| Decisão original | Origem | Nova decisão | Onde |
|---|---|---|---|
| Dois pacotes pip (`loopforge-ade` + `lf`) | BLUEPRINT E1 / plano F2 T15 | Pacote único `lf` com SPA vendored | ADR-0001, M-15 |
| E4 rebaixado para "gap documentado" | spec Fase 2 §3.3 | E4 implementado via journal + backfill | ADR-0002, M-05/06 |
| HITL timeout `continue` | spec Fase 1 F1-13 (aprovada) | Configurável, default `pause` | ADR-0006, M-11 |
| Fork stub | plano Fase 1 T4 | Fork real | M-13 |
| Export envelope mínimo | plano Fase 1 T4 | Export enriquecido | M-14 |
| `on_timeout` de F1-13 e `AGENTS.md` contraditórios | — | Resolvido por config + correção de doc | ADR-0006, M-17 |

## O que **permanece como está** (decisões ratificadas)

- Stack da SPA (React 19, Vite/rolldown, `@xyflow/react`, Zustand, TanStack
  Query, Tailwind v4) — já validada no branch.
- MCP deny-by-default com allowlist por server e SDK oficial stdio (D5/F1-5/6).
- Sem prune de `trajectories.db` no V1 (E11); export/import como backup.
- 1 run ativa + fila (E3); execução paralela real fica no V2.
- Token streaming fora do MVP (ADR-0007).
- UI em inglês (E8), dark-only (E15/UX18), docs em PT-BR.
