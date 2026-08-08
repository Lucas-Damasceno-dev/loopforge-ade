# 07 — Riscos (top 10)

Ordenados por impacto × probabilidade. Dono de cada mitigação = fase do plano
(`06-plano-de-implementacao.md`).

| # | Risco | Evidência | Mitigação | Fase |
|---|---|---|---|---|
| R-01 | **Drift SPA × backend** — contratos divergirem durante o desenvolvimento paralelo | Já ocorreu: wire do `decide` divergiu e exigiu commit de alinhamento (`644782a`); spec F2 tinha "CONFIRMAR na fonte" abertos | Envelope v1 com `schema_version` + teste de contrato no backend (todo evento valida o schema); tipos TS espelham schemas Pydantic (checados no smoke E2E); M-ids nos commits | A/B |
| R-02 | **Identidade run↔thread** — bugs de mapeamento por convenção de string | Bug vivo confirmado: resume via API procura thread que nunca existe | ADR-0003: coluna persistida, thread 1:1, dispatcher writer único; teste E2E de resume | A |
| R-03 | **Schema de checkpoint do LangGraph muda entre upgrades** e corrompe time-travel/fork | Schema é da biblioteca, não nosso; upgrade desatento quebra silenciosamente | Pin `langgraph-checkpoint-sqlite==3.1.0`; teste de fumaça de upgrade (abrir DB antigo após bump); envelope de export como formato estável próprio | A/C |
| R-04 | **MCP SDK 2.x em evolução** — API de client/stdio pode mudar | Fase 1 já foi o "maior risco" do BLUEPRINT; SDK novo | Isolamento atrás de `MCPRegistry` (único ponto de contato); stdio apenas no V1; pin de versão + teste de integração com server fake | A/D |
| R-05 | **Ledger de custo incompleto/impreciso** — hard-stop dispara tarde (ou nunca) | Path subprocess OpenCode não registra custo; tiktoken ≈ real | Estimativa flagada + buffer conservador de 10%; reconciliação manual via painel; upgrade para usage real quando o provider expuser | A |
| R-06 | **Concorrência SQLite** (API + dispatcher + CLI escrevendo) | WAL + busy_timeout já existem; dispatcher novo escritor aumenta writers | 1 run ativa (E3) limita escritores; single-writer pattern (dispatcher); testes de stress simples (2 writers) | A |
| R-07 | **Scope creep do Tier 2** (18 itens tentadores) | BLUEPRINT lista muito backlog atrativo | Escopo V1 congelado em `00-visao-e-produto.md`; qualquer adição exige ADR novo; plano de corte explícito (V1 fecha na Fase C) | todas |
| R-08 | **Banda de dev solo** — plano vira eterno | Estimativa já dobrada vs BLUEPRINT | Fases com valor independente e aceite binário; corte pré-aprovado; docs deste repo como handoff (retomar = ler 06) | todas |
| R-09 | **Testes de WS/timing frágeis** (flaky CI) | Padrão conhecido do projeto (timeouts arbitrários já causaram retrabalho) | Event-based waiting nos testes (sem `sleep`); contrato de envelope testável sem socket (validador puro); Playwright smoke só no happy path | A/B |
| R-10 | **Sync SPA→pacote estático diverge** (dist desatualizado dentro do `lf`) | ADR-0001 introduz passo manual de cópia | Script único `sync-dist`; **job de CI de drift a criar na B5** (hoje não existe — o engine só tem workflows Python): falha se hash do `static/` ≠ hash do `frontend/dist` do repo ADE (pin de commit no release); `lf serve` loga versão da SPA no boot | B |

## Riscos aceitos conscientemente (sem mitigação no V1)

- Broadcast global em `/ws/streaming` expõe eventos de todas as runs a qualquer
  cliente autenticado — aceito (dev solo, localhost).
- Sem sanitização de segredos em checkpoints/export — aceito (ver `05` §5).
- Runs antigas (thread legado) perdem resume/time-travel na migração — aceito
  (dados de dev; exportável antes).
- React Flow v12 + React 19: compatibilidade era risco aberto na spec F2;
  **mitigado de fato** — T1–T11 já rodam nesse stack no branch.
