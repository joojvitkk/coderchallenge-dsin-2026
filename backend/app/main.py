import asyncio
import os
from contextlib import asynccontextmanager

from fastapi import APIRouter, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session

from simulator.sim import rodar

from . import db
from .limite import LimiteEscrita
from .routers import agentes, auditoria, central, demo, equipamentos, inventario_io, previsao, stream
from .seed import semear


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    with Session(db.engine) as s:
        semear(s)
    tarefa = asyncio.create_task(rodar(db.engine)) if os.getenv("FOGO_SIM", "1") == "1" else None
    yield
    if tarefa:
        tarefa.cancel()


app = FastAPI(title="F.O.G.O.", lifespan=lifespan)
ORIGENS = os.getenv("FOGO_CORS", "http://localhost:5173,http://127.0.0.1:5173").split(",")
app.add_middleware(CORSMiddleware, allow_origins=ORIGENS, allow_methods=["GET", "POST", "PUT", "DELETE"],
                   allow_headers=["Content-Type"], expose_headers=["X-Total-Count"])

app.add_middleware(LimiteEscrita, maximo=int(os.getenv("FOGO_RATE", "120")))  # escritas/min por IP; 0 desliga

api = APIRouter(prefix="/api")
for modulo in (inventario_io, equipamentos, agentes, auditoria, central, demo, stream, previsao):
    api.include_router(modulo.router)


@api.get("/health")
def health():
    return {"status": "ok"}


app.include_router(api)
