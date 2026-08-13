# Artifacts Endpoint + Resume UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expor artifacts por nó (endpoint novo no motor) + Resume UI + InspectDrawer real na SPA.

**Architecture:** Dois repositórios independentes. Motor (LoopForge): novo router `src/lf/api/artifacts.py` que funde último checkpoint LangGraph (canais de artefato) + `llm_costs`/`lessons` (telemetry.sqlite). SPA (loopforge-ade): fn `getRunArtifacts` + store de override + banner/botão Resume + InspectDrawer consumindo o endpoint.

**Tech Stack:** Motor: FastAPI + SQLAlchemy async + LangGraph AsyncSqliteSaver + sqlite3. SPA: React 19 + zustand 5 + @tanstack/react-query 5 + Vitest.

**Spec:** `docs/superpowers/specs/2026-08-12-artifacts-resume-design.md` (repo loopforge-ade, commit `d4d4082`).

## Global Constraints

- **Motor** (repo `/home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge`):
  - Docs/comentários em PT-BR; strings de resposta/erro em EN (padrão existente: `"Run not found"`).
  - CI: `ruff check --select E,F,W,I,N,UP,SIM src/lf tests` → `mypy src/lf` → `pytest --cov=src/lf --cov-fail-under=75 tests/`. Python 3.11+3.12. Nenhuma dep nova.
  - Paths de DB resolvidos em call-time (`Path(".loopforge/...").resolve()`), nunca em import-time.
  - Auth no `include_router(..., dependencies=[Depends(verify_authentication)])` (padrão costs.py), não no router.
  - Schemas: `BaseModel` puro, `Field(default_factory=list)` para listas, campos aditivos no fim.
- **SPA** (repo `/home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade`):
  - Strings de UI em EN; comentários em PT-BR.
  - Sem deps novas. Tokens de cor via CSS vars (`--warn`, `--err`, `--info`, `--text-dim`, `--border`, `--bg-elev`).
  - Tests em `src/**/__tests__/` com `vi.mock` de api.ts; commit convencional (ex.: `feat(ui): …`).
  - Teste: `npm test` (vitest run). Commit por task.

---

# PARTE A — MOTOR (repo LoopForge)

## Task BE-1: Schemas + router skeleton + include + testes 404/vazio

**Files:**
- Modify: `src/lf/api/schemas.py` (append no fim)
- Create: `src/lf/api/artifacts.py`
- Modify: `src/lf/api/app.py` (seção de includes, antes de `mount_spa(app)`)
- Create: `tests/test_api_artifacts.py`

**Interfaces:**
- Consumes: `PipelineRun` (models.py), `create_async_checkpointer` (`lf.pipeline.checkpointer`), padrão de `costs.py`/`trajectories.py`.
- Produces: `ArtifactsResponse{run_id, node_artifacts, tokens, degraded, degraded_reason, circuit_breaker, lessons}` em `GET /api/v1/runs/{id}/artifacts`; helpers `_node_tokens(run_id)`, `_run_lessons(run_id)` (assinaturas na Task BE-2).

- [ ] **Step 1: Teste falhando**

Criar `tests/test_api_artifacts.py`:

```python
"""Testes do endpoint de artifacts (GET /api/v1/runs/{id}/artifacts)."""
import contextlib
import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import insert

from lf.api.app import create_app

TEST_DB_FILES = (
    ".loopforge/test_api.sqlite",
    ".loopforge/test_api.sqlite-wal",
    ".loopforge/test_api.sqlite-shm",
)

RUN_ID = "11111111-2222-3333-4444-555555555555"


@pytest_asyncio.fixture(autouse=True)
async def setup_test_db():
    """Banco API SQLite limpo (mesmo padrão de test_api_timeline.py)."""
    from lf.api.database import Base, engine

    os.environ["LF_API_TEST"] = "1"
    os.environ["LF_API_REQUIRE_AUTH"] = "false"
    for f in TEST_DB_FILES:
        with contextlib.suppress(Exception):
            os.remove(f)
    from lf.api.database import init_db

    await init_db()
    if engine is not None:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.drop_all)
            await conn.run_sync(Base.metadata.create_all)
    yield
    from lf.api.database import close_db

    await close_db()
    for f in TEST_DB_FILES[1:]:
        with contextlib.suppress(Exception):
            os.remove(f)
    os.environ.pop("LF_API_TEST", None)
    os.environ.pop("LF_API_REQUIRE_AUTH", None)


async def _insert_run(run_id: str) -> None:
    """Insere uma run direto na tabela pipeline_runs (sem pipeline)."""
    from lf.api.database import engine
    from lf.api.models import PipelineRun

    async with engine.begin() as conn:
        await conn.execute(
            insert(PipelineRun).values(id=run_id, idea="teste artifacts", stack="python", status="completed")
        )


@pytest.mark.asyncio
async def test_artifacts_404_run_inexistente():
    # SEM chdir: a URL do engine API é CWD-relative no connect-time e o
    # conftest.py já seta LF_API_TEST=1 para a sessão toda — a fixture local
    # init_db criou o test_api.sqlite na raiz; chdir quebraria o insert.
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get(f"/api/v1/runs/{RUN_ID}/artifacts")
        assert r.status_code == 404
        assert r.json()["detail"] == "Run not found"


@pytest.mark.asyncio
async def test_artifacts_200_vazio_sem_checkpoint():
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await _insert_run(RUN_ID)
        r = await ac.get(f"/api/v1/runs/{RUN_ID}/artifacts")
        assert r.status_code == 200
        data = r.json()
        assert data["run_id"] == RUN_ID
        assert data["node_artifacts"] == {}
        assert data["tokens"] == []
        assert data["degraded"] is False
        assert data["degraded_reason"] is None
        assert data["circuit_breaker"] is None
        assert data["lessons"] == []
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
pytest tests/test_api_artifacts.py -v
```
Expected: FAIL — `ImportError` (artifacts router ainda não existe / 404 com outra mensagem).

- [ ] **Step 3: Schemas — append em `src/lf/api/schemas.py`**

