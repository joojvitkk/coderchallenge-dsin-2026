"""Segurança e robustez: injeção de fórmula no CSV, limites de tamanho, GeoJSON malformado, limite de escrita, despacho."""

import csv
import io
import json

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.limite import LimiteEscrita
from app.routers import inventario_io as io_


def _csv(*linhas: dict) -> str:
    buf = io.StringIO()
    w = csv.DictWriter(buf, list(linhas[0]))
    w.writeheader()
    w.writerows(linhas)
    return buf.getvalue()


def _linha(equip, serie, **extra):
    return {**equip, "serie": serie, "atributos": json.dumps(equip["atributos"]), **extra}


def test_exportar_neutraliza_formulas_e_importar_restaura(client, equip):
    r = client.post("/api/equipamentos", json={**equip, "marca": "=HYPERLINK(\"http://x\")", "referencia": "@cmd"})
    assert r.status_code == 201
    texto = client.get("/api/equipamentos/exportar", params={"q": "RV-TESTE-1"}).text
    linha = next(csv.DictReader(io.StringIO(texto)))
    assert linha["marca"].startswith("'=") and linha["referencia"] == "'@cmd"  # a planilha não executa
    assert float(linha["lat"]) < 0  # números negativos não são tratados como texto de fórmula
    rel = client.post("/api/equipamentos/importar", content=texto, params={"simular": True}).json()
    assert rel["erros"] == [] and rel["atualizados"] >= 1
    client.post("/api/equipamentos/importar", content=texto)
    assert client.get("/api/equipamentos", params={"q": "RV-TESTE-1"}).json()[0]["marca"] == '=HYPERLINK("http://x")'


def test_importar_rejeita_arquivo_grande_e_linhas_demais(client, equip, monkeypatch):
    assert client.post("/api/equipamentos/importar", content=b"x" * (io_.MAX_BYTES + 1)).status_code == 413
    monkeypatch.setattr(io_, "MAX_LINHAS", 2)
    texto = _csv(*(_linha(equip, f"LIM-{i:04d}") for i in range(3)))
    assert client.post("/api/equipamentos/importar", content=texto).status_code == 413
    assert client.get("/api/equipamentos", params={"q": "LIM-"}).json() == []


def test_importar_limita_o_relatorio_de_erros(client, equip, monkeypatch):
    monkeypatch.setattr(io_, "MAX_ERROS", 3)
    texto = _csv(*(_linha(equip, f"ERR-{i:04d}", cep="x") for i in range(10)))
    r = client.post("/api/equipamentos/importar", content=texto).json()
    assert len(r["erros"]) == 3 and r["erros_truncados"] and not r["gravado"]


def test_importar_entradas_malformadas_dao_422_ou_relatorio(client, equip):
    post = lambda c, **p: client.post("/api/equipamentos/importar", content=c, params=p)  # noqa: E731
    assert post(b"\xff\xfe\x00", formato="csv").status_code == 422
    assert post("[1, 2]", formato="geojson").status_code == 422
    assert post(json.dumps({"features": [1]}), formato="geojson").status_code == 422
    sem_geo = json.dumps({"features": [{"properties": {"serie": "G-1"}, "geometry": {"coordinates": "abc"}}]})
    r = post(sem_geo, formato="geojson").json()
    assert r["validos"] == 0 and r["erros"] and not r["gravado"]
    ruim = _csv(_linha(equip, "ATR-0001")).replace('"{', "{{").replace("}\"", "}}")
    assert post(ruim).json()["erros"]  # JSON de atributos quebrado vira erro de linha, não 500


def test_importar_e_atomico_com_serie_repetida_no_arquivo(client, equip):
    texto = _csv(_linha(equip, "DUP-0001"), _linha(equip, "DUP-0001"))
    r = client.post("/api/equipamentos/importar", content=texto).json()
    assert not r["gravado"] and "repetida" in r["erros"][0]["mensagem"]
    assert client.get("/api/equipamentos", params={"q": "DUP-0001"}).json() == []


def test_limite_de_escrita_por_ip_ignora_leituras():
    app = FastAPI()

    @app.post("/w")
    def w():
        return {}

    @app.get("/r")
    def r():
        return {}

    app.add_middleware(LimiteEscrita, maximo=3)
    c = TestClient(app)
    assert [c.post("/w").status_code for _ in range(5)] == [200, 200, 200, 429, 429]
    assert c.post("/w").headers["Retry-After"] == "60"
    assert all(c.get("/r").status_code == 200 for _ in range(10))


def test_despacho_nao_rouba_agente_ocupado(client):
    a = client.post("/api/demo/incidente", json={"bairro": "Fragata", "severidade": 4}).json()
    outro = client.post("/api/demo/incidente", json={"bairro": "Cascata", "severidade": 3}).json()["alerta"]
    ocupado = a["agente_acionado"]
    r = client.post(f"/api/central/alertas/{outro['id']}/despachar", params={"agente_id": ocupado})
    assert r.status_code == 409 and "atendendo" in r.json()["detail"]


def test_banco_de_versao_anterior_falha_com_instrucao_clara(tmp_path):
    import sqlite3

    import pytest

    from app import db

    arq = tmp_path / "velho.db"
    sqlite3.connect(arq).execute("CREATE TABLE equipamento (id INTEGER PRIMARY KEY, serie TEXT)").connection.commit()
    with pytest.raises(RuntimeError, match="Apague o arquivo do banco"):
        db.init_db(db.criar_engine(f"sqlite:///{arq}"))


def test_calor_por_modo_respeita_escopo_e_filtros(client):
    for modo in ("alertas", "indisponibilidade", "cobertura"):
        r = client.get("/api/central/calor", params={"modo": modo}).json()
        assert r["pontos"] and len(r["focos"]) <= 5 and r["preve"] and r["dados_usados"]["pontos"] == len(r["pontos"])
        assert all({"lat", "lon", "peso"} == set(p) and p["peso"] > 0 for p in r["pontos"])
    todos = client.get("/api/central/calor", params={"modo": "indisponibilidade"}).json()
    marilia = client.get("/api/central/calor", params={"modo": "indisponibilidade", "cidade": "Marília"}).json()
    cam = client.get("/api/central/calor", params={"modo": "indisponibilidade", "tipo": "camera"}).json()
    assert 0 < sum(p["peso"] for p in marilia["pontos"]) < sum(p["peso"] for p in todos["pontos"])
    assert sum(p["peso"] for p in cam["pontos"]) < sum(p["peso"] for p in todos["pontos"])
    quente = client.post("/api/demo/incidente", json={"bairro": "Fragata", "severidade": 4})
    assert quente.status_code == 201
    al = client.get("/api/central/calor", params={"modo": "alertas", "horas": 1, "cidade": "Marília"}).json()
    # o incidente recente pesa 4 (severidade); o histórico semeado também tem alertas na última hora,
    # então qual bairro lidera os focos depende da hora do dia
    assert sum(p["peso"] for p in al["pontos"]) >= 4
    assert client.get("/api/central/calor", params={"modo": "x"}).status_code == 422
    assert client.get("/api/central/calor", params={"modo": "cobertura", "cidade": "Nada"}).status_code == 404
