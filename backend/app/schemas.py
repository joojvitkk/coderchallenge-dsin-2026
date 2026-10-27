"""Registro TIPOS: um único lugar define e valida os atributos específicos de cada tipo."""

from datetime import date
from enum import StrEnum
from typing import Annotated, Literal, NamedTuple

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

Placa = Annotated[str, StringConstraints(pattern=r"^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$")]


class Attr(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Radar(Attr):
    faixas: int = Field(ge=1, le=8)
    sentido: Literal["crescente", "decrescente", "ambos"] = "ambos"


class RadarVelocidade(Radar):
    velocidade_via_kmh: int = Field(ge=10, le=120)
    modo: Literal["fixo", "movel", "portatil"]


class RadarSemaforo(Radar):
    tempo_amarelo_s: float = Field(ge=2, le=6)


class RadarConversao(Radar):
    conversao_proibida: Literal["esquerda", "direita", "retorno"]


class Camera(Attr):
    resolucao: Literal["HD", "FullHD", "4K"]
    leitura_placa: bool = False
    visao_noturna: bool = True
    ptz: bool = False


class Balanca(Attr):
    capacidade_ton: float = Field(gt=0, le=100)
    modo: Literal["dinamica", "estatica"]
    eixos_max: int = Field(ge=2, le=9)


class VeiculoAutonomo(Attr):
    placa: Placa
    nivel_autonomia: int = Field(ge=1, le=5)
    autonomia_km: float = Field(gt=0, le=1000)
    sensores: list[str] = Field(min_length=1)


class Cancela(Attr):
    tipo_acesso: Literal["veiculos", "pedestres", "misto"]
    largura_m: float = Field(ge=1, le=12)
    leitor_tag: bool = False


class Transporte(Attr):
    placa: Placa
    alvara: str = Field(min_length=3)
    capacidade_passageiros: int = Field(ge=1, le=60)


class Taxi(Transporte):
    ponto: str = Field(min_length=2)
    taximetro_lacre: str = Field(min_length=3)


class Mototaxi(Transporte):
    capacidade_passageiros: int = Field(ge=1, le=2)
    capacete_extra: bool = True


class TransporteEscolar(Transporte):
    vistoria_ate: date


class Totem(Attr):
    funcao: Literal["informativo", "pagamento", "emergencia"]
    altura_cm: int = Field(ge=100, le=300)
    tela_polegadas: float = Field(gt=0, le=80)
    touch: bool = True


class Patinete(Attr):
    patrimonio: str = Field(min_length=3)
    operadora: str = Field(min_length=2)
    velocidade_max_kmh: int = Field(ge=5, le=32)
    autonomia_km: float = Field(gt=0, le=80)


class MotoAgente(Attr):
    placa: Placa
    prefixo: str = Field(min_length=2)
    cilindrada_cc: int = Field(ge=50, le=1500)


class Viatura(Attr):
    corporacao: Literal["GM", "PM"]
    placa: Placa
    prefixo: str = Field(min_length=2)
    modalidade: Literal["ostensiva", "tatica", "transito"]


class Outro(Attr):
    descricao: str = Field(min_length=3)
    extras: dict[str, str | int | float | bool] = {}


class Tipo(NamedTuple):
    rotulo: str
    modelo: type[Attr]


TIPOS: dict[str, Tipo] = {
    "radar_velocidade": Tipo("Radar de velocidade", RadarVelocidade),
    "radar_semaforo": Tipo("Radar de semáforo (avanço de sinal)", RadarSemaforo),
    "radar_conversao_proibida": Tipo("Radar de conversão proibida", RadarConversao),
    "camera": Tipo("Câmera", Camera),
    "balanca": Tipo("Balança", Balanca),
    "veiculo_autonomo": Tipo("Veículo autônomo de fiscalização", VeiculoAutonomo),
    "cancela": Tipo("Cancela", Cancela),
    "taxi": Tipo("Táxi", Taxi),
    "mototaxi": Tipo("Mototáxi", Mototaxi),
    "transporte_escolar": Tipo("Transporte escolar", TransporteEscolar),
    "totem": Tipo("Totem", Totem),
    "patinete": Tipo("Patinete", Patinete),
    "moto_agente": Tipo("Moto de agente", MotoAgente),
    "viatura": Tipo("Viatura GM/PM", Viatura),
    "outro": Tipo("Outro", Outro),
}

TipoEquip = StrEnum("TipoEquip", {k: k for k in TIPOS})


def esquemas_tipos() -> dict[str, dict]:
    """Conteúdo de GET /api/tipos: rótulo + JSON Schema dos atributos de cada tipo."""
    return {
        k: {"rotulo": t.rotulo, "schema": t.modelo.model_json_schema()} for k, t in TIPOS.items()
    }
