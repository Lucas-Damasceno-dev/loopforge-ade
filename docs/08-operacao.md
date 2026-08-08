# 08 — Operação

Como rodar, configurar, testar e publicar. Paths absolutos omitidos: `$ENGINE` =
repo `agentes/LoopForge`, `$ADE` = repo `web/loopforge-ade`.

## 1. Setup de desenvolvimento

```bash
# Engine (backend + SPA vendored)
cd $ENGINE && uv sync                 # ou: python3.12 -m venv .venv && pip install -e .
cd $ADE/frontend && npm install

# Terminal 1 — backend (API + WS + SPA)
cd $ENGINE && .venv/bin/lf serve --port 8787   # imprime a X-API-Key gerada
# O default de `lf serve` é 8000, MAS o proxy do Vite aponta para 8787 por padrão
# (vite.config.ts: VITE_API_TARGET ?? http://127.0.0.1:8787) — suba na 8787
# para o dev funcionar sem env, ou alinhe com `VITE_API_TARGET=http://127.0.0.1:8000`.

# Terminal 2 — SPA em dev (hot reload, proxy p/ backend)
cd $ADE/frontend && npm run dev   # http://127.0.0.1:5173
# Auth: a key pode ir via env (VITE_API_KEY=<key-impressa>) OU ser digitada na
# tela 401 da SPA (ApiKeyGate) — fica em localStorage 'lf_api_key'.
```

Modo produção local (SPA empacotada): build + sync do dist para o pacote embutido
(`scripts/sync_dist.py` na B5 — **não existe** script `sync:engine` no npm):

```bash
cd $ADE/frontend && npm run build
cd $ENGINE && python scripts/sync_dist.py $ADE/frontend/dist   # copia → src/lf/ade/static/dist/
cd $ENGINE && .venv/bin/lf serve            # abrir http://127.0.0.1:8000/app
```

O `lf serve` monta a SPA em `/app` (B4/M-16) via `LF_SPA_DIST` (override) ou do
pacote embutido `lf.ade.static.dist` (B5). Sem dist, `/app` dá 404 e o backend
segue íntegro. Dev sem hot reload não precisa do Terminal 2.

## 2. Configuração

### Variáveis de ambiente

| Var | Default | Uso |
|---|---|---|
| `LF_API_API_KEY` | gerada no boot (`secrets.token_hex(16)`; alias `LF_API_KEY`) | auth REST/WS |
| `LF_API_HOST` / `LF_API_PORT` | `127.0.0.1` / `8000` | bind do servidor (CLI `lf serve --host/--port` vence) |
| `LF_CORS_ORIGINS` | `*` (wildcard) | CSV de origens permitidas; **restringir em uso externo** (M-04) |
| `LF_SPA_DIST` | auto-resolve | override do diretório do dist da SPA |
| `LF_UI_ENABLED` | `1` | `0`/`--no-ui` desliga dashboard legado e SPA |
| `LF_API_TEST` | — | `1` = banco de teste isolado (`.loopforge/test_api.sqlite`) |
| `VITE_API_KEY` / `VITE_API_TARGET` / `VITE_API_BASE` | — | dev da SPA: key, alvo do proxy (`8787`), base da API (`/api/v1`) |

### `.loopforge/ade.yaml` (config central, E9 — espelha `AdeConfig` em `config/schema.py`)

```yaml
budget:    { max_usd: 10.0 }                        # fonte única do CircuitBreaker (M-08)
hitl:      { timeout_seconds: 300, on_timeout: continue }  # continue|abort|pause (default continue)
providers: { primary: native, ollama_base_url: "http://localhost:11434" }
mcp_servers:
  - name: filesystem
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    tools_allowlist: ["read_file", "list_directory"]     # deny-by-default (403 fora da lista)
    enabled: true
```

- `on_timeout` (C4/M-11): `continue` = transição graciosa (legado); `abort` = run
  falha controlada sem LLM; `pause` = gate permanece aberto aguardando decisão tardia.
- `PATCH /api/v1/config` valida tudo (sub-modelos aninhados + `mcp_servers` via
  `TypeAdapter(list[AdeMcpServer])` — D3); inválido → 422.

## 3. Testes

```bash
# Backend (engine) — local, SEMPRE com OPENCODE_MOCK=1 (senão o teste de runner
# spawna `opencode` real e estoura o timeout de 5min). Suíte atual: 302 passed,
# 1 skipped, 1 xfailed.
cd $ENGINE && OPENCODE_MOCK=1 .venv/bin/python -m pytest -q
cd $ENGINE && OPENCODE_MOCK=1 .venv/bin/python -m pytest tests/test_event_envelope.py   # contrato do envelope v1

