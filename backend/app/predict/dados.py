"""Adaptador fino banco -> DataFrames (SQL puro; os algoritmos nunca veem o ORM)."""

import json
import threading
import time

import pandas as pd

from ..geo import bairros_de


def _tabela(engine, nome: str, colunas: str = "*") -> pd.DataFrame:
    return pd.read_sql(f"SELECT {colunas} FROM {nome}", engine)


def carregar(engine, cidade: str | None = None, uf: str | None = None) -> dict:
    """Tabelas como DataFrames; `cidade`/`uf` restringem tudo ao escopo (a data de referência vem do conjunto inteiro)."""
    equip = _tabela(engine, "equipamento")
    agentes = _tabela(engine, "agente")
    eventos = _tabela(engine, "evento")
    tele = _tabela(engine, "telemetria")
    eventos["ts"] = pd.to_datetime(eventos["ts"])
    tele["ts"] = pd.to_datetime(tele["ts"])
    if len(tele):
        met = pd.DataFrame([json.loads(m) if isinstance(m, str) else (m or {}) for m in tele["metricas"]])
        tele = pd.concat([tele.drop(columns=["metricas"]), met], axis=1)
    agora = max([t.max() for t in (eventos.ts, tele.ts) if len(t)], default=pd.Timestamp.now())
    if cidade or uf:
        locais = set(bairros_de(cidade, uf))
        eventos, equip = eventos[eventos.bairro.isin(locais)], equip[equip.bairro.isin(locais)]
        agentes = agentes[(agentes.cidade == cidade if cidade else True) & (agentes.uf == uf if uf else True)]
        tele = tele[tele.equipamento_id.isin(equip.id)]
    return {"equip": equip, "agentes": agentes, "eventos": eventos, "tele": tele, "agora": agora}


TTL_S = 5
_cache: dict[tuple, tuple[float, dict]] = {}
_trava = threading.Lock()


def carregar_cache(engine, cidade: str | None = None, uf: str | None = None) -> dict:
    """`carregar` com cache de TTL_S segundos por escopo. A página Preditiva dispara 5 previsões em paralelo e cada uma
    relia a telemetria inteira (medido: ~10 s no total). A trava faz as paralelas esperarem uma só carga;
    devolve cópias, pois os algoritmos podem alterar os DataFrames."""
    chave, agora = (id(engine), cidade, uf), time.monotonic()
    with _trava:
        for k in [k for k, v in _cache.items() if agora - v[0] >= TTL_S]:
            del _cache[k]
        if chave not in _cache:
            _cache[chave] = (agora, carregar(engine, cidade, uf))
        d = _cache[chave][1]
    return {k: v.copy() if isinstance(v, pd.DataFrame) else v for k, v in d.items()}
