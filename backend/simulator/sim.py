"""Simulador: histórico sintético (semente fixa) e tempo real (telemetria, eventos, alertas e agentes em movimento).

O horário usado nos perfis é o de Brasília (UTC-3); o banco guarda UTC."""

import asyncio
import logging
import random
from datetime import timedelta

import numpy as np
from sqlalchemy import insert
from sqlmodel import Session, select

from app.db import TZ_BR as TZ
from app.db import agora
from app.geo import BAIRROS, MARILIA, Bairro
from app.models import Agente, Equipamento, Evento, Situacao, StatusAgente, StatusAlerta, Telemetria, TipoEvento
from app.services import alertas, kpis
from app.services.stream import bus
from app.services.telemetria import compactar, metricas, severidade

log = logging.getLogger("fogo.sim")

TAXA_BASE = 0.32  # eventos/hora num bairro de risco 1,0
CIDADE_X = 2.0  # cidades pequenas ganham histórico mais denso (senão a previsão delas seria só zeros)
DIA = np.array([0.9, 0.9, 0.9, 1.0, 1.4, 1.5, 1.1])  # seg..dom: sexta e sábado mais intensos
SEV_PESOS = (0.45, 0.30, 0.17, 0.08)
PASSO_TELEMETRIA_H = 6
DEGRADADAS = (Situacao.mau_funcionamento, Situacao.em_manutencao)
COM_TELEMETRIA = (Situacao.operacional, *DEGRADADAS)
DIAS_HISTORICO = 90
RAMPA_DIAS = 14  # dias para a degradação ir de 0 à força máxima
ABERTO_RECENTE_MIN = 45  # eventos mais novos que isso entram no seed ainda abertos
TTL_AUTO_MIN = {1: 20, 2: 45, 3: 90, 4: 180}  # o simulador encerra sozinho alertas sem tratamento após esse tempo
ACEL_EVENTOS = 2.0  # eventos ao vivo ocorrem nessa vez a taxa real (para a demonstração ter movimento)
INTERVALO_S = 1.0
SALVAR_LEITURA_S = 600  # no máximo uma leitura por equipamento a cada 10 min vai para o banco (todas vão pelo SSE)


def perfil_hora(h: np.ndarray) -> np.ndarray:
    """Sazonalidade diária (hora local): picos às 8h e 18h e um resíduo noturno."""
    g = lambda c, w: np.exp(-(((h - c) / w) ** 2))  # noqa: E731
    return 0.25 + g(8, 2) + 1.3 * g(18, 2.5) + 0.5 * g(23, 2)


def taxa(b: Bairro, h, d, tendencia=1.0):
    """Eventos/hora esperados no bairro à hora local `h` (0-23) e dia da semana `d` (vetorizado)."""
    densidade = 1.0 if b.cidade == MARILIA else CIDADE_X
    return TAXA_BASE * densidade * b.risco * perfil_hora(h) * DIA[d] * (1 + 0.6 * b.praia * (d >= 4)) * tendencia


def perfil_degradacao(eid: int, situacao: Situacao) -> tuple[float, float]:
    """(força, dia de início) determinísticos por equipamento: degradados chegam a 1,0; ~25% dos operacionais degradam depois."""
    r = random.Random(eid * 7919)
    if situacao in DEGRADADAS:
        return 1.0, r.uniform(40, 80)
    if r.random() < 0.25:
        return (1.0 if r.random() < 0.55 else 0.6), r.uniform(72, 100)
    return 0.0, 0.0


def degradacao(forca: float, inicio: float, dia: float) -> float:
    return forca * float(np.clip((dia - inicio) / RAMPA_DIAS, 0, 1))


def _eventos_historico(s: Session, rng, horas: list) -> None:
    loc = [t - TZ for t in horas]
    h, d = np.array([t.hour for t in loc]), np.array([t.weekday() for t in loc])
    tendencia = np.linspace(0.9, 1.1, len(horas))
    por_bairro: dict[str, list[int]] = {}
    for eid, bairro in s.exec(select(Equipamento.id, Equipamento.bairro)):
        por_bairro.setdefault(bairro, []).append(eid)
    corte = horas[-1] - timedelta(minutes=ABERTO_RECENTE_MIN)
    linhas = []
    for nome, b in BAIRROS.items():
        contagem = rng.poisson(taxa(b, h, d, tendencia))
        for i in np.nonzero(contagem)[0]:
            for _ in range(int(contagem[i])):
                tipo = str(rng.choice([t.value for t in TipoEvento], p=(0.25, 0.55, 0.20)))
                eqs, ts = por_bairro.get(nome), horas[i] + timedelta(minutes=int(rng.integers(60)))
                sev = int(rng.choice([1, 2, 3, 4], p=SEV_PESOS))
                aberto = ts >= corte
                linhas.append(
                    {
                        "ts": ts,
                        "inicio": ts,
                        "bairro": nome,
                        "tipo": tipo,
                        "severidade": sev,
                        "ocorrencias": 1,
                        "equipamento_id": int(rng.choice(eqs)) if eqs and tipo == TipoEvento.falha else None,
                        "status": StatusAlerta.aberto if aberto else StatusAlerta.resolvido,
                        "reconhecido_em": None if aberto else ts + timedelta(minutes=int(rng.integers(2, 20))),
                        "resolvido_em": None if aberto else ts + timedelta(minutes=int(rng.integers(20, 240))),
                    }
                )
    s.execute(insert(Evento), linhas)


