import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import event, inspect
from sqlmodel import Session, SQLModel, create_engine

DB_URL = os.getenv("FOGO_DB", f"sqlite:///{Path(__file__).resolve().parents[1] / 'fogo.db'}")


TZ_BR = timedelta(hours=3)  # Brasília (UTC-3, sem horário de verão desde 2019): perfis horários e textos do briefing


def agora() -> datetime:
    """Instante atual em UTC, sem tzinfo (SQLite guarda datas ingênuas)."""
    return datetime.now(UTC).replace(tzinfo=None)


def criar_engine(url: str = DB_URL, **kw):
    eng = create_engine(url, connect_args={"check_same_thread": False}, **kw)

    @event.listens_for(eng, "connect")
    def _pragmas(conn, _):
        conn.execute("PRAGMA foreign_keys=ON")

    return eng


engine = criar_engine()


def init_db(eng=None) -> None:
    """Cria as tabelas; um banco criado por versão anterior (colunas faltando) falha com instrução clara em vez de erro SQL."""
    eng = eng or engine
    SQLModel.metadata.create_all(eng)
    existentes = inspect(eng)
    for t in SQLModel.metadata.sorted_tables:
        faltam = {c.name for c in t.columns} - {c["name"] for c in existentes.get_columns(t.name)}
        if faltam:
            raise RuntimeError(
                f"banco desatualizado: a tabela {t.name} não tem {sorted(faltam)}. "
                f"Apague o arquivo do banco ({eng.url}); os dados são sintéticos e serão recriados."
            )


def get_session():
    with Session(engine, expire_on_commit=False) as s:
        yield s
