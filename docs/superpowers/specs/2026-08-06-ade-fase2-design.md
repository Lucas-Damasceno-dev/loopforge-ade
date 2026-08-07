# Spec de Design — Fase 2: SPA Completa do Blueprint (ADE)

> Data: 2026-08-06 · Projeto: `web/loopforge-ade` + `agentes/LoopForge` · Estado: **DRAFT — a validar**
> Base: BLUEPRINT.md v5 (decisões 4.2 UX1-UX20, 4.3 E1-E15, seção 5 Tier 1). Fase 1 (backend) concluída.

## 1. Objetivo

Entregar a **SPA React completa do blueprint** para a ADE LoopForge, consumindo o backend já existente
da Fase 1 (`lf serve --no-ui`, Trajectories API, WebSockets, NativeLLMProvider com token streaming,
Config API). A SPA é um pacote pip `loopforge-ade` que embute o build estático (E1) — neste repo,
`web/loopforge-ade/` contém o frontend e o empacotamento.

## 2. Escopo (Tier 1 — V1/MVP)

Todas as 6 features do Tier 1 que dependem de UI entram na Fase 2; features que dependem de backend
não existente (ex.: HITL drawer funcional completo, time-travel slider com replay) entram com a
**superfície de UI + dados mock/estáticos** onde o backend ainda não expõe o recurso, e o **painel DAG
+ console + workspace de runs** é o núcleo funcional real.

### 2.1 Núcleo (funcional de verdade, V1)

| # | Feature | Fonte | Critério de aceite |
|---|---|---|---|
| F2.1 | **Workspace: abas de runs (UX11, E2, E3)** | Blueprint #6 | Lista de runs (`GET /api/runs`, paginado `?skip&limit`); 1 run visível por vez; abas no topo com status; fila de runs (1 ativa + fila, E3); nova run via formulário (idea + stack) chamando `POST /api/runs` (cria no DB + dispara pipeline em background); detalhe via `GET /api/runs/{run_id}`. |
| F2.2 | **Canvas DAG: kanban linear + modo grafo 2D (UX2, UX1)** | Blueprint #1 | Renderiza os 9 nós (entry, CPO, PM, Tech Lead, Test Writer, Dev, QA, Retry, Parallel Audit) como colunas kanban por padrão; toggle para grafo 2D completo (loops de retry/fork) usando @xyflow/react (React Flow v12); zoom/pan; animação de mudança de estado. |
| F2.3 | **Status em tempo real via WebSocket (UX4, E4)** | Blueprint #1 | Conecta `/ws/streaming` e `/ws/runs/{id}`; replay/backfill ao conectar (estado completo + eventos desde o início — E4); nós mudam cor/status/borda por evento (Pendente, Em Execução, Aprovado, Rejeitado, Pausado p/ HITL); SEM tokens ao vivo no canvas (UX4) — streaming alimenta o console. |
| F2.4 | **Console fixo filtrável (E6, UX1)** | Blueprint #1 | Painel inferior fixo; logs/eventos estruturados por nó (eventos WS reais: `node_execution`, `run_updated`, `pipeline_*`, `human_decision_*`) + `run.logs` (`GET/PATCH /api/runs/{run_id}`); filtro por nó + nível (info/warn/error) + busca de texto; autoscroll com pause-on-scroll; token-streaming em tempo real fica como gap documentado (backend não emite deltas — ver 3.3). |
| F2.5 | **Inspeção de payload ao clicar (diretriz 4)** | Blueprint #1 | Click no nó → drawer/panel com inputs, outputs, tokens consumidos, uso de contexto e logs do passo; card Parallel Audit expandível (UX3: appsec+devops colapsados). |
| F2.6 | **Reconexão e offline (E14)** | Blueprint #1 | Banner "servidor desconectado"; reconexão automática com backfill; última view preservada na UI (estado Zustand mantém view durante reconexão). |
| F2.7 | **Retries visíveis (E7)** | Blueprint #1 | Badge de contagem no card do nó (developer↔qa) + lista de tentativas no drawer de inspeção. |
| F2.8 | **Layout 3 colunas + fullscreen (UX14)** | Blueprint #1 | 3 colunas redimensionáveis (drag handle); canvas em fullscreen com 1 atalho (F11 ou atalho próprio); split canvas/console (UX1). |
| F2.9 | **Demo mock 1-clique (UX16)** | Blueprint #1 | Empty state com "Run demo (mock)" → dispara run sintética dos 9 nós (custo zero) — usa `--mock`/eventos simulados do backend ou gera localmente. |
| F2.10 | **Segurança local (E5)** | Blueprint #1 | Frontend Vite dev proxy para `127.0.0.1:<porta>`; produção same-origin: **adicionar mount mínimo no backend** (`app.mount` StaticFiles do build estático em `create_app`, hoje inexistente — ver seção 5); CORS restrito à origem da SPA. |
| F2.11 | **A11y básica (UX20)** | Blueprint #1 | Contraste AA; navegação por teclado nas ações principais (abas, toggle grafo/kanban, filtros do console). |

