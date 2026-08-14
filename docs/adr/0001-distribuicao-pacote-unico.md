# ADR-0001: Distribuição em pacote pip único (`lf` embute a SPA)

- **Status**: aceito/implementado (Fase B — B4/B5, 2026-08-13)
- **Data**: 2026-08-07
- **Decisor**: arquitetura ADE

## Contexto

O BLUEPRINT v5 (E1) decidiu: backend da ADE embutido no LoopForge (`src/lf`), SPA em
`web/loopforge-ade`, e **dois pacotes pip**: `loopforge-ade` (embute a SPA compilada,
depende de `lf`). A justificativa registrada foi "um pacote, uma versão, release
conjunto — sem versionamento cruzado de pacotes".

A contradição: a solução de dois pacotes **cria** exatamente o versionamento cruzado
que E1 queria evitar. `loopforge-ade==0.1.x` precisa declarar `lf>=6,<7` (ou pin
exato), e cada mudança de contrato API/WS exige coordenar duas publicações. O plano
da Fase 2 (T15, `docs/superpowers/plans/2026-08-06-ade-fase2.md:1296`) **planejou**
isso com `dependencies = ["loopforge @ file://../agentes/LoopForge"]` — que **não
funciona fora da máquina do autor** (path local não é publicável no PyPI).
**Verificado no código**: o `pyproject.toml` real do branch `feature/ade-fase2` é
apenas um esqueleto (`name`, `version`, `description`, `requires-python`) **sem
seção `dependencies`** — a dependência `file://` existe só no texto do plano,
nunca foi implementada.

> Convenção desta documentação: afirmações sobre o estado atual são marcadas como
> **"verificado no código"** (auditadas no fonte) ou **"planejado"** (existe apenas
> em spec/plano, ainda não implementado).

Fatos adicionais do ambiente: os dois repos vivem no mesmo diretório `portfolio/`
(não é monorepo), o desenvolvedor é solo, e o `lf` já é publicado no PyPI (v6.0.0).

## Decisão

**Um único pacote pip: `lf`.** O build da SPA (`frontend/dist/`) é copiado para
`agentes/LoopForge/src/lf/ade/static/` como *package data* do `lf`, e `lf serve`
monta esse diretório via `StaticFiles` (substituindo o dashboard HTML legado). O
repo `web/loopforge-ade` permanece como **fonte de verdade da SPA** (código React,
testes, docs), mas **não é publicado como pacote pip** — seu `pyproject.toml` é
**mantido como placeholder** (`loopforge-ade` 0.1.0, dist vazio; o embed real é
`lf.ade.static.dist` via `scripts/sync_dist.py` — M-15).

Mecanismo de sincronização:

1. `web/loopforge-ade/scripts/sync-dist.sh` (ou `npm run sync:engine`): builda a SPA
   e copia `frontend/dist/*` → `../../agentes/LoopForge/src/lf/ade/static/`.
   *Implementado como `agentes/LoopForge/scripts/sync_dist.py` (B5).*
2. `lf/api/spa.py::resolve_spa_dist()` resolve em ordem: (1) env `LF_SPA_DIST`,
   (2) `importlib.resources` em `lf.ade.static` (caso instalado via pip),
   (3) path de dev `web/loopforge-ade/frontend/dist` relativo ao repo.
   *Implementado — `spa.py` (B4) + mount `/app`.*
3. A versão da SPA **é** a versão do `lf` (semver único). CI do engine falha se
   `src/lf/ade/static/` divergir do `frontend/dist` do repo da SPA (check de hash
   em CI ou release script único que faz os dois passos).
   *Implementado — job `spa-drift.yml` (B5).*

## Alternativas consideradas

| Alternativa | Por que rejeitada |
|---|---|
| Dois pacotes pip (E1 original) | Recria a matriz de compatibilidade SPA×API; `file://` não publica; dois releases para cada mudança de contrato. |
| Git submodule da SPA dentro do engine | Adiciona atrito de submodule (clone recursivo, drift) sem ganho sobre o script de sync; CI precisa de submodule init. |
| Monorepo real (fundir os repos) | O diretório `portfolio/` tem 22 projetos independentes por convenção; fundir só estes dois quebra a organização do ambiente e o histórico git de ambos. |
| Servir a SPA de CDN/registry separado | Complexidade de release e offline (air-gapped é feature Tier 2); sem ganho para dev solo. |

## Consequências

**Positivas**
- `pip install lf` entrega engine + ADE completa: zero matriz de compatibilidade.
- Um release só (`scripts/release.sh` bumpa `lf`, synca dist, publica).
- Compatível com `lf serve` abrindo o browser direto na SPA (D1).

**Negativas / custos aceitos**
- Pacote `lf` cresce ~2–4 MB (assets estáticos). Aceito: irrisório para o público
  dev-solo; a GitHub Action que consome `lf` baixa os assets mas não os serve.
- Fix exclusivo de SPA exige bump de versão do `lf`. Aceito: release conjunto já
  era o objetivo declarado de E1.
- `web/loopforge-ade/pyproject.toml` (esqueleto, branch `feature/ade-fase2`) é
  **mantido como placeholder** do pacote `loopforge-ade` 0.1.0 (dist vazio, não
  publicado) — ver `09-mudancas-sobre-o-existente.md`, M-15.

## Referências

- BLUEPRINT v5, decisão E1 (seção 4.3) e D1 (seção 4.1)
- Plano Fase 2, T14 (`spa.py`) e T15 (packaging) — parcialmente substituídos
- `src/lf/api/app.py:51` (`create_app`, ponto de mount)
