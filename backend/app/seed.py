"""Seed determinístico (tudo fictício): ~200 equipamentos, ~50 agentes e histórico sintético de 90 dias.

Marília/SP concentra a maior densidade; as demais cidades (geo.py) recebem poucos itens, ao menos um equipamento cada."""

import random
from datetime import timedelta

from sqlmodel import Session, select

from simulator.sim import historico

from .db import agora
from .geo import BAIRROS, Bairro
from .models import Agente, Categoria, Equipamento, ManutTipo, StatusAgente
from .schemas import TIPOS

SEMENTE = 2026
RUAS = ("Av. Sampaio Vidal", "Av. Carlos Gomes", "Av. Brasil", "Rua XV de Novembro", "Av. Sete de Setembro", "Rua Tiradentes",
        "Av. Rio Branco", "Av. Getúlio Vargas", "Rua São Paulo")
PLACAS = "ABCDEFGHJKLMNPRSTUVXZ"

# tipo: (peso, prefixo de série, marcas, órgão)
INFO = {
    "radar_velocidade": (14, "RV", ("Perkons", "Kapsch", "Sensys"), "DETRAN-{uf}"),
    "radar_semaforo": (8, "RS", ("Perkons", "Kapsch"), "DETRAN-{uf}"),
    "radar_conversao_proibida": (5, "RC", ("Sensys", "Perkons"), "DETRAN-{uf}"),
    "camera": (28, "CM", ("Hikvision", "Intelbras", "Axis"), "Prefeitura"),
    "balanca": (4, "BL", ("Toledo", "Kistler"), "DETRAN-{uf}"),
    "veiculo_autonomo": (3, "VA", ("Embraer-X", "Agrale"), "Prefeitura"),
    "cancela": (8, "CN", ("Nice", "Gold"), "Prefeitura"),
    "taxi": (10, "TX", ("Fiat", "Toyota"), "Prefeitura"),
    "mototaxi": (6, "MT", ("Honda", "Yamaha"), "Prefeitura"),
    "transporte_escolar": (6, "TE", ("Mercedes-Benz", "Volkswagen"), "Prefeitura"),
    "totem": (10, "TT", ("Elgin", "Positivo"), "Prefeitura"),
    "patinete": (12, "PT", ("Xiaomi", "Segway"), "Prefeitura"),
    "moto_agente": (8, "MA", ("Honda", "BMW"), "Guarda Municipal"),
    "viatura": (8, "VT", ("Chevrolet", "Ford"), "PM-{uf}"),
    "outro": (2, "OT", ("Genérica",), "Prefeitura"),
}
SITUACOES = (("operacional", 78), ("mau_funcionamento", 8), ("em_manutencao", 6), ("nao_instalado", 3),
             ("desativado", 3), ("furtado", 2))
NOMES = ("Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gisele", "Hugo", "Iara", "João", "Karen", "Luís")
SOBRENOMES = ("Silva", "Souza", "Pereira", "Costa", "Oliveira", "Rocha", "Martins", "Lima", "Alves", "Teixeira")
ORGAO_CAT = {"transito": "DETRAN-{uf}", "guarda": "Guarda Municipal", "policia": "PM-{uf}"}
PESOS = [b.peso for b in BAIRROS.values()]


def _placa(r: random.Random) -> str:
    return f"{''.join(r.choices(PLACAS, k=3))}{r.randint(0, 9)}{r.choice(PLACAS)}{r.randint(10, 99)}"


def _transporte(r, **extra) -> dict:
    return {"placa": _placa(r), "alvara": f"AL-{r.randint(1000, 9999)}", "capacidade_passageiros": 4, **extra}


