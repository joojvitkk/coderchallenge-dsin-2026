"""Backtesting: treina com o histórico até D-N e compara a previsão com o que de fato aconteceu nos últimos N dias."""

import numpy as np
import pandas as pd

from . import manutencao, risco


def auc(y: np.ndarray, p: np.ndarray) -> float | None:
    """Área sob a curva ROC (probabilidade de um positivo receber nota maior que um negativo; empates valem 1/2)."""
    pos, neg = p[y == 1], p[y == 0]
    if not len(pos) or not len(neg):
        return None
    return float(((pos[:, None] > neg).sum() + 0.5 * (pos[:, None] == neg).sum()) / (len(pos) * len(neg)))


def spearman(a: pd.Series, b: pd.Series) -> float:
    """Correlação de postos (Pearson sobre os ranks; sem scipy)."""
    return float(a.rank().corr(b.rank()))


def backtest_manutencao(tele: pd.DataFrame, equip: pd.DataFrame, corte: pd.Timestamp, k: int = 10) -> dict:
    """Quem a OS preditiva apontaria em D-N e quem de fato entrou em falha depois (equipamentos que ainda funcionavam em D-N)."""
    antes, depois = tele[tele.ts <= corte], tele[tele.ts > corte]
    prev = manutencao.prever_falhas(antes, equip.assign(situacao="operacional"))  # sem "espiar" o cadastro de hoje
    ultimo = antes.sort_values("ts").groupby("equipamento_id").situacao.last()
    ok = prev[prev.equipamento_id.map(ultimo) == "operacional"].copy()
    falhou = set(depois[depois.situacao == "mau_funcionamento"].equipamento_id)
    ok["y"] = ok.equipamento_id.isin(falhou).astype(int)
    n, pos = len(ok), int(ok.y.sum())
    if n == 0:
        return {"avaliados": 0, "falhas_reais": 0}
    k = min(k, n)
    topo = ok.nlargest(k, "sinal")
    taxa = pos / n
    return {
        "avaliados": n,
        "falhas_reais": pos,
        "taxa_base": round(taxa, 4),
        "k": k,
        "precisao_topk": round(float(topo.y.mean()), 4),
        "recall_topk": round(float(topo.y.sum() / pos), 4) if pos else None,
        "auc": auc(ok.y.to_numpy(), ok.prob_falha_7d.to_numpy()),
        "erro_medio": round(float(np.abs(ok.prob_falha_7d - ok.y).mean()), 4),  # MAE da probabilidade
        "erro_medio_base": round(float(np.abs(taxa - ok.y).mean()), 4),  # MAE de quem chutaria sempre a taxa média
    }


def backtest_risco(eventos: pd.DataFrame, equip: pd.DataFrame, corte: pd.Timestamp, agora: pd.Timestamp) -> dict:
    """Risco previsto por bairro/hora em D-N vs. gravidade acumulada que de fato ocorreu."""
    horas = int((agora - corte).total_seconds() // 3600)
    prev = risco.calcular(eventos[eventos.ts < corte], equip.assign(situacao="operacional"), corte, horas)
    prev = prev[prev.h >= 1]
    real = eventos[(eventos.ts >= corte) & (eventos.ts < agora)].assign(ts=lambda d: d.ts.dt.floor("h"))
    real = real.groupby(["bairro", "ts"]).severidade.sum().rename("real").reset_index()
    m = prev.merge(real, on=["bairro", "ts"], how="left").fillna({"real": 0})
    por = m.groupby("bairro")[["score", "real"]].sum()
    top = min(5, len(por))
    previsto, observado = set(por.score.nlargest(top).index), set(por.real.nlargest(top).index)
    topo_celulas = m.nlargest(max(1, len(m) // 5), "score")
    return {
        "bairros": len(por),
        "horas": horas,
        "celulas": len(m),
        "acerto_top_bairros": len(previsto & observado),
        "top_bairros": top,
        "acerto_aleatorio": round(top * top / len(por), 2),
        "correlacao_bairros": round(spearman(por.score, por.real), 3),
        "correlacao_celulas": round(spearman(m.score, m.real), 3),
        "ocorrencia_no_top20": round(float((topo_celulas.real > 0).mean()), 4),
        "ocorrencia_geral": round(float((m.real > 0).mean()), 4),
        "erro_medio_pp": round(float(100 * (por.score / por.score.sum() - por.real / max(por.real.sum(), 1)).abs().mean()), 3),
    }


def executar(d: dict, dias: int = 7) -> dict:
    """Backtest completo sobre os dados carregados (`dados.carregar`): risco por bairro/hora + manutenção preditiva."""
    agora = pd.Timestamp(d["agora"])
    corte = agora.floor("h") - pd.Timedelta(days=dias)
    return {
        "corte": str(corte),
        "dias": dias,
        "risco": backtest_risco(d["eventos"], d["equip"], corte, agora.floor("h")),
        "manutencao": backtest_manutencao(d["tele"], d["equip"], corte),
    }
