"""Diferenciais: ciclo de vida de alertas, despacho, auditoria, retenção, importação/exportação, backtesting, briefing."""

import csv
import io
import json
from datetime import timedelta

import pandas as pd
from sqlmodel import Session, select

from app.db import agora
from app.models import Auditoria, Equipamento, Evento, Telemetria
from app.predict import backtest, dados
from app.services import telemetria
from simulator.sim import Simulador
from tests.conftest import engine_semeado


def incidente(client, **corpo):
    r = client.post("/api/demo/incidente", json=corpo)
    assert r.status_code == 201, r.text
    return r.json()


def test_repeticoes_do_mesmo_equipamento_sao_agrupadas(client):
    eq = client.get("/api/equipamentos", params={"situacao": "operacional", "limit": 1}).json()[0]
    a = incidente(client, equipamento_id=eq["id"], tipo="falha", severidade=2)["alerta"]
    b = incidente(client, equipamento_id=eq["id"], tipo="falha", severidade=3)["alerta"]
    # uma linha só, com o pior nível (o equipamento pode já ter um alerta aberto vindo do simulador)
    assert a["id"] == b["id"] and b["ocorrencias"] == a["ocorrencias"] + 1 and b["severidade"] == 3
    abertos = client.get("/api/central/alertas", params={"limit": 500}).json()
    assert sum(x["equipamento_id"] == eq["id"] for x in abertos) == 1


def test_ciclo_de_vida_despacho_eta_e_sla(client):
    r = incidente(client, bairro="Fragata", severidade=4)
    alerta, agente_id = r["alerta"], r["agente_acionado"]
    assert alerta["status"] == "reconhecido" and alerta["agente_id"] == agente_id and r["eta_min"] >= 1
    assert alerta["sla_prazo"] > alerta["inicio"]
    ag = client.get(f"/api/agentes/{agente_id}").json()
    assert ag["status"] == "em_ocorrencia" and ag["alerta_id"] == alerta["id"] and ag["destino_lat"] is not None
    d = client.post(f"/api/central/alertas/{alerta['id']}/despachar").json()
    assert d["distancia_km"] >= 0 and d["eta_min"] >= 1 and d["agente"]["id"]  # redespacho escolhe o mais próximo ainda ativo
    ok = client.post(f"/api/central/alertas/{alerta['id']}/resolver")
    assert ok.status_code == 200 and ok.json()["status"] == "resolvido" and ok.json()["resolvido_em"]
    assert client.get(f"/api/agentes/{d['agente']['id']}").json()["status"] == "ativo"
    assert client.post(f"/api/central/alertas/{alerta['id']}/resolver").status_code == 409
    assert client.post("/api/central/alertas/99999999/reconhecer").status_code == 404
    acoes = [x["acao"] for x in client.get("/api/auditoria", params={"entidade": "alerta", "entidade_id": alerta["id"]}).json()]
    assert {"despachado", "resolvido"} <= set(acoes)


def test_alerta_sem_agente_na_uf_fica_aberto_e_estoura_sla(client, engine):
    a = incidente(client, bairro="Centro de Manaus", severidade=4)["alerta"]
    assert a["status"] == "aberto" and a["agente_id"] is None and not a["sla_estourado"]
    with Session(engine) as s:
        ev = s.get(Evento, a["id"])
        ev.inicio = ev.ts = agora() - timedelta(minutes=40)
        s.add(ev)
        s.commit()
    k = client.get("/api/central/kpis").json()
    assert k["alertas_sla_estourado"] >= 1 and k["alertas_abertos"] >= 1
    assert client.post(f"/api/central/alertas/{a['id']}/reconhecer").json()["status"] == "reconhecido"
    assert client.post(f"/api/central/alertas/{a['id']}/despachar", params={"agente_id": 99999}).status_code == 404


def alerta_por_id(client, id_):
    return next((a for a in client.get("/api/central/alertas", params={"limit": 500}).json() if a["id"] == id_), {})


def test_agente_despachado_se_move_ate_o_local_e_alerta_entra_em_atendimento(client, engine):
    r = incidente(client, bairro="Fragata")
    sim = Simulador(engine, semente=3)
    inicial = client.get(f"/api/agentes/{r['agente_acionado']}").json()
    for _ in range(1200):
        sim.passo()
        if alerta_por_id(client, r["alerta"]["id"]).get("status") == "em_atendimento":
            break
    a, ag = alerta_por_id(client, r["alerta"]["id"]), client.get(f"/api/agentes/{r['agente_acionado']}").json()
    assert a["status"] == "em_atendimento" and ag["destino_lat"] is None and ag["status"] == "em_ocorrencia"
    assert (ag["lat"], ag["lon"]) != (inicial["lat"], inicial["lon"]) and abs(ag["lat"] - a["lat"]) < 1e-3  # chegou ao incidente


