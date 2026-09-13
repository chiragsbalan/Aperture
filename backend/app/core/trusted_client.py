"""Trusted BFF client-IP resolution (shared by auth and search)."""

from __future__ import annotations

import secrets

from fastapi import HTTPException, Request, status

from app.core.config import Settings


def bff_secret_matches(configured: str, provided: str) -> bool:
    """Constant-time compare; unequal lengths never match."""
    if not configured:
        return False
    if len(configured) != len(provided):
        secrets.compare_digest(configured, configured)
        return False
    return secrets.compare_digest(configured, provided)


def require_bff_secret(request: Request, settings: Settings) -> None:
    """Require a matching non-empty BFF shared secret (Google / availability)."""
    configured = settings.auth_bff_shared_secret
    provided = request.headers.get('x-aperture-bff-secret') or ''
    if not configured or not bff_secret_matches(configured, provided):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Forbidden',
        )


def bff_attested_client_ip(request: Request, settings: Settings) -> str | None:
    """Return client IP only when BFF secret matches and the IP header is set.

    Used for dual rate-limit buckets that must not treat socket peer / SSR
    hops as an attested end-user IP.
    """
    configured = settings.auth_bff_shared_secret
    if not configured:
        return None
    provided = request.headers.get('x-aperture-bff-secret') or ''
    if not bff_secret_matches(configured, provided):
        return None
    raw = request.headers.get('x-aperture-client-ip')
    if not raw:
        return None
    ip = raw.strip()
    if not ip:
        return None
    return ip[:64]


def resolve_client_ip(request: Request, settings: Settings) -> str | None:
    """Trusted BFF client IP when secret matches; else socket peer.

    Ignores inbound ``X-Forwarded-For`` so browsers cannot spoof rate-limit
    keys. Trusts ``X-Aperture-Client-IP`` only when ``AUTH_BFF_SHARED_SECRET``
    is set and matches ``X-Aperture-BFF-Secret``. Never returns a
    whitespace-only IP.
    """
    attested = bff_attested_client_ip(request, settings)
    if attested is not None:
        return attested
    if request.client is None:
        return None
    host = request.client.host
    if host is None:
        return None
    cleaned = host.strip()
    if not cleaned:
        return None
    return cleaned[:64]
