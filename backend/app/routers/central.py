from typing import Annotated, Literal

from fastapi import APIRouter, Query

from ..crud import Escopo, Sessao, filtrar
from ..geo import cidades
from ..models import Equipamento, ManutTipo
from ..routers.equipamentos import FiltroEquip
from ..schemas import esquemas_tipos
from ..services import alertas, briefing, calor, kpis
from .previsao import get_dados

router = APIRouter(tags=["central"])


@router.get("/tipos")
def tipos():
    return esquemas_tipos()


@router.get("/central/kpis")
def get_kpis(s: Sessao, e: Escopo):
    return kpis.kpis(s, **e)


@router.get("/central/regioes")
def get_regioes(s: Sessao, e: Escopo, por: Literal["regiao", "cidade", "uf"] = "regiao"):
    """Saúde agregada por região, cidade ou UF."""
    return kpis.agrupar(s, por, **e)


@router.get("/central/cidades")
def get_cidades():
    """Cidades do conjunto com coordenadas e a marca `dsin` (presença respaldada por fonte pública)."""
    return cidades()


@router.get("/central/alertas")
def get_alertas(
    s: Sessao,
    e: Escopo,
    horas: Annotated[int, Query(ge=1, le=24 * 90)] = 24,
    sev_min: Annotated[int, Query(ge=1, le=4)] = 1,
    limit: Annotated[int, Query(ge=1, le=500)] = 50,
    status: Literal["abertos", "todos", "aberto", "reconhecido", "em_atendimento", "resolvido"] = "abertos",
):
    """Alertas (mais graves primeiro). Padrão: os ainda não resolvidos das últimas 24h."""
    return alertas.listar(s, horas, sev_min, limit, status=status, **e)


@router.get("/central/replay")
def get_replay(s: Sessao, e: Escopo, horas: Annotated[int, Query(ge=1, le=72)] = 24):
    """Eventos do período em ordem cronológica, para reproduzir no mapa."""
    return alertas.listar(s, horas, 1, 2000, status="todos", cronologico=True, **e)


@router.get("/central/briefing")
def get_briefing(s: Sessao, e: Escopo):
    """Resumo executivo (situação agora, 3 riscos das próximas 6 h e ações), gerado por regras."""
    return briefing.gerar(s, get_dados(e), **e)


@router.post("/central/alertas/{id_}/reconhecer")
def post_reconhecer(id_: int, s: Sessao):
    return alertas.reconhecer(s, id_)


@router.post("/central/alertas/{id_}/despachar")
def post_despachar(id_: int, s: Sessao, agente_id: int | None = None):
    """Despacha o agente indicado ou o ativo mais próximo; devolve distância e ETA estimado."""
    return alertas.despachar(s, id_, agente_id)


@router.post("/central/alertas/{id_}/resolver")
def post_resolver(id_: int, s: Sessao):
    return alertas.resolver(s, id_)


@router.get("/central/manutencao")
def get_manutencao(f: Annotated[FiltroEquip, Query()], s: Sessao):
    """Equipamentos que precisam de manutenção, imediatas primeiro e depois por data."""
    f = f.model_copy(update={"precisa_manutencao": True})
    prioridade = (Equipamento.manutencao_tipo == ManutTipo.imediata).desc()
    stmt = filtrar(Equipamento, f).order_by(
        prioridade, Equipamento.proxima_manutencao.is_(None), Equipamento.proxima_manutencao
    )
    return s.exec(stmt.offset(f.offset).limit(f.limit)).all()


@router.get("/central/calor")
def get_calor(f: Annotated[calor.FiltroCalor, Query()], s: Sessao):
    """Pontos {lat, lon, peso} para o mapa de calor (alertas, indisponibilidade ou cobertura) e os 5 maiores focos.
    Escopo = cidade/uf; os demais filtros de equipamento valem para `indisponibilidade`."""
    d = get_dados({"cidade": f.cidade, "uf": f.uf}) if f.modo == "cobertura" else None
    return calor.pontos(s, d, f)
