# 05 — Governança e segurança

Modelo: **dev solo, localhost** (D1/D2). A governança protege contra os riscos
reais desse modelo — gasto descontrolado de LLM, ações destrutivas sem
supervisão, exposição acidental na LAN, tool MCP maliciosa — não contra
adversários multiusuário (V2).

## 1. Autenticação e superfície de rede

| Camada | Mecanismo |
|---|---|
| REST `/api/*` | `X-API-Key` (ou Basic) em **todas** as rotas (M-03). Key gerada por `lf serve` (`secrets.token_hex(16)`) e impressa no console; override via `LF_API_API_KEY`. Constant-time compare. |
| WS | `?token=` nos dois paths; close `1008` se inválido. |
| Binding | default `127.0.0.1` (E5). `--host 0.0.0.0` possível mas exige key ativa; log de aviso explícito no boot. |
| CORS | `LF_CORS_ORIGINS` (csv), default `http://127.0.0.1:5173,http://localhost:5173` (M-04). Produção = same-origin (SPA servida pelo `lf`), CORS inócuo. Sem `*` + credentials. |
| Rate limiting | **Não** no V1 — localhost + key tornam irrelevante; brute-force local é cenário fora do modelo de ameaça. Revisitar se binding externo virar caso suportado. |

## 2. Controle de custos (diretriz 1 — não negociável)

- **Fonte única**: `ade.yaml budget.max_usd` → `CircuitBreaker` (ADR-0005).
- **Ledger**: `llm_costs` por chamada com `run_id`/`node`/`estimated` (M-08);
  subprocess OpenCode registra estimativa (`estimated=1`, tiktoken/chars) (M-09).
- **Enforcement**: 80% → `budget_warning` (toast); 100% (com buffer de 10% sobre
  estimados) → run **pausa** (`budget_exceeded`) — checkpoints íntegros;
  override via UI/API (`budget-override`, auditado) ou abort (M-10).
- **Outros limites** (CircuitBreaker, já existentes): `max_consecutive_failures=5`,
  `max_iterations=20`. Retries de nó: `max_retries=3` (QA/AppSec loops).
- **Visão honesta**: chips por nó mostram `~` quando estimado; a barra nunca
  finge precisão que não existe.

## 3. HITL (3 camadas do BLUEPRINT)

| Camada | MVP? | Mecanismo |
|---|---|---|
| 1 — interrupt técnico | ✔ | `interrupt_after` + `/decide` persistem decisão (existem); **polling remoto está quebrado hoje** — dispatcher consulta `human_decisions` por `thread_id` e a API grava por uuid da run (verificado: `task_dispatcher.py:336` vs `app.py:357`). Fix = M-22 (Fase A, com teste E2E). |
| 2 — aprovação de unidade de trabalho (equipe) | ✖ | V2 (público multiusuário) |
| 3 — override com rollback | ✔ | `adjust_state` + fork de checkpoint (M-12/M-13) |

- **Ações**: approve / retry / adjust_prompt / adjust_state / abort. `state_patch`
  validado contra chaves do `GraphState` antes de `aupdate_state` (422 se inválido).
- **Timeout**: `hitl.timeout_seconds` (default 300) + **`on_timeout: pause|continue`**
  (default `pause` — fail-safe, ADR-0006). `pause` mantém a run esperando
  indefinidamente sem consumir LLM; decisão tardia sempre aceita e logada.
- **Audit trail**: toda decisão (incl. override de budget) em `human_decisions`
  com usuário, timestamp, ação, payload e estado-alvo. Consultável na UI
  (drawer) e via API. Append-only — sem edição/remoção no V1.

## 4. Sandbox MCP

- **Deny-by-default**: tool só executa se estiver em `tools_allowlist` do server
  no `ade.yaml`; caso contrário `MCPPermissionDenied` → 403 (Fase 1, mantido).
- **Transporte stdio apenas** (F1-5): servers são subprocessos locais com
  comando declarado pelo usuário — a superfície é a mesma de rodar o comando no
  shell. HTTP/SSE → V2 (novas ameaças: SSRF, auth remota).
- **Sem escrita implícita**: `call_tool` só é exposto via API na Fase D e exige
  auth como todo `/api/*`. Nenhum nó do pipeline chama MCP autonomamente no V1 —
  tools são invocadas pelo operador (playground) ou por nós explicitamente
  codificados.
- Server morto → `MCPUnavailable` → 503; UI mostra status down sem quebrar a run.

## 5. Dados sensíveis

- Checkpoints e journal contêm **estado completo da run** (código gerado,
  prompts, possíveis segredos colados na ideia). Mitigações V1: tudo local em
  `.loopforge/` (não commitado); export de trajetória é ação explícita do
  operador. **Sem sanitização automática no V1** — documentado; o operador é o
  único destinatário. V2 candidato: redaction patterns no export.
- API key nunca logada; impressa uma vez no boot do `lf serve`.

## 6. Checklist de governança do MVP (aceite)

- [ ] Nenhuma rota `/api/*` responde sem key (teste de contrato).
- [ ] Estourar budget pausa a run e exige ação explícita (teste E2E).
- [ ] Tool fora da allowlist retorna 403 (teste existente, mantido).
- [ ] Toda decisão HITL aparece no audit trail com estado-alvo.
- [ ] CORS rejeita origem não listada (teste).
