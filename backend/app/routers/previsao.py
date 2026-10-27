"""Endpoints /api/previsao/*: cada resposta traz o que prevê, os dados usados e a recomendação."""

from typing import Annotated, Literal

import pandas as pd
from fastapi import APIRouter, Depends, HTTPException, Query

from .. import db
from ..crud import Escopo
from ..geo import BAIRROS
from ..predict import anomalia, backtest, cenarios, dados, manutencao, reforco, risco, tendencia

router = APIRouter(prefix="/previsao", tags=["previsao"])


def get_dados(e: Escopo) -> dict:
    d = dados.carregar_cache(db.engine, **e)  # a chave inclui o engine (os testes o trocam)
    if d["equip"].empty:
        raise HTTPException(404, "nenhum equipamento no escopo (cidade/uf)")
    return d


Dados = Annotated[dict, Depends(get_dados)]


def _resp(preve: str, usou: dict, recomendacao: str, **corpo) -> dict:
    return {"preve": preve, "dados_usados": usou, "recomendacao": recomendacao, **corpo}


def _usou(d: dict) -> dict:
    return {"eventos": len(d["eventos"]), "telemetria": len(d["tele"]), "equipamentos": len(d["equip"]),
            "agentes": len(d["agentes"]), "referencia": str(d["agora"])}


@router.get("/risco")
def get_risco(d: Dados, horas: int = Query(24, ge=1, le=72), agrupar: Literal["bairro", "cidade", "uf"] = "bairro"):
    r = risco.calcular(d["eventos"], d["equip"], d["agora"], horas)
    if agrupar != "bairro":
        r = risco.agregar(r, {b: getattr(v, agrupar) for b, v in BAIRROS.items()})
    r["fatores"] = r.apply(risco.explicar, axis=1)
    top = r.sort_values("score", ascending=False).iloc[0]
    matriz = {b: g.drop(columns="bairro").to_dict("records") for b, g in r.groupby("bairro")}
    return _resp(
        f"Risco 0-100 por {agrupar} e hora nas próximas {horas}h (IC 95%)", _usou(d),
        f"Pico em {top.bairro} às {top.ts:%d/%m %Hh} (score {top.score:.0f}); priorizar presença nesse horário.",
        matriz=matriz,
    )


@router.get("/anomalias")
def get_anomalias(d: Dados, limiar: float = Query(3.5, gt=0)):
    a = anomalia.detectar(d["tele"], limiar)
    lista = a[a.anomalo].sort_values("z_ewma", key=abs, ascending=False)
    n = lista.equipamento_id.nunique()
    rec = f"Inspecionar {n} equipamento(s) com desvio sustentado." if n else "Nenhuma ação necessária."
    return _resp("Desvios de telemetria (EWMA + z-score robusto/MAD)", _usou(d), rec,
                 anomalias=lista.to_dict("records"), avaliadas=len(a))


@router.get("/manutencao-preditiva")
def get_manutencao(d: Dados, limite: int = Query(20, ge=1)):
    os_ = manutencao.prever_falhas(d["tele"], d["equip"])
    imediatas = int(((os_.prioridade == "imediata") & ~os_.em_falha).sum())
    return _resp("Probabilidade de falha em 7 dias por equipamento que ainda funciona (quem já falhou vai ao fim)", _usou(d),
                 f"{imediatas} ordem(ns) de serviço preventiva(s) imediata(s) antes que o equipamento pare; seguir a ordem.",
                 ordens=os_.head(limite).to_dict("records"))


@router.get("/reforco")
def get_reforco(d: Dados, horas: int = Query(6, ge=1, le=24), raio_km: float = Query(reforco.RAIO_KM, gt=0)):
    r = risco.calcular(d["eventos"], d["equip"], d["agora"], max(horas, 1))
    plano = reforco.realocar(r, d["agentes"], reforco.centroides(d["equip"]), horas)
    cegas = reforco.lacunas_cidades(d["equip"], d["agentes"], raio_km)
    return _resp(
        f"Déficit de cobertura e realocação de agentes nas próximas {horas}h", _usou(d),
        f"Realocar {len(plano['movimentos'])} agente(s): cobertura {plano['cobertura_antes']:.0%} "
        f"-> {plano['cobertura_depois']:.0%}; "
        f"{len(cegas)} ponto(s) cego(s) a {raio_km} km.",
        plano=plano, lacunas=cegas.to_dict("records"),
    )


@router.get("/cenario")
def get_cenario(d: Dados, evento: str, bairro: str | None = None, equipamento_id: int | None = None):
    try:
        s = cenarios.simular(d["eventos"], d["equip"], d["agentes"], d["agora"], evento, bairro, equipamento_id)
    except ValueError as e:
        raise HTTPException(422, str(e)) from e
    return _resp(f"Cenário what-if: {evento}", _usou(d),
                 f"Cobertura {s['cobertura_base']:.0%} -> {s['cobertura_cenario']:.0%}; "
                 f"realocar agentes recupera para {s['cobertura_cenario_realocada']:.0%}.",
                 **s)


@router.get("/tendencias")
def get_tendencias(d: Dados):
    t = tendencia.calcular(d["tele"], d["equip"], pd.Timestamp(d["agora"]))
    disp = t["resumo"].get("disponibilidade", {})
    queda = [x["tipo"] for x in t["por_tipo"][:2] if x["variacao_pp"] < -0.5]
    rec = (f"Disponibilidade {disp.get('atual', 0):.1f}% hoje, {disp.get('projetado_7d', 0):.1f}% projetada em 7 dias"
           + (f"; atenção aos tipos em queda: {', '.join(queda)}." if queda else "; sem tipo em queda relevante."))
    return _resp("Tendência de disponibilidade e utilização dos equipamentos (30 dias + projeção de 7)", _usou(d), rec, **t)


@router.get("/backtest")
def get_backtest(d: Dados, dias: int = Query(7, ge=2, le=14)):
    """Prova de funcionamento: treina até D-N e compara com o que aconteceu nos últimos N dias."""
    b = backtest.executar(d, dias)
    r, m = b["risco"], b["manutencao"]
    rec = (f"No risco, {r['acerto_top_bairros']} dos {r['top_bairros']} bairros mais perigosos foram previstos "
           f"(acaso: {r['acerto_aleatorio']}). Na manutenção, {m.get('falhas_reais', 0)} falha(s) real(is) "
           f"em {m.get('avaliados', 0)} equipamentos.")
    return _resp(f"Quão confiável é a previsão? Treino até D-{dias} contra os {dias} dias seguintes (dados sintéticos)",
                 _usou(d), rec, **b)
