import numpy as np
from predict_sintetico import AGORA, equipamentos, eventos

from app.predict import risco


def teste_matriz_e_pico_sexta_18h():
    r = risco.calcular(eventos(), equipamentos(), AGORA)
    assert len(r) == 3 * 25 and r.score.between(0, 100).all()
    b = r[r.bairro == "B"]
    pico = b.loc[b.score.idxmax()]
    assert pico.ts == AGORA.replace(hour=18) and pico.score > 60
    a18 = r[(r.bairro == "A") & (r.ts == pico.ts)].score.iloc[0]
    assert pico.score > a18 + 30


def teste_intervalo_de_confianca_envolve_score():
    r = risco.calcular(eventos(), equipamentos(), AGORA)
    assert (r.ic_inf <= r.score + 1e-9).all() and (r.score <= r.ic_sup + 1e-9).all()
    assert (r.ic_sup - r.ic_inf).max() > 0


def teste_fatores_somam_o_score_e_equipamentos_exatos():
    r = risco.calcular(eventos(), equipamentos(), AGORA)
    soma = r[["sazonal", "tendencia", "equipamentos", "chuva", "evento"]].sum(axis=1).clip(0, 100)
    assert np.allclose(soma, r.score, atol=0.02)
    assert set(r[r.bairro == "B"].equipamentos) == {12.5}  # 1 de 2 degradado -> 25 * 0.5
    assert set(r[r.bairro == "C"].equipamentos) == {0.0}


def teste_chuva_e_evento_somam_pontos_fixos():
    base = risco.calcular(eventos(), equipamentos(), AGORA)
    chuva = risco.calcular(eventos(), equipamentos(), AGORA, chuva=True)
    assert np.allclose(chuva.chuva, 8.0)
    evt = risco.calcular(eventos(), equipamentos(), AGORA, evento_bairro="C")
    assert set(evt[evt.bairro == "C"].evento) == {20.0} and set(evt[evt.bairro != "C"].evento) == {0.0}
    c = (evt.bairro == "C").to_numpy()
    assert np.allclose(evt.score[c] - base.score[c], 20.0)


def teste_explicacao_ordenada_por_contribuicao():
    r = risco.calcular(eventos(), equipamentos(), AGORA)
    linha = r[(r.bairro == "B") & (r.ts == AGORA.replace(hour=18))].iloc[0]
    fat = risco.explicar(linha)
    assert fat[0]["fator"] == risco.ROTULOS["sazonal"]
    assert [abs(f["pontos"]) for f in fat] == sorted([abs(f["pontos"]) for f in fat], reverse=True)