def _telemetria_historico(s: Session, rng, horas: list) -> None:
    """Equipamentos degradados (e ~25% dos operacionais) derivam em dias diferentes; o resto fica estável."""
    n = len(horas) // PASSO_TELEMETRIA_H
    linhas = []
    for eid, sit in s.exec(select(Equipamento.id, Equipamento.situacao)):
        if sit not in COM_TELEMETRIA:
            continue
        forca, inicio = perfil_degradacao(eid, sit)
        for k in range(n):
            deg = degradacao(forca, inicio, k * PASSO_TELEMETRIA_H / len(horas) * DIAS_HISTORICO)
            ts = horas[k * PASSO_TELEMETRIA_H]
            linhas.append(
                {
                    "equipamento_id": eid,
                    "ts": ts,
                    "metricas": metricas(rng, deg, ((ts - TZ).hour)),
                    "situacao": (Situacao.mau_funcionamento if deg > 0.6 else Situacao.operacional).value,
                }
            )
    s.execute(insert(Telemetria), linhas)
    s.commit()


def historico(s: Session, dias: int = DIAS_HISTORICO, semente: int = 42) -> None:
    """Gera `dias` de eventos (sazonalidade hora/dia/bairro) e telemetria, terminando agora."""
    rng = np.random.default_rng(semente)
    fim = agora().replace(minute=0, second=0, microsecond=0)
    horas = [fim - timedelta(hours=dias * 24 - i) for i in range(dias * 24)]
    _eventos_historico(s, rng, horas)
    _telemetria_historico(s, rng, horas)