def test_auditoria_de_cadastro_e_linha_do_tempo(client, equip):
    eq = client.post("/api/equipamentos", json=equip).json()
    client.put(f"/api/equipamentos/{eq['id']}", json={**equip, "situacao": "operacional", "marca": "Outra"})
    trilha = client.get("/api/auditoria", params={"entidade": "equipamento", "entidade_id": eq["id"]}).json()
    assert [t["acao"] for t in trilha] == ["alterado", "criado"]
    assert trilha[0]["detalhe"]["campos"]["marca"] == ["Perkons", "Outra"] and "serie" not in trilha[0]["detalhe"]["campos"]
    incidente(client, equipamento_id=eq["id"], tipo="falha")
    linha = client.get(f"/api/equipamentos/{eq['id']}/linha-do-tempo").json()
    assert {i["tipo"] for i in linha} >= {"auditoria", "alerta"} and [i["ts"] for i in linha] == sorted(
        (i["ts"] for i in linha), reverse=True
    )
    client.delete(f"/api/equipamentos/{eq['id']}")
    assert (
        client.get("/api/auditoria", params={"entidade": "equipamento", "entidade_id": eq["id"], "limit": 1}).json()[0]["acao"]
        == "excluido"
    )
    assert client.get("/api/equipamentos/99999/linha-do-tempo").status_code == 404


def test_retencao_agrega_leituras_antigas(engine):
    with Session(engine) as s:
        eid = s.exec(select(Equipamento.id)).first()
        base = (agora() - timedelta(days=20)).replace(hour=0, minute=0, second=0, microsecond=0)
        s.add_all(
            Telemetria(
                equipamento_id=eid,
                ts=base + timedelta(minutes=10 * i),
                metricas={"latencia_ms": 100.0 + i},
                situacao="operacional",
            )
            for i in range(36)
        )  # 6 h de leituras a cada 10 min
        s.add(
            Telemetria(equipamento_id=eid, ts=agora(), metricas={"latencia_ms": 1.0}, situacao="operacional")
        )  # recente: intocada
        s.commit()
        antes = len(s.exec(select(Telemetria)).all())
        assert telemetria.compactar(s) == 35
        restantes = s.exec(select(Telemetria).where(Telemetria.ts == base, Telemetria.equipamento_id == eid)).all()
        assert len(restantes) == 1 and abs(restantes[0].metricas["latencia_ms"] - 117.5) < 1e-6
        assert len(s.exec(select(Telemetria)).all()) == antes - 35 and telemetria.compactar(s) == 0


def test_indices_de_consulta_existem():
    assert {"ix_evento_bairro_ts", "ix_telemetria_equip_ts", "ix_auditoria_entidade"} <= {
        i.name for t in (Evento, Telemetria, Auditoria) for i in t.__table__.indexes
    }


def test_exportar_e_importar_csv_com_relatorio_de_erros(client, equip):
    csv_txt = client.get("/api/equipamentos/exportar", params={"tipo": "camera"}).text
    linhas = list(csv.DictReader(io.StringIO(csv_txt)))
    assert linhas and {"serie", "cep", "referencia", "atributos"} <= set(linhas[0]) and json.loads(linhas[0]["atributos"])
    ok = client.post("/api/equipamentos/importar", content=csv_txt, params={"simular": True}).json()
    assert ok["erros"] == [] and ok["atualizados"] == len(linhas) and ok["criados"] == 0 and not ok["gravado"]
    novo = {**equip, "serie": "IMP-0001", "atributos": json.dumps(equip["atributos"])}
    ruim = {**equip, "serie": "IMP-0002", "cep": "123", "lat": "99", "atributos": json.dumps(equip["atributos"])}
    buf = io.StringIO()
    w = csv.DictWriter(buf, list(novo))
    w.writeheader()
    w.writerows([novo, ruim])
    r = client.post("/api/equipamentos/importar", content=buf.getvalue()).json()
    assert r["total"] == 2 and not r["gravado"] and {e["linha"] for e in r["erros"]} == {3}  # tudo ou nada; linha 3 do arquivo
    assert {"cep", "lat"} <= {e["campo"] for e in r["erros"]}
    assert client.get("/api/equipamentos", params={"q": "IMP-0001"}).json() == []
    buf = io.StringIO()
    w = csv.DictWriter(buf, list(novo))
    w.writeheader()
    w.writerow(novo)
    g = client.post("/api/equipamentos/importar", content=buf.getvalue()).json()
    assert g["gravado"] and g["criados"] == 1
    assert client.get("/api/equipamentos", params={"q": "IMP-0001"}).json()[0]["cidade"] == "Marília"
    assert client.get("/api/auditoria", params={"entidade": "equipamento", "limit": 1}).json()[0]["acao"] == "importado"


