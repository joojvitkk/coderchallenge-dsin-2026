from datetime import timedelta

from sqlalchemy import func
from sqlmodel import Session, select

from ..db import agora
from ..geo import BAIRROS, bairros_de, mais_proximo
from ..models import ABERTOS, SLA_MIN, Agente, Equipamento, Evento, ManutTipo, Situacao, StatusAgente, StatusAlerta

LIMITE_NORMAL, LIMITE_ATENCAO = 80.0, 60.0  # saúde >= 80: opera normalmente; 60-80: atenção; abaixo: crítico
ATIVAS = (Situacao.operacional, Situacao.mau_funcionamento, Situacao.em_manutencao, Situacao.furtado)


def _contar(s: Session, *cols, where=()) -> list:
    return s.exec(select(*cols, func.count()).where(*where).group_by(*cols)).all()


def _escopo(Model, cidade: str | None, uf: str | None) -> list:
    """Condições SQL que restringem Model (Equipamento/Agente) à cidade e/ou UF."""
    return [getattr(Model, c) == v for c, v in (("cidade", cidade), ("uf", uf)) if v]


def _disponibilidade(por_situacao: dict[str, int]) -> float:
    """% operacional entre os equipamentos instalados e não desativados."""
    base = sum(por_situacao.get(x, 0) for x in ATIVAS)
    return round(100 * por_situacao.get(Situacao.operacional, 0) / base, 1) if base else 0.0


def criticos_por_bairro(s: Session, horas: int = 24, cidade: str | None = None, uf: str | None = None) -> dict[str, int]:
    desde = agora() - timedelta(hours=horas)
    onde = (Evento.severidade >= 3, Evento.ts >= desde, Evento.status.in_(ABERTOS), Evento.bairro.in_(bairros_de(cidade, uf)))
    return dict(_contar(s, Evento.bairro, where=onde))


def sla_estourado(s: Session, cidade: str | None, uf: str | None) -> int:
    """Alertas ainda não reconhecidos cujo prazo (por severidade) já passou."""
    t = agora()
    cond = (Evento.status == StatusAlerta.aberto, Evento.ts >= t - timedelta(hours=24), Evento.bairro.in_(bairros_de(cidade, uf)))
    return sum(t > (ev.inicio or ev.ts) + timedelta(minutes=SLA_MIN[ev.severidade]) for ev in s.exec(select(Evento).where(*cond)))


def kpis(s: Session, cidade: str | None = None, uf: str | None = None) -> dict:
    eq, ag = _escopo(Equipamento, cidade, uf), _escopo(Agente, cidade, uf)
    por = {x.value: 0 for x in Situacao} | dict(_contar(s, Equipamento.situacao, where=eq))
    por_status = dict(_contar(s, Agente.status, where=ag))
    hoje = agora().date()
    agendada_7d = Equipamento.proxima_manutencao.between(hoje, hoje + timedelta(days=7))
    abertos = (Evento.status.in_(ABERTOS), Evento.ts >= agora() - timedelta(hours=24), Evento.bairro.in_(bairros_de(cidade, uf)))
    contar_ev = lambda *cond: s.exec(select(func.count()).where(*abertos, *cond)).one()  # noqa: E731
    contar_eq = lambda *cond: s.exec(select(func.count()).where(*eq, *cond)).one()  # noqa: E731
    return {
        "equipamentos_total": sum(por.values()),
        "por_situacao": por,
        "disponibilidade_pct": _disponibilidade(por),
        "agentes_total": sum(por_status.values()),
        "agentes_ativos": por_status.get(StatusAgente.ativo, 0),
        "agentes_em_ocorrencia": por_status.get(StatusAgente.em_ocorrencia, 0),
        "alertas_criticos": contar_ev(Evento.severidade == 4),
        "alertas_abertos": contar_ev(),
        "alertas_sla_estourado": sla_estourado(s, cidade, uf),
        "manutencao_imediata": contar_eq(Equipamento.manutencao_tipo == ManutTipo.imediata),
        "manutencao_agendada_7d": contar_eq(Equipamento.manutencao_tipo == ManutTipo.agendada, agendada_7d),
    }


def agrupar(s: Session, por: str = "regiao", cidade: str | None = None, uf: str | None = None) -> list[dict]:
    """Saúde por região, cidade ou UF = disponibilidade - 5 por alerta grave (sev >= 3) aberto nas últimas 24h (máx. 30).

    `estado`: normal (saúde >= 80), atencao (>= 60) ou critico."""
    criticos = criticos_por_bairro(s, cidade=cidade, uf=uf)
    grupos: dict[str, dict] = {
        g: {"nome": g, "bairros": [], "por_situacao": {}, "agentes_ativos": 0, "alertas_criticos": 0}
        for g in dict.fromkeys(getattr(BAIRROS[n], por) for n in bairros_de(cidade, uf))
    }
    for nome in bairros_de(cidade, uf):
        g = grupos[getattr(BAIRROS[nome], por)]
        g["bairros"].append(nome)
        g["alertas_criticos"] += criticos.get(nome, 0)
    for g, situacao, n in _contar(s, getattr(Equipamento, por), Equipamento.situacao, where=_escopo(Equipamento, cidade, uf)):
        grupos[g]["por_situacao"][situacao.value] = n
    ativos = select(Agente).where(Agente.status != StatusAgente.inativo, *_escopo(Agente, cidade, uf))
    for a in s.exec(ativos):
        g = grupos.get(getattr(mais_proximo(BAIRROS.values(), a.lat, a.lon), por))
        if g:
            g["agentes_ativos"] += 1
    for g in grupos.values():
        g["equipamentos"] = sum(g["por_situacao"].values())
        g["disponibilidade_pct"] = _disponibilidade(g["por_situacao"])
        g["saude"] = round(max(0.0, g["disponibilidade_pct"] - min(30, 5 * g["alertas_criticos"])), 1)
        g["estado"] = "normal" if g["saude"] >= LIMITE_NORMAL else "atencao" if g["saude"] >= LIMITE_ATENCAO else "critico"
    return list(grupos.values())
