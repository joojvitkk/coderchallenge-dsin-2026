"""Limite simples de requisições de escrita por IP (janela deslizante em memória), como ASGI puro para não atrapalhar o SSE."""

import time
from collections import defaultdict, deque

from starlette.responses import JSONResponse

ESCRITA = {"POST", "PUT", "DELETE"}


class LimiteEscrita:
    def __init__(self, app, maximo: int, janela_s: float = 60.0):
        self.app, self.maximo, self.janela = app, maximo, janela_s
        self.hist: dict[str, deque[float]] = defaultdict(deque)

    async def __call__(self, scope, receive, send):
        if self.maximo and scope["type"] == "http" and scope["method"] in ESCRITA and not self._permitir(scope):
            resp = JSONResponse({"detail": "muitas requisições de escrita; tente em instantes"}, 429,
                                headers={"Retry-After": str(int(self.janela))})
            return await resp(scope, receive, send)
        await self.app(scope, receive, send)

    def _permitir(self, scope) -> bool:
        agora, ip = time.monotonic(), (scope.get("client") or ("?",))[0]
        fila = self.hist[ip]
        while fila and agora - fila[0] > self.janela:
            fila.popleft()
        if len(fila) >= self.maximo:
            return False
        fila.append(agora)
        return True
