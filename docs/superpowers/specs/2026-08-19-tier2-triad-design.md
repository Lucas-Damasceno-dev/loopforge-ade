# Design — Tríade Tier 2: Worktree por Run, Token Streaming e Doom-Loop Guard

Data: 2026-08-19 · Status: aprovado · Escopo: LoopForge Engine (`agentes/LoopForge`) + ADE SPA (`web/loopforge-ade`)

## 1. Contexto & Motivação

Com a conclusão do Pipeline Studio (S1-S4), a engine LoopForge e a interface web ADE alcançaram maturidade de orquestração. Para garantir robustez em ambiente de produção com múltiplas execuções simultâneas e modelos LLM reais, três capacidades críticas de Tier 2 foram priorizadas:

1. **[A] Git Worktree Isolation per Run (Tier 2 §22)**: Evita poluição e conflitos no repositório base isolando geração e testes em `.slim/worktrees/<run_id>`.
2. **[B] Token Streaming End-to-End (ADR-0007)**: Transmite deltas incrementais gerados pelo LLM ao vivo do backend para os painéis de Console e nós do DAG no frontend.
3. **[C] Doom-Loop Detection & Guard (E7 / Tier 2 §24)**: Interrompe loops de retries estéreis entre `developer` e `qa` quando o código gerado ou os erros de teste estagnam, escalando para HITL.

---

## 2. Subsistema A — Git Worktree Isolation por Run

### 2.1 Engine (`agentes/LoopForge/src/lf/`)
- **Criação e Gestão de Sandbox**:
  - `GitSandbox` (`lf/runner/git/sandbox.py`) gerencia o ciclo de vida de worktrees em `.slim/worktrees/<run_id>` com branch `lf-worktree-<run_id>`.
  - Ao iniciar uma run (`POST /api/v1/runs` ou fila/worker), a engine invoca `sandbox.create_worktree(run_id)`.
  - O estado inicial da run (`initial_state`) recebe:
    - `output_dir = ".slim/worktrees/<run_id>"`
    - `project_dir = ".slim/worktrees/<run_id>"`
    - `sandbox = {"worktree_path": str(path), "branch": f"lf-worktree-{run_id}", "task_id": run_id}`
  - Todos os nós (`developer`, `test_writer`, `qa`, `appsec`, `devops`) operam exclusivamente dentro do diretório isolado da worktree.
- **Roteamento de Endpoints da API**:
  - `GET /api/v1/runs/{id}/artifacts` busca arquivos no `worktree_path` se existir; fallback para diretório padrão de run.
  - `GET /api/v1/runs/{id}/ast` executa análise estática sobre os arquivos da worktree.
  - `GET /api/v1/runs/{id}/coverage` lê relatórios gerados dentro da worktree.
  - `POST /api/v1/runs/{id}/terminal/exec` executa comandos com `cwd` apontando para a worktree.
- **Finalização / Merge**:
  - Na conclusão com sucesso, se configurado merge automático ou aprovado via HITL, a engine executa `sandbox.merge_worktree(run_id, target_branch="main")` e faz o cleanup.
  - Em caso de abort/cancelamento, a worktree e branch temporária são limpos com `sandbox.cleanup_worktree(run_id)`.

---

## 3. Subsistema B — Token Streaming End-to-End

### 3.1 Backend (`agentes/LoopForge/src/lf/`)
- **Publicador Universal de Deltas**:
  - `TokenDeltaPublisher` (`lf/pipeline/llm_factory.py`) estendido para todos os nós executores:
    - `cpo`, `pm`, `tech_lead`, `test_writer`, `developer`, `qa`, `appsec`, `devops` e nós dinâmicos instanciados via `NodeFactory`.
  - Cada chamada LLM via OpenRouter/OpenCode com streaming ativo recebe callback `on_token_delta(chunk)`.
  - O callback publica eventos no `EventBus` / Redis:
    ```json
    {
      "seq": 1042,
      "event": "token_delta",
      "run_id": "run-abc-123",
      "timestamp": "2026-08-19T11:45:00Z",
      "payload": {
        "node": "developer",
        "content": "def calculate_tax(amount: float) -> float:\n"
      }
    }
    ```

