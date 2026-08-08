# STATUS-IMPLEMENTACAO.md — Rastreabilidade de sessões (LoopForge ADE)

> Fonte de verdade de retomada. **Sempre** que uma sessão de implementação avançar,
> atualize: o que foi feito (commits), o que falta, próximo passo. Leia antes de qualquer trabalho.

## Como retomar (sessão nova, dias depois)

1. **Repos e branches:**
   - Engine: `agentes/LoopForge` → branch **`feature/ade-fase-a`** (Fases A+B backend FEITAS — A: gate cobertura 83.11%; B4/B5: spa.py mount /app + pacote único sync-dist + CI drift).
- Docs/status: `web/loopforge-ade` → branch **`main`** (docs 00–09, 01b, adr/, este arquivo; SPA mergeada em `21c2dda` e `834dea1`).
- SPA: worktree `~/.local/share/opencode/worktree/loopforge-ade/feature/ade-fase2` → branch **`feature/ade-fase2`** (igual ao main via merges 21c2dda + 834dea1; commitado até `3d51f8a`).
2. Confira `git status` nos três; leia a seção **Próximo passo**.
3. Verificação:
   - Engine: `cd agentes/LoopForge && OPENCODE_MOCK=1 .venv/bin/python -m pytest -q` (Fase C: **296 passed, 1 skipped, 1 xfailed**; cobertura **83.11%** ≥75%). **SEMPRE com `OPENCODE_MOCK=1`** (sem isso, `test_opencode_runner_mock_or_execution` spawna subprocesso real de `opencode` e estoura timeout de 5min).
   - SPA: `cd ~/.local/share/opencode/worktree/loopforge-ade/feature/ade-fase2 && npm run build && npm run test` (**23 arquivos / 110 testes**; smoke E2E: `npx playwright test tests/smoke.spec.ts`, chromium já instalado).
4. Convenções: commits citam M-id (ex.: `fix(api): resume usa thread_id persistido [M-01]`); docs/comentários em PT, identificadores em EN; sem monorepo (AGENTS.md da raiz).
5. **Flakiness conhecida dos lanes**: algumas sessões fixer retornam resultado vazio sem aplicar nada (padrão recorrente). Sempre VERIFICAR o estado real no disco (`git log -3`, `git status`, greps) antes de dar uma tarefa como feita ou re-despachar. Sessão fix-3 (ses_020b81ca...) falhou 2x em silêncio — não reutilizar.

## Fases (plano `06-plano-de-implementacao.md`)

| Fase | Escopo | Estimativa | Estado |
|---|---|---|---|
| A | Backend hardening (A1–A9) | 8–11 d | **COMPLETA** (gate cobertura 83.11%) |
| B | SPA reconcile + packaging (B1–B6) | 5–7 d | **COMPLETA** (design system, B1–B6, merge `21c2dda`) |
| C | Time-travel + HITL real (C1–C5) | 8–10 d | **COMPLETA** (engine `340c9a1`, SPA `3d51f8a`, merge `834dea1`) |
| D | Custos UI + MCP hub (D1–D4) | 4–5 d | **EM EXECUÇÃO** |

## Fase A — lanes (todas FEITO — ver histórico)

Onda 1: n1 (A1+A9), n2a (A3-standalone), n5 (A7). Onda 2: n3 (A5+A8), n4 (A6), n2b (A3-integração+A4). Onda 3: n6 (A2). Detalhes nos commits e no histórico abaixo. Checklist de aceites 10/10.

## Fase B — progresso (todas FEITO)

| Item | Escopo | Status |
|---|---|---|
| Design system | tokens.css + componentes (des-1: Input/Textarea/Toggle/Modal/ConfirmDialog/Topbar, 18 alterados, motion, scrollbar, z-index) | **FEITO** |
| B1 (M-19) | SPA envelope v1 (normalizeWsEvent retrofit, ids canônicos, entry virtual, retry condicional, estados queued/paused) | **FEITO** |
| B2 (M-20) | NewRunForm stack+routing_mode; telas 401 (api.ts /api/v1 + X-API-Key + fila retry; ApiKeyGate) | **FEITO** (`403e5ae`) |
| B3 (M-08, M-10) | CostBar consome GET /runs/{id}/cost; modal de override | **FEITO** (`403e5ae`) |
| B4 (M-16) | spa.py resolve_spa_dist + mount /app; token WS no dashboard; banner deprecated | **FEITO** (auto-checkpoint) |
| B5 (M-15) | pacote único sync-dist (`scripts/sync_dist.py`); `lf.ade.static`; CI drift + smoke instalação (`spa-drift.yml`); .gitignore `!src/lf/ade/static/dist/` | **FEITO** (`ca97075`, `0aaba9a`) |
| B6 (E13) | QA build/lint/test + Playwright smoke (`tests/smoke.spec.ts`: topbar, DAG demo, console limpo) | **FEITO** (`047a283`) |
| Merge | feature/ade-fase2 → main da ADE | **FEITO** (`21c2dda`) |

## Fase C — lanes (todas FEITO)

