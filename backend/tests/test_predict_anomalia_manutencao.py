import numpy as np
from predict_sintetico import equipamentos, telemetria

from app.predict import anomalia, comum, manutencao


def teste_z_robusto_valor_conhecido():
    ref = [1, 2, 3, 4, 5]  # mediana 3, MAD 1 -> escala 1.4826
    assert np.isclose(comum.z_robusto(3 + 1.4826, ref), 1.0)
    assert np.isclose(comum.z_robusto(3, ref), 0.0)


def teste_ewma_valores_conhecidos():
    assert np.allclose(comum.ewma([1, 0, 0], alpha=0.5), [1, 0.5, 0.25])


def teste_anomalia_detecta_deriva_e_pico_mas_nao_estavel():
    a = anomalia.detectar(telemetria())
    flagged = set(a[a.anomalo & (a.metrica == "latencia_ms")].equipamento_id)
    assert flagged == {2, 3}
    est = a[(a.equipamento_id == 1)]
    assert not est.anomalo.any() and est.z_ewma.abs().max() < 3.5
    pico = a[(a.equipamento_id == 3) & (a.metrica == "latencia_ms")].iloc[0]
    assert pico.z_pico > 7 and not pico.z_ewma > 100  # pico isolado, ewma suavizado


def teste_manutencao_ordena_por_probabilidade():
    m = manutencao.prever_falhas(telemetria(), equipamentos())
    p = m.set_index("equipamento_id")
    assert list(m.ordem) == [1, 2, 3] and m.equipamento_id.iloc[0] == 2
    assert p.loc[2, "prob_falha_7d"] > 0.7 and p.loc[2, "prioridade"] == "imediata"
    assert p.loc[1, "prob_falha_7d"] < 0.1 and p.loc[1, "prioridade"] == "monitorar"
    assert p.loc[2, "causa_principal"] in {"latencia_ms", "taxa_erro"}
    assert m.prob_falha_7d.is_monotonic_decreasing


def teste_situacao_ruim_aumenta_probabilidade():
    eq = equipamentos()
    base = manutencao.prever_falhas(telemetria(), eq).set_index("equipamento_id").prob_falha_7d
    eq.loc[eq.id == 1, "situacao"] = "mau_funcionamento"
    pior = manutencao.prever_falhas(telemetria(), eq).set_index("equipamento_id").prob_falha_7d
    assert pior[1] > base[1] and pior[2] == base[2]