### 3.2 Frontend (`web/loopforge-ade/frontend/`)
- **Processamento no `wsBridge.ts`**:
  - Eventos `token_delta` alimentam `useConsoleStore.getState().appendStream(node, content, run_id)`.
  - Ao receber `node_execution` (fim do nó), o buffer é promovido via `finishStream(node)` para entrada de log permanente.
- **Visualização**:
  - `ConsolePanel`: exibe buffer de streaming ativo para o nó selecionado em tempo real com indicador de digitação.
  - `FlowCanvas` / `AgentNode`: nó em execução exibe indicador de pulso e contagem incremental de streaming.

---

## 4. Subsistema C — Doom-Loop Detection & HITL Guard

### 4.1 Mecânica de Detecção (`agentes/LoopForge/src/lf/pipeline/`)
- **Fingerprinting de Iteração**:
  - Ao final de cada execução do `developer` e avaliação do `qa`, a engine calcula um hash de assinatura da iteração:
    - `fingerprint = SHA256(ast_symbols_dump + test_failure_output + diff_patch)`
  - O `GraphState` acumula o histórico: `retry_fingerprints: list[str]`.
- **Condição de Disparo do Guard**:
  - Se 2 tentativas consecutivas produzirem o MESMO fingerprint (código inalterado ou mesmo erro exato sem evolução), ou se atingir 3 retries sem redução no número de testes falhando:
    - O roteador `should_retry` interrompe o ciclo automático.
    - O estado transiciona para `status: "paused"`, `paused_reason: "doom_loop_detected"`.
    - Um evento `hitl_gate_reached` é emitido com payload:
      ```json
      {
        "gate": "doom_loop",
        "node": "developer",
        "consecutive_identical_attempts": 2,
        "last_failure": "AssertionError: Expected 200 but got 422 in test_auth.py",
        "suggestion": "Adjust prompt context or supply test mocks"
      }
      ```

### 4.2 Intervenção Humana no Frontend (`HitlDrawer.tsx`)
- O banner de HITL identifica o tipo `doom_loop` com destaque visual (`tone="warn"` / `"err"`).
- O drawer oferece três ações explícitas:
  1. **Ajustar Prompt**: injeta instruções corretivas no nó `developer` e retenta.
  2. **Override & Avançar**: ignora a falha estagnada e força o avanço para o próximo estágio.
  3. **Abortar Run**: cancela a execução para evitar desperdício de tokens.

---

## 5. Ordem de Implementação

| Fase | Foco | Repos | Entregáveis |
|---|---|---|---|
| **Fase 1** | [A] Worktree Sandbox | `LoopForge` | Isolamento em `POST /runs`, resolução de artefatos/terminal nos endpoints, testes unitários |
| **Fase 2** | [B] Token Streaming | `LoopForge` + `loopforge-ade` | `TokenDeltaPublisher` em todos os nós, renderização no `ConsolePanel` e nós |
| **Fase 3** | [C] Doom-Loop Guard | `LoopForge` + `loopforge-ade` | Fingerprint no `GraphState`, `should_retry` doom-loop check, banner/drawer HITL |

---

## 6. Critérios de Aceite

- **Worktree**: Execuções paralelas de runs não colidem arquivos em disco; endpoints de artifacts e terminal leem diretamente da worktree correspondente.
- **Streaming**: Caracteres gerados pelo LLM aparecem progressivamente no console da UI durante a execução de cada nó.
- **Doom-Loop**: Se um nó developer falhar duas vezes com o mesmo erro e mesmo diff, a run pausa em vez de esgotar todos os retries silenciosamente, abrindo o modal de decisão humana.
- **Regressão**: Suíte de testes do engine e da SPA 100% verdes.