| Lane | Tasks / M-ids | Escopo (plano 06) | Status |
|---|---|---|---|
| c1 | C1+C2 (M-13, M-14) | fork REAL de thread (copiar tuples do checkpoint + pin `langgraph-checkpoint-sqlite==3.1.0`); export enriquecido + import materializa thread | **FEITO** — trajectories.py reescrito (548 linhas): fork byte-a-byte INSERT…SELECT, export 1.1 (checkpoints+steps+events+costs), import valida/materializa; testes fork/export/roundtrip/422/404 |
| c2 | C3 (M-12) | adjust_state de verdade (aplicar ajustes no checkpoint via aupdate_state no gate; hoje só adjust_prompt) | **FEITO** — `state_patch` em HumanDecisionCreate (validator 422 PT), action `adjust_state` no choice_map, `_apply_state_patch_to_checkpoint` (update_state sync / aupdate_state via asyncio.run), persistência atômica do patch (fix de race com polling 0.5s) |
| c3 | C4 (M-11) | hitl.on_timeout: choice `continue` → `abort` com escape explícito (ADR-0006; depende do fix M-22 do HITL remoto p/ funcionar ponta a ponta) | **FEITO** — `AdeHITL.on_timeout: Literal["continue","abort","pause"]` (default continue); abort = pipeline_failed motivo `hitl_timeout_abort` sem LLM; pause = re-aguarda decisão tardia sem consumir LLM; evento `hitl_gate_reached` (dedup) |
| c4 | C5 (M-02) | timeline por run_id (journal de eventos + checkpoints consultáveis por run na UI/API) | **FEITO** — commit `8e1ed04` (timeline unificada eventos+checkpoints, rotas v1 + legado) |
| c5 | UI SPA (C1/C3/C4/C5) | Fork from here, form adjust_state com diff + JSON, banner hitl_gate_reached, timeline por run_id | **FEITO** — commit `3d51f8a`: ForkDialog/ExportDialog/TrajectoriesPanel (import), HitlDrawer GUIDED_FIELDS + submitAdjustState + JSON avançado PT, HitlGateBanner (ws.ts:190 normalização + hitlGateStore), TimelineDialog paginado; build ✓, 23/110 testes ✓, lint ✓, smoke ✓ |

## Aceites da Fase C (checklist)

- [x] fork REAL de thread por run_id (INSERT…SELECT byte-a-byte) · [x] export enriquecido + import materializa (roundtrip) · [x] adjust_state aplica patch no checkpoint (validator 422 PT) · [x] on_timeout continue/abort/pause + evento `hitl_gate_reached` · [x] timeline por run_id (rotas v1 + legado) · [x] UI SPA: fork/export/import, adjust_state com diff + JSON, banner HITL, timeline — suíte SPA 23/110 · [x] engine 296 passed, 1 skipped, 1 xfailed

## Aceites da Fase A (checklist — 10/10)

- [x] pytest verde com cobertura ≥75% — **gate PASS: 83.11%** (270 passed, 1 skipped; 2026-08-08)
- [x] `test_event_envelope.py` (n2a) · [x] resume E2E via API (n1) · [x] run `lf run --mock` na lista da API (n6) · [x] 401 em rota v1 (n3) · [x] budget pausa + override resume (n4+n2b) · [x] budget_warning 80% (n4) · [x] E2E HITL sem stdin (n1) · [x] fila 2º POST queued (n3) · [x] migração/backfill DB real (n1)

## Próximo passo (atualizar a cada marco)

1. ~~Fases A e B~~ **FECHADAS** (A: gate 83.11%; B: merge `21c2dda`).
2. ~~Fase C~~ **FECHADA**: backend (C1 fork, C2 export/import, C3 adjust_state, C4 on_timeout, C5 timeline — engine `340c9a1`, 296/1/1) + SPA (`3d51f8a`, 23/110 testes, smoke ✓) + merge `834dea1`.
3. **Fase D em execução** — D1 (M-08): chips de custo por agente/etapa na UI; D2: POST `/mcp/servers/{name}/tools/{tool}` allowlist de tools; D3: Settings UI PATCH `/config` (E9); D4: endurecimento E2E. Lanes em paralelo: D1+D3 na worktree SPA (des-1), D2 na engine (fix-1).
4. Atualizar este arquivo + commit no `main` da ADE a cada marco.
5. Fase E (se houver no plano 06) após D fechada.

## Histórico de commits

- ADE main: `7807bcc` (docs 19 arquivos), `b21e068` (status Fase A+B2/B3), **`21c2dda`** (merge feature/ade-fase2 — SPA completa B1–B6), `17750c4` (status Fase C backend), **`834dea1`** (merge feature/ade-fase2 — SPA Fase C completa).
- SPA worktree `feature/ade-fase2`: `0e8605a` (design system + envelope v1 [M-19]), `403e5ae` (B2/B3 [M-20][M-08][M-10]), `047a283` (smoke E2E [E13]), `3d51f8a` (Fase C: fork/export/import, adjust_state, banner HITL, timeline [M-13][M-14][M-12][M-11][M-02]).
- Engine `feature/ade-fase-a` (auto-checkpoint "checkpoint: loopforge/..."): `f927eb9` (n5/A7), `14e2974` (n1), n2a (events.py), `cac8fb1` (n3), `264fa70` (n4), `a27a618` (ruído), `d833082`/`7d93a59` (n6), B4 (spa.py+test_spa_mount), `ca97075` (B5), `0aaba9a` (.gitignore fix), c1 (C1+C2 fork/export/import — auto-checkpoints), `dc825d7` (C3+C4 + flaky fix test_events_backfill), `8e1ed04` (C5 timeline [M-02]), HEAD `340c9a1`.
