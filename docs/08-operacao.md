# 08 — Operação

Como rodar, configurar, testar e publicar. Paths absolutos omitidos: `$ENGINE` =
repo `agentes/LoopForge`, `$ADE` = repo `web/loopforge-ade`.

## 1. Setup de desenvolvimento

```bash
# Engine (backend + SPA vendored)
cd $ENGINE && uv sync                 # ou: python3.12 -m venv .venv && pip install -e .
cd $ADE/frontend && npm install

# Terminal 1 — backend (API + WS + SPA)
cd $ENGINE && lf serve                # imprime a X-API-Key gerada; --port 8000 default

# Terminal 2 — SPA em dev (hot reload, proxy p/ backend)
cd $ADE/frontend && VITE_API_KEY=<key-impressa> npm run dev   # http://127.0.0.1:5173
```

Modo produção local (SPA empacotada): `npm run sync:engine` (build + copia dist →
`$ENGINE/src/lf/ade/static/`) → `lf serve` e abrir `http://127.0.0.1:8000/app`.
Dev sem hot reload não precisa do Terminal 2.

## 2. Configuração

### Variáveis de ambiente

| Var | Default | Uso |
|---|---|---|
| `LF_API_API_KEY` | gerada no boot | auth REST/WS |
| `LF_API_HOST` / `LF_API_PORT` | `127.0.0.1` / `8000` | bind do servidor |
| `LF_CORS_ORIGINS` | `http://127.0.0.1:5173,http://localhost:5173` | CORS (M-04) |
| `LF_SPA_DIST` | auto-resolve | override do diretório da SPA |
| `LF_UI_ENABLED` | `1` | `0`/`--no-ui` desliga dashboard legado e SPA |
| `LF_API_TEST` | — | `1` = banco de teste isolado |
| `VITE_API_KEY` / `VITE_API_TARGET` | — | dev da SPA |

### `.loopforge/ade.yaml` (config central, E9)

```yaml
budget:    { max_usd: 10.0 }
hitl:      { timeout_seconds: 300, on_timeout: pause }   # pause|continue (ADR-0006)
providers: { primary: native, ollama_base_url: "http://localhost:11434" }
mcp_servers:
  - name: filesystem
    command: "npx"
    args: ["-y", "@modelcontextprotocol/server-filesystem", "/tmp"]
    tools_allowlist: ["read_file", "list_directory"]     # deny-by-default
    enabled: true
```

Editável também pela UI (Settings → `PATCH /api/v1/config`, validado).

## 3. Testes

```bash
# Backend (engine) — CI: ruff → mypy → pytest --cov-fail-under=75
cd $ENGINE && pytest tests/ --cov=src/lf --cov-fail-under=75
cd $ENGINE && pytest tests/test_event_envelope.py   # contrato do envelope v1 (novo)

# SPA
cd $ADE/frontend && npm run test        # Vitest
cd $ADE/frontend && npm run lint && npm run build
cd $ADE/frontend && npx playwright test # smoke E2E (requer backend mock ou demo)

# Fumaça manual ponta a ponta
lf run --mock --idea "Calculadora CLI"  # aparece na UI (M-07), sem custo
```

## 4. Release (pacote único, ADR-0001)

```bash
# 1. Build e sync da SPA
cd $ADE/frontend && npm run build && npm run sync:engine
# 2. CI/check de drift: hash de static/ == hash do dist commitado
#    (job de CI criado na B5 — hoje o engine só tem workflows Python)
# 3. Bump de versão do lf (semver único = versão da SPA)
cd $ENGINE && bump-my-version bump patch   # ou edit manual de pyproject
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
| SPA branca em `/app` | dist não sincronizado | `npm run sync:engine`; checar `LF_SPA_DIST` |
| Run "sumiu" da UI após restart | run CLI antiga (pré-M-07) | esperado: só runs novas têm linha canônica |
| `checkpoints.sqlite` gigante | arquivo **legado órfão** | pode apagar; checkpoints vivem em `trajectories.db` |
| Budget não dispara | run anterior à M-08 (sem `run_id` no ledger) | esperado em dados antigos |
| MCP server "down" | comando não encontrado | validar `command`/`args` do `ade.yaml`; logs do boot |

## 6. Limites operacionais conhecidos (V1)

- 1 run ativa + fila; sem paralelismo real.
- Sem prune/TTL de `trajectories.db` e `events` — export é o backup; limpeza
  manual via `DELETE /api/v1/runs/{id}`.
- Dashboard HTML legado: deprecated (banner), WS com fix de token; removido na
  próxima major.
