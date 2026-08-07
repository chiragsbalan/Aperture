"""Auth HTTP routes under ``/api/v1/auth``."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.auth.deps import CurrentIdentityDep
from app.auth.schemas import (
    GoogleAuthRequest,
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
    google_link,
    google_sign_in,
    login,
    logout,
    refresh,
    register,
    resolve_identity_from_access_token,
)
from app.core.config import Settings
from app.core.deps import DbSessionDep, SettingsDep
from app.core.trusted_client import bff_secret_matches, resolve_client_ip

router = APIRouter(prefix='/auth', tags=['auth'])
_bearer = HTTPBearer(auto_error=False)


def _user_agent(request: Request) -> str | None:
    value = request.headers.get('user-agent')
    if value is None:
        return None
    return value[:512]


def _require_bff_secret(request: Request, settings: Settings) -> None:
    """Require a matching non-empty BFF shared secret (Google verified claims)."""
    configured = settings.auth_bff_shared_secret
    provided = request.headers.get('x-aperture-bff-secret') or ''
    if not configured or not bff_secret_matches(configured, provided):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail='Forbidden',
        )


def _client_ip(request: Request, settings: Settings) -> str | None:
    """Trusted BFF client IP when secret matches; else socket peer."""
    return resolve_client_ip(request, settings)


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


@router.post('/google', response_model=TokenResponse)
async def google_endpoint(
    body: GoogleAuthRequest,
    request: Request,
    session: DbSessionDep,
    settings: SettingsDep,
    credentials: Annotated[
        HTTPAuthorizationCredentials | None,
        Depends(_bearer),
    ],
) -> TokenResponse:
    """Accept verified Google claims from the BFF; sign in or link."""
    _require_bff_secret(request, settings)
    client_ip = _client_ip(request, settings)
    user_agent = _user_agent(request)

    if body.intent == 'link':
        if credentials is None or credentials.scheme.lower() != 'bearer':
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail='Not authenticated',
                headers={'WWW-Authenticate': 'Bearer'},
            )
        identity = await resolve_identity_from_access_token(
            session,
            settings=settings,
            token=credentials.credentials,
        )
        tokens = await google_link(
            session,
            settings=settings,
            identity=identity,
            sub=body.sub,
            email=str(body.email),
            user_agent=user_agent,
            client_ip=client_ip,
        )
        return _token_response(tokens)

    tokens = await google_sign_in(
        session,
        settings=settings,
        sub=body.sub,
        email=str(body.email),
        given_name=body.given_name,
        family_name=body.family_name,
        user_agent=user_agent,
        client_ip=client_ip,
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
            avatar_url=context.user.avatar_url,
        )
    return MeResponse(
        identity_id=context.identity.id,
        email=context.identity.email,
        user=user_summary,
        providers=context.providers,
    )
