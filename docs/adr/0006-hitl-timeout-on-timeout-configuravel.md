# ADR-0006: HITL — timeout configurável com default fail-safe (`pause`)

- **Status**: proposto (altera F1-13, que havia sido aprovada na spec Fase 1)
- **Data**: 2026-08-07

## Contexto

Há **três fontes contraditórias** sobre o que acontece quando um gate HITL expira:

1. **Código** (`task_dispatcher.py:475-487`): timeout **continua a pipeline**,
   emite `human_decision_expired`, status `decision_expired`, e aceita decisão
   tardia.
2. **Spec Fase 1 (F1-13)**, aprovada em review: formalizou esse comportamento
   ("continua graciosamente").
3. **`AGENTS.md:77`** do engine: afirma que o default é **abort** (drift
   documental, nunca foi verdade no código).
4. **BLUEPRINT UX10**: fala em "run permanece pausada marcada como esperando" —
   terceiro comportamento.

O problema de fundo: `continue` como único comportamento é **fail-open** — se o
operador configurou um gate HITL, a intenção era bloquear gasto/alteração sem
supervisão. Continuar automaticamente num gate expirado transforma o HITL em
enfeite: basta o operador se ausentar para o gate deixar de existir, com custo de
LLM correndo solto.

## Decisão

Nova chave de config: **`hitl.on_timeout: "pause" | "continue"`** em `ade.yaml`
(default **`pause`**).

- **`pause`** (default, fail-safe): ao expirar `hitl.timeout_seconds`, a run fica
  em `decision_expired` **e permanece pausada no gate** — o interrupt não é
  resolvido; o dispatcher segue aguardando decisão (local ou remota, sem novo
  timeout). UI mostra badge "awaiting decision (timed out)". Nada mais de LLM
  roda até o operador decidir.
- **`continue`**: comportamento atual da Fase 1 (segue a pipeline) — para quem
  quer throughput e aceita o risco.
- Em ambos os modos: evento `human_decision_expired` é emitido e decisão tardia
  segue aceita. `abort` explícito continua disponível como ação.

`AGENTS.md` do engine é corrigido para refletir o comportamento real (M-17).

**Escopo de implementação**: Fase C (junto do HITL real), não Fase A — exige
mudar o loop de espera do dispatcher (re-aguardar decisão após expirar), o que é
médio esforço e não bloqueia o hardening.

## Alternativas consideradas

| Alternativa | Por que rejeitada |
|---|---|
| Manter `continue` como único comportamento (F1-13) | Fail-open em feature de governança; contradiz o propósito do gate e o UX10. |
| `abort` como default (AGENTS.md) | Fail-closed demais: uma ausência de 5 min destrói uma run inteira; `pause` preserva o trabalho. |
| Novo timeout recorrente (re-notificar a cada N s) | Complexidade sem ganho; o badge persistente + notificação OS (UX10, V2) bastam. |
| Resolver só a doc (AGENTS.md) e manter código | Não resolve a contradição de produto, só a documental. |

## Consequências

**Positivas**: comportamento fail-safe alinhado à governança; config resolve o
trade-off em vez de escolher um vencedor; drift documental eliminado.

**Negativas / custos**: muda comportamento implementado na Fase 1 (quem dependia
do `continue` automático precisa optar via config); implementação adiada para a
Fase C (até lá o comportamento real permanece `continue` — documentado como
transição).

## Referências

- `task_dispatcher.py:475-487`, `config/schema.py:115-117` (AdeHITL)
- Spec Fase 1 F1-13; BLUEPRINT UX10; `AGENTS.md:77` (drift)
- `05-governanca-e-seguranca.md` §HITL
