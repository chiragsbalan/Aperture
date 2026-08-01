"""Auth HTTP routes under ``/api/v1/auth``."""

from __future__ import annotations

import secrets

from fastapi import APIRouter, Request, status

from app.auth.deps import CurrentIdentityDep
from app.auth.schemas import (
    LoginRequest,
    LogoutRequest,
    MeResponse,
    RefreshRequest,
    RegisterRequest,
    TokenResponse,
    UserSummary,
)
from app.auth.service import (
    IssuedTokens,
    get_me,
    login,
    logout,
    refresh,
    register,
)
from app.core.config import Settings
from app.core.deps import DbSessionDep, SettingsDep

router = APIRouter(prefix='/auth', tags=['auth'])


def _user_agent(request: Request) -> str | None:
    value = request.headers.get('user-agent')
    if value is None:
        return None
    return value[:512]


def _bff_secret_matches(configured: str, provided: str) -> bool:
    """Constant-time compare; unequal lengths never match."""
    if not configured:
        return False
    if len(configured) != len(provided):
        secrets.compare_digest(configured, configured)
        return False
    return secrets.compare_digest(configured, provided)


def _client_ip(request: Request, settings: Settings) -> str | None:
    """Trusted BFF client IP when secret matches; else socket peer.

    Ignores inbound ``X-Forwarded-For`` so browsers cannot spoof rate-limit keys.
    Trusts ``X-Aperture-Client-IP`` only when ``AUTH_BFF_SHARED_SECRET`` is set
    and matches ``X-Aperture-BFF-Secret``.
    """
    configured = settings.auth_bff_shared_secret
    if configured:
        provided = request.headers.get('x-aperture-bff-secret') or ''
        if _bff_secret_matches(configured, provided):
            raw = request.headers.get('x-aperture-client-ip')
            if raw:
                ip = raw.strip()
                if ip:
                    return ip[:64]
    if request.client is None:
        return None
    return request.client.host


def _token_response(tokens: IssuedTokens) -> TokenResponse:
    return TokenResponse(
        access_token=tokens.access_token,
        refresh_token=tokens.refresh_token,
        expires_in=tokens.expires_in,
    )


@router.post(
    '/register',
    response_model=TokenResponse,
    status_code=status.HTTP_201_CREATED,
)
async def register_endpoint(
    body: RegisterRequest,
    request: Request,
    session: DbSessionDep,
    settings: SettingsDep,
) -> TokenResponse:
    """Create identity + profile and return tokens for the BFF."""
    tokens = await register(
        session,
        settings=settings,
        email=str(body.email),
        username=body.username,
        password=body.password,
        user_agent=_user_agent(request),
        client_ip=_client_ip(request, settings),
    )
    return _token_response(tokens)


@router.post('/login', response_model=TokenResponse)
async def login_endpoint(
    body: LoginRequest,
    request: Request,
    session: DbSessionDep,
    settings: SettingsDep,
) -> TokenResponse:
    """Authenticate with email or username plus password; return tokens for the BFF."""
    tokens = await login(
        session,
        settings=settings,
        identifier=body.identifier,
        password=body.password,
        user_agent=_user_agent(request),
        client_ip=_client_ip(request, settings),
    )
    return _token_response(tokens)


@router.post('/logout', status_code=status.HTTP_204_NO_CONTENT)
async def logout_endpoint(
    body: LogoutRequest,
    session: DbSessionDep,
) -> None:
    """Revoke the supplied refresh session."""
    await logout(session, refresh_token=body.refresh_token)


@router.post('/refresh', response_model=TokenResponse)
async def refresh_endpoint(
    body: RefreshRequest,
    request: Request,
    session: DbSessionDep,
    settings: SettingsDep,
) -> TokenResponse:
    """Rotate refresh token and issue a new access token."""
    tokens = await refresh(
        session,
        settings=settings,
        refresh_token=body.refresh_token,
        user_agent=_user_agent(request),
        client_ip=_client_ip(request, settings),
    )
    return _token_response(tokens)


@router.get('/me', response_model=MeResponse)
async def me_endpoint(
    session: DbSessionDep,
    identity: CurrentIdentityDep,
) -> MeResponse:
    """Return the current identity and linked profile summary."""
    context = await get_me(session, identity=identity)
    user_summary: UserSummary | None = None
    if context.user is not None:
        user_summary = UserSummary(
            id=context.user.id,
            username=context.user.username,
            display_name=context.user.display_name,
        )
    return MeResponse(
        identity_id=context.identity.id,
        email=context.identity.email,
        user=user_summary,
    )
