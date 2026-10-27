import pytest
from predict_sintetico import AGORA, agentes, equipamentos, eventos

from app.predict import cenarios, reforco, risco


def teste_realocacao_move_agentes_para_bairro_com_deficit():
    r = risco.calcular(eventos(), equipamentos(), AGORA, 24)
    cent = reforco.centroides(equipamentos())
    plano = reforco.realocar(r, agentes(), cent, horas=24)
    assert plano["movimentos"] and all(m["de"] == "A" for m in plano["movimentos"])
    assert plano["cobertura_depois"] > plano["cobertura_antes"]
    assert sum(plano["agentes_por_bairro"].values()) == 4  # nenhum agente criado/perdido


def teste_cobertura_formula():
    import pandas as pd

    tem, precisa = pd.Series({"A": 3.0, "B": 0.0}), pd.Series({"A": 1.0, "B": 3.0})
    assert reforco.cobertura(tem, precisa) == pytest.approx(0.25)  # min(3,1)+min(0,3)=1 de 4


def teste_agentes_em_ocorrencia_nao_sao_movidos():
    ag = agentes().assign(status="em_ocorrencia")
    r = risco.calcular(eventos(), equipamentos(), AGORA, 24)
    assert reforco.realocar(r, ag, reforco.centroides(equipamentos()), 24)["movimentos"] == []


def teste_lacunas_dependem_do_raio_e_da_operacao():
    eq, ag = equipamentos(), agentes()
    assert len(reforco.lacunas(eq, ag, raio_km=0.1)) > len(reforco.lacunas(eq, ag, raio_km=3))
    assert len(reforco.lacunas(eq, ag, raio_km=100)) == 0
    # sem nenhum operacional nem agente: grade inteira fica cega
    eq["situacao"] = "desativado"
    assert len(reforco.lacunas(eq, ag.assign(status="inativo"), raio_km=100)) == 100
    cega = reforco.lacunas(equipamentos(), ag, raio_km=3)
    assert set(cega.bairro) <= {"A", "B", "C"} and (cega.lat < -27.62).any()


def teste_cenario_chuva_soma_8_pontos_em_todos():
    s = cenarios.simular(eventos(), equipamentos(), agentes(), AGORA, "chuva")
    d = s["delta_risco_medio"].values()
    assert len(d) == 3 and max(d) == 8.0 and all(0 < v <= 8.0 for v in d)  # menor que 8 só onde o score estava truncado em 0


def teste_cenario_falha_equipamento_eleva_risco_do_bairro_e_cria_lacunas():
    s = cenarios.simular(eventos(), equipamentos(), agentes(), AGORA, "falha_equipamento", equipamento_id=3)
    assert s["bairro"] == "B" and list(s["delta_risco_medio"]) == ["B"]
    assert 11.0 <= s["delta_risco_medio"]["B"] <= 12.5  # B passa de 50% para 100% degradado (+12,5 antes do clip)
    assert s["lacunas_cenario"] >= s["lacunas_base"]
    assert s["cobertura_cenario_realocada"] >= s["cobertura_cenario"]


def teste_cenario_evento_no_bairro_reduz_cobertura():
    s = cenarios.simular(eventos(), equipamentos(), agentes(), AGORA, "evento_bairro", bairro="C")
    assert s["delta_risco_medio"]["C"] == pytest.approx(20.0, abs=0.01)
    assert s["cobertura_cenario"] <= s["cobertura_base"]


INVALIDOS = [{"tipo": "xyz"}, {"tipo": "evento_bairro", "bairro": "Z"}, {"tipo": "falha_equipamento", "equipamento_id": 99}]


@pytest.mark.parametrize("kw", INVALIDOS)
def teste_cenario_invalido(kw):
    with pytest.raises(ValueError):
        cenarios.simular(eventos(), equipamentos(), agentes(), AGORA, **kw)
