"""Alertas: severidade 1-4, agrupamento de repetições, ciclo de vida (reconhecer, despachar, resolver) e SLA."""

from datetime import timedelta

from fastapi import HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlmodel import Session, select

from ..db import agora
from ..geo import BAIRROS, bairros_de, mais_proximo
from ..models import (
    ABERTOS,
    SLA_MIN,
    Agente,
    Equipamento,
    Evento,
    ManutTipo,
    Situacao,
    StatusAgente,
    StatusAlerta,
    TipoEvento,
)
from ..predict.comum import haversine_km
from . import auditoria
from .kpis import kpis
from .stream import bus

JANELA_AGRUPAR = timedelta(hours=6)  # repetições do mesmo equipamento dentro da janela viram uma só ocorrência
VELOCIDADE_KMH = 40.0  # velocidade média urbana para o ETA
FATOR_ROTA = 1.3  # a rota real é mais longa que a linha reta


class IncidenteIn(BaseModel):
    bairro: str | None = None
    equipamento_id: int | None = None
    tipo: TipoEvento = TipoEvento.ocorrencia
    severidade: int = Field(4, ge=1, le=4)

    @model_validator(mode="after")
    def _origem(self):
        if self.equipamento_id is None and self.bairro not in BAIRROS:
            raise ValueError(f"informe equipamento_id ou bairro válido: {list(BAIRROS)}")
        return self


def serializar(ev: Evento, eq: Equipamento | None) -> dict:
    """Alerta pronto para API/SSE, com posição (equipamento ou centro do bairro) e prazo de SLA."""
    b = BAIRROS[ev.bairro]
    inicio = ev.inicio or ev.ts
    prazo = inicio + timedelta(minutes=SLA_MIN[ev.severidade])
    return {
        **ev.model_dump(),
        "inicio": inicio,
        "regiao": b.regiao,
        "cidade": b.cidade,
        "uf": b.uf,
        "equipamento": {"serie": eq.serie, "tipo": eq.tipo} if eq else None,
        "lat": eq.lat if eq else b.lat,
        "lon": eq.lon if eq else b.lon,
        "sla_prazo": prazo,
        "sla_estourado": ev.status == StatusAlerta.aberto and agora() > prazo,
    }


def listar(
    s: Session,
    horas: int = 24,
    sev_min: int = 1,
    limit: int = 50,
    cidade: str | None = None,
    uf: str | None = None,
    status: str = "abertos",
    cronologico: bool = False,
) -> list[dict]:
    """`status`: abertos (padrão: aberto, reconhecido, em atendimento), todos ou um status. Mais graves primeiro."""
    cond = [
        Evento.ts >= agora() - timedelta(hours=horas),
        Evento.severidade >= sev_min,
        Evento.bairro.in_(bairros_de(cidade, uf)),
    ]
    if status == "abertos":
        cond.append(Evento.status.in_(ABERTOS))
    elif status != "todos":
        cond.append(Evento.status == StatusAlerta(status))
    ordem = (Evento.ts,) if cronologico else (Evento.severidade.desc(), Evento.ts.desc())
    stmt = select(Evento, Equipamento).join(Equipamento, isouter=True).where(*cond).order_by(*ordem).limit(limit)
    return [serializar(ev, eq) for ev, eq in s.exec(stmt)]


def _publicar(s: Session, ev: Evento) -> dict:
    alerta = serializar(ev, s.get(Equipamento, ev.equipamento_id) if ev.equipamento_id else None)
    bus.publicar("alerta", alerta)
    return alerta


def _repetido(s: Session, ev: Evento) -> Evento | None:
    """Alerta aberto do mesmo equipamento dentro da janela (evita 200 alertas iguais de um só equipamento)."""
    if ev.equipamento_id is None:
        return None
    return s.exec(
        select(Evento)
        .where(Evento.equipamento_id == ev.equipamento_id, Evento.status.in_(ABERTOS), Evento.ts >= ev.ts - JANELA_AGRUPAR)
        .order_by(Evento.ts.desc())
    ).first()


def registrar(s: Session, ev: Evento, agrupar: bool = True) -> dict:
    """Persiste o evento (ou o soma a um alerta aberto equivalente) e o publica como alerta no SSE."""
    ev.inicio = ev.inicio or ev.ts
    dup = _repetido(s, ev) if agrupar else None
    if dup:
        dup.ocorrencias += 1
        dup.ts, dup.severidade = ev.ts, max(dup.severidade, ev.severidade)
        ev = dup
    s.add(ev)
    s.commit()
    s.refresh(ev)
    return _publicar(s, ev)


def _obter(s: Session, id_: int) -> Evento:
    ev = s.get(Evento, id_)
    if not ev:
        raise HTTPException(404, f"Alerta {id_} não encontrado")
    if ev.status == StatusAlerta.resolvido:
        raise HTTPException(409, f"Alerta {id_} já está resolvido")
    return ev


def reconhecer(s: Session, id_: int) -> dict:
    ev = _obter(s, id_)
    if ev.status == StatusAlerta.aberto:
        ev.status, ev.reconhecido_em = StatusAlerta.reconhecido, agora()
        auditoria.registrar(s, "alerta", id_, "reconhecido")
    s.add(ev)
    s.commit()
    return _publicar(s, ev)


