# STATUS-IMPLEMENTACAO.md — Rastreabilidade de sessões (LoopForge ADE)

> Fonte de verdade de retomada. **Sempre** que uma sessão de implementação avançar,
> atualize: o que foi feito (commits), o que falta, próximo passo. Leia antes de qualquer trabalho.

## Como retomar (sessão nova, dias depois)

1. **Repos e branches:**
   - Engine: `agentes/LoopForge` → branch **`feature/ade-fase-a`** (Fases A–D backend FEITAS — A: gate cobertura 83.11%; B4/B5: spa.py mount /app + pacote único sync-dist + CI drift; D: POST mcp tools + cost nodes + PATCH config validado).
- Docs/status: `web/loopforge-ade` → branch **`main`** (docs 00–09, 01b, adr/, este arquivo; SPA mergeada em `21c2dda`, `834dea1`, `a0ee0c2`, `2cbc612`).
- SPA: worktree `~/.local/share/opencode/worktree/loopforge-ade/feature/ade-fase2` → branch **`feature/ade-fase2`** (igual ao main via merges acima; commitado até `721624d`).
2. Confira `git status` nos três; leia a seção **Próximo passo**.
3. Verificação:
   - Engine: `cd agentes/LoopForge && OPENCODE_MOCK=1 .venv/bin/python -m pytest -q` (Fase D: **302 passed, 1 skipped, 1 xfailed**; cobertura **83.11%** ≥75%). **SEMPRE com `OPENCODE_MOCK=1`** (sem isso, `test_opencode_runner_mock_or_execution` spawna subprocesso real de `opencode` e estoura timeout de 5min).
   - SPA: `cd ~/.local/share/opencode/worktree/loopforge-ade/feature/ade-fase2 && npm run build && npm run test` (**28 arquivos / 200 testes**; E2E: `npx playwright test` — 4/4, chromium já instalado).
4. Convenções: commits citam M-id (ex.: `fix(api): resume usa thread_id persistido [M-01]`); docs/comentários em PT, identificadores em EN; sem monorepo (AGENTS.md da raiz).
5. **Flakiness conhecida dos lanes**: algumas sessões fixer retornam resultado vazio sem aplicar nada (padrão recorrente). Sempre VERIFICAR o estado real no disco (`git log -3`, `git status`, greps) antes de dar uma tarefa como feita ou re-despachar. Sessão fix-3 (ses_020b81ca...) falhou 2x em silêncio — não reutilizar.

## Fases (plano `06-plano-de-implementacao.md`)

| Fase | Escopo | Estimativa | Estado |
|---|---|---|---|
| A | Backend hardening (A1–A9) | 8–11 d | **COMPLETA** (gate cobertura 83.11%) |
| B | SPA reconcile + packaging (B1–B6) | 5–7 d | **COMPLETA** (design system, B1–B6, merge `21c2dda`) |
| C | Time-travel + HITL real (C1–C5) | 8–10 d | **COMPLETA** (engine `340c9a1`, SPA `3d51f8a`, merge `834dea1`) |
| D | Custos UI + MCP hub (D1–D4) | 4–5 d | **COMPLETA** (engine `7cbfd61`, SPA `721624d`, docs `7709e3e`, merges `a0ee0c2`+`2cbc612`) |

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

## Fase D — lanes (todas FEITO)

| Lane | Tasks | Escopo (plano 06) | Status |
|---|---|---|---|
| d1+d3 | D1+D3 (M-08, E9) | Chips de custo por nó no DAG + indicador `~` estimado; Settings UI via PATCH /config | **FEITO** (des-1, commit `0394520`) — `CostResponse.nodes` (aditivo), costForNode real, chips `~$0.12` em AgentNode (query deduplicada queryKey `['run-cost', id]`); SettingsPanel (budget/hitl/providers/toggle servers MCP, PATCH sub-objetos completos p/ não zerar defaults) |
| d2 | D2 | POST `/mcp/servers/{name}/tools/{tool}` via allowlist; playground funcional | **FEITO** (fix-1 engine `7cbfd61` + des-1 SPA) — rota POST com 404/403/503 PT; `MCPToolCallRequest{arguments}`; playground Run tool habilitado, JSON inválido → erro EN, resultado pretty-printed |
| d3-extra | PATCH /config valida mcp_servers | TypeAdapter list[AdeMcpServer] → 422 (antes lista crua descartava itens inválidos silenciosamente) | **FEITO** (fix-1, `config.py:43-47`) |
| d4 | D4 | Endurecimento E2E UC-01..12; docs de operação revisadas | **FEITO** (tes-1 `721624d` + doc-1 `7709e3e`) — 28 arquivos/197 vitest (+71), playwright 4/4 (3 specs stale corrigidos: ApiKeyGate overlay via tests/helpers.ts dismissApiKeyGate); docs 03/05/08/README revisados (comandos reais: `lf serve --port 8787`, `sync_dist.py`, OPENCODE_MOCK; CostResponse real; checklist 05: 8 itens [x], pendentes: CORS restrito teste + rate limiting fora do V1) |

**Aceites da Fase D**: engine **302 passed, 1 skipped, 1 xfailed** · SPA **28/197 vitest + 4/4 playwright + build/lint ✓** · docs de operação espelham o código real.

## Aceites da Fase A (checklist — 10/10)

