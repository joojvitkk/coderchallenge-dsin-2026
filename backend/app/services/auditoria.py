"""Trilha de auditoria: registra criação, alteração (com diff), exclusão e ciclo de vida de alertas."""

from typing import Any

from sqlmodel import Session

from ..models import Auditoria


def diff(antes: dict[str, Any], depois: dict[str, Any]) -> dict[str, list]:
    """Campos que mudaram: {campo: [antes, depois]}."""
    return {k: [antes.get(k), v] for k, v in depois.items() if antes.get(k) != v}


def registrar(s: Session, entidade: str, entidade_id: int, acao: str, detalhe: dict | None = None) -> None:
    """Adiciona a entrada à sessão (quem chama faz o commit junto com a alteração auditada)."""
    s.add(Auditoria(entidade=entidade, entidade_id=entidade_id, acao=acao, detalhe=detalhe or {}))
