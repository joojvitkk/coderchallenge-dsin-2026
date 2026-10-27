"""Detecção de anomalias em telemetria: EWMA + z-score robusto (MAD)."""

import pandas as pd

from .comum import METRICAS, ewma, serie_por_equip, z_robusto

RECENTES = 6  # últimas leituras avaliadas; o restante é a linha de base


def detectar(tele: pd.DataFrame, limiar: float = 3.5, alpha: float = 0.3) -> pd.DataFrame:
    """Uma linha por (equipamento, métrica) com z do EWMA recente vs. baseline robusto.

    Anômalo quando |z_ewma| >= limiar (desvio sustentado) ou |z_pico| >= 2*limiar (pico isolado).
    """
    linhas = []
    for metrica in METRICAS:
        for eid, v in serie_por_equip(tele, metrica):
            if len(v) <= RECENTES + 5:
                continue
            base, rec = v[:-RECENTES], v[-RECENTES:]
            z_ewma = float(z_robusto(ewma(v, alpha)[-1], base))
            zs = z_robusto(rec, base)
            z_pico = float(zs[abs(zs).argmax()])
            linhas.append({
                "equipamento_id": eid, "metrica": metrica, "valor": float(v[-1]),
                "baseline": float(pd.Series(base).median()), "z_ewma": z_ewma, "z_pico": z_pico,
                "anomalo": abs(z_ewma) >= limiar or abs(z_pico) >= 2 * limiar,
            })
    cols = ["equipamento_id", "metrica", "valor", "baseline", "z_ewma", "z_pico", "anomalo"]
    return pd.DataFrame(linhas, columns=cols).astype({"anomalo": bool})  # vazio também filtra por máscara booleana
