# 00 — Visão e produto

## 1. O que é

A **LoopForge ADE** (Agentic Development Environment) é a plataforma visual de
**depuração, simulação e governança em tempo real** do LoopForge — o motor
Python/LangGraph que executa um DAG de agentes (CPO → PM → Tech Lead → Test
Writer → Developer → QA → AppSec/DevOps → Lessons) para gerar projetos de
software a partir de uma ideia (AppSec/DevOps executam dentro de Parallel Audit;
Lessons é artefato gerado por ele — ver 03 §7).

Posicionamento (mantido do BLUEPRINT v5): **"LangGraph Studio para pipelines de
software, com governança."** Nenhuma ferramenta do mercado cobre os 5 pilares
juntos: DAG visual + time-travel + HITL + gestor MCP + evals. A ADE cobre os 4
primeiros no MVP; evals ficam para V2.

## 2. Público e restrições de produto

- **Dev solo** (D2), rodando **local** (`127.0.0.1`, CLI-first, D1). Sem
  multiusuário, RBAC ou cloud no MVP.
- Tempo de desenvolvimento é escasso e fragmentado → **realismo > perfeição**:
  escopo fechado, cortes explícitos, fases com valor independente.
- Governança é o diferencial: budget com hard-stop e gates humanos são
  **features de produto**, não configuração escondida.

## 3. Problema que resolve

Hoje o LoopForge é um "script de terminal": quando uma run de 20 minutos e
alguns dólares falha no meio, não há como ver onde ela está, o que cada agente
produziu, quanto gastou, nem como intervir sem matar o processo. A ADE torna a
run **observável, pausável, rebobinável e bifurcável**.

## 4. Escopo do MVP (V1)

### Dentro (Tier 1)

| # | Feature | Fundação |
|---|---|---|
| 1 | **Workspace de runs em abas** — lista, fila (até `max_concurrent_runs` em paralelo, default 2 — E3), nova run (idea+stack), demo mock 1-click (UX16) | `POST/GET /runs` + journal |
| 2 | **DAG visual interativo** — kanban-linear e grafo 2D (UX2), status por nó, retries visíveis (E7), click-to-inspect (payload, logs, custo do nó) | `@xyflow/react` + envelope v1 |
| 3 | **Console filtrável** (E6) com **backfill real** e reconexão sem perda (E4/E14) | event journal (ADR-0002) |
| 4 | **Time-travel**: slider de checkpoints, ghost + banner de inspeção (UX5/6), **fork real** de qualquer checkpoint (UX7) | trajectories API + M-13 |
| 5 | **HITL drawer** (UX8/9/10): approve/retry/adjust_prompt/**adjust_state**/abort, timeout configurável fail-safe, audit trail | `/decide` + M-11/M-12 |
| 6 | **Custos**: chip por nó + barra global (UX12), toast 80% + modal bloqueante 100% com override (UX13) | M-08/09/10 |
| 7 | **Gestor MCP**: lista servers/tools, playground com execução via UI (allowlist deny-by-default) | Fase 1 + Fase D |

### Fora (com motivo)

| Fora do MVP | Por quê | Quando |
|---|---|---|
| Token streaming ao vivo | Custo/valor; UX4; ADR-0007 | V2 |
| Checkout atômico de task (paralelismo com lock) | Fila já roda **até `max_concurrent_runs` em paralelo (default 2)** sem lock de escrita; atomic checkout fica para o V2 | V2 |
| Worktrees isolados por lane | Depende de paralelismo real | V2 |
| Evals integrados | BLUEPRINT já priorizou; benchmark CLI existe | V2 |
| RBAC/multiusuário, aprovação em camada de equipe | Público é dev solo (D2) | V2+ |
| Prune/TTL de checkpoints e journal | E11; export é o backup | V2 |
| Rollback de filesystem | D4: time-travel = estado do grafo | não planejado |
| Tema claro, i18n, presença, comentários | E15/E8; cosmético ou multiusuário | V2+ |
| Navegação web embarcada (Playwright na UI) | Candidato a revisão de escopo (BLUEPRINT Tier 2 #18) | sob revisão |

## 5. Critérios de sucesso do MVP

1. Rodar `pip install lf && lf serve` e operar uma run completa na SPA sem
   tocar no terminal (criar → observar → decidir num gate → ver custo).
2. Rebobinar uma run concluída até o checkpoint pós-Tech Lead e **forkar** uma
   nova run dali, com a original intacta.
3. Estourar o budget de propósito e ver a run **pausar** com opção de override.
4. Desligar o Wi‑Fi/aba no meio da run, reconectar, e **não perder nenhum
   evento** (backfill por `seq`).
5. Suite verde: backend ≥75% coverage (CI existente), SPA Vitest + smoke
   Playwright (E13).

## 6. Relação com os documentos anteriores

O BLUEPRINT v5 e as specs/plans das Fases 1–2 foram **insumo auditado
criticamente**, não autoridade. Esta documentação os substitui como referência
viva. Reversões explícitas (com justificativa) estão em
`09-mudancas-sobre-o-existente.md` — as maiores: pacote pip único (ADR-0001),
event journal que torna E4 real (ADR-0002), identidade run↔thread persistida
(ADR-0003), budget de fonte única com hard-stop-pausa (ADR-0005) e HITL
`on_timeout` fail-safe (ADR-0006; default real na implementação: `continue` — ver M-11).
