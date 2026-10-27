import os

os.environ.setdefault("FOGO_RATE", "0")  # sem limite de escrita na suíte (o limitador tem teste próprio)

from functools import cache

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel

from app import db
from app.main import app
from app.predict import dados
from app.seed import semear


def _novo_engine():
    eng = db.criar_engine("sqlite://", poolclass=StaticPool)
    SQLModel.metadata.create_all(eng)
    return eng


@cache
def _molde(dias: int):
    """Banco semeado uma única vez por duração; cada teste recebe uma cópia em memória (backup do SQLite)."""
    eng = _novo_engine()
    with Session(eng) as s:
        semear(s, dias=dias)
    return eng


def engine_semeado(dias: int):
    eng, molde = _novo_engine(), _molde(dias)
    with molde.connect() as origem, eng.connect() as destino:
        origem.connection.driver_connection.backup(destino.connection.driver_connection)
    return eng


@pytest.fixture
def engine(monkeypatch):
    eng = engine_semeado(14)
    monkeypatch.setattr(db, "engine", eng)
    dados._cache.clear()  # a chave do cache usa id(engine), que o Python pode reaproveitar
    yield eng
    eng.dispose()


@pytest.fixture
def client(engine):
    return TestClient(app)  # sem `with`: não dispara lifespan (simulador desligado)


EQUIP = {
    "tipo": "radar_velocidade", "serie": "RV-TESTE-1", "marca": "Perkons", "modelo": "X1", "orgao": "DETRAN-SP",
    "cep": "17500-000", "bairro": "Centro", "regiao": "Marília Centro", "cidade": "Marília", "uf": "SP", "rua": "Rua A",
    "lat": -22.21, "lon": -49.94,
    "atributos": {"faixas": 2, "velocidade_via_kmh": 60, "modo": "fixo"},
}
AGENTE = {"nome": "Teste Silva", "matricula": "AG9999", "categoria": "guarda", "orgao": "Guarda Municipal",
          "cidade": "Marília", "uf": "SP", "lat": -22.21, "lon": -49.94}


@pytest.fixture
def equip():
    return dict(EQUIP)
