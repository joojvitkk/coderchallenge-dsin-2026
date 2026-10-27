from fastapi import APIRouter

from ..crud import Sessao
from ..services.alertas import IncidenteIn, injetar

router = APIRouter(prefix="/demo", tags=["demo"])


@router.post("/incidente", status_code=201)
def incidente(body: IncidenteIn, s: Sessao):
    """Injeta um incidente para a banca ver alertas/KPIs/previsões reagirem ao vivo."""
    return injetar(s, body)
