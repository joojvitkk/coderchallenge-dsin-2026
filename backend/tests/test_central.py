import asyncio

from sqlmodel import Session, select

from app.geo import BAIRROS, bairros_de
from app.models import Equipamento, Evento
from app.services import stream
from simulator.sim import Simulador
from tests.conftest import engine_semeado


def test_kpis_batem_com_banco(client):
    k = client.get("/api/central/kpis").json()
    eqs = client.get("/api/equipamentos", params={"limit": 500}).json()
    assert k["equipamentos_total"] == len(eqs) == sum(k["por_situacao"].values())
    oper = sum(e["situacao"] == "operacional" for e in eqs)
    assert k["por_situacao"]["operacional"] == oper
    ativas = sum(e["situacao"] in ("operacional", "mau_funcionamento", "em_manutencao", "furtado") for e in eqs)
    assert k["disponibilidade_pct"] == round(100 * oper / ativas, 1)
    assert k["agentes_total"] == 50 and k["manutencao_imediata"] > 0


def test_regioes(client):
    regs = client.get("/api/central/regioes").json()
    assert {"Marília Centro", "Região de Marília", "Norte", "Nordeste"} <= {r["nome"] for r in regs}
    assert sum(len(r["bairros"]) for r in regs) == len(BAIRROS)
    assert sum(r["equipamentos"] for r in regs) == 200
    assert all(0 <= r["saude"] <= 100 for r in regs)


def test_agregacao_e_kpis_por_cidade_e_uf(client):
    ufs = {r["nome"]: r for r in client.get("/api/central/regioes", params={"por": "uf"}).json()}
    cids = {r["nome"]: r for r in client.get("/api/central/regioes", params={"por": "cidade"}).json()}
    assert {"SP", "PR", "MT", "BA", "AM"} <= set(ufs) and "Marília" in cids
    assert sum(r["equipamentos"] for r in ufs.values()) == sum(r["equipamentos"] for r in cids.values()) == 200
    assert cids["Marília"]["equipamentos"] > 0.5 * 200  # maior densidade
    k = client.get("/api/central/kpis", params={"cidade": "Marília"}).json()
    assert k["equipamentos_total"] == cids["Marília"]["equipamentos"] and 0 < k["agentes_total"] < 50
    assert client.get("/api/central/kpis", params={"uf": "PR"}).json()["equipamentos_total"] == ufs["PR"]["equipamentos"]
    mt = client.get("/api/central/regioes", params={"uf": "MT", "por": "cidade"}).json()
    assert {r["nome"] for r in mt} == {"Várzea Grande", "Cuiabá"}
    assert all(a["uf"] == "SP" for a in client.get("/api/central/alertas", params={"uf": "SP", "horas": 24 * 14}).json())
    assert client.get("/api/central/cidades").json()[0]["cidade"] == "Marília"


def test_alertas_e_manutencao(client):
    todos = client.get("/api/central/replay", params={"horas": 72}).json()
    assert len({a["severidade"] for a in todos}) == 4  # escala 1-4 realista, não saturada em "crítico"
    assert sum(a["severidade"] == 4 for a in todos) < 0.2 * len(todos)
    assert [a["ts"] for a in todos] == sorted(a["ts"] for a in todos)  # replay em ordem cronológica
    alertas = client.get("/api/central/alertas", params={"horas": 24 * 14}).json()
    assert alertas and all(a["status"] != "resolvido" for a in alertas)
    sev = [a["severidade"] for a in alertas]
    assert sev == sorted(sev, reverse=True)  # mais graves primeiro
    man = client.get("/api/central/manutencao").json()
    assert man and man[0]["manutencao_tipo"] == "imediata"
    sul = client.get("/api/central/manutencao", params={"regiao": "Marília Sul"}).json()
    assert all(m["regiao"] == "Marília Sul" for m in sul)


def test_incidente_reflete_em_alertas_e_kpis(client):
    antes = client.get("/api/central/kpis").json()
    eq = client.get("/api/equipamentos", params={"situacao": "operacional", "limit": 1}).json()[0]
    r = client.post("/api/demo/incidente", json={"equipamento_id": eq["id"], "tipo": "falha", "severidade": 4})
    assert r.status_code == 201 and r.json()["agente_acionado"]
    depois = client.get("/api/central/kpis").json()
    assert depois["alertas_criticos"] == antes["alertas_criticos"] + 1
    assert depois["por_situacao"]["mau_funcionamento"] == antes["por_situacao"]["mau_funcionamento"] + 1
    assert depois["agentes_em_ocorrencia"] == antes["agentes_em_ocorrencia"] + 1
    assert client.get("/api/central/alertas", params={"limit": 1}).json()[0]["equipamento"]["serie"] == eq["serie"]


