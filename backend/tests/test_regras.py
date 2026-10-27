"""Regras de negócio que os demais testes só tocam de passagem."""

import numpy as np
import pytest
from sqlmodel import Session, select

from app.geo import BAIRROS, CONFIRMADAS, bairros_de, cidades, mais_proximo
from app.models import Agente, Telemetria
from app.services.kpis import _disponibilidade
from app.services.telemetria import metricas, severidade
from tests.conftest import AGENTE

MOTOTAXI = {"placa": "ABC1D23", "alvara": "AL-1", "capacidade_passageiros": 1}


def test_disponibilidade_ignora_nao_instalado_e_desativado():
    assert _disponibilidade({"operacional": 3, "mau_funcionamento": 1, "desativado": 9, "nao_instalado": 9}) == 75.0
    assert _disponibilidade({}) == 0.0


@pytest.mark.parametrize(("m", "esperado"), [
    ({"latencia_ms": 80, "temperatura": 40, "taxa_erro": 0.01}, None),
    ({"latencia_ms": 250, "temperatura": 40, "taxa_erro": 0.01}, 2),
    ({"latencia_ms": 80, "temperatura": 70, "taxa_erro": 0.01}, 3),
    ({"latencia_ms": 80, "temperatura": 40, "taxa_erro": 0.25}, 4),
])
def test_severidade_por_limiares(m, esperado):
    assert severidade(m) == esperado


def test_degradacao_piora_metricas():
    sao = metricas(np.random.default_rng(1), 0.0, 12)
    ruim = metricas(np.random.default_rng(1), 1.0, 12)
    assert ruim["latencia_ms"] > sao["latencia_ms"] and ruim["taxa_erro"] > sao["taxa_erro"] and ruim["bateria"] < sao["bateria"]
    assert severidade(sao) is None and severidade(ruim) == 4


def test_geo_mais_proximo_e_escopo():
    c = BAIRROS["Fragata"]
    assert mais_proximo(BAIRROS.values(), c.lat + 0.001, c.lon) is c and c.regiao == "Marília Sul"
    assert set(bairros_de("Marília")) == {n for n, b in BAIRROS.items() if b.cidade == "Marília"}
    assert len(bairros_de("Marília")) == 10
    assert set(bairros_de(uf="PR")) == {"Centro de Maringá", "Centro de Londrina", "Centro de Toledo", "Centro de Curitiba"}
    assert bairros_de("Marília", "PR") == []


def test_cidades_marcam_so_as_confirmadas_pela_pesquisa():
    lista = cidades()
    assert {c["cidade"] for c in lista if c["dsin"]} == set(CONFIRMADAS)
    assert {c["uf"] for c in lista} >= {"SP", "PR", "MT", "BA", "AM", "RS"} and len(lista) >= 30


def test_mototaxi_so_cabe_um_passageiro_extra(client, equip):
    base = equip | {"tipo": "mototaxi"}
    assert client.post("/api/equipamentos", json=base | {"atributos": MOTOTAXI}).status_code == 201
    r = client.post("/api/equipamentos", json=base | {"serie": "MT-9", "atributos": MOTOTAXI | {"capacidade_passageiros": 3}})
    assert r.status_code == 422


def test_atributos_sao_normalizados_com_padroes(client, equip):
    r = client.post("/api/equipamentos", json=equip).json()
    assert r["atributos"]["sentido"] == "ambos" and r["situacao"] == "nao_instalado"


def test_put_valida_e_404(client, equip):
    id_ = client.post("/api/equipamentos", json=equip).json()["id"]
    assert client.put(f"/api/equipamentos/{id_}", json=equip | {"lat": 200}).status_code == 422
    assert client.put("/api/equipamentos/99999", json=equip).status_code == 404
    assert client.delete("/api/equipamentos/99999").status_code == 404


def test_matricula_duplicada_409(client):
    assert client.post("/api/agentes", json=AGENTE).status_code == 201
    assert client.post("/api/agentes", json=AGENTE).status_code == 409


def test_filtro_tipo_multiplo_e_curingas_literais(client):
    r = client.get("/api/equipamentos", params={"tipo": "camera,taxi", "limit": 500})
    tipos = {e["tipo"] for e in r.json()}
    assert tipos == {"camera", "taxi"} and int(r.headers["X-Total-Count"]) == len(r.json())
    assert client.get("/api/equipamentos", params={"tipo": "camera", "q": "%"}).json() == []


def test_excluir_equipamento_apaga_telemetria(client, engine):
    with Session(engine) as s:
        eid = s.exec(select(Telemetria.equipamento_id)).first()
    assert client.delete(f"/api/equipamentos/{eid}").status_code == 204
    with Session(engine) as s:
        assert s.exec(select(Telemetria).where(Telemetria.equipamento_id == eid)).first() is None


def test_incidente_de_falha_aciona_agente_mais_proximo(client, engine):
    eq = client.get("/api/equipamentos", params={"situacao": "operacional", "limit": 1}).json()[0]
    with Session(engine) as s:
        ativos = s.exec(select(Agente).where(Agente.status == "ativo")).all()
        esperado = mais_proximo(ativos, eq["lat"], eq["lon"]).id
    r = client.post("/api/demo/incidente", json={"equipamento_id": eq["id"], "tipo": "falha"}).json()
    assert r["agente_acionado"] == esperado
    atual = client.get(f"/api/equipamentos/{eq['id']}").json()
    assert (atual["situacao"], atual["manutencao_tipo"]) == ("mau_funcionamento", "imediata")


def test_alertas_respeitam_severidade_minima(client):
    alertas = client.get("/api/central/alertas", params={"horas": 24 * 14, "sev_min": 4, "limit": 500}).json()
    assert alertas and {a["severidade"] for a in alertas} == {4}
    assert client.get("/api/central/alertas", params={"sev_min": 9}).status_code == 422


def test_risco_inclui_agora_h0(client):
    m = client.get("/api/previsao/risco", params={"horas": 24}).json()["matriz"]
    assert all([c["h"] for c in cels] == list(range(25)) for cels in m.values())


def test_cors_somente_origens_configuradas(client):
    ok = client.get("/api/health", headers={"Origin": "http://localhost:5173"})
    assert ok.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "access-control-allow-origin" not in client.get("/api/health", headers={"Origin": "http://evil.example"}).headers


def test_carregar_cache_reusa_e_isola_copias(monkeypatch):
    from app.predict import dados

    chamadas = []
    quadro = dados.pd.DataFrame({"a": [1]})
    monkeypatch.setattr(dados, "carregar", lambda e, c=None, u=None: chamadas.append(1) or {"equip": quadro.copy(), "agora": 1})
    dados._cache.clear()
    motor = object()
    a = dados.carregar_cache(motor)
    a["equip"]["a"] = 99  # alterar a cópia não pode contaminar o cache
    assert dados.carregar_cache(motor)["equip"]["a"].tolist() == [1] and len(chamadas) == 1
    dados.carregar_cache(motor, uf="SP")  # outro escopo = outra carga
    assert len(chamadas) == 2
    dados._cache.clear()


def test_anomalias_sem_leituras_suficientes_nao_quebra(client):
    from app.predict import anomalia

    vazio = anomalia.detectar(anomalia.pd.DataFrame({"equipamento_id": [], "ts": []}))
    assert vazio.anomalo.dtype == bool and vazio[vazio.anomalo].empty
    r = client.get("/api/previsao/anomalias", params={"cidade": "Garça", "uf": "SP"})
    assert r.status_code == 200