```python
# ─── Artifacts (InspectDrawer da SPA) ────────────────────────────────────
class ArtifactTokens(BaseModel):
    """Tokens + custo LLM agregados por nó (tabela llm_costs)."""

    node: str
    model: str | None = None
    prompt_tokens: int = 0
    completion_tokens: int = 0
    cost_usd: float = 0.0
    estimated: bool = False


class NodeArtifact(BaseModel):
    """Artifacts de um nó do DAG extraídos do último checkpoint."""

    output: dict[str, Any] = Field(default_factory=dict)


class CircuitBreakerSnapshot(BaseModel):
    """Snapshot serializável do CircuitBreaker (canal circuit_breaker)."""

    state: str | None = None
    consecutive_failures: int = 0
    total_iterations: int = 0
    total_cost: float = 0.0
    max_consecutive_failures: int | None = None
    max_iterations: int | None = None
    max_total_cost: float | None = None
    cost_per_iteration: float | None = None
    reset_timeout: float | None = None
    last_failure_time: float | None = None


class ArtifactLesson(BaseModel):
    """Lição aprendida associada à run (tabela lessons)."""

    id: int
    run_id: str
    lesson_text: str
    created_at: float


class ArtifactsResponse(BaseModel):
    """GET /api/v1/runs/{id}/artifacts — artifacts + tokens + estado da run."""

    run_id: str
    node_artifacts: dict[str, NodeArtifact] = Field(default_factory=dict)
    tokens: list[ArtifactTokens] = Field(default_factory=list)
    degraded: bool = False
    degraded_reason: str | None = None
    circuit_breaker: CircuitBreakerSnapshot | None = None
    lessons: list[ArtifactLesson] = Field(default_factory=list)
```

- [ ] **Step 4: Router — criar `src/lf/api/artifacts.py`** (skeleton completo da Task BE-2 já com as helpers; nesta task só o caminho vazio importa, mas escreva o arquivo inteiro de uma vez):

```python
"""Endpoint de artifacts por run — nó → output + tokens + estado da run.

Fonte dupla: último checkpoint LangGraph (trajectories.db — canais de
artefato do GraphState) + llm_costs/lessons (telemetry.sqlite). Padrão de
paths call-time e PRAGMA busy_timeout herdado de costs.py/trajectories.py.
"""
import sqlite3
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from lf.api.database import get_session
from lf.api.models import PipelineRun
from lf.api.schemas import (
    ArtifactLesson,
    ArtifactTokens,
    ArtifactsResponse,
    CircuitBreakerSnapshot,
    NodeArtifact,
)

artifacts_router = APIRouter(prefix="/api/v1", tags=["Artifacts"])

# Canais de artefato por nó canônico do DAG (ordem = ordem de exibição).
# security_report/devops_report são markdown (str) — renomeados com sufixo
# _md no output para não colidir com os canais estruturados homônimos
# security_review/devops_manifest (dicts).
NODE_CHANNELS: dict[str, tuple[str, ...]] = {
    "cpo": ("epic",),
    "pm": ("user_stories",),
    "tech_lead": ("tech_spec", "stack_rationale"),
    "test_writer": ("contract_tests",),
    "developer": ("code",),
    "qa": ("test_report",),
    "parallel_audit": ("security_review", "devops_manifest", "security_report", "devops_report"),
}

_MD_RENAMES = {"security_report": "security_report_md", "devops_report": "devops_report_md"}


def _trajectories_db() -> Path:
    """Caminho do banco de trajetórias resolvido em call-time."""
    return Path(".loopforge/trajectories.db").resolve()


def _telemetry_db() -> Path:
    """Caminho do telemetry.sqlite resolvido em call-time."""
    return Path(".loopforge/telemetry.sqlite").resolve()


def _node_tokens(run_id: str) -> list[ArtifactTokens]:
    """Tokens + custo LLM agregados por nó (llm_costs → GROUP BY node, model)."""
    db_path = _telemetry_db()
    if not db_path.exists():
        return []
    try:
        conn = sqlite3.connect(str(db_path), timeout=10.0)
        try:
            conn.execute("PRAGMA busy_timeout=5000")
            rows = conn.execute(
                "SELECT node, model, SUM(prompt_tokens), SUM(completion_tokens), "
                "SUM(cost_usd), MAX(estimated) FROM llm_costs "
                "WHERE run_id = ? GROUP BY node, model ORDER BY node",
                (run_id,),
            ).fetchall()
            return [
                ArtifactTokens(
                    node=str(row[0]),
                    model=str(row[1]) if row[1] else None,
                    prompt_tokens=int(row[2] or 0),
                    completion_tokens=int(row[3] or 0),
                    cost_usd=round(float(row[4] or 0.0), 6),
                    estimated=bool(row[5]),
                )
                for row in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


def _run_lessons(run_id: str) -> list[ArtifactLesson]:
    """Lições aprendidas da run (tabela lessons, mais recentes primeiro)."""
    db_path = _telemetry_db()
    if not db_path.exists():
        return []
    try:
        conn = sqlite3.connect(str(db_path), timeout=10.0)
        try:
            conn.execute("PRAGMA busy_timeout=5000")
            rows = conn.execute(
                "SELECT id, run_id, lesson_text, created_at FROM lessons "
                "WHERE run_id = ? ORDER BY created_at DESC",
                (run_id,),
            ).fetchall()
            return [
                ArtifactLesson(
                    id=int(row[0]),
                    run_id=str(row[1]),
                    lesson_text=str(row[2]),
                    created_at=float(row[3]),
                )
                for row in rows
            ]
        finally:
            conn.close()
    except sqlite3.Error:
        return []


@artifacts_router.get("/runs/{run_id}/artifacts", response_model=ArtifactsResponse)
async def get_run_artifacts(
    run_id: str,
    session: AsyncSession = Depends(get_session),
) -> ArtifactsResponse:
    """Artifacts por nó + tokens + estado de auditoria da run (404 se não existe)."""
    run = await session.get(PipelineRun, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    from lf.pipeline.checkpointer import create_async_checkpointer

    node_artifacts: dict[str, NodeArtifact] = {}
    degraded = False
    degraded_reason: str | None = None
    circuit_breaker: CircuitBreakerSnapshot | None = None

    saver = create_async_checkpointer(_trajectories_db())
    try:
        await saver.setup()
        thread_id = f"run-{run_id}"
        async with saver.conn.execute(
            "SELECT checkpoint_id FROM checkpoints WHERE thread_id = ? "
            "ORDER BY checkpoint_id DESC LIMIT 1",
            (thread_id,),
        ) as cur:
            row = await cur.fetchone()
        if row is not None:
            value = await saver.aget_tuple(
                {"configurable": {"thread_id": thread_id, "checkpoint_id": row[0]}}
            )
            if value is not None:
                channels = value.checkpoint.get("channel_values", {}) or {}
                for node, keys in NODE_CHANNELS.items():
                    output = {k: channels[k] for k in keys if channels.get(k) not in (None, "")}
                    if output:
                        for src, dst in _MD_RENAMES.items():
                            if src in output:
                                output[dst] = output.pop(src)
                        node_artifacts[node] = NodeArtifact(output=output)
                degraded = bool(channels.get("degraded", False))
                degraded_reason = channels.get("degraded_reason")
                cb = channels.get("circuit_breaker")
                if isinstance(cb, dict):
                    circuit_breaker = CircuitBreakerSnapshot(**cb)
    finally:
        await saver.conn.close()

    return ArtifactsResponse(
        run_id=run_id,
        node_artifacts=node_artifacts,
        tokens=_node_tokens(run_id),
        degraded=degraded,
        degraded_reason=degraded_reason,
        circuit_breaker=circuit_breaker,
        lessons=_run_lessons(run_id),
    )
```

