"""Tendências de disponibilidade e utilização (série diária + projeção linear com faixa de incerteza)."""

import numpy as np
import pandas as pd

DIAS = 30
PROJECAO = 7
MIN_EQUIP = 3  # tipos com menos equipamentos oscilam demais para indicar tendência


def _projetar(y: np.ndarray, passos: int) -> tuple[np.ndarray, float, float]:
    """Reta de mínimos quadrados sobre y; devolve (valores projetados, inclinação por dia, desvio dos resíduos)."""
    x = np.arange(len(y))
    a, b = np.polyfit(x, y, 1) if len(y) > 2 else (0.0, float(np.mean(y)))
    resid = float(np.std(y - (a * x + b))) if len(y) > 2 else 0.0
    return a * np.arange(len(y), len(y) + passos) + b, float(a), resid


def calcular(tele: pd.DataFrame, equip: pd.DataFrame, agora: pd.Timestamp) -> dict:
    """Disponibilidade = % de leituras com o equipamento operacional; utilização = média da métrica `utilizacao` (%)."""
    t = tele[tele.ts >= agora.floor("D") - pd.Timedelta(days=DIAS)].copy()
    t["dia"] = t.ts.dt.floor("D")
    t["ok"] = (t.situacao == "operacional") * 100.0
    if "utilizacao" not in t:
        t["utilizacao"] = np.nan
    diario = (
        t.groupby("dia").agg(disponibilidade=("ok", "mean"), utilizacao=("utilizacao", "mean")).dropna(subset=["disponibilidade"])
    )
    serie = [
        {
            "dia": str(d.date()),
            "disponibilidade": round(r.disponibilidade, 2),
            "utilizacao": None if pd.isna(r.utilizacao) else round(r.utilizacao, 2),
            "projetado": False,
        }
        for d, r in diario.iterrows()
    ]
    resumo: dict = {}
    for col in ("disponibilidade", "utilizacao"):
        y = diario[col].dropna().to_numpy()
        if len(y) < 3:
            continue
        proj, incl, resid = _projetar(y, PROJECAO)
        resumo[col] = {
            "atual": round(float(y[-3:].mean()), 2),
            "variacao_pp_semana": round(incl * 7, 2),
            "projetado_7d": round(float(np.clip(proj[-1], 0, 100)), 2),
        }
        ultimo = diario.index[-1]
        for i, v in enumerate(proj, start=1):
            linha = next((s for s in serie if s["dia"] == str((ultimo + pd.Timedelta(days=i)).date())), None)
            if linha is None:
                linha = {
                    "dia": str((ultimo + pd.Timedelta(days=i)).date()),
                    "disponibilidade": None,
                    "utilizacao": None,
                    "projetado": True,
                }
                serie.append(linha)
            linha[col] = round(float(np.clip(v, 0, 100)), 2)
            linha[f"{col}_inf"], linha[f"{col}_sup"] = (
                round(float(np.clip(v - 1.96 * resid, 0, 100)), 2),
                round(float(np.clip(v + 1.96 * resid, 0, 100)), 2),
            )
    return {"serie": serie, "resumo": resumo, "por_tipo": _por_tipo(t, equip)}


def _por_tipo(t: pd.DataFrame, equip: pd.DataFrame) -> list[dict]:
    """Disponibilidade e utilização por tipo de equipamento: últimos 7 dias e variação contra os 7 anteriores."""
    if t.empty:
        return []
    t = t.merge(equip[["id", "tipo"]], left_on="equipamento_id", right_on="id")
    fim = t.dia.max()
    recente, anterior = (
        t[t.dia > fim - pd.Timedelta(days=7)],
        t[(t.dia <= fim - pd.Timedelta(days=7)) & (t.dia > fim - pd.Timedelta(days=14))],
    )
    a, b = (
        recente.groupby("tipo").agg(disp=("ok", "mean"), uso=("utilizacao", "mean"), n=("equipamento_id", "nunique")),
        anterior.groupby("tipo").ok.mean(),
    )
    linhas = [
        {
            "tipo": tipo,
            "equipamentos": int(r.n),
            "disponibilidade": round(r.disp, 2),
            "utilizacao": None if pd.isna(r.uso) else round(r.uso, 2),
            "variacao_pp": round(r.disp - b.get(tipo, r.disp), 2),
        }
        for tipo, r in a.iterrows()
        if r.n >= MIN_EQUIP
    ]
    return sorted(linhas, key=lambda x: x["variacao_pp"])
