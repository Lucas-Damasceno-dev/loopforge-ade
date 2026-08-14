# ADR-0003: Identidade run↔thread 1:1, persistida e de escrita única

- **Status**: aceito/implementado (Fase A — M-01/M-02/M-07; 2026-08-13)
- **Data**: 2026-08-07

## Contexto

Hoje a relação run (linha em `pipeline_runs`) ↔ thread (checkpoints LangGraph) é
**derivada por convenção de string em dois pontos do código**, e os dois pontos
divergem:

- Dispatch (via API): `project_id=f"run-{run_id}"`, `task.id=f"task-{run_id[:8]}"`
  → thread `run-{run_id}-task-{run_id[:8]}` (`app.py:490-514` + `task_dispatcher.py:640`).
- Resume (via API): `dispatcher.resume(project_id="project", task_id=f"run-{id}")`
  → thread `project-run-{id}` (`app.py:226`). **Nunca casa → resume via API está
  quebrado.**

Consequências adicionais: time-travel é endereçado por `thread_id` que a UI não
consegue derivar com segurança (gap documentado na spec Fase 2 §3.3-c); runs
disparadas via CLI (`lf run`) **não criam linha em `pipeline_runs`**, então UX17
("runs CLI aparecem ao vivo") não funciona — só runs da API existem na UI.

## Decisão

**1. Run e thread são 1:1 no V1.** Toda run tem exatamente uma thread LangGraph;
forks criam uma **nova run** (nova linha) com `parent_run_id` apontando para a
origem — em vez de "threads órfãs" invisíveis para a UI.

**2. `thread_id` simplificado e persistido.** Formato `run-{run_id}` (dispatch usa
`project_id="run"`, `task.id=run_id`). Duas colunas novas em `pipeline_runs`:

```sql
ALTER TABLE pipeline_runs ADD COLUMN thread_id TEXT;        -- único, preenchido na criação
ALTER TABLE pipeline_runs ADD COLUMN parent_run_id TEXT;    -- NULL exceto forks
```

Backfill de migração: `thread_id = 'run-' || id` para runs existentes (runs
antigas cujas threads usam o formato legado ficam read-only; resume delas não é
garantido — documentado, aceito: dados de dev).

**3. `POST /api/v1/runs/{id}/resume` lê a coluna** em vez de reconstruir a string
— elimina o bug por construção. Trajectories API passa a aceitar `run_id` como
alias de `thread_id` (resolve internamente via coluna).

**4. Dispatcher = escritor canônico do estado da run.** `TaskDispatcher` passa a
fazer upsert da linha `PipelineRun` (status, current_node, started/finished) no
início e a cada transição de nó — para runs criadas pela API **e** para runs CLI
(`lf run` cria a linha no dispatch). A API deixa de ser a única que escreve
estado; `PATCH /api/runs/{id}` (escrita manual de status/logs) é deprecado para
uso interno (permanece para admin/debug, mas a UI passa a ler).

## Alternativas consideradas

| Alternativa | Por que rejeitada |
|---|---|
| Manter convenção de string, só corrigir o resume | O bug é sintoma: qualquer novo consumidor (UI, fork, export) precisaria reimplementar a convenção. Persistir é o fix estrutural. |
| Chave composta (project_id, task_id) exposta à UI | Vaza detalhe interno do dispatcher para o contrato público; E2 diz que thread é detalhe interno. |
| N runs → 1 thread (runs compartilham thread) | Quebra isolamento de checkpoints entre runs; forks ficam ambíguos. |

## Consequências

**Positivas**
- Resume, fork, time-travel e export passam a funcionar por chave real — UX17,
  UX5/UX6 e a Layer 3 de HITL desbloqueadas.
- UI nunca mais deriva string de thread.

**Negativas / custos**
- Migração de schema (aditiva, trivial com `ALTER TABLE`; alembic já é dependência
  mas segue não utilizado — migração aplicada em `init_db` com checagem de coluna,
  padrão já usado no projeto).
- Runs antigas (formato legado de thread) perdem resume/time-travel — aceito
  (dados locais de dev; export antes, se necessário).

## Referências

- Bug: `app.py:226` vs `app.py:513`; convenção: `task_dispatcher.py:640`
- BLUEPRINT E2 (run = unidade primária), UX17 (runs CLI ao vivo)
- `04-modelo-de-dados.md`, `03-contratos-api.md`