- [ ] **Step 5: Include em `src/lf/api/app.py`**

Na seção de routers, antes de `mount_spa(app)`:

```python
    # ─── Artifacts (SPA InspectDrawer) ────────────────────────────────
    from lf.api.artifacts import artifacts_router

    app.include_router(artifacts_router, dependencies=[Depends(verify_authentication)])
```

- [ ] **Step 6: Rodar testes**

```bash
pytest tests/test_api_artifacts.py -v
```
Expected: PASS (2 testes).

- [ ] **Step 7: Lint + mypy**

```bash
ruff check --select E,F,W,I,N,UP,SIM src/lf tests
mypy src/lf
```
Expected: limpos.

- [ ] **Step 8: Commit**

```bash
git add src/lf/api/schemas.py src/lf/api/artifacts.py src/lf/api/app.py tests/test_api_artifacts.py
git commit -m "feat(api): endpoint GET /runs/{id}/artifacts (skeleton + schemas)"
```

## Task BE-2: Mapeamento de artifacts + tokens + lessons (com checkpoint seedado)

**Files:**
- Modify: `tests/test_api_artifacts.py` (adiciona testes + seed helpers)

**Interfaces:**
- Consumes: `ArtifactsResponse` (BE-1), padrão `_seed_thread` de `test_api_trajectories.py`.
- Produces: contrato de `node_artifacts` por nó (chaves exatas abaixo) consumido pela SPA (FE-4).

- [ ] **Step 1: Testes falhando** — append em `tests/test_api_artifacts.py`:

```python
async def _seed_thread(db_path: Path, thread_id: str, checkpoint_id: str, channels: dict) -> None:
    """Grava um checkpoint direto no checkpointer em db_path (padrão test_api_trajectories)."""
    from lf.pipeline.checkpointer import create_async_checkpointer

    saver = create_async_checkpointer(db_path)
    try:
        await saver.setup()
        await saver.aput(
            {"configurable": {"thread_id": thread_id, "checkpoint_ns": ""}},
            {"id": checkpoint_id, "v": 1, "ts": "2026-08-05T00:00:00Z", "channel_values": channels},
            {"source": "loop", "step": 0},
            {},
        )
    finally:
        await saver.conn.close()


def _seed_telemetry(db_path: Path, run_id: str) -> None:
    """Cria llm_costs + lessons em telemetry.sqlite (db_path) com dados da run."""
    import sqlite3

    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute(
            "CREATE TABLE IF NOT EXISTS llm_costs (id INTEGER PRIMARY KEY AUTOINCREMENT, model TEXT, "
            "prompt_tokens INTEGER, completion_tokens INTEGER, cost_usd REAL, created_at REAL, "
            "run_id TEXT, node TEXT, estimated INTEGER DEFAULT 0)"
        )
        conn.execute(
            "CREATE TABLE IF NOT EXISTS lessons (id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, "
            "stack TEXT NOT NULL, idea TEXT NOT NULL, lesson_text TEXT NOT NULL, created_at REAL NOT NULL)"
        )
        conn.execute(
            "INSERT INTO llm_costs (model, prompt_tokens, completion_tokens, cost_usd, created_at, run_id, node, estimated) "
            "VALUES ('oc/test', 100, 50, 0.01, 1.0, ?, 'developer', 0)",
            (run_id,),
        )
        conn.execute(
            "INSERT INTO llm_costs (model, prompt_tokens, completion_tokens, cost_usd, created_at, run_id, node, estimated) "
            "VALUES ('oc/test', 20, 10, 0.002, 2.0, ?, 'qa', 1)",
            (run_id,),
        )
        conn.execute(
            "INSERT INTO lessons (run_id, stack, idea, lesson_text, created_at) "
            "VALUES (?, 'python', 'teste', 'lição de teste', 3.0)",
            (run_id,),
        )
        conn.commit()
    finally:
        conn.close()


@pytest.mark.asyncio
async def test_artifacts_mapeia_canais_por_no(tmp_path, monkeypatch):
    # Isolamento SEM chdir (engine API é CWD-relative no connect-time):
    # monkeypatch das helpers de path do módulo aponta para tmp_path.
    monkeypatch.setattr("lf.api.artifacts._trajectories_db", lambda: tmp_path / "trajectories.db")
    monkeypatch.setattr("lf.api.artifacts._telemetry_db", lambda: tmp_path / "telemetry.sqlite")
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        await _insert_run(RUN_ID)
        await _seed_thread(
            tmp_path / "trajectories.db",
            f"run-{RUN_ID}",
            "seed-1",
            {
                "epic": {"title": "Login"},
                "tech_spec": "FastAPI + JWT",
                "code": "def main():\n    pass\n",
                "test_report": {"summary": {"tests_passed": 1, "tests_failed": 0, "total_tests": 1}},
                "security_review": {"vulnerabilities_found": []},
                "devops_manifest": {"deployability_score": 90, "status": "ok", "dockerfile_created": True,
                                    "ci_workflow_created": True, "recommendations": []},
                "security_report": "## Security (md)",
                "devops_report": "## DevOps (md)",
                "degraded": True,
                "degraded_reason": "mock fallback",
                "circuit_breaker": {"state": "closed", "consecutive_failures": 1, "total_iterations": 3,
                                    "total_cost": 0.5, "max_consecutive_failures": 5, "max_iterations": 20,
                                    "max_total_cost": 10.0, "cost_per_iteration": 0.05, "reset_timeout": 300,
                                    "last_failure_time": None},
            },
        )
        _seed_telemetry(tmp_path / "telemetry.sqlite", RUN_ID)

        r = await ac.get(f"/api/v1/runs/{RUN_ID}/artifacts")
        assert r.status_code == 200
        data = r.json()

        # Mapeamento por nó
        assert data["node_artifacts"]["cpo"]["output"]["epic"] == {"title": "Login"}
        assert data["node_artifacts"]["tech_lead"]["output"]["tech_spec"] == "FastAPI + JWT"
        assert data["node_artifacts"]["developer"]["output"]["code"].startswith("def main")
        assert data["node_artifacts"]["qa"]["output"]["test_report"]["summary"]["tests_passed"] == 1
        pa = data["node_artifacts"]["parallel_audit"]["output"]
        assert pa["security_review"]["vulnerabilities_found"] == []
        assert pa["devops_manifest"]["deployability_score"] == 90
        # markdown renomeado com sufixo _md
        assert pa["security_report_md"] == "## Security (md)"
        assert pa["devops_report_md"] == "## DevOps (md)"
        assert "security_report" not in pa

        # Tokens agrupados por nó
        tokens = {t["node"]: t for t in data["tokens"]}
        assert tokens["developer"]["prompt_tokens"] == 100
        assert tokens["developer"]["completion_tokens"] == 50
        assert tokens["developer"]["cost_usd"] == 0.01
        assert tokens["qa"]["estimated"] is True

        # Estado da run
        assert data["degraded"] is True
        assert data["degraded_reason"] == "mock fallback"
        assert data["circuit_breaker"]["state"] == "closed"
        assert data["circuit_breaker"]["consecutive_failures"] == 1
        assert len(data["lessons"]) == 1
        assert data["lessons"][0]["lesson_text"] == "lição de teste"
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
pytest tests/test_api_artifacts.py::test_artifacts_mapeia_canais_por_no -v
```
Expected: FAIL (mapeamento ainda não escrito — mas como BE-1 já entregou o arquivo completo, se PASSAR vá direto ao Step 4; a implementação de BE-1 já contém o mapeamento).

