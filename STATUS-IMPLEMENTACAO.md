# STATUS-IMPLEMENTACAO.md — Rastreabilidade de sessões (LoopForge ADE)

> Fonte de verdade de retomada. **Sempre** que uma sessão de implementação avançar,
> atualize: o que foi feito (commits), o que falta, próximo passo. Leia antes de qualquer trabalho.

## Como retomar (sessão nova, dias depois)

1. **Repos e branches:**
   - Engine: `agentes/LoopForge` → branch **`feature/ade-fase-a`** (Fase A COMPLETA; commits via auto-checkpoint 'checkpoint: loopforge/...').
   - Docs/status: `web/loopforge-ade` → branch **`main`** (docs 00–09, 01b, adr/, este arquivo).
   - SPA: worktree `~/.local/share/opencode/worktree/loopforge-ade/feature/ade-fase2` → branch **`feature/ade-fase2`** (SPA T1–T11 + design system + envelope v1 B1 — commitado).
2. Confira `git status` nos três; leia a seção **Próximo passo**.
3. Verificação:
   - Engine: `cd agentes/LoopForge && .venv/bin/python -m pytest -q` (baseline: **270 passed, 1 skipped** pós-n6).
   - SPA: `cd ~/.local/share/opencode/worktree/loopforge-ade/feature/ade-fase2 && npm run build && npm run test` (**18 arquivos / 66 testes** pós-B1).
4. Convenções: commits citam M-id (ex.: `fix(api): resume usa thread_id persistido [M-01]`); docs/comentários em PT, identificadores em EN; sem monorepo (AGENTS.md da raiz).
5. **Flakiness conhecida dos lanes**: algumas sessões fixer retornam resultado vazio sem aplicar nada (padrão recorrente). Sempre VERIFICAR o estado real no disco (`git log -3`, `git status`, greps) antes de dar uma tarefa como feita ou re-despachar. Sessão fix-3 (ses_020b81ca...) falhou 2x em silêncio — não reutilizar.

## Fases (plano `06-plano-de-implementacao.md`)

| Fase | Escopo | Estimativa | Estado |
|---|---|---|---|
| A | Backend hardening (A1–A9) | 8–11 d | **COMPLETA** (todas as lanes FEITO; suíte 270 passed) |
| B | SPA reconcile + packaging (B1–B6) | 5–7 d | PARCIAL (design system + B1 envelope v1 FEITO; B2–B6 pendentes) |
| C | Time-travel + HITL real (C1–C5) | 8–10 d | pendente |
| D | Custos UI + MCP hub (D1–D4) | 4–5 d | pendente |

## Fase A — lanes

Onda 1 (2026-08-07):
| Lane | Tasks / M-ids | Escopo | Status |
|---|---|---|---|
| n1 | A1+A9 (M-01, M-02, M-22) | thread_id/parent_run_id em PipelineRun; migração aditiva (PRAGMA + ALTER + backfill `'run-'||id||'-task-'||substr(id,1,8)`); thread canônica `run-{uuid}`; polling por uuid; `_check_remote_decision` removido; resume usa thread_id persistido; testes resume E2E/HITL remoto/migração | **FEITO** |
| n2a | A3-standalone (M-05) | `api/events.py` (EventBus + tabela events + envelope v1 `{seq,event,run_id,timestamp,payload}` + list_events); `websocket_manager.py` (WS por run + global); test_event_envelope | **FEITO** |
| n5 | A7 (M-17) | 6 `.ts` mortos removidos (backup /tmp/opencode/loopforge-ts-removed/); AGENTS.md (32→63 files, Lessons não é nó, checkpoints.sqlite legado, resume→trajectories.db); nota mypy | **FEITO** |

Onda 2 (2026-08-07):
| Lane | Tasks / M-ids | Escopo | Status |
|---|---|---|---|
| n3 | A5+A8 (M-03, M-04, M-18, M-21) | auth Depends nos 4 routers v1; CORS `LF_CORS_ORIGINS`; rotas canônicas `/api/v1/runs*` + aliases legados Sunset/Deprecation; fila E3 (queued→running, worker promove, run_updated via EventBus); test_auth_v1_routers + test_run_queue | **FEITO** |
| n4 | A6 (M-08, M-09, M-10) | budget fonte única ade.yaml→CircuitBreaker; llm_costs +run_id/node/estimated (+migração aditiva em llm_factory); custo estimado subprocess; `api/costs.py` (GET /runs/{id}/cost + POST override, auth); hard-stop vira PAUSA via `interrupt()` do LangGraph (developer.py); canal circuit_breaker no state.py; test_budget_pause_override (5 testes) | **FEITO** |
| n2b | A3-integração + A4 (M-05, M-06) | `_broadcast_ws` → event_bus.publish; WS /ws/runs/{run_id} filtrado; broadcasts inline → EventBus; rota `GET /runs/{id}/events` + alias legado; costs_router registrado no app.py; status `paused` (detecção via checkpoint `snapshot.next != []`); test_ws_run_filter + test_events_backfill + teste paused | **FEITO** (sessão nova após fix-3 falhar 2x em silêncio) |

