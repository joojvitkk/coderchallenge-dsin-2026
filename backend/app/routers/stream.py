from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from ..services.stream import eventos

router = APIRouter(tags=["stream"])


@router.get("/stream")
async def stream():
    """SSE: eventos `telemetria`, `agente`, `alerta` e `kpis`."""
    return StreamingResponse(
        eventos(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"}
    )