- [ ] **Step 3: Implementar mapeamento** (se necessário)

O código de `src/lf/api/artifacts.py` da Task BE-1 já contém: loop `NODE_CHANNELS`, rename `_MD_RENAMES`, `degraded`/`degraded_reason`, `circuit_breaker` via `CircuitBreakerSnapshot(**cb)`, `_node_tokens`, `_run_lessons`. Ajuste apenas se o teste revelar divergência.

- [ ] **Step 4: Rodar suíte do arquivo**

```bash
pytest tests/test_api_artifacts.py -v
```
Expected: PASS (3 testes).

- [ ] **Step 5: Lint + mypy**

```bash
ruff check --select E,F,W,I,N,UP,SIM src/lf tests && mypy src/lf
```
Expected: limpos.

- [ ] **Step 6: Commit**

```bash
git add tests/test_api_artifacts.py src/lf/api/artifacts.py
git commit -m "test(api): mapeamento artifacts por nó + tokens + lessons"
```

## Task BE-3: E2E com pipeline mock

**Files:**
- Modify: `tests/test_api_artifacts.py` (teste E2E)

**Interfaces:**
- Consumes: `POST /api/runs` com `mock_llm=True` (padrão `_run_mock_pipeline` de test_api_timeline.py).

- [ ] **Step 1: Teste falhando** — append:

```python
async def _run_mock_pipeline(client: AsyncClient, idea: str = "Artifacts") -> tuple[str, str]:
    """Cria e espera uma pipeline mock terminar; devolve (run_id, status)."""
    resp = await client.post("/api/runs", json={"idea": idea, "stack": "python", "mock_llm": True})
    assert resp.status_code == 201
    run_id = resp.json()["id"]
    waited = 0.0
    while waited < 30.0:
        status = (await client.get(f"/api/runs/{run_id}")).json()["status"]
        if status in ("completed", "failed", "paused"):
            return run_id, status
        await asyncio.sleep(0.2)
        waited += 0.2
    raise AssertionError(f"run {run_id} não terminou em 30s")


@pytest.mark.asyncio
async def test_artifacts_e2e_pipeline_mock(tmp_path, monkeypatch):
    """Pipeline mock completa → artifacts com nós do fluxo full + tokens."""
    monkeypatch.chdir(tmp_path)
    app = create_app()
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        run_id, status = await _run_mock_pipeline(ac, idea="Artifacts e2e")
        assert status == "completed"

        r = await ac.get(f"/api/v1/runs/{run_id}/artifacts")
        assert r.status_code == 200
        data = r.json()
        assert data["run_id"] == run_id
        # Fluxo full: cpo→…→parallel_audit escreve artifact em cada nó
        assert "cpo" in data["node_artifacts"]
        assert "developer" in data["node_artifacts"]
        assert "parallel_audit" in data["node_artifacts"]
        assert "circuit_breaker" in data and data["circuit_breaker"] is not None
        assert data["degraded"] is True  # mock → fallback degradado
```

- [ ] **Step 2: Rodar para ver falhar/passar**

```bash
pytest tests/test_api_artifacts.py::test_artifacts_e2e_pipeline_mock -v
```
Expected: PASS (a implementação já existe). Se FAIL: corrigir `artifacts.py`/fixture — causa provável: canal `degraded` ausente no estado mock (relaxe o assert para aceitar `False` e reporte no resultado da task).

- [ ] **Step 3: Suíte completa do motor**

```bash
pytest tests/test_api_artifacts.py -v && pytest tests/test_api_trajectories.py tests/test_api_timeline.py -q
```
Expected: tudo verde (garante que nada existente quebrou).

- [ ] **Step 4: Commit**

```bash
git add tests/test_api_artifacts.py
git commit -m "test(api): e2e artifacts com pipeline mock"
```

---

# PARTE B — SPA (repo loopforge-ade)

> Rodar tudo em `frontend/` (workdir). Verificar: `npm test`.

## Task FE-1: Tipos + `getRunArtifacts`

**Files:**
- Modify: `frontend/src/shared/lib/types.ts` (append no fim)
- Modify: `frontend/src/shared/lib/api.ts` (após `getRunCost`, ~linha 109)
- Modify: `frontend/src/shared/lib/__tests__/api.test.ts` (append)

**Interfaces:**
- Produces: `ArtifactsResponse`, `ArtifactTokens`, `NodeArtifact`, `CircuitBreakerSnapshot`, `ArtifactLesson` (types) + `getRunArtifacts(id)` (api). Consumidos por FE-4.

- [ ] **Step 1: Tipos** — append em `types.ts`:

```ts
// ─── Artifacts (InspectDrawer real) — GET /api/v1/runs/{id}/artifacts ─────
// Espelha src/lf/api/schemas.py (ArtifactsResponse, ArtifactTokens,
// NodeArtifact, CircuitBreakerSnapshot, ArtifactLesson).

/** Tokens + custo LLM agregados por nó (tabela llm_costs). */
export interface ArtifactTokens {
  node: string
  model?: string | null
  prompt_tokens: number
  completion_tokens: number
  cost_usd: number
  estimated: boolean
}

/** Output de um nó do DAG (canais do último checkpoint). */
export interface NodeArtifact {
  output: Record<string, unknown>
}

/** Snapshot serializável do CircuitBreaker (canal circuit_breaker). */
export interface CircuitBreakerSnapshot {
  state?: string | null
  consecutive_failures: number
  total_iterations: number
  total_cost: number
  max_consecutive_failures?: number | null
  max_iterations?: number | null
  max_total_cost?: number | null
  cost_per_iteration?: number | null
  reset_timeout?: number | null
  last_failure_time?: number | null
}

/** Lição aprendida associada à run (tabela lessons). */
export interface ArtifactLesson {
  id: number
  run_id: string
  lesson_text: string
  created_at: number
}

/** Resposta de GET /runs/{id}/artifacts. */
export interface ArtifactsResponse {
  run_id: string
  node_artifacts: Record<string, NodeArtifact>
  tokens: ArtifactTokens[]
  degraded: boolean
  degraded_reason?: string | null
  circuit_breaker?: CircuitBreakerSnapshot | null
  lessons: ArtifactLesson[]
}
```