def test_incidente_validacao(client):
    assert client.post("/api/demo/incidente", json={}).status_code == 422
    assert client.post("/api/demo/incidente", json={"bairro": "Marte"}).status_code == 422
    assert client.post("/api/demo/incidente", json={"equipamento_id": 99999}).status_code == 404
    assert client.post("/api/demo/incidente", json={"bairro": "Centro de Manaus"}).status_code == 201  # sem agente no AM: ok
    assert client.post("/api/demo/incidente", json={"bairro": "Fragata"}).json()["agente_acionado"]


def test_seed_deterministico_e_historico(engine):
    with Session(engine) as s:
        eventos = s.exec(select(Evento)).all()
        assert [e.ts.hour for e in eventos[:20]] == [e.ts.hour for e in s.exec(select(Evento).limit(20))]
        assert len(s.exec(select(Equipamento)).all()) == 200


def test_historico_sazonalidade():
    with Session(engine_semeado(90)) as s:
        ev = s.exec(select(Evento)).all()
    horas = [e.ts.hour for e in ev]
    assert len(ev) > 2000
    assert horas.count(21) > 2 * horas.count(6)  # 18h vs 3h em Brasília (o banco guarda UTC)
    centro = sum(e.bairro == "Centro" for e in ev)  # Centro de Marília
    assert centro > 1.5 * sum(e.bairro == "Centro de Oriente" for e in ev)


def test_simulador_passo_move_agentes(engine):
    sim = Simulador(engine, semente=1)
    primeira = dict(sim.passo())
    segunda = dict(sim.passo())
    assert {"agente", "telemetria", "kpis"} <= set(primeira)
    mov = [(a, b) for a, b in zip(primeira["agente"], segunda["agente"], strict=True)
           if (a["lat"], a["lon"]) != (b["lat"], b["lon"])]
    assert mov and len(segunda["telemetria"]) == sim.amostra


def test_sse_entrega_eventos_publicados():
    async def cenario():
        gen = stream.eventos(heartbeat=0.05)
        assert await anext(gen) == ": conectado\n\n"
        stream.bus.publicar("kpis", {"x": 1})
        msg = await anext(gen)
        assert msg.startswith("id: ") and msg.endswith('event: kpis\ndata: {"x": 1}\n\n')  # id = epoch ms da emissão
        assert await anext(gen) == ": hb\n\n"
        await gen.aclose()
        assert not stream.bus._subs

    asyncio.run(cenario())


def test_endpoint_stream_registrado(client):
    rotas = client.get("/openapi.json").json()["paths"]
    assert "/api/stream" in rotas and "/api/previsao/risco" in rotas
    assert client.get("/api/health").json() == {"status": "ok"}


def test_previsao_sobre_seed_real(client):
    for rota in ("risco", "anomalias", "manutencao-preditiva", "reforco"):
        r = client.get(f"/api/previsao/{rota}")
        assert r.status_code == 200, (rota, r.text)
        assert r.json()["dados_usados"]["equipamentos"] == 200
    assert client.get("/api/previsao/cenario", params={"evento": "chuva"}).status_code == 200


def test_previsao_por_cidade_uf_e_agrupamento(client):
    r = client.get("/api/previsao/risco", params={"horas": 6, "cidade": "Marília"}).json()
    assert set(r["matriz"]) == set(bairros_de("Marília")) and r["dados_usados"]["equipamentos"] > 100
    uf = client.get("/api/previsao/risco", params={"horas": 6, "agrupar": "uf"}).json()["matriz"]
    assert {"SP", "PR", "MT", "AM"} <= set(uf) and len(uf["SP"]) == 7 and "fatores" in uf["SP"][0]
    assert set(client.get("/api/previsao/risco", params={"horas": 3, "uf": "PR", "agrupar": "cidade"}).json()["matriz"]) == {
        "Maringá", "Londrina", "Toledo", "Curitiba"}
    assert client.get("/api/previsao/risco", params={"cidade": "Atlantida"}).status_code == 404
    ref = client.get("/api/previsao/reforco", params={"uf": "SP"}).json()
    assert all(m["km"] <= 60 for m in ref["plano"]["movimentos"]) and ref["lacunas"] is not None


def test_reforco_move_cada_agente_no_maximo_uma_vez(client):
    movs = client.get("/api/previsao/reforco", params={"horas": 24}).json()["plano"]["movimentos"]
    ids = [m["agente_id"] for m in movs]
    assert movs and len(ids) == len(set(ids))
