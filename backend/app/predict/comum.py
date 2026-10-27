"""Primitivas numéricas compartilhadas pelos módulos preditivos (numpy/pandas puros)."""

import numpy as np
import pandas as pd

OPERACIONAL = "operacional"
METRICAS = ("latencia_ms", "taxa_erro", "temperatura")


def haversine_km(lat1, lon1, lat2, lon2):
    """Distância em km (vetorizada, com broadcasting)."""
    p1, p2 = np.radians(lat1), np.radians(lat2)
    a = np.sin((p2 - p1) / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(np.radians(lon2 - lon1) / 2) ** 2
    return 6371.0 * 2 * np.arcsin(np.sqrt(a))


def sigmoid(x):
    return 1.0 / (1.0 + np.exp(-np.asarray(x, dtype=float)))


def ewma(x, alpha: float = 0.3) -> np.ndarray:
    return pd.Series(np.asarray(x, dtype=float)).ewm(alpha=alpha, adjust=False).mean().to_numpy()


def mad_escala(ref, piso: float = 1e-6) -> tuple[float, float]:
    """(mediana, escala robusta ~ desvio) via MAD; piso evita divisão por zero."""
    ref = np.asarray(ref, dtype=float)
    med = float(np.median(ref))
    return med, max(1.4826 * float(np.median(np.abs(ref - med))), piso)


def z_robusto(x, ref) -> np.ndarray:
    """Z-score robusto (mediana/MAD) de x contra a amostra de referência."""
    med, escala = mad_escala(ref, piso=max(1e-6, 0.01 * abs(np.median(ref))))
    return (np.asarray(x, dtype=float) - med) / escala


def serie_por_equip(tele: pd.DataFrame, metrica: str):
    """Itera (equipamento_id, valores ordenados por ts) ignorando NaN."""
    for eid, g in tele.sort_values("ts").groupby("equipamento_id"):
        v = g[metrica].dropna().to_numpy(dtype=float)
        if len(v):
            yield eid, v
