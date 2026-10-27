from datetime import date, datetime
from enum import StrEnum
from typing import Annotated, Any, ClassVar

from pydantic import StringConstraints, ValidationError, model_validator
from sqlalchemy import JSON, Column, DateTime, Index
from sqlmodel import Field, SQLModel

from .db import agora
from .schemas import TIPOS, TipoEquip


class Situacao(StrEnum):
    nao_instalado = "nao_instalado"
    operacional = "operacional"
    mau_funcionamento = "mau_funcionamento"
    em_manutencao = "em_manutencao"
    desativado = "desativado"
    furtado = "furtado"


class ManutTipo(StrEnum):
    imediata = "imediata"
    agendada = "agendada"
    nenhuma = "nenhuma"


class Categoria(StrEnum):
    transito = "transito"
    guarda = "guarda"
    policia = "policia"


class StatusAgente(StrEnum):
    ativo = "ativo"
    inativo = "inativo"
    em_ocorrencia = "em_ocorrencia"


class StatusAlerta(StrEnum):
    aberto = "aberto"
    reconhecido = "reconhecido"
    em_atendimento = "em_atendimento"
    resolvido = "resolvido"


ABERTOS = (StatusAlerta.aberto, StatusAlerta.reconhecido, StatusAlerta.em_atendimento)
SLA_MIN = {4: 15, 3: 30, 2: 120, 1: 480}  # prazo (min) para reconhecer um alerta, por severidade


class TipoEvento(StrEnum):
    falha = "falha"
    ocorrencia = "ocorrencia"
    alerta = "alerta"


UF = Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")]


class EquipamentoBase(SQLModel):
    BUSCA: ClassVar[tuple[str, ...]] = ("serie", "marca", "modelo", "rua", "bairro", "cidade", "referencia")

    tipo: TipoEquip = Field(index=True)
    serie: str = Field(min_length=3, index=True, unique=True)
    marca: str = Field(min_length=1)
    modelo: str = Field(min_length=1)
    orgao: str = Field(min_length=2, index=True)
    cep: Annotated[str, StringConstraints(pattern=r"^\d{5}-?\d{3}$")]
    bairro: str = Field(min_length=2, index=True)
    regiao: str = Field(min_length=2, index=True)
    cidade: str = Field(min_length=2, index=True)
    uf: UF = Field(index=True)
    rua: str = Field(min_length=2)
    referencia: str | None = None
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    situacao: Situacao = Field(default=Situacao.nao_instalado, index=True)
    manutencao_tipo: ManutTipo = ManutTipo.nenhuma
    proxima_manutencao: date | None = None
    atributos: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def _valida(self):
        """Valida atributos pelo esquema do tipo e a coerência da manutenção."""
        try:
            attr = TIPOS[self.tipo].modelo.model_validate(self.atributos)
        except ValidationError as e:
            msg = "; ".join(f"atributos.{'.'.join(map(str, x['loc']))}: {x['msg']}" for x in e.errors())
            raise ValueError(msg) from None
        self.atributos = attr.model_dump(mode="json")
        if self.manutencao_tipo == ManutTipo.agendada and not self.proxima_manutencao:
            raise ValueError("manutencao agendada exige proxima_manutencao")
        return self


class Equipamento(EquipamentoBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    atributos: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))

    @classmethod
    def precisa_manutencao(cls):
        """Expressão SQL: manutenção marcada ou equipamento degradado/em manutenção."""
        return (cls.manutencao_tipo != ManutTipo.nenhuma) | cls.situacao.in_(
            [Situacao.mau_funcionamento, Situacao.em_manutencao]
        )


class AgenteBase(SQLModel):
    BUSCA: ClassVar[tuple[str, ...]] = ("nome", "matricula")

    nome: str = Field(min_length=2)
    matricula: str = Field(min_length=3, index=True, unique=True)
    categoria: Categoria = Field(index=True)
    orgao: str = Field(min_length=2, index=True)
    status: StatusAgente = Field(default=StatusAgente.ativo, index=True)
    cidade: str = Field(min_length=2, index=True)
    uf: UF = Field(index=True)
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)


class Agente(AgenteBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    atualizado_em: datetime = Field(default_factory=agora, sa_type=DateTime)
    # despacho: enquanto `alerta_id` existe o agente segue para (destino_lat, destino_lon) e não volta sozinho à patrulha
    alerta_id: int | None = None
    destino_lat: float | None = None
    destino_lon: float | None = None


class Telemetria(SQLModel, table=True):
    __table_args__ = (Index("ix_telemetria_equip_ts", "equipamento_id", "ts"),)
    id: int | None = Field(default=None, primary_key=True)
    equipamento_id: int = Field(foreign_key="equipamento.id", ondelete="CASCADE", index=True)
    ts: datetime = Field(index=True, sa_type=DateTime)
    metricas: dict[str, float] = Field(default_factory=dict, sa_column=Column(JSON))
    situacao: Situacao


class Evento(SQLModel, table=True):
    """Evento/alerta. `ts` é a última ocorrência e `inicio` a primeira (repetições do mesmo equipamento são agrupadas)."""

    __table_args__ = (Index("ix_evento_bairro_ts", "bairro", "ts"),)
    id: int | None = Field(default=None, primary_key=True)
    ts: datetime = Field(index=True, sa_type=DateTime)
    inicio: datetime | None = Field(default=None, sa_type=DateTime)
    status: StatusAlerta = Field(default=StatusAlerta.aberto, index=True)
    ocorrencias: int = Field(default=1, ge=1)
    agente_id: int | None = Field(default=None, foreign_key="agente.id", ondelete="SET NULL")
    reconhecido_em: datetime | None = Field(default=None, sa_type=DateTime)
    resolvido_em: datetime | None = Field(default=None, sa_type=DateTime)
    bairro: str = Field(index=True)
    tipo: TipoEvento
    severidade: int = Field(ge=1, le=4)
    equipamento_id: int | None = Field(
        default=None, foreign_key="equipamento.id", ondelete="SET NULL", index=True
    )


class Auditoria(SQLModel, table=True):
    """Trilha de alterações (cadastros e ciclo de vida dos alertas): quem/quando/o quê."""

    __table_args__ = (Index("ix_auditoria_entidade", "entidade", "entidade_id", "ts"),)
    id: int | None = Field(default=None, primary_key=True)
    ts: datetime = Field(default_factory=agora, index=True, sa_type=DateTime)
    entidade: str  # equipamento | agente | alerta
    entidade_id: int
    acao: str  # criado | alterado | excluido | reconhecido | despachado | resolvido ...
    detalhe: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSON))
