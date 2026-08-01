"""Shared response helpers."""

from typing import Any


def ok_message(message: str, **extra: Any) -> dict[str, Any]:
    """Return a simple success payload."""
    return {'status': 'ok', 'message': message, **extra}