### 2.2 Superfície de UI (mock/estático onde backend falta)

| # | Feature | Estado backend | Entregável V1 |
|---|---|---|---|
| F2.12 | **Time-Travel slider (UX5, UX6)** | Parcial: checkpoints existem em `GET /api/v1/trajectories/{thread_id}/checkpoints` e estado em `.../checkpoints/{checkpoint_id}` (channel_values), endereçado por **thread_id** (`{project_id}-{task_id}`), não run_id | Slider de steps com ghosting do futuro (nós esmaecidos) + banner fixo "Inspection — step X/Y" renderizando a partir do checkpoint selecionado; UI funcional quando thread_id estiver disponível (run resume → `pipeline_resumed` traz thread_id); senão UI com dados estáticos de exemplo. |
| F2.13 | **HITL drawer (UX8, UX9, UX10)** | Backend envia eventos de pausa (human_decision_expired etc.); ações Approve/Retry/Adjust State/Abort via WS | Drawer lateral não-modal com diff e botões; se a action WS não existir, estado "pending" visual + notificação de timeout; trilha auditável (quem/quando) quando houver dados. |
| F2.14 | **Custos (UX12, UX13)** | Telemetria V1 parcial | Chip de custo por nó + barra global de orçamento (valores de telemetria quando existirem; senão 0/estático); toast 80% + modal 100% com override (lógica local sobre orçamento de ade.yaml). |
| F2.15 | **Playground MCP (feature #5)** | Backend Fase 1b parcial (list_tools com allowlist; playground não existe) | UI para listar servidores/ferramentas (`GET /api/v1/mcp/servers` + `/tools`) e testar uma chamada isolada com JSON in/out — se a rota de execução não existir, mostrar interface com botão disabled/503 explicativo. |

### 2.3 Fora do escopo (Tier 2 / V2 — NÃO implementar)

- Time-travel com state mutation + fork funcional (V2 — requer API de resume do checkpoint)
- Doom-loop detection (V2)
- Rollback de filesystem (V2)
- Execução paralela real com atomic checkout (V2)
- Tema claro / presets (V2)
- i18n
- Evals (V2)

## 3. Arquitetura Frontend

### 3.1 Stack

| Camada | Escolha | Justificativa |
|---|---|---|
| Framework | **React 19 + Vite** (Rolldown) | Padrão do repo (`web/quocient` usa mesma stack); E1 — SPA embutida no pacote pip |
| Grafo | **@xyflow/react (React Flow v12)** | Canvas DAG interativo (zoom/pan, nós customizados, animações); requerido no blueprint |
| Estado | **Zustand** | Estado de UI + runs + nós; persistência de sessão (UX15); Undo/Redo Ctrl+Z |
| Server-state | **TanStack Query** | Cache/refetch das APIs REST (trajectories, runs, config) |
| WebSocket | **Vanilla WS + wrapper Zustand store** | WS bidirecional + fallback SSE + replay/backfill (E4) |
| Estilo | **Tailwind CSS v4** | Design system dark-first sóbrio (Vercel/Linear), tokens, a11y |
| Testes | **Vitest** (unit, componentes críticos) + **Playwright** (smoke E2E: load, DAG renderiza, navegação) | E13 |
| Lint/format | ESLint (padrão repo) | — |

### 3.2 Estrutura de diretórios (proposta)

```
web/loopforge-ade/
├── frontend/                 # SPA React
│   ├── src/
│   │   ├── app/              # bootstrap, providers (sem router no V1 — abas de runs substituem navegação por URL)
│   │   ├── features/
│   │   │   ├── dag/          # canvas kanban+grafo, nós customizados, drawer inspeção
│   │   │   ├── runs/         # abas, fila, form de nova run
│   │   │   ├── console/      # console filtrável
│   │   │   ├── timeline/     # time-travel slider + ghosting
│   │   │   ├── hitl/         # drawer HITL
│   │   │   ├── costs/        # chips + barra orçamento + hard-stop
│   │   │   └── mcp/          # playground MCP
│   │   ├── shared/           # ui-kit (buttons, badges, drawer, banner), lib (ws, api)
│   │   ├── stores/           # zustand: runsStore, canvasStore, consoleStore, wsStore
│   │   └── styles/           # tailwind tokens dark-first
│   ├── tests/                # vitest unit + e2e smoke (playwright)
│   └── vite.config.ts        # dev proxy → 127.0.0.1:porta
├── pyproject.toml            # pacote loopforge-ade (embute build estático, depende de lf)
└── README.md
```

### 3.3 Protocolo de eventos (WS) — consumido pela SPA (validado no backend, 2026-08-06)

Envelope real (variante dispatcher, `src/lf/api/task_dispatcher.py:142-157`):
`{event, task_id, timestamp, **payload}`; variante app.py: `{event, run_id, ...}`.

Eventos emitidos pelo backend (única fonte de verdade — SPA os mapeia 1:1 em `shared/lib/ws.ts`):

| event | payload | origem |
|---|---|---|
| `pipeline_started` | `{idea, node}` | dispatcher |
| `node_execution` | `{node, status:"completed", next_agent, attempt_count}` | dispatcher (sem texto/logs/tokens) |
| `pipeline_finished` / `pipeline_failed` | `{status, error}` (dispatcher) ou `{run_id, status, duration_seconds}` (app) | ambos |
| `pipeline_error` | `{error}` ou `{run_id, error}` | ambos |
| `pipeline_resumed` | `{thread_id, resuming_from_node}` | dispatcher |
| `human_decision_expired` | `{node, timeout_seconds, run_status}` | dispatcher |
| `run_created` | `{run_id, idea, status}` | app |
| `run_updated` | `{run_id, status, current_node}` | app |
| `human_decision_submitted` | `{run_id, gate_node, action, feedback_category, feedback_message, user}` | app |

Conexão: `GET /ws/streaming` e `/ws/runs/{run_id}` com auth `?token=`; mensagem `{event:"connected", status, run_id}` ao conectar; `{"type":"pong"}` a pings.

**Gaps confirmados (não implementar na Fase 2 — documentar na UI)**: (a) não existe SSE/broadcast de
tokens por nó (`NativeLLMProvider.stream()` não é exposto por rota); `node_execution` não carrega
texto/logs/tokens — o console V1 mostra os eventos reais acima + `run.logs` (campo aceito por
`PATCH /api/runs/{run_id}`); token-streaming em tempo real fica como melhoria futura (UX4 já manda
tokens para o console, nunca para o canvas). (b) export de trajectory devolve envelope vazio
(`steps:[], events:[]` até a Fase 3). (c) time-travel é endereçado por `thread_id`, não `run_id`.

## 4. Decisões de Design (UI)

- **Tema**: dark-first único (UX18, E15); paleta sóbria Vercel/Linear (zinc/neutral + um acento por tipo
  de nó — CPO, Dev, QA etc. — UX19); sem glassmorphism.
- **Layout**: split vertical canvas (topo, flex-1) + console fixo (base, altura mínima ~200px, redimensionável) (UX1);
  3 colunas opcionais (lista de runs | canvas | drawer) redimensionáveis (UX14); fullscreen do canvas com atalho.
- **Idioma**: UI em inglês (E8); docs/código comentado seguem PT do repo.
- **A11y**: AA contraste; foco visível; teclado nas abas/toggles/filtros (UX20).
- **Persistência**: apenas na sessão (UX15) — zoom/resize/abas não persistem entre sessões (Zustand session-only).
- **Estados vazios/carregamento/erro**: skeletons, empty state com demo mock (UX16), banner offline (E14).

## 5. Dependências e Riscos

1. **Protocolo WS real mapeado** — eventos reais confirmados (seção 3.3); camada única `shared/lib/ws.ts`
   + testes com fixtures dos envelopes reais. Nenhum risco aqui após a validação feita.
2. **Token-streaming por nó é GAP do backend** — `node_execution` não carrega texto/logs/tokens e não
   existe endpoint SSE de `NativeLLMProvider.stream()`. Console V1 usa eventos reais + `run.logs`;
   streaming de tokens em tempo real fica fora do escopo (documentado na UI). NÃO criar endpoint novo.
3. **Mount StaticFiles é backend mínimo necessário** — sem ele a SPA não é servida em produção (E1).
   Tarefa pequena e isolada em `create_app` (`ui_enabled`): servir build estático + fallback index.html.
   CORS restrito à origem da SPA.
4. **React Flow v12 + React 19** — compatibilidade a confirmar na instalação.
5. **Pacote pip `loopforge-ade`** — empacotamento do build estático pode ficar para o fim (não bloqueia
   desenvolvimento da SPA; pyproject criado no setup).
6. **Time-travel endereçado por thread_id, não run_id** — slider navega checkpoints da thread; quando a
   run ainda não produziu thread_id (nunca resumida), UI mostra estado estático de exemplo.

## 6. Fora de escopo explícito (não fazer na Fase 2)

- Backend novo além do **mínimo**: mount StaticFiles da SPA em `create_app` (ui_enabled) + nada mais
  em `src/lf`. Sem endpoint SSE de tokens, sem mudanças em `task_dispatcher.py`/`llm_factory.py`.
- Refactor da Fase 1 (sem mexer em `src/lf` além do mount).
- Tier 2 (seção 2.3).
