"""Cidades e bairros (coordenadas reais aproximadas) e utilidades geográficas.

Presença da DSIN respaldada por fontes públicas (docs/PESQUISA_DSIN.md): CONFIRMADAS (SP, PR, MT). As demais são
apenas simulação de demonstração. Todos os equipamentos e agentes do sistema são fictícios.
"""

from collections.abc import Iterable
from typing import NamedTuple


class Bairro(NamedTuple):
    cidade: str
    uf: str
    regiao: str
    lat: float
    lon: float
    risco: float  # multiplicador da taxa-base de eventos
    peso: float  # participação no sorteio de equipamentos/agentes do seed
    praia: bool = False


MARILIA = "Marília"
# cidades com presença da DSIN respaldada por fontes públicas (docs/PESQUISA_DSIN.md)
CONFIRMADAS = (MARILIA, "Indaiatuba", "Olímpia", "Maringá", "Londrina", "Toledo", "Várzea Grande")

# bairro: (regiao, lat, lon, risco) — bairros reais de Marília/SP, posições aproximadas
_MARILIA = {
    "Centro": ("Marília Centro", -22.2139, -49.9458, 1.6),
    "Palmital": ("Marília Norte", -22.1900, -49.9300, 1.1),
    "Santa Antonieta": ("Marília Norte", -22.1860, -49.9560, 0.9),
    "Fragata": ("Marília Sul", -22.2420, -49.9560, 1.3),
    "Cascata": ("Marília Sul", -22.2480, -49.9300, 0.8),
    "Nova Marília": ("Marília Leste", -22.2150, -49.9050, 1.0),
    "Somenzari": ("Marília Leste", -22.2050, -49.9100, 0.9),
    "Alto Cafezal": ("Marília Oeste", -22.2100, -49.9900, 1.0),
    "Jardim Itaipu": ("Marília Oeste", -22.2000, -49.9800, 1.0),
    "Jardim Maria Izabel": ("Marília Oeste", -22.2300, -49.9850, 0.8),
}

# cidade: (uf, regiao, lat, lon, risco, praia) — o "bairro" é o centro, nomeado "Centro de <cidade>"
_CIDADES = {
    "Garça": ("SP", "Região de Marília", -22.2111, -49.6561, 0.6, False),
    "Pompeia": ("SP", "Região de Marília", -22.1064, -50.1708, 0.5, False),
    "Vera Cruz": ("SP", "Região de Marília", -22.2189, -49.8228, 0.5, False),
    "Oriente": ("SP", "Região de Marília", -22.1483, -50.0928, 0.4, False),
    "Echaporã": ("SP", "Região de Marília", -22.4339, -50.2000, 0.4, False),
    "Álvaro de Carvalho": ("SP", "Região de Marília", -22.0839, -49.7169, 0.4, False),
    "Gália": ("SP", "Região de Marília", -22.2958, -49.5578, 0.4, False),
    "Júlio Mesquita": ("SP", "Região de Marília", -22.0108, -49.7878, 0.4, False),
    "Assis": ("SP", "Região de Marília", -22.6619, -50.4122, 0.8, False),
    "Tupã": ("SP", "Região de Marília", -21.9347, -50.5136, 0.7, False),
    "Bauru": ("SP", "Região de Marília", -22.3147, -49.0608, 1.0, False),
    "Ourinhos": ("SP", "Região de Marília", -22.9789, -49.8708, 0.7, False),
    "Presidente Prudente": ("SP", "Interior SP", -22.1256, -51.3889, 1.0, False),
    "Indaiatuba": ("SP", "Interior SP", -23.0922, -47.2181, 0.9, False),
    "Olímpia": ("SP", "Interior SP", -20.7364, -48.9150, 0.6, False),
    "São Paulo": ("SP", "Interior SP", -23.5505, -46.6333, 1.5, False),
    "Maringá": ("PR", "Sul", -23.4205, -51.9331, 1.0, False),
    "Londrina": ("PR", "Sul", -23.3103, -51.1628, 1.0, False),
    "Toledo": ("PR", "Sul", -24.7136, -53.7433, 0.7, False),
    "Curitiba": ("PR", "Sul", -25.4284, -49.2733, 1.3, False),
    "Florianópolis": ("SC", "Sul", -27.5954, -48.5480, 1.2, True),
    "Porto Alegre": ("RS", "Sul", -30.0346, -51.2177, 1.3, False),
    "Várzea Grande": ("MT", "Centro-Oeste", -15.6467, -56.1325, 0.8, False),
    "Cuiabá": ("MT", "Centro-Oeste", -15.6014, -56.0979, 1.0, False),
    "Campo Grande": ("MS", "Centro-Oeste", -20.4697, -54.6201, 1.0, False),
    "Goiânia": ("GO", "Centro-Oeste", -16.6869, -49.2648, 1.2, False),
    "Brasília": ("DF", "Centro-Oeste", -15.7939, -47.8828, 1.4, False),
    "Belo Horizonte": ("MG", "Sudeste", -19.9167, -43.9345, 1.4, False),
    "Rio de Janeiro": ("RJ", "Sudeste", -22.9068, -43.1729, 1.6, True),
    "Vitória": ("ES", "Sudeste", -20.3155, -40.3128, 1.0, True),
    "Salvador": ("BA", "Nordeste", -12.9777, -38.5016, 1.4, True),
    "Recife": ("PE", "Nordeste", -8.0476, -34.8770, 1.3, True),
    "Fortaleza": ("CE", "Nordeste", -3.7319, -38.5267, 1.3, True),
    "Manaus": ("AM", "Norte", -3.1190, -60.0217, 1.1, False),
    "Belém": ("PA", "Norte", -1.4558, -48.4902, 1.1, False),
    "Palmas": ("TO", "Norte", -10.1689, -48.3317, 0.7, False),
    "Porto Velho": ("RO", "Norte", -8.7612, -63.9004, 0.8, False),
}

BAIRROS: dict[str, Bairro] = {
    **{n: Bairro(MARILIA, "SP", r, lat, lon, k, peso=9.0) for n, (r, lat, lon, k) in _MARILIA.items()},
    **{f"Centro de {c}": Bairro(c, uf, r, lat, lon, k, peso=1.0, praia=p) for c, (uf, r, lat, lon, k, p) in _CIDADES.items()},
}


def mais_proximo[T](itens: Iterable[T], lat: float, lon: float) -> T:
    """Item (com .lat/.lon) mais próximo do ponto; distância euclidiana basta na escala local."""
    return min(itens, key=lambda i: (i.lat - lat) ** 2 + (i.lon - lon) ** 2)


def bairros_de(cidade: str | None = None, uf: str | None = None) -> list[str]:
    """Nomes dos bairros que pertencem à cidade e/ou UF informadas (sem filtro: todos)."""
    return [n for n, b in BAIRROS.items() if cidade in (None, b.cidade) and uf in (None, b.uf)]


def cidades() -> list[dict]:
    """Cidades do conjunto (centroide dos bairros) com a marca `dsin` = presença respaldada por fonte pública."""
    out: dict[str, list[Bairro]] = {}
    for b in BAIRROS.values():
        out.setdefault(b.cidade, []).append(b)
    return [
        {"cidade": c, "uf": bs[0].uf, "regiao": bs[0].regiao, "dsin": c in CONFIRMADAS,
         "lat": sum(b.lat for b in bs) / len(bs), "lon": sum(b.lon for b in bs) / len(bs)}
        for c, bs in out.items()
    ]