- [x] pytest verde com cobertura ≥75% — **gate PASS: 83.11%** (270 passed, 1 skipped; 2026-08-08)
- [x] `test_event_envelope.py` (n2a) · [x] resume E2E via API (n1) · [x] run `lf run --mock` na lista da API (n6) · [x] 401 em rota v1 (n3) · [x] budget pausa + override resume (n4+n2b) · [x] budget_warning 80% (n4) · [x] E2E HITL sem stdin (n1) · [x] fila 2º POST queued (n3) · [x] migração/backfill DB real (n1)

## Próximo passo (atualizar a cada marco)

1. ~~Fases A e B~~ **FECHADAS** (A: gate 83.11%; B: merge `21c2dda`).
2. ~~Fase C~~ **FECHADA**: backend (C1 fork, C2 export/import, C3 adjust_state, C4 on_timeout, C5 timeline — engine `340c9a1`, 296/1/1) + SPA (`3d51f8a`, 23/110 testes, smoke ✓) + merge `834dea1`.
3. ~~Fase D~~ **FECHADA**: engine `7cbfd61` (302/1/1 — POST mcp tools, cost nodes, PATCH config validado) + SPA `0394520`/`721624d` (28/197 vitest, 4/4 playwright) + docs `7709e3e` + merges `a0ee0c2`/`2cbc612`. **MVP completo: UCs 01–12 cobertos, docs de operação espelham o código real.**
4. **Pendências resolvidas (commit `c149c66`)**: (a) demoMock — run demo-* cancelada vira `completed` ao iniciar novo demo (não fica presa em `running`); (b) shortId dedup em `trajectories/shortId` (RunTabs/Topbar importam) — slice(-4) só para ids demo-* >10 chars (`demo-1` intacto); (c) errorMsg — `detail` opcional no shape check (status sozinho já é API error); (d) HitlDrawer — guard `!run?.id`. Fora do V1 (mantido): (e) CORS restrito + rate limiting (checklist 05).
5. Fase E (se houver no plano 06) após D fechada — plano 06 termina na Fase D; próximo grande item é V1.1 (execução paralela E3, token streaming ADR-0007) se priorizado.

## Refinamento pós-MVP (2026-08-10) — commits `85a28cb` + `05da796`

- **R1 (E8)**: strings de UI unificadas em EN — trajectories (Fork/Export/Timeline/Panel/errorMsg fallbacks) + HITL (HitlDrawer) + RunTabs (Queued/Paused) + App ("Trajectories") + api.ts 401 + costModel override. Detail PT do backend continua exibido como veio (decisão documentada).
- **R2**: suíte 100% limpa — `environmentOptions.jsdom.url` no vitest.config.ts + act() no HitlDrawer.test → **zero warnings** no stderr (antes: 3× act + "Not implemented: navigation").
- **R3**: `nodeStatusMeta.ts` compartilhado (AgentNode + InspectDrawer) — elimina mapeamento duplicado documentado.
- Verificação: build ✓ · lint ✓ · **28/200 testes, stderr limpo** ✓ · Playwright 4/4 ✓.

## Histórico de commits

- ADE main: `7807bcc` (docs 19 arquivos), `b21e068` (status Fase A+B2/B3), **`21c2dda`** (merge feature/ade-fase2 — SPA completa B1–B6), `17750c4` (status Fase C backend), **`834dea1`** (merge feature/ade-fase2 — SPA Fase C completa), `b79075a` (status Fase C completa), **`a0ee0c2`** (merge feature/ade-fase2 — Fase D D1–D3), `7709e3e` (docs Fase D [D4]), **`2cbc612`** (merge feature/ade-fase2 — Fase D D4 testes), `2fa3ca1` (fix SPA: WS reusa API key como token [M-03]), `81cd9bb` (docs 08: dev com key fixa [M-03]), `5d8a1d9` (fix SPA: boot busca runs existentes e auto-seleciona a ativa), `fac391d` (docs: status Fase D completa, MVP completo), **`c149c66`** (fix SPA: pendências do MVP — demo cancelada completa, shortId, errorMsg shape, guard HitlDrawer), **`85a28cb`** (fix SPA: E8 strings de UI em EN + suíte zero warnings), **`05da796`** (refactor SPA: nodeStatusMeta compartilhado).
- SPA worktree `feature/ade-fase2`: `0e8605a` (design system + envelope v1 [M-19]), `403e5ae` (B2/B3 [M-20][M-08][M-10]), `047a283` (smoke E2E [E13]), `3d51f8a` (Fase C: fork/export/import, adjust_state, banner HITL, timeline [M-13][M-14][M-12][M-11][M-02]), `0394520` (Fase D: chips custo por nó, playground MCP, Settings [D1][D2][D3]), `721624d` (Fase D D4: E2E UC-01..12 + endurecimento, 197 vitest).
- Engine `feature/ade-fase-a` (auto-checkpoint "checkpoint: loopforge/..."): `f927eb9` (n5/A7), `14e2974` (n1), n2a (events.py), `cac8fb1` (n3), `264fa70` (n4), `a27a618` (ruído), `d833082`/`7d93a59` (n6), B4 (spa.py+test_spa_mount), `ca97075` (B5), `0aaba9a` (.gitignore fix), c1 (C1+C2 fork/export/import — auto-checkpoints), `dc825d7` (C3+C4 + flaky fix test_events_backfill), `8e1ed04` (C5 timeline [M-02]), `340c9a1` (Fase C backend), `7cbfd61` (Fase D: POST mcp tools + cost nodes + PATCH config [D2][D1][D3]).