- [ ] **Step 2: fn api** — em `api.ts` após `getRunCost` (linha 109):

```ts
// Artifacts por nó (InspectDrawer real): GET /api/v1/runs/{id}/artifacts —
// último checkpoint (canais de artefato) + llm_costs (tokens) + lessons.
export const getRunArtifacts = (id: string) => apiFetch<ArtifactsResponse>(`/runs/${encodeURIComponent(id)}/artifacts`)
```

- [ ] **Step 3: Import do tipo** — atualizar linha 1 de `api.ts`:

```ts
import type { AdeConfig, ArtifactsResponse, BudgetOverrideRequest, Checkpoint, CostResponse, CreateRunInput, DecisionRecord, DeepPartial, EvalsLeaderboard, EvalsSummary, ForkResult, GitInfo, HealthStatus, ImportResult, Lesson, LessonCreate, LessonDeleteResult, LessonUpdate, McpServer, McpTool, Run, RunListResponse, TimelineResponse, TrajectoryExport } from './types'
```

- [ ] **Step 4: Teste** — append em `api.test.ts` (seguir padrão de mock do fetch existente no arquivo; se o arquivo usar `vi.stubGlobal('fetch', ...)`, reusar):

```ts
it('getRunArtifacts chama GET /runs/{id}/artifacts', async () => {
  const payload: ArtifactsResponse = { run_id: 'r1', node_artifacts: {}, tokens: [], degraded: false, lessons: [] }
  // mock do fetch conforme padrão já usado no arquivo
  const res = await getRunArtifacts('r1')
  expect(res.run_id).toBe('r1')
  expect(res.node_artifacts).toEqual({})
})
```

- [ ] **Step 5: Rodar**

```bash
npm test
```
Expected: PASS (suíte toda; nenhum teste antigo quebra).

- [ ] **Step 6: Commit**

```bash
git add src/shared/lib/types.ts src/shared/lib/api.ts src/shared/lib/__tests__/api.test.ts
git commit -m "feat(api): getRunArtifacts + tipos ArtifactsResponse"
```

## Task FE-2: Store de budget override + CostBar refactor

**Files:**
- Create: `frontend/src/features/costs/budgetOverrideStore.ts`
- Create: `frontend/src/features/costs/__tests__/budgetOverrideStore.test.ts`
- Modify: `frontend/src/features/costs/CostBar.tsx` (substituir `overrideOpen` local pelo store)

**Interfaces:**
- Consumes: `effectiveRunId` do CostBar (existente).
- Produces: `useBudgetOverrideStore` → `{ open, runId, openOverride(runId), closeOverride() }`. Consumido por FE-3 (banner) e CostBar.

- [ ] **Step 1: Store** — criar `budgetOverrideStore.ts`:

```ts
import { create } from 'zustand'

// Estado de abertura do modal de budget override — compartilhado entre o
// CostBar (dono do modal) e o banner de run pausada (RunsWorkspace).
// runId guarda qual run o modal deve operar quando aberto pelo banner.
interface BudgetOverrideState {
  open: boolean
  runId: string | null
  openOverride: (runId: string) => void
  closeOverride: () => void
}

export const useBudgetOverrideStore = create<BudgetOverrideState>((set) => ({
  open: false,
  runId: null,
  openOverride: (runId) => set({ open: true, runId }),
  closeOverride: () => set({ open: false, runId: null }),
}))
```

- [ ] **Step 2: Teste do store** — criar `__tests__/budgetOverrideStore.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import { useBudgetOverrideStore } from '../budgetOverrideStore'

describe('useBudgetOverrideStore', () => {
  beforeEach(() => {
    useBudgetOverrideStore.setState({ open: false, runId: null })
  })

  it('openOverride define open + runId', () => {
    useBudgetOverrideStore.getState().openOverride('r1')
    expect(useBudgetOverrideStore.getState()).toMatchObject({ open: true, runId: 'r1' })
  })

  it('closeOverride limpa open + runId', () => {
    useBudgetOverrideStore.getState().openOverride('r1')
    useBudgetOverrideStore.getState().closeOverride()
    expect(useBudgetOverrideStore.getState()).toMatchObject({ open: false, runId: null })
  })
})
```

- [ ] **Step 3: Refactor do CostBar** — mudanças exatas:

1. Import: `import { useBudgetOverrideStore } from './budgetOverrideStore'`
2. Remover `const [overrideOpen, setOverrideOpen] = useState(false)` (linha 52).
3. Adicionar dentro do componente:

```tsx
const overrideOpen = useBudgetOverrideStore((s) => s.open)
const openOverride = useBudgetOverrideStore((s) => s.openOverride)
const closeOverride = useBudgetOverrideStore((s) => s.closeOverride)
```

4. Substituir `setOverrideOpen(true)` → `openOverride(effectiveRunId as string)` (2 ocorrências: botão Override linha 125 e botão "Give override" linha 140).
5. Substituir `setOverrideOpen(false)` → `closeOverride()` (3 ocorrências: submit linha 97, Cancel linha 170, Modal onClose linha 149).

- [ ] **Step 4: Rodar testes de custos + suite**

```bash
npx vitest run src/features/costs
npm test
```
Expected: PASS (CostBar.test.tsx existente segue verde).

- [ ] **Step 5: Commit**

```bash
git add src/features/costs/budgetOverrideStore.ts src/features/costs/__tests__/budgetOverrideStore.test.ts src/features/costs/CostBar.tsx
git commit -m "feat(costs): store compartilhado de budget override + refactor CostBar"
```

## Task FE-3: Resume UI (banner + toolbar) + wsBridge

**Files:**
- Modify: `frontend/src/features/runs/RunsWorkspace.tsx`
- Modify: `frontend/src/stores/wsBridge.ts` (case `pipeline_resumed`, linhas 141-143)
- Modify: `frontend/src/features/runs/__tests__/RunsWorkspace.test.tsx`
- Modify: `frontend/src/stores/__tests__/wsBridge.test.ts`

**Interfaces:**
- Consumes: `resumeRun` (api.ts:101 existente), `useBudgetOverrideStore.openOverride` (FE-2), `updateStatus`/`upsertRun` (runsStore), `Alert`/`Button` (ui).
- Produces: botão `Resume` na toolbar + banner `run-paused-banner` no workspace; `pipeline_resumed` deixa de ser log-only.

