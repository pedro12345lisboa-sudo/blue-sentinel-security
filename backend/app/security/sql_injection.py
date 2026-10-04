"""Proteções contra SQL injection: allowlist de ordenação.

Princípio: valores vindos do cliente **nunca** entram no texto da SQL.
Parâmetros de filtro usam binds (parametrização do SQLAlchemy/ORM) e a
cláusula `ORDER BY` é resolvida por um dicionário de colunas já mapeadas --
a chave do usuário só *seleciona* uma coluna, nunca é concatenada.
"""

from __future__ import annotations

from typing import Any, Mapping

from sqlalchemy import Select
from sqlalchemy.sql import ColumnElement

SORT_DIRECTIONS = ("asc", "desc")


class UnsafeSortError(ValueError):
    """Chave de ordenação fora da allowlist ou direção inválida."""


def apply_sort(
    statement: Select[Any],
    *,
    sort: str | None,
    direction: str | None,
    allowed: Mapping[str, ColumnElement[Any]],
    default: str,
) -> Select[Any]:
    """Aplica `ORDER BY` restrito à allowlist `allowed`.

    - `sort` precisa ser uma chave literal de `allowed`; caso contrário
      levanta :class:`UnsafeSortError` (nada é executado no banco).
    - `direction` só aceita ``asc``/``desc``.
    - A coluna ordenável é uma expressão já referenciada no modelo; nenhum
      texto do usuário chega ao SQL gerado.
    """
    if default not in allowed:
        raise UnsafeSortError(f"default sort {default!r} is not in the allowlist")

    key = (sort or default).strip()
    if key not in allowed:
        raise UnsafeSortError(
            f"sort field {key!r} is not allowed; use one of: {', '.join(sorted(allowed))}"
        )

    order = (direction or "desc").strip().lower()
    if order not in SORT_DIRECTIONS:
        raise UnsafeSortError(
            f"sort direction {order!r} is not allowed; use one of: {', '.join(SORT_DIRECTIONS)}"
        )

    column = allowed[key]
    return statement.order_by(column.desc() if order == "desc" else column.asc())
