"""Users HTTP routes under ``/api/v1/users`` (API layer; AuthZ via Auth deps)."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, status

from app.auth.deps import CurrentIdentityDep
from app.core.deps import DbSessionDep
from app.users import service as users_service
from app.users.schemas import (
    PreferencesPatchRequest,
    PreferencesResponse,
    ProfilePatchRequest,
    ProfileResponse,
    PublicProfileResponse,
)

router = APIRouter(prefix='/users', tags=['users'])


def _profile_response(profile: users_service.OwnedProfile) -> ProfileResponse:
    prefs = profile.preferences
    return ProfileResponse(
        id=profile.id,
        username=profile.username,
        display_name=profile.display_name,
        bio=profile.bio,
        preferences=PreferencesResponse(
            theme=prefs['theme'],  # validated in normalize_preferences
            spoilers=prefs['spoilers'],
            language=prefs['language'],
        ),
        username_changed_at=profile.username_changed_at,
        username_rename_available_at=profile.username_rename_available_at,
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


@router.get('/{username}', response_model=PublicProfileResponse)
async def get_public_profile(
    username: str,
    session: DbSessionDep,
) -> PublicProfileResponse:
    """Return a minimal public profile by username."""
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
    return PublicProfileResponse(
        username=profile.username,
        display_name=profile.display_name,
        bio=profile.bio,
    )