def test_geojson_ida_e_volta(client):
    gj = client.get("/api/equipamentos/exportar", params={"formato": "geojson", "tipo": "totem"}).json()
    assert gj["type"] == "FeatureCollection" and gj["features"][0]["geometry"]["type"] == "Point"
    p = gj["features"][0]["properties"]
    assert gj["features"][0]["geometry"]["coordinates"] == [p["lon"], p["lat"]]
    r = client.post("/api/equipamentos/importar", content=json.dumps(gj), params={"formato": "geojson", "simular": True}).json()
    assert r["erros"] == [] and r["atualizados"] == len(gj["features"])
    assert client.post("/api/equipamentos/importar", content="{}", params={"formato": "geojson"}).status_code == 422


def test_backtest_compara_previsao_com_o_realizado():
    d = dados.carregar(engine_semeado(90))  # 90 dias: o treino precisa de semanas de histórico
    b = backtest.executar(d)
    r, m = b["risco"], b["manutencao"]
    assert r["bairros"] > 40 and r["horas"] > 0 and r["acerto_top_bairros"] >= r["acerto_aleatorio"]
    assert r["correlacao_bairros"] > 0.3 and r["ocorrencia_no_top20"] > r["ocorrencia_geral"]
    assert (
        m["avaliados"] > 100
        and 0 <= m["erro_medio"] <= 1
        and m["auc"] > 0.8
        and m["precisao_topk"] > 3 * m["taxa_base"]
        and m["erro_medio"] < m["erro_medio_base"]
    )
    assert pd.Timestamp(b["corte"]) < pd.Timestamp(d["agora"])


def test_endpoints_de_previsao_novos(client):
    b = client.get("/api/previsao/backtest").json()
    assert {"preve", "dados_usados", "recomendacao", "risco", "manutencao"} <= set(b)
    t = client.get("/api/previsao/tendencias").json()
    assert {"preve", "recomendacao", "serie", "resumo", "por_tipo"} <= set(t)
    assert any(x["projetado"] for x in t["serie"]) and any(not x["projetado"] for x in t["serie"])
    assert 0 <= t["resumo"]["disponibilidade"]["atual"] <= 100


def test_probabilidade_de_falha_calibrada_e_nao_saturada(client):
    ordens = client.get("/api/previsao/manutencao-preditiva", params={"limite": 500}).json()["ordens"]
    p = [o["prob_falha_7d"] for o in ordens if not o["em_falha"]]
    assert p and max(p) <= 0.97 and min(p) >= 0.01
    assert sum(x >= 0.97 for x in p) < 0.1 * len(p) and len({round(x, 2) for x in p}) > 5
    sinais = [o["sinal"] for o in ordens if not o["em_falha"]]
    assert sinais == sorted(sinais, reverse=True) and all(o["em_falha"] for o in ordens[len(p) :])


def test_briefing_em_portugues_com_riscos_e_acoes(client):
    incidente(client, bairro="Centro", severidade=4)
    b = client.get("/api/central/briefing", params={"cidade": "Marília", "uf": "SP"}).json()
    assert b["escopo"] == "Marília/SP" and len(b["riscos"]) == 3 and len(b["situacao"]) >= 3 and b["acoes"]
    assert all({"local", "quando", "score", "motivo"} <= set(r) for r in b["riscos"])
    assert any("alerta" in linha for linha in b["situacao"])


def test_regioes_trazem_estado_normal_atencao_critico(client):
    regs = client.get("/api/central/regioes", params={"por": "uf"}).json()
    assert {r["estado"] for r in regs} <= {"normal", "atencao", "critico"}
    assert all((r["estado"] == "normal") == (r["saude"] >= 80) for r in regs)
