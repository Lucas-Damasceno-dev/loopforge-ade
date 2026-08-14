# ADR-0004: API `/api/v1` canônica, auth uniforme e CORS restrito

- **Status**: aceito/implementado (Fase A — M-03/M-18; CORS M-04 parcial — default `*` mantido; 2026-08-13)
- **Data**: 2026-08-07

## Contexto

Auditoria (Fase 1 implementada):

- **Gap de auth**: todas as rotas `/api/runs*` exigem `verify_authentication`,
  mas **nenhum** dos 4 routers `/api/v1/*` (trajectories, mcp, providers, config)
  tem auth (`app.py:443-458` sem `dependencies`). `PATCH /api/v1/config` reescreve
  o `ade.yaml` sem credencial; trajectories exporta estado completo de runs.
- **CORS permissivo demais**: `allow_origins=["*"]` **com**
  `allow_credentials=True` (`app.py:67-73`) — combinação que os browsers tratam
  como inválida/insegura e que o BLUEPRINT E5 já mandava restringir.
- **Prefixo inconsistente**: rotas novas em `/api/v1/*`, rotas de runs em
  `/api/*` sem versão.
- **Dashboard legado quebrado sob `lf serve`**: o HTML embutido conecta ao WS sem
  `?token=`, mas `lf serve` sempre gera API key → close 1008 (`dashboard.html:639`
  vs `serve.py:19-22`).

## Decisão

1. **Auth em tudo**: `verify_authentication` vira dependência de todos os routers
   `/api/*` (runs, v1/*). Exceções explícitas e documentadas: `GET /health`,
   `GET /api/genome|registry|retro` (read-only, sem dados de run — mantidas
   abertas para não quebrar o dashboard legado durante a transição; revisitadas
   quando o dashboard for removido, M-16).
2. **`/api/v1/runs*` canônico**: as rotas de runs passam a existir sob
   `/api/v1/runs*`. As rotas legadas `/api/runs*` ficam como alias que responde
   com header `Sunset` + `Deprecation`, removidas na próxima major do `lf`.
   `lf explore` e o dashboard legado continuam funcionando durante a deprecação.
3. **CORS configurável**: `LF_CORS_ORIGINS` (csv) restringe; **default mantido `*`
   (wildcard, sem `allow_credentials`)** — decisão revisada na implementação
   (M-04): o default restrito do ADR (`127.0.0.1:5173`) foi descartado para não
   quebrar fluxos de dev/consumidores; a restrição existe quando a env é definida.
   Em produção a SPA é same-origin (servida pelo próprio `lf`), então CORS é
   essencialmente um problema de dev.
4. **WS auth uniforme**: `?token=` obrigatório quando `LF_API_API_KEY` ativa, nos
   dois paths WS (já existe; manter). SPA injeta o token de `VITE_API_KEY`.
5. **Dashboard legado**: fix mínimo de token WS (ler `?api_key=` da URL ou
   prompt) + banner "deprecated — use a SPA em /app". Remoção na major seguinte
   (M-16). Sem investimento adicional.

## Alternativas consideradas

| Alternativa | Por que rejeitada |
|---|---|
| Só documentar o gap de auth (localhost é "seguro") | `lf serve` pode ser exposto por engano (`--host 0.0.0.0`); config write e trajectory export sem auth são inaceitáveis mesmo em LAN. |
| Mover tudo para `/api/v1` sem alias de deprecação | Quebra `lf explore`, dashboard legado e qualquer script do usuário sem necessidade — custo do alias é ~5 linhas. |
| API key por rota/granular (read vs write) | Over-engineering para dev solo; RBAC já é V2 (D2). |

## Consequências

**Positivas**: superfície de escrita protegida por uma única chave; CORS coerente
com E5; contrato versionado prepara evolução futura (v2 sem big bang).

**Negativas / custos**: clientes existentes precisam enviar `X-API-Key` também nas
rotas `/api/v1/*` (a SPA já envia; scripts do usuário, se houver, ganham 401 com
mensagem clara). Migração trivial.

## Referências

- `app.py:67-73` (CORS), `app.py:443-458` (routers sem auth), `auth.py`
- BLUEPRINT E5; spec Fase 2 F2.10
- `05-governanca-e-seguranca.md`
