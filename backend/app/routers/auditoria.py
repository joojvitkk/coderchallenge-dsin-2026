from typing import Annotated

from fastapi import APIRouter, HTTPException, Query
from sqlmodel import select

from ..crud import Sessao
from ..models import Auditoria, Equipamento, Evento, Telemetria

router = APIRouter(tags=["auditoria"])


@router.get("/auditoria")
def listar(
    s: Sessao, entidade: str | None = None, entidade_id: int | None = None, limit: Annotated[int, Query(ge=1, le=500)] = 50
):
    """Trilha de alterações (mais recentes primeiro), opcionalmente de uma entidade."""
    stmt = select(Auditoria).order_by(Auditoria.ts.desc()).limit(limit)
    if entidade:
        stmt = stmt.where(Auditoria.entidade == entidade)
    if entidade_id is not None:
        stmt = stmt.where(Auditoria.entidade_id == entidade_id)
    return s.exec(stmt).all()


@router.get("/equipamentos/{id_}/linha-do-tempo")
def linha_do_tempo(id_: int, s: Sessao, limit: Annotated[int, Query(ge=1, le=200)] = 40):
    """Histórico do equipamento: alertas, mudanças de situação (pela telemetria) e alterações de cadastro."""
    if not s.get(Equipamento, id_):
        raise HTTPException(404, f"Equipamento {id_} não encontrado")
    itens = [
        {"ts": a.ts, "tipo": "auditoria", "titulo": f"Cadastro {a.acao}", "detalhe": a.detalhe}
        for a in s.exec(select(Auditoria).where(Auditoria.entidade == "equipamento", Auditoria.entidade_id == id_))
    ]
    itens += [
        {
            "ts": e.ts,
            "tipo": "alerta",
            "titulo": f"Alerta {e.tipo} (sev. {e.severidade}, {e.ocorrencias}x)",
            "detalhe": {"status": e.status, "alerta_id": e.id},
        }
        for e in s.exec(select(Evento).where(Evento.equipamento_id == id_).order_by(Evento.ts.desc()).limit(limit))
    ]
    anterior = None
    for t in s.exec(select(Telemetria).where(Telemetria.equipamento_id == id_).order_by(Telemetria.ts)):
        if anterior is not None and t.situacao != anterior:
            itens.append(
                {"ts": t.ts, "tipo": "situacao", "titulo": f"Situação: {anterior} → {t.situacao}", "detalhe": t.metricas}
            )
        anterior = t.situacao
    return sorted(itens, key=lambda i: i["ts"], reverse=True)[:limit]
