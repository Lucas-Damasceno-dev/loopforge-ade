# ADR-0007: Token streaming ao vivo fora do MVP

- **Status**: proposto (mantém e formaliza gap já documentado na spec Fase 2)
- **Data**: 2026-08-07

## Contexto

`NativeLLMProvider.stream()` (Fase 1, 1d) já implementa streaming token-a-token
via SSE para o provider nativo, mas **não é exposto** por nenhuma rota/WS. A spec
da Fase 2 (§3.3-a) validou o gap e decidiu: console V1 usa eventos reais +
`run.logs`, sem tokens ao vivo; "NÃO criar endpoint novo".

O BLUEPRINT (UX4) decidiu "streaming sóbrio": sem tokens voando no canvas; a
dúvida restante era o console.

## Decisão

**MVP sem streaming de tokens na UI.** O console consome o event journal
(ADR-0002) + logs estruturados por nó. O `stream()` interno permanece pronto e
testado; a exposição (canal WS dedicado `/ws/runs/{id}/tokens` ou multiplexação
no envelope) fica para **V2**, junto com a decisão de consumo visual.

Justificativa:
- **Custo/valor**: stream de tokens exige mux por run, backpressure, e UI de
  alta frequência de atualização — tudo isso para um console que 90% do tempo é
  lido depois do fato. O journal já entrega a narrativa essencial (quem rodou,
  com que resultado, por quanto).
- **Coerência com UX4**: a ADE é uma ferramenta de governança/depuração, não um
  terminal de chat. Tokens ao vivo incentivam babysitting; o design quer o
  contrário (gates, budgets, inspeção sob demanda).
- **Risco técnico**: SSE de providers varia (formato de delta, `[DONE]`) — parser
  tolerante já existe no provider, mas estabilizar isso como contrato público de
  WS é trabalho de V2.

## Consequências

**Positivas**: escopo do MVP fecha; console entregue sobre fundação sólida
(journal); nenhum contrato público apressado para deprecar depois.

**Negativas**: quem quiser "ver o LLM pensando" ao vivo não terá — mitigado pelo
demo mock (UX16) e pelos logs por nó no inspect drawer. Decisão reversível:
`stream()` está pronto, expor é incremental.

## Referências

- Spec Fase 2 §3.3-a (gap documentado); BLUEPRINT UX4
- `pipeline/llm_factory.py` (NativeLLMProvider.stream)
