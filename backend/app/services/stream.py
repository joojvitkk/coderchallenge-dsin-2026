"""Barramento de eventos em memória para SSE (publicação segura entre threads)."""

import asyncio
import json
import time
from collections.abc import AsyncIterator

HEARTBEAT_S = 15


class Bus:
    def __init__(self):
        self._subs: set[tuple[asyncio.AbstractEventLoop, asyncio.Queue]] = set()

    def assinar(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=1000)
        self._subs.add((asyncio.get_running_loop(), q))
        return q

    def cancelar(self, q: asyncio.Queue) -> None:
        self._subs = {s for s in self._subs if s[1] is not q}

    def publicar(self, evento: str, dados) -> None:
        for loop, q in list(self._subs):
            loop.call_soon_threadsafe(self._colocar, q, (evento, dados, time.time_ns() // 1_000_000))

    @staticmethod
    def _colocar(q: asyncio.Queue, item) -> None:
        if not q.full():
            q.put_nowait(item)


bus = Bus()


def formatar(evento: str, dados, emitido_ms: int | None = None) -> str:
    """Quadro SSE; `id` é o instante (epoch ms) em que o servidor emitiu o evento, base da métrica de latência evento->tela."""
    cabeca = f"id: {emitido_ms}\n" if emitido_ms else ""
    return f"{cabeca}event: {evento}\ndata: {json.dumps(dados, default=str, ensure_ascii=False)}\n\n"


async def eventos(heartbeat: float = HEARTBEAT_S) -> AsyncIterator[str]:
    """Fluxo SSE: comentário inicial, eventos do barramento e heartbeats periódicos."""
    q = bus.assinar()
    try:
        yield ": conectado\n\n"
        while True:
            try:
                evento, dados, emitido = await asyncio.wait_for(q.get(), heartbeat)
                yield formatar(evento, dados, emitido)
            except TimeoutError:
                yield ": hb\n\n"
    finally:
        bus.cancelar(q)