- [ ] **Step 1: Testes falhando** — em `RunsWorkspace.test.tsx`:

Atualizar o `vi.mock` para incluir `resumeRun`:

```tsx
vi.mock('../../../shared/lib/api', () => ({
  listRuns: vi.fn(),
  createRun: vi.fn(),
  resumeRun: vi.fn(),
}))
```

Adicionar testes (usar padrão existente de render; `useRunsStore.setState` com run paused):

```tsx
it('mostra botão Resume na toolbar quando a run ativa está paused', () => {
  useRunsStore.setState({
    runs: [{ id: 'r1', idea: 'x', stack: 'python', status: 'paused' }],
    activeRunId: 'r1',
    queue: [],
    past: [],
    future: [],
  })
  render(<RunsWorkspace />)
  expect(screen.getByRole('button', { name: /^resume$/i })).toBeInTheDocument()
})

it('banner de paused oferece Resume e Budget override', () => {
  useRunsStore.setState({
    runs: [{ id: 'r1', idea: 'x', stack: 'python', status: 'paused' }],
    activeRunId: 'r1',
    queue: [],
    past: [],
    future: [],
  })
  render(<RunsWorkspace />)
  expect(screen.getByTestId('run-paused-banner')).toBeInTheDocument()
  expect(screen.getByRole('button', { name: /budget override/i })).toBeInTheDocument()
})

it('clique em Resume chama resumeRun e upserta a run', async () => {
  useRunsStore.setState({
    runs: [{ id: 'r1', idea: 'x', stack: 'python', status: 'paused' }],
    activeRunId: 'r1',
    queue: [],
    past: [],
    future: [],
  })
  vi.mocked(resumeRun).mockResolvedValue({ id: 'r1', idea: 'x', stack: 'python', status: 'running' })
  render(<RunsWorkspace />)
  fireEvent.click(screen.getByRole('button', { name: /^resume$/i }))
  await waitFor(() => {
    expect(resumeRun).toHaveBeenCalledWith('r1')
    expect(useRunsStore.getState().runs[0].status).toBe('running')
  })
})
```

Em `wsBridge.test.ts`:

```ts
it('pipeline_resumed atualiza status da run para running', () => {
  useRunsStore.setState({ runs: [{ id: 'r1', idea: 'x', stack: 'python', status: 'paused' }], activeRunId: 'r1', queue: [], past: [], future: [] })
  dispatchWsEvent({ event: 'pipeline_resumed', run_id: 'r1', payload: {} })
  expect(useRunsStore.getState().runs[0].status).toBe('running')
})
```

(Ajustar import/types do evento conforme o arquivo existente usa.)

- [ ] **Step 2: Rodar para ver falhar**

```bash
npx vitest run src/features/runs/__tests__/RunsWorkspace.test.tsx src/stores/__tests__/wsBridge.test.ts
```
Expected: FAIL.

- [ ] **Step 3: wsBridge** — substituir:

```ts
    case 'pipeline_resumed':
      log('info', 'pipeline resumed')
      break
```

por:

```ts
    case 'pipeline_resumed': {
      const id = str(e.run_id)
      if (id) useRunsStore.getState().updateStatus(id, 'running')
      log('info', 'pipeline resumed', undefined, id)
      break
    }
```

- [ ] **Step 4: RunsWorkspace** — mudanças exatas:

Imports:

```tsx
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { listRuns, resumeRun } from '../../shared/lib/api'
import { useBudgetOverrideStore } from '../costs/budgetOverrideStore'
import { Alert } from '../../shared/ui/Alert'
```

Dentro do componente, após `const activeRun = ...`:

```tsx
const queryClient = useQueryClient()
const openOverride = useBudgetOverrideStore((s) => s.openOverride)
const [resuming, setResuming] = useState(false)

const activeRunPaused = activeRun?.status === 'paused'

const handleResume = async () => {
  if (!activeRun) return
  setResuming(true)
  try {
    const updated = await resumeRun(activeRun.id)
    useRunsStore.getState().upsertRun(updated)
    queryClient.invalidateQueries({ queryKey: ['run-cost', activeRun.id] })
  } catch {
    // Erro de resume: mantém status paused (o log do console já cobre).
  } finally {
    setResuming(false)
  }
}
```

Toolbar (div linha 65): adicionar antes do `<Button variant="ghost" ...>Run demo</Button>`:

```tsx
{activeRunPaused && (
  <Button size="sm" variant="primary" onClick={handleResume} disabled={resuming}>
    {resuming ? 'Resuming…' : 'Resume'}
  </Button>
)}
```

Banner: dentro do `<div className="relative flex-1 overflow-hidden">` (linha 73), ANTES do `{activeRun ? ...}`:

```tsx
{activeRunPaused && activeRun && (
  <Alert tone="warn" data-testid="run-paused-banner">
    Run paused — budget hard-stop reached. Adjust budget or resume.
    <span className="ml-2 inline-flex gap-2">
      <Button size="sm" variant="primary" onClick={handleResume} disabled={resuming}>
        {resuming ? 'Resuming…' : 'Resume'}
      </Button>
      <Button size="sm" variant="subtle" onClick={() => openOverride(activeRun.id)}>
        Budget override
      </Button>
    </span>
  </Alert>
)}
```

- [ ] **Step 5: Rodar**

```bash
npx vitest run src/features/runs/__tests__/RunsWorkspace.test.tsx src/stores/__tests__/wsBridge.test.ts
npm test
```
Expected: PASS completo.

- [ ] **Step 6: Commit**

```bash
git add src/features/runs/RunsWorkspace.tsx src/stores/wsBridge.ts src/features/runs/__tests__/RunsWorkspace.test.tsx src/stores/__tests__/wsBridge.test.ts
git commit -m "feat(runs): resume UI (toolbar + banner) + wsBridge pipeline_resumed"
```

## Task FE-4: InspectDrawer real (payloads, tokens, audit, CB)

**Files:**
- Modify: `frontend/src/features/dag/InspectDrawer.tsx` (reescrever seções placeholder)
- Modify: `frontend/src/features/dag/__tests__/InspectDrawer.test.tsx` (reescrever asserts)

**Interfaces:**
- Consumes: `getRunArtifacts`/`ArtifactsResponse` (FE-1), `useRunsStore.activeRunId`, `useCanvasStore.selectedNodeId`, `Badge`, `SectionTitle` (existentes).
- Produces: drawer com seções reais; nenhum consumidor novo.