# CI (mesma ordem do pipeline): ruff → mypy → pytest com cobertura ≥75%
cd $ENGINE && .venv/bin/ruff check --select E,F,W,I,N,UP,SIM src/lf tests
cd $ENGINE && .venv/bin/mypy src/lf
cd $ENGINE && OPENCODE_MOCK=1 .venv/bin/python -m pytest --cov=src/lf --cov-fail-under=75 tests/

# SPA (24 arquivos / 126 testes)
cd $ADE/frontend && npm run test        # Vitest
cd $ADE/frontend && npm run lint && npm run build
cd $ADE/frontend && npx playwright test # smoke E2E (requer backend mock ou demo)

# Fumaça manual ponta a ponta
cd $ENGINE && OPENCODE_MOCK=1 .venv/bin/lf run --mock --idea "Calculadora CLI"  # aparece na UI (M-07), sem custo
```

## 4. Release (pacote único, ADR-0001)

```bash
# 1. Build e sync da SPA (dist embutido em src/lf/ade/static/dist/)
cd $ADE/frontend && npm run build
cd $ENGINE && python scripts/sync_dist.py $ADE/frontend/dist
# 2. CI/check de drift: hash de static/ == hash do dist commitado
#    (job real em .github/workflows/spa-drift.yml — B5)
# 3. Bump de versão do lf (semver único = versão da SPA). **Sem bump-my-version
#    configurado**: editar manualmente `version = "6.0.0"` no pyproject.toml (ex.: → "6.0.1").
# 4. Suite completa + smoke de instalação limpa (automatizado em CI na B5;
#    comando manual equivalente:)
python -m venv /tmp/vlf && /tmp/vlf/bin/pip install . && /tmp/vlf/bin/lf serve --port 8123
# 5. Publica
cd $ENGINE && uv build && uv publish
```

Regras: toda mudança de contrato API/WS ⇒ bump minor+ e atualização desta doc;
mudança quebradora de envelope ⇒ `schema_version` novo.

## 5. Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| WS fecha com 1008 | token ausente/errado | `VITE_API_KEY` = key impressa no boot |
| 401 em `/api/v1/*` | M-03 passou a exigir key | enviar `X-API-Key` |
| `sqlite3.OperationalError: database is locked` | writers demais / WAL não ativo | verificar WAL; 1 run ativa (E3); aumentar `busy_timeout` |
| SPA branca em `/app` | dist não sincronizado | `npm run build` + `python scripts/sync_dist.py $ADE/frontend/dist`; checar `LF_SPA_DIST` |
| Run "sumiu" da UI após restart | run CLI antiga (pré-M-07) | esperado: só runs novas têm linha canônica |
| `checkpoints.sqlite` gigante | arquivo **legado órfão** | pode apagar; checkpoints vivem em `trajectories.db` |
| Budget não dispara | run anterior à M-08 (sem `run_id` no ledger) | esperado em dados antigos |
| MCP server "down" | comando não encontrado | validar `command`/`args` do `ade.yaml`; logs do boot |
| 403 em POST tool MCP | tool fora do `tools_allowlist` | adicionar à allowlist do server no `ade.yaml` (deny-by-default) |
| 404 em POST tool MCP | server não declarado no `ade.yaml` | declarar o server (`name` deve casar) |
| SPA dev não acha o backend | porta do proxy (8787) ≠ porta do `lf serve` (8000) | `lf serve --port 8787` ou `VITE_API_TARGET=http://127.0.0.1:8000` |
| Override de budget "sumiu" após restart | override é **em memória** (por processo) | reaplicar `POST /cost/override` após subir o servidor |

## 6. Limites operacionais conhecidos (V1)

- 1 run ativa + fila; sem paralelismo real.
- Override de budget (`POST /runs/{id}/cost/override`) é **em memória** — por
  processo; sem persistência em SQLite (decisão documentada em `costs.py`).
- Sem prune/TTL de `trajectories.db` e `events` — export é o backup; limpeza
  manual via `DELETE /api/v1/runs/{id}`.
- Dashboard HTML legado: deprecated (banner), WS com fix de token; removido na
  próxima major.
