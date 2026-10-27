"""Déficit de cobertura, realocação gulosa de agentes e lacunas de cobertura."""

import numpy as np
import pandas as pd

from .comum import OPERACIONAL, haversine_km

AGENTES_MAX = 4.0  # agentes necessários num bairro com risco 100
RAIO_KM = 1.5
MAX_DESLOCAMENTO_KM = 60.0  # agentes não atravessam o país: só reforçam locais próximos


def centroides(equip: pd.DataFrame) -> pd.DataFrame:
    return equip.groupby("bairro")[["lat", "lon"]].mean()


def demanda(risco: pd.DataFrame, horas: int) -> pd.Series:
    """Agentes necessários por bairro = AGENTES_MAX x risco médio das próximas `horas` / 100."""
    return risco[risco.h.between(1, horas)].groupby("bairro")["score"].mean() * AGENTES_MAX / 100


def bairro_mais_proximo(lat, lon, cent: pd.DataFrame) -> np.ndarray:
    d = haversine_km(np.asarray(lat)[:, None], np.asarray(lon)[:, None], cent.lat.to_numpy(), cent.lon.to_numpy())
    return cent.index.to_numpy()[d.argmin(1)]


def cobertura(tem: pd.Series, precisa: pd.Series) -> float:
    return float(np.minimum(tem, precisa).sum() / max(precisa.sum(), 1e-9))


def _ganho(tem: pd.Series, precisa: pd.Series, origem: str, dest: str) -> float:
    """Variação (não normalizada) da cobertura ao mover 1 agente de `origem` para `dest`; só esses dois locais mudam."""
    ganha = min(tem[dest] + 1, precisa[dest]) - min(tem[dest], precisa[dest])
    perde = min(tem[origem], precisa[origem]) - min(tem[origem] - 1, precisa[origem])
    return float(ganha - perde)


def realocar(risco, agentes: pd.DataFrame, cent: pd.DataFrame, horas: int = 6) -> dict:
    """Guloso: a cada passo move o agente que maximiza déficit_destino/(1+distância) com ganho > 0."""
    precisa = demanda(risco, horas).reindex(cent.index, fill_value=0.0)
    ag = agentes[agentes.status != "inativo"].copy()
    ag["bairro"] = bairro_mais_proximo(ag.lat, ag.lon, cent)

    def conta():
        return ag.bairro.value_counts().reindex(cent.index, fill_value=0).astype(float)

    antes, movs = cobertura(conta(), precisa), []
    movidos: set[int] = set()  # cada agente é realocado no máximo uma vez
    while True:
        tem, melhor = conta(), None
        deficit = (precisa - tem).clip(lower=0)
        for i, a in ag[ag.status == "ativo"].iterrows():
            if i in movidos or tem[a.bairro] <= precisa[a.bairro]:
                continue
            kms = pd.Series(haversine_km(a.lat, a.lon, cent.lat.to_numpy(), cent.lon.to_numpy()), index=cent.index)
            for dest in deficit[(deficit > 0) & (kms <= MAX_DESLOCAMENTO_KM)].index:
                ganho = _ganho(tem, precisa, a.bairro, dest)
                prio = deficit[dest] / (1 + kms[dest])
                if ganho > 1e-9 and (melhor is None or prio > melhor[0]):
                    melhor = (prio, i, a.bairro, dest, float(kms[dest]))
        if melhor is None:
            break
        _, i, origem, dest, km = melhor
        movs.append({"agente_id": ag.loc[i, "id"].item(), "de": origem, "para": dest, "km": round(km, 2)})
        ag.loc[i, "bairro"] = dest
        movidos.add(i)
    return {
        "movimentos": movs, "cobertura_antes": round(antes, 4), "cobertura_depois": round(cobertura(conta(), precisa), 4),
        "deficit": deficit.round(2).to_dict(), "agentes_por_bairro": conta().astype(int).to_dict(),
    }


def lacunas(equip: pd.DataFrame, agentes: pd.DataFrame, raio_km: float = RAIO_KM, n: int = 10) -> pd.DataFrame:
    """Pontos de uma grade n x n sobre a área monitorada sem equipamento operacional nem agente ativo em `raio_km`."""
    cent = centroides(equip)
    lat = np.linspace(equip.lat.min(), equip.lat.max(), n)
    lon = np.linspace(equip.lon.min(), equip.lon.max(), n)
    g = pd.DataFrame([(a, o) for a in lat for o in lon], columns=["lat", "lon"])
    ativos = [equip[equip.situacao == OPERACIONAL], agentes[agentes.status != "inativo"]]
    cobre = pd.concat([x[["lat", "lon"]] for x in ativos])
    d = haversine_km(g.lat.to_numpy()[:, None], g.lon.to_numpy()[:, None], cobre.lat.to_numpy(), cobre.lon.to_numpy())
    cega = g[(d > raio_km).all(1)].copy() if len(cobre) else g.copy()
    cega["bairro"] = bairro_mais_proximo(cega.lat, cega.lon, cent) if len(cega) else []
    return cega.reset_index(drop=True).round(5)


def lacunas_cidades(equip: pd.DataFrame, agentes: pd.DataFrame, raio_km: float = RAIO_KM, n: int = 6) -> pd.DataFrame:
    """Lacunas calculadas cidade a cidade (uma grade n x n por cidade), sem grades cobrindo o país inteiro."""
    grupos = [g for _, g in equip.groupby("cidade")] if "cidade" in equip else [equip]
    return pd.concat([lacunas(g, agentes, raio_km, n) for g in grupos], ignore_index=True).drop_duplicates(["lat", "lon"])
