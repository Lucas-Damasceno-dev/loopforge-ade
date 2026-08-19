# LoopForge ADE — Makefile
# Roda backend (engine) + SPA (frontend) + testes + run completa.
# Docs de referência: docs/08-operacao.md (setup, env vars, fluxos).

SHELL := /bin/bash
.PHONY: help setup install dev dev-backend dev-web build sync-dist serve \
        test test-frontend test-e2e test-engine run run-mock status clean

# ─── Config ────────────────────────────────────────────────────────────────
# Engine (repo LoopForge) relativo ao ADE: portfolio/{agentes,web}/...
ENGINE_DIR ?= $(CURDIR)/../../agentes/LoopForge
FRONTEND_DIR := $(CURDIR)/frontend
VENV_LF := $(ENGINE_DIR)/.venv/bin/lf

# Portas: 8787 é o default do proxy do Vite (vite.config.ts VITE_API_TARGET);
# 5173 é a porta do dev server da SPA.
API_PORT ?= 8787
WEB_PORT ?= 5173

# Key fixa de dev — SEM ela o serve.py gera uma key nova a cada boot e a SPA
# volta a tomar 401 após restart (docs/08-operacao.md §1).
API_KEY ?= dev-local-key

# Target da API p/ o proxy do Vite: nativo (make dev) = 8787; docker = 8000.
API_TARGET ?= http://127.0.0.1:8787

# LLM: modelo default via OPENROUTER_MODEL/OPENCODE_MODEL/.loopforge.json.
# OPENCODE_MOCK=1 força respostas mock (sem LLM real, sem custo).
MODEL ?=
MOCK ?= 0

help:
	@echo "LoopForge ADE targets:"
	@echo "  make setup        Instala deps (frontend npm + engine venv lf)"
	@echo "  make dev          Sobe backend (8787) + SPA dev (5173, hot reload)"
	@echo "  make dev-docker   Engine via docker (:8000) + SPA dev (1 comando)"
	@echo "  make dev-backend  Sobe só o backend na 8787"
	@echo "  make dev-web      Sobe só a SPA dev na 5173"
	@echo "  make build        Compila a SPA (dist/)"
	@echo "  make sync-dist    Copia dist/ para o pacote embutido do engine (B5)"
	@echo "  make serve        Produção local: lf serve com SPA embutida (/app)"
	@echo "  make run          POST /api/v1/runs (run completa; IDEA/STACK/MODEL/MOCK)"
	@echo "  make status       Health check de backend e SPA"
	@echo "  make test         Frontend (vitest) + e2e (playwright) + engine (pytest mock)"
	@echo "  make clean        Remove dist/ e .env de dev"

# ─── Setup ─────────────────────────────────────────────────────────────────
setup: install
install:
	@test -x "$(VENV_LF)" || { echo "engine venv ausente em $(ENGINE_DIR)/.venv — rode: cd $(ENGINE_DIR) && uv sync"; exit 1; }
	cd "$(FRONTEND_DIR)" && npm install
	@echo "OK: engine=$(VENV_LF) frontend=$(FRONTEND_DIR)"

# ─── Dev (dois terminais) ──────────────────────────────────────────────────
dev: dev-backend dev-web
	@echo "Backend: http://127.0.0.1:$(API_PORT)  SPA: http://127.0.0.1:$(WEB_PORT)"

# Docker: engine em container (:8000) + SPA dev apontando pra ele. 1 comando.
dev-docker:
	cd "$(ENGINE_DIR)" && docker compose up -d
	$(MAKE) dev-web API_TARGET=http://127.0.0.1:8000

# PATH com o venv do engine à frente: o harness de QA (pytest) e o subprocess
# opencode precisam das ferramentas do venv no PATH — sem isso o QA reporta
# "comando de teste não encontrado" e toda run real falha na coleta.
dev-backend:
	@test -x "$(VENV_LF)" || { echo "engine venv ausente — rode: cd $(ENGINE_DIR) && uv sync"; exit 1; }
	cd "$(ENGINE_DIR)" && LF_API_API_KEY=$(API_KEY) PATH="$(ENGINE_DIR)/.venv/bin:$$PATH" "$(VENV_LF)" serve --host 127.0.0.1 --port $(API_PORT)

dev-web:
	cd "$(FRONTEND_DIR)" && printf 'VITE_API_KEY=%s\nVITE_API_TARGET=%s\n' "$(API_KEY)" "$(API_TARGET)" > .env && VITE_API_KEY=$(API_KEY) VITE_API_TARGET=$(API_TARGET) npm run dev -- --port $(WEB_PORT)

# ─── Build / distribuição ──────────────────────────────────────────────────
build:
	cd "$(FRONTEND_DIR)" && npm run build

sync-dist: build
	@test -f "$(ENGINE_DIR)/scripts/sync_dist.py" || { echo "sync_dist.py ausente no engine"; exit 1; }
	python "$(ENGINE_DIR)/scripts/sync_dist.py" "$(FRONTEND_DIR)/dist"

serve: sync-dist
	cd "$(ENGINE_DIR)" && LF_API_API_KEY=$(API_KEY) PATH="$(ENGINE_DIR)/.venv/bin:$$PATH" "$(VENV_LF)" serve --host 127.0.0.1 --port $(API_PORT)
	@echo "SPA em http://127.0.0.1:$(API_PORT)/app"

# ─── Run completa via API ──────────────────────────────────────────────────
# Uso: make run IDEA="gerar api rest de tarefas" STACK=python [MOCK=1] [MODEL=...]
run:
	@test -n "$(IDEA)" || { echo "passe IDEA=\"...\""; exit 1; }
	@if [ "$(MOCK)" = "1" ]; then MOCK_ARG='"mock_llm": true,'; else MOCK_ARG=''; fi
	@if [ -n "$(MODEL)" ]; then MODEL_ARG='"model": "$(MODEL)",'; else MODEL_ARG=''; fi
	@BODY="{\"idea\": \"$(IDEA)\", \"stack\": \"$(STACK)\", $$MOCK_ARG $$MODEL_ARG \"routing_mode\": \"full\"}"; \
	echo "POST /api/v1/runs: $$BODY"; \
	curl -s -X POST http://127.0.0.1:$(API_PORT)/api/v1/runs \
		-H "X-API-Key: $(API_KEY)" -H "Content-Type: application/json" -d "$$BODY"; echo

run-mock:
	$(MAKE) run MOCK=1

# ─── Status / limpeza ──────────────────────────────────────────────────────
status:
	@echo -n "backend $(API_PORT): "; curl -s -m 2 http://127.0.0.1:$(API_PORT)/health || echo "offline"
	@echo -n "spa $(WEB_PORT): "; curl -s -m 2 -o /dev/null -w "%{http_code}\n" http://127.0.0.1:$(WEB_PORT)/ || echo "offline"

clean:
	rm -rf "$(FRONTEND_DIR)/dist"
	rm -f "$(FRONTEND_DIR)/.env"

# ─── Testes ────────────────────────────────────────────────────────────────
test: test-frontend test-e2e test-engine

test-frontend:
	cd "$(FRONTEND_DIR)" && npm test

test-e2e:
	cd "$(FRONTEND_DIR)" && npx playwright test

test-engine:
	cd "$(ENGINE_DIR)" && OPENCODE_MOCK=1 .venv/bin/python -m pytest tests/ -q
