"""Mapa de calor geográfico: pontos {lat, lon, peso} por modo (alertas, indisponibilidade, cobertura) e os 5 maiores focos."""

from collections import Counter
from typing import Literal

from pydantic import Field
from sqlmodel import Session

from ..crud import filtrar
from ..db import agora
from ..models import Equipamento, Situacao
from ..predict import reforco
from ..routers.equipamentos import FiltroEquip
from . import alertas

Modo = Literal["alertas", "indisponibilidade", "cobertura"]
INDISPONIVEIS = (Situacao.mau_funcionamento, Situacao.furtado, Situacao.em_manutencao)


class FiltroCalor(FiltroEquip):
    """Filtros de equipamento (e escopo cidade/uf) mais os parâmetros do mapa de calor."""

    modo: Modo = "alertas"
    horas: int = Field(24, ge=1, le=24 * 90)
    raio_km: float = Field(reforco.RAIO_KM, gt=0, le=50)  # só para `cobertura`

PARAMS = ("modo", "horas", "raio_km")

TEXTOS = {
    "alertas": ("Densidade de alertas e ocorrências nas últimas {h} h, cada alerta pesando sua severidade (1 a 4).",
                "Concentre patrulha e atendimento nos focos mais quentes; repita a leitura em outros horários."),
    "indisponibilidade": ("Onde há equipamentos em mau funcionamento, em manutenção ou furtados (peso 1 cada).",
                          "Priorize ordens de serviço nas áreas com mais equipamentos parados."),
    "cobertura": ("Lacunas: pontos sem equipamento operacional nem agente num raio de {r} km.",
                  "Realoque agentes ou instale equipamentos nas áreas quentes (sem cobertura)."),
}


def _agrupar(itens: list[tuple[float, float, str, float]]) -> tuple[list[dict], list[dict]]:
    """Soma pesos por posição (4 casas) e por local; devolve os pontos e os 5 maiores locais."""
    pos: Counter = Counter()
    locais: Counter = Counter()
    for lat, lon, local, peso in itens:
        pos[(round(lat, 4), round(lon, 4))] += peso
        locais[local] += peso
    return ([{"lat": a, "lon": b, "peso": p} for (a, b), p in pos.items()],
            [{"local": n, "peso": p} for n, p in locais.most_common(5)])


def pontos(s: Session, d: dict | None, f: FiltroCalor) -> dict:
    """`d` (dados da previsão) só serve a `cobertura`; o escopo é a cidade/UF de `f`, os demais filtros valem p/ equipamentos."""
    modo, horas, raio_km = f.modo, f.horas, f.raio_km
    if modo == "alertas":
        itens = [(a["lat"], a["lon"], a["bairro"], a["severidade"])
                 for a in alertas.listar(s, horas, 1, 5000, f.cidade, f.uf, status="todos")]
    elif modo == "indisponibilidade":
        base = filtrar(Equipamento, FiltroEquip(**f.model_dump(exclude=set(PARAMS))))
        stmt = base.where(Equipamento.situacao.in_(INDISPONIVEIS))
        itens = [(e.lat, e.lon, e.bairro, 1.0) for e in s.exec(stmt.limit(5000))]
    else:
        cegas = reforco.lacunas_cidades(d["equip"], d["agentes"], raio_km)
        itens = [(r.lat, r.lon, r.bairro, 1.0) for r in cegas.itertuples()]
    pts, focos = _agrupar(itens)
    preve, reco = TEXTOS[modo]
    return {
        "modo": modo,
        "preve": preve.format(h=horas, r=raio_km),
        "dados_usados": {"pontos": len(pts), "registros": len(itens), "referencia": str(agora())},
        "recomendacao": reco if pts else "Nada a destacar neste recorte.",
        "pontos": pts,
        "focos": focos,
    }