- [ ] **Step 1: Testes falhando** — reescrever `InspectDrawer.test.tsx` (substituir conteúdo por versão que mocka artifacts):

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { InspectDrawer } from '../InspectDrawer'
import { getRunArtifacts } from '../../../shared/lib/api'
import { useCanvasStore } from '../../../stores/canvasStore'
import { useRunsStore } from '../../../stores/runsStore'
import type { ArtifactsResponse } from '../../../shared/lib/types'

vi.mock('../../../shared/lib/api', () => ({ getRunArtifacts: vi.fn() }))

const queryClient = new QueryClient()

const ARTIFACTS: ArtifactsResponse = {
  run_id: 'r1',
  node_artifacts: {
    developer: { output: { code: 'def main():\n    pass\n' } },
    parallel_audit: {
      output: {
        security_review: {
          vulnerabilities_found: [{ severity: 'high', type: 'SQLi', description: 'query raw' }],
        },
        devops_manifest: {
          deployability_score: 90,
          status: 'ok',
          dockerfile_created: true,
          ci_workflow_created: true,
          recommendations: ['add healthcheck'],
        },
      },
    },
  },
  tokens: [{ node: 'developer', model: 'oc/test', prompt_tokens: 100, completion_tokens: 50, cost_usd: 0.01, estimated: false }],
  degraded: true,
  degraded_reason: 'mock fallback',
  circuit_breaker: { state: 'closed', consecutive_failures: 1, total_iterations: 3, total_cost: 0.5 },
  lessons: [],
}

function renderDrawer(node: string) {
  useRunsStore.setState({ runs: [], activeRunId: 'r1', queue: [], past: [], future: [] })
  useCanvasStore.setState({ selectedNodeId: node, nodeStatus: { [node]: { status: 'approved', attemptCount: 1 } } })
  return render(
    <QueryClientProvider client={queryClient}>
      <InspectDrawer />
    </QueryClientProvider>,
  )
}

