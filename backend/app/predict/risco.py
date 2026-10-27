"""Risco por bairro x hora (próximas N horas): score 0-100 aditivo, explicável, com IC 95%."""

import numpy as np
import pandas as pd

SEMANAS = 8
PTS_SAZONAL, PTS_TENDENCIA, PTS_EQUIP, PTS_CHUVA, PTS_EVENTO = 60.0, 15.0, 25.0, 8.0, 20.0
DEGRADADO = {"mau_funcionamento", "furtado", "em_manutencao"}
ROTULOS = {
    "sazonal": "histórico do dia da semana/hora", "tendencia": "tendência dos últimos 7 dias",
    "equipamentos": "equipamentos degradados", "chuva": "chuva prevista", "evento": "evento no bairro",
}


def historico(eventos: pd.DataFrame, bairros, now: pd.Timestamp, semanas: int = SEMANAS) -> dict:
    """bairro -> array (semanas, 7 dia-da-semana, 24 hora) de severidade acumulada (semana 0 = mais recente)."""
    ev = eventos[(eventos.ts < now) & (eventos.ts > now - pd.Timedelta(days=7 * semanas))]
    semana = ((now - ev.ts).dt.days // 7).to_numpy()
    out = {b: np.zeros((semanas, 7, 24)) for b in bairros}
    for b, s, d, h, sev in zip(ev.bairro, semana, ev.ts.dt.dayofweek, ev.ts.dt.hour, ev.severidade, strict=True):
        if b in out:
            out[b][s, d, h] += sev
    return out


def fracao_degradada(equip: pd.DataFrame) -> pd.Series:
    inst = equip[equip.situacao != "nao_instalado"]
    return inst.assign(d=inst.situacao.isin(DEGRADADO)).groupby("bairro")["d"].mean()


def calcular(eventos, equip, now, horas: int = 24, chuva: bool = False, evento_bairro: str | None = None):
    """DataFrame longo (h = 0..horas; 0 = agora): bairro, h, ts, pontos por fator, score, ic_inf, ic_sup."""
    now = pd.Timestamp(now)
    bairros = sorted(set(equip.bairro) | set(eventos.bairro))
    hist, degr = historico(eventos, bairros, now), fracao_degradada(equip)
    medias = {b: a.mean(0) for b, a in hist.items()}
    ref = max(float(np.quantile(np.concatenate([m.ravel() for m in medias.values()]), 0.98)), 1e-9)
    alvo = now.floor("h") + pd.to_timedelta(np.arange(horas + 1), unit="h")  # h=0 é "agora"

    def pontos(m):
        return PTS_SAZONAL * np.clip(m / ref, 0, 1)

    linhas = []
    for b in bairros:
        a = hist[b]
        sem = np.sqrt(np.maximum(a.var(0, ddof=1), medias[b]) / SEMANAS)  # piso de Poisson: var >= média
        tot = a.sum((1, 2))
        razao = (tot[0] + 1) / (tot[1:].mean() + 1)
        dow, hr = alvo.dayofweek.to_numpy(), alvo.hour.to_numpy()
        saz = pontos(medias[b][dow, hr])
        meio = np.full(len(alvo), PTS_TENDENCIA * np.clip(np.log2(razao), -1, 1))
        eq = np.full(len(alvo), PTS_EQUIP * float(degr.get(b, 0.0)))
        ch = np.full(len(alvo), PTS_CHUVA if chuva else 0.0)
        evt = np.full(len(alvo), PTS_EVENTO if evento_bairro == b else 0.0)
        extra = meio + eq + ch + evt
        m, e = medias[b][dow, hr], 1.96 * sem[dow, hr]
        linhas.append(pd.DataFrame({
            "bairro": b, "h": np.arange(len(alvo)), "ts": alvo, "sazonal": saz, "tendencia": meio,
            "equipamentos": eq, "chuva": ch, "evento": evt,
            "score": np.clip(saz + extra, 0, 100), "ic_inf": np.clip(pontos(m - e) + extra, 0, 100),
            "ic_sup": np.clip(pontos(m + e) + extra, 0, 100),
        }))
    out = pd.concat(linhas, ignore_index=True)
    num = out.select_dtypes("number").columns
    out[num] = out[num].round(2)
    return out


def explicar(linha) -> list[dict]:
    """Fatores ordenados por contribuição absoluta (descarta os nulos)."""
    fat = [{"fator": ROTULOS[k], "pontos": float(linha[k])} for k in ROTULOS if abs(linha[k]) >= 0.5]
    return sorted(fat, key=lambda x: -abs(x["pontos"]))


def agregar(r: pd.DataFrame, grupo_de: dict[str, str]) -> pd.DataFrame:
    """Risco agregado (média dos bairros) por grupo, p.ex. cidade ou UF; mantém a coluna `bairro` com o nome do grupo."""
    g = r.assign(bairro=r.bairro.map(grupo_de))
    out = g.groupby(["bairro", "h", "ts"], as_index=False).mean()
    num = out.select_dtypes("number").columns
    out[num] = out[num].round(2)
    return out
