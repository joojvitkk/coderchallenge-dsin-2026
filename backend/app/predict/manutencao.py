"""Manutenção preditiva: P(falha em 7 dias) a partir da deriva de latência, erro e temperatura."""

import numpy as np
import pandas as pd

from .comum import METRICAS, ewma, serie_por_equip, sigmoid, z_robusto

PESOS = {"latencia_ms": 0.9, "taxa_erro": 1.1, "temperatura": 0.7}
ESCALA, CENTRO = (
    2.4,
    1.9,
)  # p = sigmoid(ESCALA * (ln(1 + sinal) - CENTRO)); calibrado no backtest D-14 -> D-7 (ver predict/backtest.py)
P_MIN, P_MAX = 0.01, 0.97  # nunca "certeza": a estimativa tem incerteza
JANELA = 12  # leituras usadas para inclinação/nível recentes
SITUACAO_RUIM = {"mau_funcionamento": 1.5, "em_manutencao": 0.5}


def deriva(v: np.ndarray, alpha: float = 0.3) -> tuple[float, float]:
    """(z do nível EWMA recente, inclinação em desvios-robustos por leitura) vs. baseline inicial."""
    base = v[: max(len(v) - JANELA, 5)]
    suave = ewma(v, alpha)
    nivel = float(z_robusto(suave[-1], base))
    y = z_robusto(suave[-JANELA:], base)
    return nivel, float(np.polyfit(np.arange(len(y)), y, 1)[0])


def prever_falhas(tele: pd.DataFrame, equip: pd.DataFrame) -> pd.DataFrame:
    """Probabilidade de falha em 7 dias + ordem de serviço priorizada (quem ainda funciona e mais se degrada vem primeiro;
    equipamentos que já estão em falha vão ao fim, marcados `em_falha`)."""
    contrib: dict = {}
    for m in METRICAS:
        for eid, v in serie_por_equip(tele, m):
            if len(v) >= 10:
                nivel, incl = deriva(v)
                contrib.setdefault(eid, {})[m] = PESOS[m] * (max(nivel, 0) * 0.25 + max(incl, 0) * 4)
    sit = equip.set_index("id")["situacao"] if "id" in equip else pd.Series(dtype=object)
    ultima = tele.sort_values("ts").groupby("equipamento_id").situacao.last() if "situacao" in tele else pd.Series(dtype=object)
    linhas = []
    for eid, c in contrib.items():
        sinal = sum(c.values()) + SITUACAO_RUIM.get(sit.get(eid), 0.0)
        p = float(np.clip(sigmoid(ESCALA * (np.log1p(sinal) - CENTRO)), P_MIN, P_MAX))
        principal = max(c, key=c.get)
        linhas.append(
            {
                "equipamento_id": eid,
                "prob_falha_7d": round(p, 3),
                "sinal": round(sinal, 3),
                "em_falha": bool(sit.get(eid) == "mau_funcionamento" or ultima.get(eid) == "mau_funcionamento"),
                "causa_principal": principal if c[principal] > 0.1 else "estavel",
                "fatores": {k: round(x, 3) for k, x in c.items()},
                "prioridade": "imediata" if p >= 0.7 else "agendada" if p >= 0.35 else "monitorar",
            }
        )
    cols = ["equipamento_id", "prob_falha_7d", "sinal", "em_falha", "causa_principal", "fatores", "prioridade"]
    # preventivas primeiro (quem ainda não falhou), do maior para o menor sinal; o sinal desempata probabilidades arredondadas
    ordem = pd.DataFrame(linhas, columns=cols).sort_values(["em_falha", "sinal"], ascending=[True, False])
    ordem.insert(0, "ordem", range(1, len(ordem) + 1))
    return ordem.reset_index(drop=True)
