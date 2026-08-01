"""Trusted BFF client-IP resolution (shared by auth and search)."""

from __future__ import annotations

import secrets

from fastapi import Request

from app.core.config import Settings


def bff_secret_matches(configured: str, provided: str) -> bool:
    """Constant-time compare; unequal lengths never match."""
    if not configured:
        return False
    if len(configured) != len(provided):
        secrets.compare_digest(configured, configured)
        return False
    return secrets.compare_digest(configured, provided)


def resolve_client_ip(request: Request, settings: Settings) -> str | None:
    """Trusted BFF client IP when secret matches; else socket peer.

    Ignores inbound ``X-Forwarded-For`` so browsers cannot spoof rate-limit
    keys. Trusts ``X-Aperture-Client-IP`` only when ``AUTH_BFF_SHARED_SECRET``
    is set and matches ``X-Aperture-BFF-Secret``. Never returns a
    whitespace-only IP.
    """
    configured = settings.auth_bff_shared_secret
    if configured:
        provided = request.headers.get('x-aperture-bff-secret') or ''
        if bff_secret_matches(configured, provided):
            raw = request.headers.get('x-aperture-client-ip')
            if raw:
                ip = raw.strip()
                if ip:
                    return ip[:64]
    if request.client is None:
        return None
    host = request.client.host
    if host is None:
        return None
    cleaned = host.strip()
    if not cleaned:
        return None
    return cleaned[:64]
