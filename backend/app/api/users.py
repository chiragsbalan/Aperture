"""Users HTTP routes under ``/api/v1/users`` (API layer; AuthZ via Auth deps)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, HTTPException, Query, Request, status

from app.auth.deps import CurrentIdentityDep, OptionalIdentityDep
from app.core.cache import get_cache
from app.core.deps import DbSessionDep, SettingsDep
from app.core.trusted_client import resolve_client_ip
from app.library import service as library_service
from app.library.schemas import WatchEntriesPageResponse
from app.users import service as users_service
from app.users.rate_limit import enforce_users_public_rate_limit
from app.users.schemas import (
    PreferencesPatchRequest,
    PreferencesResponse,
    ProfileCounts,
    ProfilePatchRequest,
    ProfileResponse,
    PublicProfileResponse,
    normalize_links,
)

router = APIRouter(prefix='/users', tags=['users'])


def _profile_response(profile: users_service.OwnedProfile) -> ProfileResponse:
    prefs = profile.preferences
    return ProfileResponse(
        id=profile.id,
        username=profile.username,
        display_name=profile.display_name,
        bio=profile.bio,
        avatar_url=profile.avatar_url,
        website_url=profile.website_url,
        links=normalize_links(profile.links),
        preferences=PreferencesResponse(
            theme=prefs['theme'],  # validated in normalize_preferences
            spoilers=prefs['spoilers'],
            language=prefs['language'],
        ),
        username_changed_at=profile.username_changed_at,
        username_rename_available_at=profile.username_rename_available_at,
    )


async def _build_public_profile_response(
    session: DbSessionDep,
    *,
    profile: users_service.PublicProfile,
    viewer_identity_id: object | None,
) -> PublicProfileResponse:
    """Assemble public shell + counters in the API layer (not Users domain)."""
    is_owner = (
        viewer_identity_id is not None and viewer_identity_id == profile.identity_id
    )
    movies = await library_service.count_logged_titles_by_type(
        session,
        owner_user_id=profile.id,
        content_type='movie',
    )
    shows = await library_service.count_logged_titles_by_type(
        session,
        owner_user_id=profile.id,
        content_type='tv_show',
    )
    return PublicProfileResponse(
        username=profile.username,
        display_name=profile.display_name,
        bio=profile.bio,
        avatar_url=profile.avatar_url,
        website_url=profile.website_url,
        links=normalize_links(profile.links),
        is_owner=is_owner,
        counts=ProfileCounts(
            movies=movies,
            shows=shows,
            followers=0,
            following=0,
        ),
    )


@router.get('/me', response_model=ProfileResponse)
async def get_me_profile(
    identity: CurrentIdentityDep,
    session: DbSessionDep,
) -> ProfileResponse:
    """Return the authenticated user's full profile + preferences."""
    try:
        profile = await users_service.get_owned_profile(
            session,
            identity_id=identity.id,
        )
    except users_service.ProfileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Profile not found',
        ) from exc
    return _profile_response(profile)


@router.patch('/me', response_model=ProfileResponse)
async def patch_me_profile(
    body: ProfilePatchRequest,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
) -> ProfileResponse:
    """Update username, display name, and/or bio for the current user."""
    data = body.model_dump(exclude_unset=True)
    if not data:
        return await get_me_profile(identity, session)

    username = data.get('username')
    display_name = data['display_name'] if 'display_name' in data else ...
    bio = data['bio'] if 'bio' in data else ...
    avatar_url = data['avatar_url'] if 'avatar_url' in data else ...
    website_url = data['website_url'] if 'website_url' in data else ...
    links_raw = data.get('links', ...)
    links: list[dict[str, str]] | object = ...
    if links_raw is not ...:
        links = [{'label': item['label'], 'url': item['url']} for item in links_raw]
    prefs = data.get('preferences')
    update_preferences = prefs is not None
    theme = prefs.get('theme') if isinstance(prefs, dict) else None
    spoilers = prefs.get('spoilers') if isinstance(prefs, dict) else None
    language = prefs.get('language') if isinstance(prefs, dict) else None

    try:
        profile = await users_service.update_owned_profile(
            session,
            identity_id=identity.id,
            username=username,
            display_name=display_name,
            bio=bio,
            avatar_url=avatar_url,
            website_url=website_url,
            links=links,
            update_preferences=update_preferences,
            theme=theme,
            spoilers=spoilers,
            language=language,
        )
    except users_service.ProfileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Profile not found',
        ) from exc
    except users_service.UsernameInvalidError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail='Invalid username',
        ) from exc
    except users_service.UsernameConflictError as exc:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail='Username already taken',
        ) from exc
    except users_service.UsernameRenameCooldownError as exc:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail={
                'message': 'Username can only be changed once every 30 days',
                'username_rename_available_at': exc.available_at.isoformat(),
            },
        ) from exc
    return _profile_response(profile)


@router.get('/me/preferences', response_model=PreferencesResponse)
async def get_me_preferences(
    identity: CurrentIdentityDep,
    session: DbSessionDep,
) -> PreferencesResponse:
    """Return preferences for the authenticated user."""
    profile = await get_me_profile(identity, session)
    return profile.preferences


@router.patch('/me/preferences', response_model=PreferencesResponse)
async def patch_me_preferences(
    body: PreferencesPatchRequest,
    identity: CurrentIdentityDep,
    session: DbSessionDep,
) -> PreferencesResponse:
    """Merge preference updates for the authenticated user."""
    data = body.model_dump(exclude_unset=True)
    if not data:
        return await get_me_preferences(identity, session)
    try:
        profile = await users_service.update_owned_preferences(
            session,
            identity_id=identity.id,
            theme=data.get('theme'),
            spoilers=data.get('spoilers'),
            language=data.get('language'),
        )
    except users_service.ProfileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Profile not found',
        ) from exc
    return _profile_response(profile).preferences


@router.get(
    '/{username}/watch-entries',
    response_model=WatchEntriesPageResponse,
)
async def list_public_watch_entries(
    request: Request,
    username: str,
    session: DbSessionDep,
    settings: SettingsDep,
    page: Annotated[int, Query(ge=1)] = 1,
    limit: Annotated[int, Query(ge=1, le=100)] = 24,
    year: Annotated[int | None, Query(ge=1900, le=2100)] = None,
    month: Annotated[int | None, Query(ge=1, le=12)] = None,
) -> WatchEntriesPageResponse:
    """Return a member's public diary (always public; newest first)."""
    await enforce_users_public_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        profile = await users_service.get_public_profile(
            session,
            username=username,
        )
        return await library_service.list_entries_for_owner(
            session,
            owner_user_id=profile.id,
            page=page,
            limit=limit,
            year=year,
            month=month,
        )
    except users_service.ProfileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Profile not found',
        ) from exc
    except library_service.UnsupportedWatchContentError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc) or 'Invalid diary filters',
        ) from exc


@router.get('/{username}', response_model=PublicProfileResponse)
async def get_public_profile(
    request: Request,
    username: str,
    session: DbSessionDep,
    settings: SettingsDep,
    identity: OptionalIdentityDep,
) -> PublicProfileResponse:
    """Return a public profile shell with counters (profiles are always public)."""
    await enforce_users_public_rate_limit(
        get_cache(),
        settings=settings,
        client_ip=resolve_client_ip(request, settings),
    )
    try:
        profile = await users_service.get_public_profile(
            session,
            username=username,
        )
    except users_service.ProfileNotFoundError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail='Profile not found',
        ) from exc
    return await _build_public_profile_response(
        session,
        profile=profile,
        viewer_identity_id=identity.id if identity is not None else None,
    )
