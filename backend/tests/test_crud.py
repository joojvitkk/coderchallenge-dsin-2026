import pytest

from app.schemas import TIPOS
from tests.conftest import AGENTE


def test_crud_equipamento(client, equip):
    r = client.post("/api/equipamentos", json=equip)
    assert r.status_code == 201
    id_ = r.json()["id"]
    assert client.get(f"/api/equipamentos/{id_}").json()["serie"] == "RV-TESTE-1"
    r = client.put(f"/api/equipamentos/{id_}", json=equip | {"situacao": "operacional"})
    assert r.json()["situacao"] == "operacional"
    assert client.delete(f"/api/equipamentos/{id_}").status_code == 204
    assert client.get(f"/api/equipamentos/{id_}").status_code == 404


def test_serie_duplicada_409(client, equip):
    assert client.post("/api/equipamentos", json=equip).status_code == 201
    r = client.post("/api/equipamentos", json=equip)
    assert r.status_code == 409 and "detail" in r.json()


def test_crud_agente(client):
    r = client.post("/api/agentes", json=AGENTE)
    assert r.status_code == 201
    id_ = r.json()["id"]
    r = client.put(f"/api/agentes/{id_}", json=AGENTE | {"status": "inativo"})
    assert r.json()["status"] == "inativo"
    assert client.post("/api/agentes", json=AGENTE).status_code == 409
    assert client.delete(f"/api/agentes/{id_}").status_code == 204
    assert client.get("/api/agentes/999999").status_code == 404


def test_tipos_cobrem_enunciado(client):
    tipos = client.get("/api/tipos").json()
    assert set(tipos) == set(TIPOS) and len(tipos) == 15
    assert "velocidade_via_kmh" in tipos["radar_velocidade"]["schema"]["properties"]


@pytest.mark.parametrize("atributos", [
    {"faixas": 2, "modo": "fixo"},  # falta campo
    {"faixas": 2, "velocidade_via_kmh": 500, "modo": "fixo"},  # fora do intervalo
    {"faixas": 2, "velocidade_via_kmh": 60, "modo": "fixo", "extra": 1},  # campo desconhecido
    {"faixas": 2, "velocidade_via_kmh": 60, "modo": "voador"},  # enum inválido
])
def test_validacao_por_tipo(client, equip, atributos):
    r = client.post("/api/equipamentos", json=equip | {"atributos": atributos})
    assert r.status_code == 422 and "atributos" in str(r.json()["detail"])


def test_atributos_de_outro_tipo_rejeitados(client, equip):
    r = client.post("/api/equipamentos", json=equip | {"tipo": "camera"})
    assert r.status_code == 422


def test_validacoes_gerais(client, equip):
    assert client.post("/api/equipamentos", json=equip | {"cep": "123"}).status_code == 422
    assert client.post("/api/equipamentos", json=equip | {"manutencao_tipo": "agendada"}).status_code == 422
    assert client.post("/api/equipamentos", json=equip | {"tipo": "xyz"}).status_code == 422
    placa = {"placa": "abc", "alvara": "AL-1", "capacidade_passageiros": 4, "ponto": "P1", "taximetro_lacre": "LC123"}
    r = client.post("/api/equipamentos", json=equip | {"tipo": "taxi", "atributos": placa})
    assert r.status_code == 422


def test_filtros_e_paginacao(client):
    r = client.get("/api/equipamentos", params={"limit": 500})
    assert r.headers["X-Total-Count"] == "200" and len(r.json()) == 200
    cams = client.get("/api/equipamentos", params={"tipo": "camera", "limit": 500}).json()
    assert cams and all(e["tipo"] == "camera" for e in cams)
    combo = client.get("/api/equipamentos", params={"regiao": "Marília Norte", "situacao": "operacional"}).json()
    assert combo and all(e["regiao"] == "Marília Norte" and e["situacao"] == "operacional" for e in combo)
    sp = client.get("/api/equipamentos", params={"uf": "SP", "cidade": "Garça", "limit": 500}).json()
    assert sp and all(e["uf"] == "SP" and e["cidade"] == "Garça" for e in sp)
    pag = client.get("/api/equipamentos", params={"limit": 5, "offset": 5}).json()
    assert len(pag) == 5 and pag[0]["id"] == 6
    assert client.get("/api/equipamentos", params={"limit": 0}).status_code == 422
    assert client.get("/api/equipamentos", params={"inexistente": 1}).status_code == 422


def test_busca_textual_e_manutencao(client):
    serie = client.get("/api/equipamentos", params={"limit": 1}).json()[0]["serie"]
    assert client.get("/api/equipamentos", params={"q": serie.lower()}).json()[0]["serie"] == serie
    todos = client.get("/api/equipamentos", params={"limit": 500}).json()
    com = client.get("/api/equipamentos", params={"precisa_manutencao": True, "limit": 500}).json()
    sem = client.get("/api/equipamentos", params={"precisa_manutencao": False, "limit": 500}).json()
    assert len(com) + len(sem) == len(todos) and com and sem


def test_filtro_agentes(client):
    ag = client.get("/api/agentes", params={"categoria": "guarda", "status": "ativo"}).json()
    assert ag and all(a["categoria"] == "guarda" and a["status"] == "ativo" for a in ag)
    assert client.get("/api/agentes", params={"limit": 100}).headers["X-Total-Count"] == "50"