Onda 3 (2026-08-08):
| Lane | Tasks / M-ids | Escopo | Status |
|---|---|---|---|
| n6 | A2 (M-07) | dispatcher writer canônico de `pipeline_runs`: `_pipeline_run_id` (:377) + `_upsert_pipeline_run` (:389, CREATE TABLE IF NOT EXISTS + ON CONFLICT upsert, sqlite3 direto em telemetry.sqlite); call sites em dispatch/resume (running→completed/failed); runs API usam o uuid existente (ON CONFLICT atualiza a mesma linha), runs CLI geram uuid novo com thread_id salvo; fix NOT NULL duration_seconds (:461); cli/run.py sem mudança; test_cli_run_writes_pipeline_runs (4 testes, incl. GET /api/runs vê a run CLI) | **FEITO** (suíte 270 passed; commits d833082 + 7d93a59) |

## Fase B — progresso

| Item | Escopo | Status |
|---|---|---|
| Design system | tokens.css + componentes (des-1: Input/Textarea/Toggle/Modal/ConfirmDialog/Topbar, 18 alterados, motion, scrollbar, z-index) | **FEITO** (commitado na SPA) |
| B1 (M-19) | SPA envelope v1: `normalizeWsEvent` retrofit (aceita v1 e legado → normaliza p/ v1), ids canônicos (dev→developer, appsec/devops removidos de node_execution, entry virtual, retry condicional attemptCount>0, lessons nunca nó), estados queued/paused (RunTabs badge info/warn, Badge tone info), wsBridge lê tudo de payload; demoMock emite v1; testes +10 (18 arquivos/66 testes); build/lint ok | **FEITO** |
| B2 (M-20) | NewRunForm stack+routing_mode; telas de 401 | pendente |
| B3 (M-08, M-10) | CostBar consome GET /runs/{id}/cost; modal de override | pendente |
| B4 (M-16) | spa.py resolve_spa_dist + mount /app; token WS no dashboard; banner deprecated | pendente |
| B5 (M-15) | pacote único sync-dist; lf.ade.static; remover pyproject da ADE; CI drift + smoke instalação | pendente |
| B6 (E13) | QA build/lint/test + Playwright | pendente |
| Merge | feature/ade-fase2 → main da ADE + mount no engine (pré-B4) | pendente |

## Aceites da Fase A (checklist)

- [ ] pytest verde com cobertura ≥75% (suíte 270 passed; rodar com `--cov=src/lf --cov-fail-under=75` antes de fechar a fase)
- [x] `test_event_envelope.py`: todo evento WS casa com envelope v1 + persiste no journal (n2a)
- [x] resume E2E via API funciona (mock_llm) (n1 — test_resume_api_e2e)
- [x] run `lf run --mock` aparece na lista da API com eventos journados (n6 — test_cli_run_writes_pipeline_runs, teste (c) via ASGITransport)
- [x] 401 em rota v1 sem key (n3 — test_auth_v1_routers)
- [x] estouro de budget pausa a run e override a resume (n4 — test_budget_pause_override; status `paused` via API confirmado no n2b — test_run_paused_status)
- [x] `budget_warning` (80%) emitido com payload correto (n4)
- [x] E2E HITL sem stdin: `POST /decide` consumido pelo dispatcher no gate e run prossegue (n1 — test_hitl_remote_e2e)
- [x] fila: 2º `POST /runs` fica `queued` até o 1º terminar e entra `running` sem intervenção (n3 — test_run_queue)
- [x] migração/backfill sobre DB real (fixture 6.0.0, `PRAGMA table_info`, `'run-'||id`) (n1 — test_migration_backfill; backfill usa `'run-'||id||'-task-'||substr(id,1,8)` para manter runs legadas resumíveis)

## Próximo passo (atualizar a cada marco)

1. **Fechar a Fase A**: rodar suíte com cobertura (`.venv/bin/python -m pytest --cov=src/lf --cov-fail-under=75 tests/ -q`) e, se verde, considerar commits descritivos por M-id no `feature/ade-fase-a` (opcional — auto-checkpoint já commitou tudo).
2. **Fase B**: merge SPA `feature/ade-fase2` → `main` da ADE (o worktree da SPA está commitado); depois B2 (NewRunForm stack+routing_mode, telas 401), B3 (CostBar + modal override), B4 (spa.py mount /app + token WS dashboard), B5 (pacote único + CI drift), B6 (QA + Playwright). Ordem sugerida: merge → B4/B5 (backend mount) → B2/B3 (SPA) → B6.
3. Atualizar este arquivo + commit no `main` da ADE a cada marco.
4. Fase C (C1–C5) e D (D1–D4) após B fechada.

## Histórico de commits

- ADE main `7807bcc` — docs completas commitadas (19 arquivos, 2048 linhas)
- Engine `feature/ade-fase-a` — criado a partir de `main` (5349246), baseline 241 passed
- Engine (auto-checkpoint, mensagens "checkpoint: loopforge/..."): `f927eb9` (n5/A7), `14e2974` (n1/A1+A9), n2a (events.py + ws_manager), `cac8fb1` (n3/A5+A8), `264fa70` (n4/A6), `a27a618` (ruído), `d833082` (n6/A2: helper + fix NOT NULL + testes), `7d93a59` (n6 refinamento). HEAD: `7d93a59`.
- SPA worktree `feature/ade-fase2` — design system + B1 commitados (ver `git log` da worktree).
