"""Briefing executivo PROMETHEUS: resumo em português gerado por regras (sem LLM), com os dados da Central e da Preditiva."""


from sqlmodel import Session

from ..db import TZ_BR, agora
from ..predict import manutencao, reforco, risco
from . import alertas, kpis

HORAS = 6
ROTULO_ESTADO = {"normal": "opera normalmente", "atencao": "exige atenção", "critico": "em estado crítico"}


def _plural(n: int, um: str, varios: str) -> str:
    return f"{n} {um if n == 1 else varios}"


def _riscos(d: dict) -> list[dict]:
    """Os 3 maiores riscos (bairros distintos) das próximas 6 horas, com o fator que mais pesa."""
    r = risco.calcular(d["eventos"], d["equip"], d["agora"], HORAS)
    r = r[r.h >= 1].sort_values("score", ascending=False).drop_duplicates("bairro").head(3)
    saida = []
    for _, linha in r.iterrows():
        fatores = risco.explicar(linha)
        saida.append(
            {
                "local": linha.bairro,
                "quando": f"{(linha.ts.to_pydatetime() - TZ_BR):%Hh}",
                "score": round(float(linha.score)),
                "motivo": fatores[0]["fator"] if fatores else "histórico geral",
            }
        )
    return saida


def gerar(s: Session, d: dict, cidade: str | None = None, uf: str | None = None) -> dict:
    """Situação agora, 3 riscos das próximas 6 h e ações recomendadas (cada ação aponta a evidência que a motivou)."""
    k = kpis.kpis(s, cidade, uf)
    abertos = alertas.listar(s, 24, 1, 50, cidade, uf)
    graves = [a for a in abertos if a["severidade"] >= 3]
    regioes = kpis.agrupar(s, "regiao", cidade, uf)
    atencao = [g for g in regioes if g["estado"] != "normal"]
    escopo = f"{cidade}/{uf}" if cidade and uf else cidade or uf or "Brasil"
    situacao = [
        f"{_plural(k['equipamentos_total'], 'equipamento', 'equipamentos')} no escopo, "
        f"{k['disponibilidade_pct']:.1f}% disponíveis; "
        f"{k['manutencao_imediata']} com manutenção imediata.",
        f"{_plural(k['alertas_abertos'], 'alerta aberto', 'alertas abertos')} ({k['alertas_criticos']} crítico(s)); "
        f"{_plural(k['alertas_sla_estourado'], 'alerta fora do prazo de SLA', 'alertas fora do prazo de SLA')}.",
        f"{k['agentes_ativos']} agente(s) em patrulha e {k['agentes_em_ocorrencia']} em ocorrência.",
        (
            "Regiões que exigem atenção: "
            + ", ".join(f"{g['nome']} (saúde {int(g['saude'])}%, {ROTULO_ESTADO[g['estado']]})" for g in atencao[:4])
            + "."
        )
        if atencao
        else "Todas as regiões operam normalmente.",
    ]
    riscos = _riscos(d)
    acoes = []
    for a in [x for x in graves if x["sla_estourado"] or not x["agente_id"]][:2]:
        alvo = f"equipamento {a['equipamento']['serie']}" if a["equipamento"] else "ocorrência de rua"
        acoes.append(
            f"Tratar o alerta de severidade {a['severidade']} em {a['bairro']} ({alvo}): "
            f"{'prazo de SLA estourado' if a['sla_estourado'] else 'ainda sem agente'}; despachar o agente mais próximo."
        )
    acoes += [
        f"Reforçar a presença em {x['local']} por volta das {x['quando']} "
            f"(risco {x['score']}/100; principal fator: {x['motivo']})."
        for x in riscos
    ]
    preventivas = manutencao.prever_falhas(d["tele"], d["equip"])
    preventivas = preventivas[~preventivas.em_falha & (preventivas.prob_falha_7d >= 0.5)].head(2)
    porid = d["equip"].set_index("id")
    for _, o in preventivas.iterrows():
        eq = porid.loc[o.equipamento_id]
        acoes.append(
            f"Abrir OS preventiva para {eq.serie} em {eq.bairro}: "
            f"{o.prob_falha_7d:.0%} de chance de falha em 7 dias ({o.causa_principal})."
        )
    plano = reforco.realocar(
        risco.calcular(d["eventos"], d["equip"], d["agora"], HORAS), d["agentes"], reforco.centroides(d["equip"]), HORAS
    )
    if plano["movimentos"]:
        acoes.append(
            f"Realocar {_plural(len(plano['movimentos']), 'agente', 'agentes')}: "
            f"cobertura prevista {plano['cobertura_antes']:.0%} -> {plano['cobertura_depois']:.0%}."
        )
    if not acoes:
        acoes.append("Sem ação urgente: manter a rotina de patrulha e acompanhar os alertas.")
    return {
        "gerado_em": agora(),
        "escopo": escopo,
        "janela_horas": HORAS,
        "situacao": situacao,
        "riscos": riscos,
        "acoes": acoes,
        "base": {
            "eventos": len(d["eventos"]),
            "telemetria": len(d["tele"]),
            "regras": "rule-based, sem LLM; mesmos dados da Central e da Preditiva",
        },
    }
