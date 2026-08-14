# ADR-0005: Orçamento com fonte única e hard-stop real

- **Status**: aceito/implementado (Fase A backend + Fase D UI — M-08/M-09/M-10; 2026-08-13)
- **Data**: 2026-08-07

## Contexto

O BLUEPRINT (diretriz 1, UX12/UX13) define controle de custos como feature
não-negociável: budget por run, warning aos 80%, hard-stop aos 100% com override.
A realidade auditada:

- Existem **quatro pontos de configuração de budget desconectados**:
  `CircuitBreaker.max_total_cost` (default de classe 50.0,
  `circuit_breaker.py:17-24`), override hardcoded `10.0` no
  `TaskDispatcher.__init__` (`task_dispatcher.py:76`),
  `LoopForgeConfig.budget_limit_usd` (10.0, só usado pelo CLI `lf run`) e
  `AdeBudget.max_usd` (10.0, **nunca lido por nenhum código de enforcement**).
- O único enforcement real hoje é o check `budget_exceeded` **no nó developer**
  (`developer.py:416-426`) — os demais nós consomem custo sem checar limite, e
  o estouro vira `error` + rota para `parallel_audit` (a run morre, não pausa).
- O ledger `llm_costs` não tem `run_id` nem `node` — impossível agregar custo por
  run ou por nó (UX12 inviável).
- O path de fallback OpenCode (subprocess) **não registra custo nenhum** — o
  ledger é incompleto exatamente no path mais usado quando não há chave OpenRouter.
- A UI da Fase 2 (T12) **planejou** o modal de hard-stop com `spentUsd = 0`
  fixo — **verificado no código**: `frontend/src/features/costs/` no branch
  contém apenas `.gitkeep` e há **zero ocorrências de `spentUsd`**; T12 nunca foi
  implementada. Ou seja: nem o ledger nem a UI de custos existem hoje.

## Decisão

**1. Fonte única de orçamento**: `ade.yaml → budget.max_usd` (config central, E9).
`TaskDispatcher` constrói seu `CircuitBreaker(max_total_cost=...)` **a partir de
`load_ade_config().budget.max_usd`** quando nenhum breaker é injetado — remove o
literal `10.0`. `LoopForgeConfig.budget_limit_usd` permanece para o CLI standalone
mas é preterido pelo `ade.yaml` quando a run roda sob `lf serve`/API.

**2. Ledger por run e por nó**: `llm_costs` ganha colunas `run_id TEXT`,
`node TEXT`, `estimated INTEGER(1|0)`. `CostTracker.track()` recebe contexto
(run_id, node) via o estado do grafo. Agregação por run = `SUM(cost_usd) GROUP BY
run_id` (barato no SQLite).

**3. Custo estimado no path subprocess**: quando o provider é OpenCode subprocess
(sem `usage` real), registra estimativa via `tiktoken` (ou `chars//4` como último
fallback) sobre prompt+resposta, com `estimated=1`. O hard-stop usa um **buffer
conservador de 10%** sobre estimativas (estimado×1.1 no cálculo do limite) —
reconhece a imprecisão sem fingir precisão.

**4. Endpoint de leitura**: `GET /api/v1/runs/{run_id}/cost` →
`{run_id, budget_usd, spent_usd, pct, per_node: [{node, cost_usd, estimated}], hard_stopped}`.
A barra global de budget (UX12) e o modal (UX13) consomem este endpoint via
TanStack Query (poll leve a cada evento `node_execution`, não por timer).

> **Shape final implementado** (`CostResponse`, verificado no código):
> `{run_id, spent_usd, estimated, budget: {max_usd, percent_used},
> budget_warning: bool, nodes: [{node, spent_usd, estimated}]}`.

**5. Enforcement**:
- 80% → `budget_warning` (campo do `GET /cost`; **não é evento WS** — a UI vê o
  campo via poll/TanStack Query) → toast na UI.
- 100% → dispatcher **pausa a run** com status `paused` (não aborta:
  checkpoints preservados) + evento `circuit_breaker_changed` + modal bloqueante
  na UI. *(O ADR propunha status `budget_exceeded`; a implementação M-10 usa
  `paused` — ver `01` §3.1.)*
- Escape hatch: `POST /api/v1/runs/{run_id}/cost/override {new_max_usd}` (nome
  final; o ADR citava `budget-override`) → ajusta o budget da run e resume.
  Registrado em `human_decisions` (audit trail).

## Alternativas consideradas

| Alternativa | Por que rejeitada |
|---|---|
| Manter hard-stop como abort (comportamento atual do CircuitBreaker no developer) | Perde o trabalho da run; pausa+resume usa a infra de checkpoints que já existe e é a semântica que UX13 descreve ("dar override"). |
| Budget global (não por run) | Runs sequenciais compartilhariam estado de forma opaca; por-run é o que a UI mostra e o que o usuário controla. Budget global pode virar V2 (soma de runs ativas). |
| Telemetria real de tokens no subprocess | O OpenCode CLI não expõe `usage` de forma estável; estimativa flagada é honesta e reversível. |
| Poll por timer na UI | Desperdiça requests; poll disparado por `node_execution` é suficiente (custos só mudam em execução de nó). |

## Consequências

**Positivas**: UX12/UX13 passam a ter dados reais; comportamento de custo
previsível e auditável; fecha o maior gap entre o BLUEPRINT e a implementação.

**Negativas / custos**: migração de schema em `llm_costs` (aditiva); custos
estimados podem desviar do real (mitigado pelo buffer e pela flag `estimated`
visível na UI); leve acoplamento novo entre dispatcher e `ade.yaml` (já existia
para `hitl.timeout_seconds` — padrão mantido).

## Referências

- `task_dispatcher.py:75-76`, `llm_factory.py:143-233` (CostTracker),
  `circuit_breaker.py:17-24`, `config/schema.py:106-108` (AdeBudget)
- BLUEPRINT diretriz 1, UX12/UX13; spec Fase 2 F2.14 (downgrade a reverter)
- `05-governanca-e-seguranca.md` §custos
