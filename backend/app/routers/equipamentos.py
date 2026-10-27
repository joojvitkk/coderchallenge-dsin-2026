from pydantic import field_validator

from ..crud import Filtro, crud_router
from ..models import Equipamento, EquipamentoBase, Situacao
from ..schemas import TipoEquip


class FiltroEquip(Filtro):
    tipo: list[TipoEquip] | None = None  # repetido ou separado por vírgula: ?tipo=camera,taxi
    situacao: Situacao | None = None
    bairro: str | None = None
    regiao: str | None = None
    cidade: str | None = None
    uf: str | None = None
    precisa_manutencao: bool | None = None

    @field_validator("tipo", mode="before")
    @classmethod
    def _separa_virgulas(cls, v):
        return [t for x in v for t in x.split(",")] if isinstance(v, list) else v


router = crud_router(Equipamento, EquipamentoBase, FiltroEquip, "/equipamentos")
