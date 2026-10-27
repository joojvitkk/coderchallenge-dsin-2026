"""Importação e exportação do inventário (CSV e GeoJSON) com validação linha a linha e relatório de erros."""

import csv
import io
import json
from typing import Annotated, Literal

from fastapi import APIRouter, HTTPException, Query, Request, Response
from pydantic import ValidationError
from sqlmodel import select

from ..crud import Sessao, filtrar
from ..models import Equipamento, EquipamentoBase
from ..services import auditoria
from .equipamentos import FiltroEquip

router = APIRouter(prefix="/equipamentos", tags=["equipamentos"])
CAMPOS = [c for c in EquipamentoBase.model_fields]  # ordem do modelo; `atributos` vai como JSON numa coluna
MAX_BYTES = 5_000_000
MAX_LINHAS = 5_000  # linhas por arquivo (a validação é linha a linha)
MAX_ERROS = 200  # o relatório não cresce sem limite
FORMULA = ("=", "+", "-", "@", "\t", "\r")  # prefixos que planilhas interpretam como fórmula
Formato = Literal["csv", "geojson"]


class FiltroExportar(FiltroEquip):
    formato: Formato = "csv"


@router.get("/exportar")
def exportar(f: Annotated[FiltroExportar, Query()], s: Sessao):
    """Exporta os equipamentos filtrados (até 500) em CSV ou GeoJSON."""
    formato = f.formato
    itens = [
        e.model_dump(mode="json", exclude={"id"})
        for e in s.exec(
            filtrar(Equipamento, FiltroEquip(**f.model_dump(exclude={"formato", "limit", "offset"}), limit=500)).order_by(
                Equipamento.id
            )
        )
    ]
    if formato == "geojson":
        feats = [
            {"type": "Feature", "geometry": {"type": "Point", "coordinates": [i["lon"], i["lat"]]}, "properties": i}
            for i in itens
        ]
        corpo, tipo = json.dumps({"type": "FeatureCollection", "features": feats}, ensure_ascii=False), "application/geo+json"
    else:
        buf = io.StringIO()
        w = csv.DictWriter(buf, CAMPOS)
        w.writeheader()
        w.writerows(
            {k: _neutralizar(v) for k, v in {**i, "atributos": json.dumps(i["atributos"], ensure_ascii=False)}.items()}
            for i in itens
        )
        corpo, tipo = buf.getvalue(), "text/csv"
    return Response(
        corpo,
        media_type=f"{tipo}; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="inventario.{formato}"'},
    )


def _neutralizar(v):
    """Injeção de fórmula (CSV): textos que começam com = + - @ ganham um apóstrofo para o Excel/Sheets não os executarem."""
    return f"'{v}" if isinstance(v, str) and v.startswith(FORMULA) else v


def _restaurar(v):
    """Inverso de `_neutralizar` na importação (round-trip exportar -> importar)."""
    return v[1:] if isinstance(v, str) and v.startswith("'") and v[1:].startswith(FORMULA) else v


def _registros(texto: str, formato: Formato) -> list[dict]:
    """Linhas do arquivo como dicionários de campos (CSV: strings; GeoJSON: properties + geometria)."""
    if formato == "geojson":
        dados = json.loads(texto)
        feats = dados.get("features") if isinstance(dados, dict) else None
        if not isinstance(feats, list):
            raise ValueError("GeoJSON deve ser uma FeatureCollection")
        saida = []
        for f in feats:
            if not isinstance(f, dict):
                raise ValueError("cada feature deve ser um objeto")
            p = dict(f.get("properties") or {})
            lon_lat = (f.get("geometry") or {}).get("coordinates")
            if isinstance(lon_lat, list) and len(lon_lat) >= 2:
                p.setdefault("lon", lon_lat[0])
                p.setdefault("lat", lon_lat[1])
            saida.append(p)
        return saida
    return list(csv.DictReader(io.StringIO(texto)))


def _normalizar(r: dict) -> dict:
    """CSV traz tudo como texto: vazio vira ausente e `atributos` é um JSON."""
    r = {k.strip(): _restaurar(v.strip()) if isinstance(v, str) else v for k, v in r.items() if k}
    r = {k: v for k, v in r.items() if v not in ("", None)}
    if isinstance(r.get("atributos"), str):
        r["atributos"] = json.loads(r["atributos"])
    return r


def _erros(e: Exception) -> list[dict]:
    if isinstance(e, ValidationError):
        return [
            {"campo": ".".join(map(str, x["loc"])) or "linha", "mensagem": x["msg"].removeprefix("Value error, ")}
            for x in e.errors()
        ]
    return [{"campo": "linha", "mensagem": str(e)}]


async def _ler_corpo(request: Request) -> str:
    """Corpo do envio como texto, cortando assim que passa de MAX_BYTES (sem trazer tudo para a memória)."""
    if int(request.headers.get("content-length") or 0) > MAX_BYTES:
        raise HTTPException(413, "arquivo maior que 5 MB")
    bruto = bytearray()
    async for pedaco in request.stream():
        bruto += pedaco
        if len(bruto) > MAX_BYTES:
            raise HTTPException(413, "arquivo maior que 5 MB")
    try:
        return bruto.decode("utf-8-sig")
    except UnicodeDecodeError as e:
        raise HTTPException(422, f"arquivo ilegível: {e}") from None


def _validar(registros: list[dict], formato: Formato) -> tuple[list[EquipamentoBase], list[dict]]:
    """Valida linha a linha (CSV: a linha 1 é o cabeçalho); devolve os itens válidos e o relatório de erros."""
    validos, erros, vistas = [], [], set()
    for n, bruto in enumerate(registros, start=2 if formato == "csv" else 1):
        try:
            item = EquipamentoBase.model_validate(_normalizar(bruto))
            if item.serie in vistas:
                raise ValueError(f"série {item.serie} repetida no arquivo")
            vistas.add(item.serie)
            validos.append(item)
        except Exception as e:
            erros += [{"linha": n, "serie": bruto.get("serie"), **x} for x in _erros(e)][: MAX_ERROS - len(erros)]
    return validos, erros


@router.post("/importar", status_code=200)
async def importar(request: Request, s: Sessao, formato: Formato = "csv", simular: bool = False):
    """Valida e grava (upsert pela série) o corpo enviado, tudo numa transação. `simular=true` só devolve o relatório."""
    texto = await _ler_corpo(request)
    try:
        registros = _registros(texto, formato)
    except (ValueError, csv.Error) as e:
        raise HTTPException(422, f"arquivo ilegível: {e}") from None
    if len(registros) > MAX_LINHAS:
        raise HTTPException(413, f"mais de {MAX_LINHAS} linhas")
    validos, erros = _validar(registros, formato)
    existentes = {e.serie: e for e in s.exec(select(Equipamento))}
    novos = sum(i.serie not in existentes for i in validos)
    gravar = not simular and not erros
    if gravar:
        for i in validos:
            alvo = existentes.get(i.serie)
            s.add(alvo.sqlmodel_update(i.model_dump()) if alvo else Equipamento(**i.model_dump()))
        auditoria.registrar(
            s, "equipamento", 0, "importado",
            {"formato": formato, "criados": novos, "atualizados": len(validos) - novos},
        )
        s.commit()  # um único commit: se algo falhar, nada é gravado
    return {
        "total": len(registros),
        "validos": len(validos),
        "criados": novos,
        "atualizados": len(validos) - novos,
        "erros": erros,
        "erros_truncados": len(erros) >= MAX_ERROS,
        "simulacao": simular,
        "gravado": gravar,
    }