def eta_min(km: float) -> int:
    return max(1, round(km * FATOR_ROTA / VELOCIDADE_KMH * 60))


def _liberar(s: Session, ag: Agente) -> None:
    ag.alerta_id = ag.destino_lat = ag.destino_lon = None
    ag.status, ag.atualizado_em = StatusAgente.ativo, agora()
    s.add(ag)


def despachar(s: Session, id_: int, agente_id: int | None = None) -> dict:
    """Envia o agente (o escolhido ou o ativo mais próximo da mesma UF) ao local; ele passa a se mover até lá."""
    ev = _obter(s, id_)
    eq = s.get(Equipamento, ev.equipamento_id) if ev.equipamento_id else None
    b = BAIRROS[ev.bairro]
    lat, lon = (eq.lat, eq.lon) if eq else (b.lat, b.lon)
    if agente_id is None:
        ativos = s.exec(select(Agente).where(Agente.status == StatusAgente.ativo, Agente.uf == b.uf)).all()
        if not ativos:
            raise HTTPException(409, f"nenhum agente ativo disponível em {b.uf}")
        ag = mais_proximo(ativos, lat, lon)
    elif not (ag := s.get(Agente, agente_id)):
        raise HTTPException(404, f"Agente {agente_id} não encontrado")
    elif ag.status == StatusAgente.inativo:
        raise HTTPException(409, f"Agente {agente_id} está inativo")
    elif ag.alerta_id not in (None, ev.id):
        raise HTTPException(409, f"Agente {agente_id} já está atendendo o alerta {ag.alerta_id}")
    if ev.agente_id and ev.agente_id != ag.id and (anterior := s.get(Agente, ev.agente_id)):
        _liberar(s, anterior)
    km = float(haversine_km(ag.lat, ag.lon, lat, lon))
    ag.status, ag.alerta_id, ag.destino_lat, ag.destino_lon, ag.atualizado_em = (
        StatusAgente.em_ocorrencia,
        ev.id,
        lat,
        lon,
        agora(),
    )
    ev.agente_id = ag.id
    if ev.status == StatusAlerta.aberto:
        ev.status, ev.reconhecido_em = StatusAlerta.reconhecido, agora()
    auditoria.registrar(
        s, "alerta", ev.id, "despachado", {"agente_id": ag.id, "agente": ag.nome, "km": round(km, 2), "eta_min": eta_min(km)}
    )
    s.add_all([ag, ev])
    s.commit()
    bus.publicar("agente", [ag.model_dump()])
    return {"alerta": _publicar(s, ev), "agente": ag.model_dump(), "distancia_km": round(km, 2), "eta_min": eta_min(km)}


def chegou(s: Session, ag: Agente) -> None:
    """O agente despachado chegou: o alerta passa a 'em atendimento' (o agente fica no local até a resolução)."""
    ev = s.get(Evento, ag.alerta_id) if ag.alerta_id else None
    ag.destino_lat = ag.destino_lon = None
    s.add(ag)
    if ev and ev.status != StatusAlerta.resolvido:
        ev.status = StatusAlerta.em_atendimento
        auditoria.registrar(s, "alerta", ev.id, "agente_no_local", {"agente_id": ag.id})
        s.add(ev)
    s.commit()
    if ev:
        _publicar(s, ev)


def resolver(s: Session, id_: int) -> dict:
    ev = _obter(s, id_)
    ev.status, ev.resolvido_em = StatusAlerta.resolvido, agora()
    ev.reconhecido_em = ev.reconhecido_em or ev.resolvido_em
    if ev.agente_id and (ag := s.get(Agente, ev.agente_id)) and ag.alerta_id == ev.id:
        _liberar(s, ag)
        bus.publicar("agente", [ag.model_dump()])
    auditoria.registrar(
        s, "alerta", id_, "resolvido", {"duracao_min": round((ev.resolvido_em - (ev.inicio or ev.ts)).total_seconds() / 60)}
    )
    s.add(ev)
    s.commit()
    bus.publicar("kpis", kpis(s))
    return _publicar(s, ev)


def injetar(s: Session, dados: IncidenteIn) -> dict:
    """Modo demonstração: cria o incidente, degrada o equipamento e despacha o agente mais próximo (se houver na UF)."""
    eq = s.get(Equipamento, dados.equipamento_id) if dados.equipamento_id is not None else None
    if dados.equipamento_id is not None and not eq:
        raise HTTPException(404, f"Equipamento {dados.equipamento_id} não encontrado")
    bairro = eq.bairro if eq else dados.bairro
    if eq and dados.tipo == TipoEvento.falha:
        eq.situacao, eq.manutencao_tipo = Situacao.mau_funcionamento, ManutTipo.imediata
        s.add(eq)
    alerta = registrar(
        s, Evento(ts=agora(), bairro=bairro, tipo=dados.tipo, severidade=dados.severidade, equipamento_id=eq.id if eq else None)
    )
    try:
        despacho = despachar(s, alerta["id"])
    except HTTPException:  # sem agente ativo na UF: o incidente existe, só não há quem enviar
        despacho = None
    bus.publicar("kpis", kpis(s))
    return {
        "alerta": despacho["alerta"] if despacho else alerta,
        "agente_acionado": despacho["agente"]["id"] if despacho else None,
        "eta_min": despacho["eta_min"] if despacho else None,
    }
