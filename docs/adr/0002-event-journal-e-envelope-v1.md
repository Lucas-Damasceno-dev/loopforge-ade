# ADR-0002: Event journal persistido + envelope de eventos v1

- **Status**: proposto (torna real a decisão E4 do BLUEPRINT, hoje rebaixada de fato)
- **Data**: 2026-08-07

## Contexto

O BLUEPRINT (E4) promete: "ao conectar (ou reconectar), a UI recebe estado completo
da run + eventos desde o início". A realidade auditada:

- Eventos WS são **fire-and-forget**: nada é persistido; quem conecta depois do
  início da run não vê o passado. A spec da Fase 2 rebaixou E4 para "gap
  documentado" e compensou com `demoMock` local.
- `/ws/runs/{run_id}` **não filtra por run**: ambos os paths caem no mesmo
  broadcast global (`app.py:100-101`, `websocket_manager.py:35`).
- Os eventos têm **dois formatos de envelope** (dispatcher: `{event, task_id,
  timestamp, **payload}`; app: `{event, run_id, ...}`) e nenhum `seq` — impossível
  detectar perda de eventos numa reconexão.
- `run.logs` é um campo texto atualizado via PATCH — não é um log estruturado.

Sem journal, três features do MVP ficam impossíveis de entregar de verdade:
backfill de runs CLI (UX17), reconexão sem perda (E14) e console filtrável com
histórico (E6).

## Decisão

**1. Event journal em SQLite.** Nova tabela `events` no banco de aplicação
(`telemetry.sqlite`):

```sql
CREATE TABLE events (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id     TEXT NOT NULL,
  thread_id  TEXT,
  seq        INTEGER NOT NULL,          -- por run_id, monotônico, 1-based
  event      TEXT NOT NULL,             -- ex.: node_execution
  payload    TEXT NOT NULL,             -- JSON
  ts         TEXT NOT NULL,             -- ISO-8601 UTC
  UNIQUE (run_id, seq)
);
CREATE INDEX idx_events_run ON events(run_id, seq);
```

**2. Emissor único (`EventBus`).** Novo módulo `src/lf/api/event_bus.py`:
`publish(run_id, thread_id, event, payload)` → persiste no journal (seq =
`MAX(seq)+1` da run) **e** faz broadcast WS no mesmo ponto de código.
`TaskDispatcher._broadcast_ws` e os broadcasts inline de `app.py` são substituídos
por chamadas ao `EventBus`. Nenhum evento sai sem ser journado.

**3. Envelope v1 único** (todas as mensagens server→cliente):

```json
{
  "schema_version": "1",
  "event": "node_execution",
  "run_id": "…", "thread_id": "…", "seq": 17,
  "ts": "2026-08-07T12:00:00Z",
  "payload": { "node": "qa", "status": "completed", "…": "…" }
}
```

O payload específico de cada evento sai do top-level para dentro de `payload`
(quebra intencional de contrato — a SPA consumidora ainda está em branch, sem
consumidores em produção; ver `09-mudancas`, M-05/M-19).

**4. Backfill via REST, live via WS.** Nova rota
`GET /api/v1/runs/{run_id}/events?after_seq=N&limit=M` (auth, paginada). Fluxo da
SPA: abrir run → `GET events?after_seq=0` (backfill) → conectar WS → descartar
live com `seq <=` último do backfill → aplicar o resto em ordem. `seq` fecha o
buraco entre backfill e live.

**5. `/ws/runs/{run_id}` filtra de verdade.** O `WebSocketManager` passa a manter
canais por run_id; `/ws/streaming` continua global (feed da lista de runs).

## Alternativas consideradas

| Alternativa | Por que rejeitada |
|---|---|
| Replay dentro do WS (servidor reenvia ao conectar) | Acopla backfill ao lifecycle do socket; mistura replay com live na mesma conexão; mais difícil de testar. REST+seq separa as duas preocupações. |
| Journal só em memória (ring buffer) | Não sobrevive a restart do `lf serve` nem cobre runs CLI anteriores à abertura da UI — derrota UX17/E14. |
| Event sourcing completo (estado derivado do journal) | Over-engineering para V1; o estado canônico continua sendo o checkpoint LangGraph + tabelas de aplicação. Journal é só para entrega/UX/telemetria. |
| Manter envelope plano (só adicionar campos) | Ambiguidade crescente entre os dois formatos atuais; quebrar agora é barato (SPA ainda não mergeada). |

## Consequências

**Positivas**
- E4 vira realidade; UX17 (runs CLI ao vivo com histórico) e E14 (reconexão sem
  perda) passam a ser implementáveis sem mocks.
- Console (E6) ganha fonte estruturada e persistente.
- Journal é também a semente do envelope de export de trajetórias (Fase C) e da
  telemetria E10.

**Negativas / custos**
- Escrita extra por evento no SQLite (irrisória: eventos por run são dezenas).
- Contrato WS quebra uma vez (SPA em branch precisa ajustar `normalizeWsEvent`).
- Sem prune no V1 (E11) o journal cresce junto — aceito e monitorado (tabela é
  pequena comparada aos checkpoints).

## Referências

- BLUEPRINT v5: E4, E6, E14, UX17; spec Fase 2 §3.3 (gaps documentados a, b, c)
- `src/lf/api/app.py:100-132` (WS), `src/lf/api/websocket_manager.py`,
  `src/lf/orchestrator/task_dispatcher.py:142-157` (`_broadcast_ws`)
- `03-contratos-api.md` (envelope e rotas finais)