def atributos(tipo: str, r: random.Random) -> dict:
    """Atributos plausíveis para o tipo (validados depois pelo esquema do tipo)."""
    radar = {"faixas": r.randint(1, 4), "sentido": r.choice(["crescente", "decrescente", "ambos"])}
    return {
        "radar_velocidade": lambda: {**radar, "velocidade_via_kmh": r.choice([40, 50, 60, 80]),
                                     "modo": r.choice(["fixo", "fixo", "movel", "portatil"])},
        "radar_semaforo": lambda: {**radar, "tempo_amarelo_s": r.choice([3.0, 4.0, 5.0])},
        "radar_conversao_proibida": lambda: {**radar, "conversao_proibida": r.choice(["esquerda", "direita", "retorno"])},
        "camera": lambda: {"resolucao": r.choice(["HD", "FullHD", "4K"]), "leitura_placa": r.random() < 0.4,
                           "visao_noturna": True, "ptz": r.random() < 0.3},
        "balanca": lambda: {"capacidade_ton": r.choice([30, 60, 80]), "modo": r.choice(["dinamica", "estatica"]),
                            "eixos_max": r.randint(3, 9)},
        "veiculo_autonomo": lambda: {"placa": _placa(r), "nivel_autonomia": r.randint(2, 4),
                                     "autonomia_km": r.randint(80, 300), "sensores": ["lidar", "camera", "radar"]},
        "cancela": lambda: {"tipo_acesso": r.choice(["veiculos", "pedestres", "misto"]),
                            "largura_m": r.choice([3, 4.5, 6]), "leitor_tag": r.random() < 0.5},
        "taxi": lambda: _transporte(r, ponto=f"Ponto {r.randint(1, 40)}", taximetro_lacre=f"LC{r.randint(10000, 99999)}"),
        "mototaxi": lambda: _transporte(r, capacidade_passageiros=1, capacete_extra=True),
        "transporte_escolar": lambda: _transporte(
            r, capacidade_passageiros=r.randint(15, 40), vistoria_ate=str(agora().date() + timedelta(days=r.randint(-30, 300)))),
        "totem": lambda: {"funcao": r.choice(["informativo", "pagamento", "emergencia"]), "altura_cm": 180,
                          "tela_polegadas": r.choice([21.5, 32, 43]), "touch": True},
        "patinete": lambda: {"patrimonio": f"PAT-{r.randint(1000, 9999)}", "operadora": r.choice(["Yellow", "Tembici"]),
                             "velocidade_max_kmh": 25, "autonomia_km": r.randint(20, 40)},
        "moto_agente": lambda: {"placa": _placa(r), "prefixo": f"M{r.randint(10, 99)}",
                                "cilindrada_cc": r.choice([160, 300, 650])},
        "viatura": lambda: {"corporacao": r.choice(["GM", "PM"]), "placa": _placa(r), "prefixo": f"VTR-{r.randint(100, 999)}",
                            "modalidade": r.choice(["ostensiva", "tatica", "transito"])},
        "outro": lambda: {"descricao": "Equipamento diverso", "extras": {"nota": "seed"}},
    }[tipo]()


def _manutencao(situacao: str, r: random.Random) -> dict:
    hoje = agora().date()
    if situacao in ("mau_funcionamento", "em_manutencao"):
        return {"manutencao_tipo": ManutTipo.imediata, "proxima_manutencao": hoje + timedelta(days=r.randint(0, 3))}
    if situacao == "operacional" and r.random() < 0.3:
        return {"manutencao_tipo": ManutTipo.agendada, "proxima_manutencao": hoje + timedelta(days=r.randint(-5, 40))}
    return {}


def _local(i: int, r: random.Random) -> tuple[str, Bairro]:
    """Os primeiros itens cobrem cada bairro uma vez (todo local tem dados); o resto é sorteado pelo peso."""
    nomes = list(BAIRROS)
    nome = nomes[i % len(nomes)] if i < len(nomes) else r.choices(nomes, weights=PESOS)[0]
    return nome, BAIRROS[nome]


def equipamento(i: int, r: random.Random) -> Equipamento:
    tipo = r.choices(list(INFO), weights=[v[0] for v in INFO.values()])[0]
    _, prefixo, marcas, orgao = INFO[tipo]
    nome, b = _local(i - 1, r)
    situacao = r.choices([s for s, _ in SITUACOES], weights=[w for _, w in SITUACOES])[0]
    cep = f"175{r.randint(0, 99):02d}" if b.cidade == "Marília" else f"{r.randint(10, 99)}{r.randint(0, 999):03d}"
    return Equipamento(
        tipo=tipo, serie=f"{prefixo}-{i:05d}", marca=r.choice(marcas), modelo=f"{prefixo}{r.randint(100, 999)}",
        orgao=orgao.format(uf=b.uf), cep=f"{cep}-{r.randint(0, 999):03d}", bairro=nome, regiao=b.regiao, cidade=b.cidade, uf=b.uf,
        rua=r.choice(RUAS), referencia=f"Próx. ao nº {r.randint(1, 900)}", lat=b.lat + r.gauss(0, 0.004),
        lon=b.lon + r.gauss(0, 0.004), situacao=situacao,
        atributos=TIPOS[tipo].modelo(**atributos(tipo, r)).model_dump(mode="json"),
        **_manutencao(situacao, r),
    )


def agente(i: int, r: random.Random) -> Agente:
    cat = r.choice(list(Categoria))
    _, b = _local(len(BAIRROS), r)  # sempre sorteado pelo peso
    return Agente(
        nome=f"{r.choice(NOMES)} {r.choice(SOBRENOMES)}", matricula=f"AG{i:04d}", categoria=cat,
        orgao=ORGAO_CAT[cat].format(uf=b.uf), cidade=b.cidade, uf=b.uf,
        status=r.choices(list(StatusAgente), weights=[80, 15, 5])[0],
        lat=b.lat + r.gauss(0, 0.004), lon=b.lon + r.gauss(0, 0.004),
    )


def semear(s: Session, dias: int = 90, n_equip: int = 200, n_agentes: int = 50) -> bool:
    """Popula o banco se vazio (idempotente). Retorna True se semeou."""
    if s.exec(select(Equipamento).limit(1)).first():
        return False
    r = random.Random(SEMENTE)
    s.add_all([equipamento(i, r) for i in range(1, n_equip + 1)])
    s.add_all([agente(i, r) for i in range(1, n_agentes + 1)])
    s.commit()
    historico(s, dias, SEMENTE)
    return True
