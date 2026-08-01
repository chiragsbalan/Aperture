"""Auth FastAPI dependencies."""

from __future__ import annotations

from typing import Annotated

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.models import Identity
from app.auth.service import resolve_identity_from_access_token
from app.core.deps import DbSessionDep, SettingsDep

_bearer = HTTPBearer(auto_error=False)


async def get_current_identity(
    settings: SettingsDep,
    session: DbSessionDep,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(_bearer),
    ],
) -> Identity:
    """Require a valid Bearer access JWT and return the identity."""
    if credentials is None or credentials.scheme.lower() != 'bearer':
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail='Not authenticated',
            headers={'WWW-Authenticate': 'Bearer'},
        )
    return await resolve_identity_from_access_token(
        session,
        settings=settings,
        token=credentials.credentials,
    )


async def get_optional_identity(
    settings: SettingsDep,
    session: DbSessionDep,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(_bearer),
    ],
) -> Identity | None:
    """Return identity when Authorization is present; None when missing.

    Invalid or expired tokens still raise 401 (same as required auth).
    """
    if credentials is None or credentials.scheme.lower() != 'bearer':
        return None
    return await resolve_identity_from_access_token(
        session,
        settings=settings,
        token=credentials.credentials,
    )


CurrentIdentityDep = Annotated[Identity, Depends(get_current_identity)]
OptionalIdentityDep = Annotated[Identity | None, Depends(get_optional_identity)]