class Simulador:
    """Estado do tempo real: movimento dos agentes, leituras, eventos de fundo e encerramento automático de alertas."""

    PASSO_AGENTE = 0.00025  # graus por tick de patrulha (~28 m)
    PASSO_DESPACHO = 0.0006  # graus por tick a caminho de um alerta (~65 m/s: o tempo da demo é comprimido)

    def __init__(self, engine, semente: int = 7, amostra: int = 6):
        self.engine, self.rng, self.amostra = engine, np.random.default_rng(semente), amostra
        self.casa: dict[int, tuple[float, float]] = {}
        self.alvo: dict[int, tuple[float, float]] = {}
        self.salvo: dict[int, object] = {}
        self.inicio, self.ticks = agora(), 0

    def _mover(self, a: Agente) -> bool:
        """Anda um passo; devolve True quando um agente despachado acaba de chegar ao destino."""
        if a.destino_lat is not None:
            dx, dy = a.destino_lat - a.lat, a.destino_lon - a.lon
            dist = float(np.hypot(dx, dy))
            chegou = dist <= self.PASSO_DESPACHO
            a.lat, a.lon = (
                (a.destino_lat, a.destino_lon)
                if chegou
                else (a.lat + dx / dist * self.PASSO_DESPACHO, a.lon + dy / dist * self.PASSO_DESPACHO)
            )
            a.atualizado_em = agora()
            return chegou
        if a.status == StatusAgente.em_ocorrencia and a.alerta_id is None and self.rng.random() < 0.05:
            a.status = StatusAgente.ativo
        if a.status != StatusAgente.ativo:
            return False
        casa = self.casa.setdefault(a.id, (a.lat, a.lon))
        alvo = self.alvo.get(a.id, casa)
        dx, dy = alvo[0] - a.lat, alvo[1] - a.lon
        dist = float(np.hypot(dx, dy))
        if dist < self.PASSO_AGENTE:
            self.alvo[a.id] = tuple(np.array(casa) + self.rng.normal(0, 0.005, 2))
        else:
            a.lat, a.lon = a.lat + dx / dist * self.PASSO_AGENTE, a.lon + dy / dist * self.PASSO_AGENTE
        a.atualizado_em = agora()
        return False

    def _telemetria(self, s: Session) -> tuple[list[dict], list[Evento]]:
        eqs = s.exec(select(Equipamento).where(Equipamento.situacao.in_(COM_TELEMETRIA))).all()
        sorteio = self.rng.choice(len(eqs), min(self.amostra, len(eqs)), replace=False) if eqs else []
        dia = DIAS_HISTORICO + (agora() - self.inicio).total_seconds() / 86400
        leituras, novos = [], []
        for i in sorteio:
            eq, ts = eqs[int(i)], agora()
            forca, ini = perfil_degradacao(eq.id, eq.situacao)
            deg = degradacao(forca, ini, dia)
            m = metricas(self.rng, deg, (ts - TZ).hour)
            leituras.append({"equipamento_id": eq.id, "ts": ts, "metricas": m, "situacao": eq.situacao})
            if (ts - self.salvo.get(eq.id, ts - timedelta(days=1))).total_seconds() >= SALVAR_LEITURA_S:
                lida = Situacao.mau_funcionamento if deg > 0.6 else eq.situacao  # a leitura registra o que a telemetria indica
                s.add(Telemetria(equipamento_id=eq.id, ts=ts, metricas=m, situacao=lida))
                self.salvo[eq.id] = ts
            sev = severidade(m)
            # só alerta quando um equipamento CADASTRADO como operacional piora (os já degradados estão na lista de manutenção)
            if sev and eq.situacao == Situacao.operacional and self.rng.random() < 0.3:
                novos.append(Evento(ts=ts, bairro=eq.bairro, tipo=TipoEvento.falha, severidade=sev, equipamento_id=eq.id))
        return leituras, novos

    def _eventos_fundo(self, s: Session) -> list[Evento]:
        """Ocorrências da cidade ao vivo: mesma taxa sazonal do histórico (vezes ACEL_EVENTOS), severidade 1-4 realista."""
        ts = agora()
        loc = ts - TZ
        nomes = list(BAIRROS)
        pesos = np.array([float(taxa(b, loc.hour, loc.weekday())) for b in BAIRROS.values()])
        novos = []
        for _ in range(int(self.rng.poisson(ACEL_EVENTOS * pesos.sum() * INTERVALO_S / 3600))):
            bairro = str(self.rng.choice(nomes, p=pesos / pesos.sum()))
            tipo = TipoEvento(str(self.rng.choice([t.value for t in TipoEvento], p=(0.25, 0.55, 0.20))))
            eqs = s.exec(select(Equipamento.id).where(Equipamento.bairro == bairro)).all() if tipo == TipoEvento.falha else []
            novos.append(
                Evento(
                    ts=ts,
                    bairro=bairro,
                    tipo=tipo,
                    severidade=int(self.rng.choice([1, 2, 3, 4], p=SEV_PESOS)),
                    equipamento_id=int(self.rng.choice(eqs)) if eqs else None,
                )
            )
        return novos

    def _encerrar_antigos(self, s: Session) -> None:
        """Sem operador, alertas envelhecem e são encerrados (o prazo cresce com a severidade)."""
        t = agora()
        for ev in s.exec(
            select(Evento).where(Evento.status != StatusAlerta.resolvido, Evento.ts < t - timedelta(minutes=20))
        ).all():
            if t - (ev.inicio or ev.ts) > timedelta(minutes=TTL_AUTO_MIN[ev.severidade]):
                alertas.resolver(s, ev.id)

    def passo(self) -> list[tuple[str, object]]:
        """Um tick: move agentes, grava telemetria, gera eventos e devolve os eventos SSE a publicar."""
        self.ticks += 1
        with Session(self.engine, expire_on_commit=False) as s:
            agentes = s.exec(select(Agente)).all()
            chegadas = [a for a in agentes if self._mover(a)]
            s.add_all(agentes)
            leituras, novos = self._telemetria(s)
            s.commit()
            for a in chegadas:
                alertas.chegou(s, a)
            for ev in [*novos, *self._eventos_fundo(s)]:
                alertas.registrar(s, ev)  # persiste (agrupando repetições) e publica o alerta
            if self.ticks % 30 == 0:
                self._encerrar_antigos(s)
            return [("agente", [a.model_dump() for a in agentes]), ("telemetria", leituras), ("kpis", kpis.kpis(s))]


async def rodar(engine, intervalo: float = INTERVALO_S) -> None:
    """Tarefa de fundo do app: executa ticks e publica no barramento SSE; a cada hora compacta a telemetria antiga."""
    sim = Simulador(engine)
    while True:
        try:
            for evento, dados in await asyncio.to_thread(sim.passo):
                bus.publicar(evento, dados)
            if sim.ticks % 3600 == 1:
                with Session(engine) as s:
                    log.info("retenção: %d leituras compactadas", await asyncio.to_thread(compactar, s))
        except Exception:  # um tick ruim não pode matar o tempo real
            log.exception("falha no tick do simulador")
        await asyncio.sleep(intervalo)
