# LoopForge ADE — Documentação (v1, 2026-08-07)

Documentação viva da ADE: visão, especificações, plano e decisões. **Substitui**
como referência o `BLUEPRINT.md` (v5) e as specs/plans de Fase 1–2 em
`docs/superpowers/` — esses permanecem como histórico; divergências estão
rastreadas em `09-mudancas-sobre-o-existente.md`.

## Mapa

| Doc | Conteúdo |
|---|---|
| `00-visao-e-produto.md` | Propósito, público, escopo do MVP (dentro/fora e por quê), critérios de sucesso |
| `01-especificacao-funcional.md` | Telas, 12 casos de uso, fluxos, estados de UI |
| `01b-design-system.md` | Direção visual, tokens, componentes, motion, microcopy, layout — referência obrigatória das tasks B1–B6 e do QA visual |
| `02-arquitetura.md` | Componentes, camadas backend/SPA, fluxos-chave (run, HITL, fork, budget) |
| `03-contratos-api.md` | REST `/api/v1/*`, envelope WS v1, catálogo de eventos, versionamento |
| `04-modelo-de-dados.md` | Bancos SQLite, tabelas, `ade.yaml`, retenção, migrações |
| `05-governanca-e-seguranca.md` | Auth, rede, custos (hard-stop), HITL, sandbox MCP, dados sensíveis |
| `06-plano-de-implementacao.md` | Fases A–D com tasks, dependências, aceite e estimativas; plano de corte |
| `07-riscos.md` | Top 10 riscos + mitigações; riscos aceitos |
| `08-operacao.md` | Setup, config, testes, release, troubleshooting |
| `09-mudancas-sobre-o-existente.md` | Registro M-01…M-22 de mudanças sobre código/decisões existentes |

## ADRs (`adr/`)

| ADR | Decisão |
|---|---|
| `0001` | Pacote pip único (`lf` embute a SPA) |
| `0002` | Event journal + envelope de eventos v1 (backfill REST + WS filtrado) |
| `0003` | Identidade run↔thread 1:1 persistida; dispatcher escritor canônico |
| `0004` | API `/api/v1` canônica, auth uniforme, CORS restrito |
| `0005` | Orçamento fonte única (`ade.yaml`) e hard-stop com pausa + override |
| `0006` | HITL `on_timeout: pause\|continue` (default fail-safe `pause`) |
| `0007` | Token streaming fora do MVP |

## Convenções

- Docs em PT-BR; identificadores/contratos em inglês. Diagramas em Mermaid.
- Mudança de contrato ⇒ atualizar `03` + ADR novo se for decisão.
- Commits de implementação citam M-ids (ex.: `[M-05]`).
- Afirmações sobre o estado atual são marcadas como **"verificado no código"**
  (auditadas no fonte) ou **"planejado"** (existe apenas em spec/plano, ainda
  não implementado).
- Estado de implementação auditado em 2026-08-07: engine Fase 1 concluída; SPA
  T1–T11 no branch `feature/ade-fase2`.
