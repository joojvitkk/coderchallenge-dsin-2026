"""Métricas de telemetria (geração, severidade) e retenção da tabela (compactação de leituras antigas)."""

import math
from datetime import timedelta

import numpy as np
from sqlmodel import Session, select

from ..db import agora
from ..models import Telemetria

RETENCAO_DIAS = 7  # leituras brutas mais velhas que isso viram uma média por equipamento a cada BUCKET_H horas
BUCKET_H = 6


def metricas(rng: np.random.Generator, degradacao: float, hora: float) -> dict[str, float]:
    """Métricas de um equipamento; degradacao em [0,1] eleva latência, temperatura e erros e derruba a utilização."""
    d = float(degradacao)
    ciclo = 8 * math.sin(2 * math.pi * (hora - 9) / 24)
    pico = lambda c, w: math.exp(-(((hora - c) / w) ** 2))  # noqa: E731
    uso = 30 + 35 * pico(8, 2.5) + 45 * pico(18, 3) + 4 * rng.standard_normal() - 25 * d
    return {
        "latencia_ms": round(max(5.0, 80 + 15 * rng.standard_normal() + 520 * d**2), 1),
        "temperatura": round(40 + ciclo + 2 * rng.standard_normal() + 32 * d, 1),
        "taxa_erro": round(max(0.0, 0.005 + 0.003 * rng.standard_normal() + 0.26 * d), 4),
        "bateria": round(float(np.clip(97 - 30 * d - abs(3 * rng.standard_normal()), 0, 100)), 1),
        "utilizacao": round(float(np.clip(uso, 0, 100)), 1),
    }


def severidade(m: dict[str, float]) -> int | None:
    """Severidade (1-4) de uma leitura anômala, ou None se normal."""
    if m["latencia_ms"] > 450 or m["temperatura"] > 75 or m["taxa_erro"] > 0.2:
        return 4
    if m["latencia_ms"] > 300 or m["temperatura"] > 65 or m["taxa_erro"] > 0.1:
        return 3
    if m["latencia_ms"] > 200 or m["taxa_erro"] > 0.05:
        return 2
    return None


def compactar(s: Session, dias: int = RETENCAO_DIAS) -> int:
    """Retenção: leituras com mais de `dias` dias são agregadas (média) em baldes de BUCKET_H horas por equipamento.

    Mantém a tendência de longo prazo que os modelos usam e limita o crescimento da tabela. Idempotente;
    devolve o número de linhas removidas."""
    grupos: dict[tuple[int, object], list[Telemetria]] = {}
    for t in s.exec(select(Telemetria).where(Telemetria.ts < agora() - timedelta(days=dias))):
        grupos.setdefault(
            (t.equipamento_id, t.ts.replace(hour=t.ts.hour // BUCKET_H * BUCKET_H, minute=0, second=0, microsecond=0)), []
        ).append(t)
    removidas = 0
    for (_, balde), ls in grupos.items():
        if len(ls) < 2:
            continue
        ls.sort(key=lambda t: t.ts)
        manter, resto = ls[0], ls[1:]
        manter.metricas = {k: round(float(np.mean([t.metricas[k] for t in ls if k in t.metricas])), 4) for k in manter.metricas}
        manter.ts, manter.situacao = balde, max((t.situacao for t in ls), key=lambda x: x != "operacional")
        for t in resto:
            s.delete(t)
        removidas += len(resto)
    s.commit()
    return removidas
