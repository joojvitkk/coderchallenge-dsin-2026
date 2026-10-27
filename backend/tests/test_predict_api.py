import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from predict_sintetico import para_banco
from sqlalchemy import create_engine

from app.predict import dados
from app.routers import previsao


@pytest.fixture
def client(tmp_path):
    engine = create_engine(f"sqlite:///{tmp_path}/t.db")
    para_banco(engine)
    app = FastAPI()
    app.include_router(previsao.router, prefix="/api")
    app.dependency_overrides[previsao.get_dados] = lambda: dados.carregar(engine)
    return TestClient(app)


def teste_contrato_das_respostas(client):
    for rota in ("risco", "anomalias", "manutencao-preditiva", "reforco"):
        j = client.get(f"/api/previsao/{rota}")
        assert j.status_code == 200, (rota, j.text)
        assert {"preve", "dados_usados", "recomendacao"} <= set(j.json())
    j = client.get("/api/previsao/cenario", params={"evento": "chuva"})
    assert j.status_code == 200 and "delta_risco_medio" in j.json()


def teste_risco_traz_fatores_e_ic(client):
    m = client.get("/api/previsao/risco", params={"horas": 12}).json()["matriz"]
    assert set(m) == {"A", "B", "C"} and len(m["B"]) == 13 and m["B"][0]["h"] == 0
    cel = m["B"][0]
    assert cel["ic_inf"] <= cel["score"] <= cel["ic_sup"] and isinstance(cel["fatores"], list)


def teste_manutencao_e_anomalias_via_banco(client):
    o = client.get("/api/previsao/manutencao-preditiva").json()["ordens"]
    assert o[0]["equipamento_id"] == 2 and o[0]["ordem"] == 1
    an = client.get("/api/previsao/anomalias").json()["anomalias"]
    assert {a["equipamento_id"] for a in an if a["metrica"] == "latencia_ms"} == {2, 3}


def teste_cenario_invalido_422_e_horas_fora_do_limite(client):
    assert client.get("/api/previsao/cenario", params={"evento": "x"}).status_code == 422
    assert client.get("/api/previsao/risco", params={"horas": 0}).status_code == 422


def teste_reforco_json_serializavel(client):
    j = client.get("/api/previsao/reforco", params={"horas": 24}).json()
    assert j["plano"]["cobertura_depois"] >= j["plano"]["cobertura_antes"]
