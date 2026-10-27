"""Dados sintéticos determinísticos para os testes preditivos (sem ORM)."""

import json

import numpy as np
import pandas as pd

AGORA = pd.Timestamp("2026-10-16 12:00")  # sexta-feira


def equipamentos() -> pd.DataFrame:
    return pd.DataFrame({
        "id": [1, 2, 3, 4, 5], "bairro": ["A", "A", "B", "B", "C"],
        "lat": [-27.590, -27.591, -27.600, -27.601, -27.650],
        "lon": [-48.550, -48.551, -48.500, -48.501, -48.450],
        "situacao": ["operacional", "operacional", "operacional", "mau_funcionamento", "operacional"],
    })


def agentes() -> pd.DataFrame:
    return pd.DataFrame({
        "id": [10, 11, 12, 13], "status": ["ativo"] * 4,
        "lat": [-27.590, -27.591, -27.592, -27.589], "lon": [-48.550, -48.551, -48.549, -48.548],
    })


def eventos() -> pd.DataFrame:
    """B concentra severidade 3 às sextas 18h (4 semanas); A tem ruído leve; C quase nada."""
    rng = np.random.default_rng(7)
    linhas = [(AGORA - pd.Timedelta(days=7 * s) + pd.Timedelta(hours=6, minutes=m), "B", 3)
              for s in range(1, 5) for m in range(5)]
    for _ in range(25):
        linhas.append((AGORA - pd.Timedelta(hours=int(rng.integers(1, 24 * 28))), "A", 1))
    return pd.DataFrame(linhas, columns=["ts", "bairro", "severidade"])


def telemetria(n: int = 60) -> pd.DataFrame:
    """e1 estável; e2 com latência/erro em deriva; e3 com pico isolado de latência."""
    rng = np.random.default_rng(1)
    t = pd.date_range(end=AGORA, periods=n, freq="h")
    base = 100 + rng.normal(0, 2, (3, n))
    err = 0.01 + rng.normal(0, 0.001, (3, n))
    base[1, n - 12:] += np.linspace(5, 90, 12)
    err[1, n - 12:] += np.linspace(0.005, 0.12, 12)
    base[2, -1] += 200
    return pd.concat([pd.DataFrame({
        "equipamento_id": i + 1, "ts": t, "latencia_ms": base[i], "taxa_erro": err[i],
        "temperatura": 45 + rng.normal(0, 0.5, n)}) for i in range(3)], ignore_index=True)


def para_banco(engine) -> None:
    """Grava os mesmos dados no layout do banco (metricas em JSON) para testar o adaptador/endpoints."""
    equipamentos().to_sql("equipamento", engine, index=False)
    agentes().to_sql("agente", engine, index=False)
    eventos().to_sql("evento", engine, index=False)
    tele = telemetria()
    tele["metricas"] = [json.dumps(r) for r in tele[["latencia_ms", "taxa_erro", "temperatura"]].to_dict("records")]
    tele[["equipamento_id", "ts", "metricas"]].to_sql("telemetria", engine, index=False)
