"""CRUD genérico e filtro compartilhado (usado por equipamentos, agentes e pelo Copilot)."""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, select

from .db import get_session
from .services import auditoria

Sessao = Annotated[Session, Depends(get_session)]


def _escopo(cidade: str | None = None, uf: str | None = None) -> dict:
    return {"cidade": cidade, "uf": uf}


Escopo = Annotated[dict, Depends(_escopo)]  # ?cidade=&uf= nos endpoints de central e previsão


class Filtro(BaseModel):
    model_config = ConfigDict(extra="forbid")
    q: str | None = None
    orgao: str | None = None
    limit: int = Field(100, ge=1, le=500)
    offset: int = Field(0, ge=0)


def filtrar(Model, f: Filtro):
    """Monta o SELECT de Model aplicando os filtros (igualdade, busca textual, manutenção)."""
    stmt = select(Model)
    for campo, valor in f.model_dump(exclude_none=True, exclude={"limit", "offset"}).items():
        if campo == "q":
            stmt = stmt.where(or_(*(getattr(Model, c).icontains(valor, autoescape=True) for c in Model.BUSCA)))
        elif campo == "precisa_manutencao":
            cond = Model.precisa_manutencao()
            stmt = stmt.where(cond if valor else ~cond)
        else:
            col = getattr(Model, campo)
            stmt = stmt.where(col.in_(valor) if isinstance(valor, list) else col == valor)
    return stmt


def _gravar(s: Session, obj, entidade: str, acao: str, detalhe: dict | None = None):
    """Grava e audita na mesma transação; `detalhe` pode ser calculado depois do flush (ex.: id novo)."""
    try:
        s.add(obj)
        s.flush()
        auditoria.registrar(s, entidade, obj.id, acao, detalhe)
        s.commit()
    except IntegrityError:
        s.rollback()
        raise HTTPException(409, "valor único já cadastrado (serie/matricula)") from None
    s.refresh(obj)
    return obj


def crud_router(Model, In, Filtro_, prefixo: str) -> APIRouter:
    nome = prefixo.rsplit("/", 1)[-1]
    entidade = nome.removesuffix("s")  # equipamentos -> equipamento
    r = APIRouter(prefix=prefixo, tags=[nome])

    def obter(s: Session, id_: int):
        obj = s.get(Model, id_)
        if not obj:
            raise HTTPException(404, f"{Model.__name__} {id_} não encontrado")
        return obj

    @r.get("", response_model=list[Model])
    def listar(f: Annotated[Filtro_, Query()], s: Sessao, resp: Response):
        stmt = filtrar(Model, f)
        resp.headers["X-Total-Count"] = str(
            s.exec(select(func.count()).select_from(stmt.subquery())).one()
        )
        return s.exec(stmt.order_by(Model.id).offset(f.offset).limit(f.limit)).all()

    @r.post("", response_model=Model, status_code=201)
    def criar(body: In, s: Sessao):
        dados = body.model_dump(mode="json")
        return _gravar(s, Model(**body.model_dump()), entidade, "criado", {"campos": {k: dados[k] for k in list(dados)[:6]}})

    @r.get("/{id_}", response_model=Model)
    def ler(id_: int, s: Sessao):
        return obter(s, id_)

    @r.put("/{id_}", response_model=Model)
    def atualizar(id_: int, body: In, s: Sessao):
        obj = obter(s, id_)
        antes = obj.model_dump(mode="json")
        mudou = auditoria.diff(antes, body.model_dump(mode="json"))
        return _gravar(s, obj.sqlmodel_update(body.model_dump()), entidade, "alterado", {"campos": mudou})

    @r.delete("/{id_}", status_code=204)
    def remover(id_: int, s: Sessao):
        obj = obter(s, id_)
        auditoria.registrar(s, entidade, id_, "excluido", {"nome": getattr(obj, "serie", None) or getattr(obj, "nome", "")})
        s.delete(obj)
        s.commit()

    return r
