"""Cenários what-if: falha de equipamento, chuva ou evento em bairro -> recalcula risco e cobertura."""

import pandas as pd

from . import reforco, risco

TIPOS = ("falha_equipamento", "chuva", "evento_bairro")


def _resumo(r: pd.DataFrame) -> pd.Series:
    return r.groupby("bairro")["score"].mean()


def simular(eventos, equip, agentes, now, tipo: str, bairro: str | None = None, equipamento_id=None, horas: int = 24) -> dict:
    if tipo not in TIPOS:
        raise ValueError(f"tipo de cenário inválido: {tipo}; use {TIPOS}")
    if tipo == "evento_bairro" and bairro not in set(equip.bairro) | set(eventos.bairro):
        raise ValueError(f"bairro desconhecido: {bairro}")
    equip_c = equip.copy()
    if tipo == "falha_equipamento":
        alvo = equip_c.id == equipamento_id
        if not alvo.any():
            raise ValueError(f"equipamento desconhecido: {equipamento_id}")
        equip_c.loc[alvo, "situacao"] = "mau_funcionamento"
        bairro = equip_c.loc[alvo, "bairro"].iloc[0]
    base = risco.calcular(eventos, equip, now, horas)
    alvo_evt = bairro if tipo == "evento_bairro" else None
    cen = risco.calcular(eventos, equip_c, now, horas, chuva=tipo == "chuva", evento_bairro=alvo_evt)
    delta = (_resumo(cen) - _resumo(base)).round(2)
    cent = reforco.centroides(equip)
    h = min(6, horas)
    ref0, ref1 = reforco.realocar(base, agentes, cent, h), reforco.realocar(cen, agentes, cent, h)
    return {
        "tipo": tipo, "bairro": bairro, "equipamento_id": equipamento_id,
        "delta_risco_medio": delta[delta != 0].sort_values(key=abs, ascending=False).to_dict(),
        "cobertura_base": ref0["cobertura_antes"], "cobertura_cenario": ref1["cobertura_antes"],
        "cobertura_cenario_realocada": ref1["cobertura_depois"], "movimentos": ref1["movimentos"],
        "lacunas_base": len(reforco.lacunas_cidades(equip, agentes)),
        "lacunas_cenario": len(reforco.lacunas_cidades(equip_c, agentes)),
    }