describe('InspectDrawer (real artifacts)', () => {
  beforeEach(() => {
    vi.mocked(getRunArtifacts).mockReset()
    vi.mocked(getRunArtifacts).mockResolvedValue(ARTIFACTS)
    queryClient.clear()
  })

  it('mostra output do nó em JSON (developer → code)', async () => {
    renderDrawer('developer')
    expect(await screen.findByText(/def main/)).toBeInTheDocument()
  })

  it('mostra tokens do nó', async () => {
    renderDrawer('developer')
    expect(await screen.findByText(/100 \/ 50/)).toBeInTheDocument()
  })

  it('sem artifacts mostra "No data recorded" (não o placeholder V1)', async () => {
    vi.mocked(getRunArtifacts).mockResolvedValue({ run_id: 'r1', node_artifacts: {}, tokens: [], degraded: false, lessons: [] })
    renderDrawer('pm')
    expect(await screen.findByText(/no data recorded/i)).toBeInTheDocument()
  })

  it('parallel_audit lista vulnerabilidades + devops score', async () => {
    renderDrawer('parallel_audit')
    expect(await screen.findByText(/SQLi/)).toBeInTheDocument()
    expect(await screen.findByText(/90/)).toBeInTheDocument()
  })

  it('mostra chip degraded quando a run degradou', async () => {
    renderDrawer('developer')
    expect(await screen.findByText(/degraded/i)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Rodar para ver falhar**

```bash
npx vitest run src/features/dag/__tests__/InspectDrawer.test.tsx
```
Expected: FAIL (placeholders antigos).

- [ ] **Step 3: Implementar** — reescrever `InspectDrawer.tsx`:

```tsx
import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useCanvasStore } from '../../stores/canvasStore'
import type { NodeStatusEntry } from '../../stores/canvasStore'
import { useRunsStore } from '../../stores/runsStore'
import { useConsoleStore } from '../../stores/consoleStore'
import { getRunArtifacts } from '../../shared/lib/api'
import type { ArtifactsResponse, CircuitBreakerSnapshot } from '../../shared/lib/types'
import { Drawer } from '../../shared/ui/Drawer'
import { Badge } from '../../shared/ui/Badge'
import { SectionTitle } from '../../shared/ui/SectionTitle'
import { NODE_LABELS } from './dagModel'
import { nodeAccentTextVar } from './nodeAccent'
import { NODE_STATUS_LABEL, NODE_STATUS_TONE } from './nodeStatusMeta'

const DEFAULT_ENTRY: NodeStatusEntry = { status: 'pending', attemptCount: 0 }
const PAYLOAD_TRUNC = 2000

// Severidade de vulnerabilidade → tone do Badge.
const SEVERITY_TONE: Record<string, 'err' | 'warn' | 'neutral'> = {
  critical: 'err',
  high: 'err',
  medium: 'warn',
  low: 'neutral',
  info: 'neutral',
}

// Drawer de inspeção (UX8): abre com um nó selecionado no canvas.
// Dados REAIS via GET /runs/{id}/artifacts (outputs do nó, tokens por nó,
// audit AppSec/DevOps, degraded/circuit breaker); logs seguem do console.
export function InspectDrawer() {
  const selectedNodeId = useCanvasStore((s) => s.selectedNodeId)
  const nodeStatus = useCanvasStore((s) => s.nodeStatus)
  const selectNode = useCanvasStore((s) => s.selectNode)
  const entries = useConsoleStore((s) => s.entries)
  const activeRunId = useRunsStore((s) => s.activeRunId)

  const open = selectedNodeId !== null
  const node = selectedNodeId as NonNullable<typeof selectedNodeId> | null

  const { data: artifacts } = useQuery<ArtifactsResponse>({
    queryKey: ['run-artifacts', activeRunId],
    queryFn: () => getRunArtifacts(activeRunId as string),
    enabled: open && !!activeRunId,
    staleTime: 5000,
  })

  const label = node ? NODE_LABELS[node as keyof typeof NODE_LABELS] ?? node : ''
  const entry = (node ? nodeStatus[node as keyof typeof nodeStatus] : undefined) ?? DEFAULT_ENTRY
  const nodeLogs = node ? entries.filter((e) => e.node === node) : []
  const nodeArtifact = node ? artifacts?.node_artifacts[node] : undefined

  // Output serializado (truncado com toggle quando grande).
  const rawOutput = nodeArtifact ? JSON.stringify(nodeArtifact.output, null, 2) : null
  const [expanded, setExpanded] = useState(false)
  useEffect(() => { setExpanded(false) }, [node])
  const truncated = rawOutput !== null && rawOutput.length > PAYLOAD_TRUNC && !expanded
  const shownOutput = truncated ? `${rawOutput.slice(0, PAYLOAD_TRUNC)}\n… (truncated)` : rawOutput

  const nodeTokens = node ? artifacts?.tokens.filter((t) => t.node === node) ?? [] : []

  const titleStyle = node ? { color: nodeAccentTextVar(node as keyof typeof nodeAccentTextVar) } : undefined

  const secReview = nodeArtifact?.output.security_review as
    | { vulnerabilities_found?: { severity?: string; type?: string; description?: string }[] }
    | undefined
  const devopsManifest = nodeArtifact?.output.devops_manifest as
    | { deployability_score?: number; status?: string; dockerfile_created?: boolean; ci_workflow_created?: boolean; recommendations?: string[] }
    | undefined

  const cb: CircuitBreakerSnapshot | null = artifacts?.circuit_breaker ?? null

  return (
    <Drawer open={open} title={label} onClose={() => selectNode(null)} titleStyle={titleStyle}>
      <div className="space-y-5">
        <div className="flex items-center gap-2">
          <Badge tone={NODE_STATUS_TONE[entry.status]}>{NODE_STATUS_LABEL[entry.status]}</Badge>
          {entry.attemptCount > 1 && (
            <span
              title={`retry ×${entry.attemptCount}`}
              className="rounded bg-[var(--err)]/15 px-1 text-xs font-bold text-[var(--err-text)]"
            >
              ×{entry.attemptCount}
            </span>
          )}
          {artifacts?.degraded && (
            <Badge tone="warn" data-testid="degraded-chip">degraded</Badge>
          )}
          {cb && <Badge tone="neutral" title={`iterations ${cb.total_iterations} · cost $${cb.total_cost.toFixed(2)}`}>{cb.state ?? '?'}</Badge>}
        </div>

        <section>
          <SectionTitle className="mb-1">Inputs / Outputs</SectionTitle>
          {shownOutput === null ? (
            <p className="text-sm text-[var(--text-dim)]">No data recorded</p>
          ) : (
            <div>
              <pre className="max-h-64 overflow-auto rounded border border-[var(--border)] bg-[var(--bg-elev)] p-2 font-mono text-xs leading-5 text-[var(--text-dim)]">
                {shownOutput}
              </pre>
              {rawOutput !== null && rawOutput.length > PAYLOAD_TRUNC && (
                <button
                  type="button"
                  onClick={() => setExpanded((v) => !v)}
                  className="mt-1 text-xs text-[var(--accent)] hover:underline"
                >
                  {expanded ? 'Collapse' : 'Expand'}
                </button>
              )}
            </div>
          )}
        </section>

        <section>
          <SectionTitle className="mb-1">Tokens / Context</SectionTitle>
          {nodeTokens.length === 0 ? (
            <p className="text-sm text-[var(--text-dim)]">No token data</p>
          ) : (
            <ul className="space-y-0.5 font-mono text-xs leading-5 text-[var(--text-dim)]">
              {nodeTokens.map((t) => (
                <li key={t.node + (t.model ?? '')}>
                  {t.model ?? 'n/a'} · in {t.prompt_tokens} / out {t.completion_tokens} · ${t.cost_usd.toFixed(4)}
                  {t.estimated ? ' (est.)' : ''}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle className="mb-1">Step logs</SectionTitle>
          {nodeLogs.length === 0 ? (
            <p className="text-sm text-[var(--text-dim)]">No logs for this node</p>
          ) : (
            <ul className="space-y-0.5 font-mono text-xs leading-5">
              {nodeLogs.map((e) => (
                <li key={e.id} className={e.level === 'error' ? 'text-[var(--err-text)]' : e.level === 'warn' ? 'text-[var(--warn)]' : 'text-[var(--text-dim)]'}>
                  [{e.node}] [{e.level.toUpperCase()}] {e.message}
                </li>
              ))}
            </ul>
          )}
        </section>

        {node === 'parallel_audit' && (
          <section>
            <SectionTitle className="mb-1">Parallel Audit</SectionTitle>
            <details className="rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2" open>
              <summary className="cursor-pointer text-sm font-medium">AppSec</summary>
              {secReview && secReview.vulnerabilities_found && secReview.vulnerabilities_found.length > 0 ? (
                <ul className="mt-1 space-y-1">
                  {secReview.vulnerabilities_found.map((v, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <Badge tone={SEVERITY_TONE[v.severity ?? 'low'] ?? 'neutral'}>{v.severity ?? 'n/a'}</Badge>
                      <span className="text-[var(--text-dim)]">
                        {v.type ?? '?'} — {v.description ?? ''}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-1 text-xs text-[var(--text-dim)]">No vulnerabilities found</p>
              )}
            </details>
            <details className="mt-2 rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2" open>
              <summary className="cursor-pointer text-sm font-medium">DevOps</summary>
              {devopsManifest ? (
                <div className="mt-1 space-y-0.5 text-xs text-[var(--text-dim)]">
                  <p>Deployability score: <span className="font-mono">{devopsManifest.deployability_score ?? 'n/a'}</span></p>
                  <p>Status: <span className="font-mono">{devopsManifest.status ?? 'n/a'}</span></p>
                  <p>Dockerfile: {devopsManifest.dockerfile_created ? 'yes' : 'no'} · CI workflow: {devopsManifest.ci_workflow_created ? 'yes' : 'no'}</p>
                  {devopsManifest.recommendations && devopsManifest.recommendations.length > 0 && (
                    <ul className="mt-1 list-disc pl-4">
                      {devopsManifest.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-xs text-[var(--text-dim)]">No DevOps report</p>
              )}
            </details>
          </section>
        )}
      </div>
    </Drawer>
  )
}
```

Nota de layout: `<details open>` mantém os sub-cards abertos por padrão (antes colapsados) — dados reais merecem visibilidade imediata; preserva a estética dos cards existentes.

- [ ] **Step 4: Rodar**

```bash
npx vitest run src/features/dag/__tests__/InspectDrawer.test.tsx
npm test
```
Expected: PASS completo. Se o teste de "tokens" falhar pelo formato exato do texto, alinhar o regex do teste com o markup (ex.: `in 100 / out 50`).

- [ ] **Step 5: Commit**

```bash
git add src/features/dag/InspectDrawer.tsx src/features/dag/__tests__/InspectDrawer.test.tsx
git commit -m "feat(dag): InspectDrawer com artifacts reais (payloads, tokens, audit, degraded/CB)"
```

---

# Verificação final (após todas as tasks)

```bash
# Motor
cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/agentes/LoopForge
ruff check --select E,F,W,I,N,UP,SIM src/lf tests
mypy src/lf
pytest tests/test_api_artifacts.py -v

# SPA
cd /home/lucasd/Documents/03_Desenvolvimento/code/projects/personal/portfolio/web/loopforge-ade/frontend
npm test
```

Manual (quando possível): `lf serve --port 8000` → criar run mock → abrir `/dashboard` → clicar nó developer no canvas → drawer mostra code real; nó parallel_audit → vulns/score; run pausada → banner + Resume.
