from ..crud import Filtro, crud_router
from ..models import Agente, AgenteBase, Categoria, StatusAgente


class FiltroAgente(Filtro):
    categoria: Categoria | None = None
    status: StatusAgente | None = None
    cidade: str | None = None
    uf: str | None = None


router = crud_router(Agente, AgenteBase, FiltroAgente, "/agentes")
