"""Execução: ciclo de vida do app (lifespan), laço do simulador, encerramento automático de alertas e agente em patrulha."""

import asyncio
from datetime import timedelta

from fastapi.testclient import TestClient
from sqlmodel import Session, select

from app.db import agora
from app.main import app
from app.models import Evento, StatusAlerta
from app.services.stream import bus
from simulator import sim as simulador
from simulator.sim import Simulador, rodar


def test_lifespan_sobe_com_simulador_e_desliga_limpo(client, monkeypatch):
    monkeypatch.setenv("FOGO_SIM", "1")
    with TestClient(app) as c:  # com `with` dispara o lifespan: init_db, seed idempotente e tarefa do simulador
        assert c.get("/api/health").json() == {"status": "ok"}
    monkeypatch.setenv("FOGO_SIM", "0")
    with TestClient(app) as c:
        assert c.get("/api/central/kpis").json()["equipamentos_total"] > 0


def test_rodar_publica_no_barramento_e_sobrevive_a_tick_com_erro(engine, monkeypatch, caplog):
    recebidos = []
    monkeypatch.setattr(bus, "publicar", lambda evento, dados: recebidos.append(evento))
    falhas = iter([RuntimeError("tick ruim")])
    original = Simulador.passo

    def passo(self):
        if (e := next(falhas, None)):
            raise e
        return original(self)

    monkeypatch.setattr(Simulador, "passo", passo)

    async def executar():
        tarefa = asyncio.create_task(rodar(engine, intervalo=0.01))
        await asyncio.sleep(0.6)
        tarefa.cancel()

    asyncio.run(executar())
    assert "falha no tick do simulador" in caplog.text  # o erro é registrado e o laço continua
    assert {"agente", "telemetria", "kpis"} <= set(recebidos)


def test_alertas_sem_tratamento_sao_encerrados_pelo_simulador(engine):
    with Session(engine) as s:
        h5 = agora() - timedelta(hours=5)
        velho = Evento(ts=h5, inicio=h5, bairro="Centro", tipo="ocorrencia", severidade=1)
        novo = Evento(ts=agora() - timedelta(minutes=25), bairro="Centro", tipo="ocorrencia", severidade=4)
        s.add_all([velho, novo])
        s.commit()
        ids = velho.id, novo.id
    sim = Simulador(engine)
    sim.ticks = 29
    sim.passo()  # tick 30: rotina de encerramento
    with Session(engine) as s:
        assert s.get(Evento, ids[0]).status == StatusAlerta.resolvido  # sev. 1 passou de 20 min
        assert s.get(Evento, ids[1]).status != StatusAlerta.resolvido  # sev. 4 aguarda até 180 min


def test_agente_em_patrulha_anda_e_volta_perto_de_casa(engine):
    sim = Simulador(engine, semente=5)
    with Session(engine) as s:
        from app.models import Agente, StatusAgente

        ag = s.exec(select(Agente).where(Agente.status == StatusAgente.ativo)).first()
        antes = (ag.lat, ag.lon)
        for _ in range(400):
            sim._mover(ag)
    assert (ag.lat, ag.lon) != antes
    assert abs(ag.lat - antes[0]) < 0.2 and abs(ag.lon - antes[1]) < 0.2
    assert simulador.perfil_hora(__import__("numpy").array([8, 18])).min() > 0.25
