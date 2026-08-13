"""Pacote Python da SPA do LoopForge ADE.

Este pacote empacota o build do frontend SPA (``static/dist``) como package-data,
para que o engine (repo LoopForge) resolva o dist via ``lf.ade.static.dist``
ou ``LF_SPA_DIST``. O ``scripts/sync_dist.py`` copia ``frontend/dist`` para
``src/lf/ade/static/dist`` no lado do engine, e este pacote entrega o mesmo
dist como artefato Python instalável (embedding B5).
"""

__version__ = "0.1.0"
