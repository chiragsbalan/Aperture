"""Cloudflare R2 (S3-compatible) helpers for avatar object storage.

Presigned PUTs use the R2 S3 API hostname; public reads use ``R2_PUBLIC_BASE_URL``
(custom domain / CDN). See ADR-0014.
"""

from __future__ import annotations

import asyncio
from dataclasses import dataclass
from functools import lru_cache
from typing import TYPE_CHECKING
from urllib.parse import urlparse

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import Settings, get_settings

if TYPE_CHECKING:
    from mypy_boto3_s3 import S3Client


class R2NotConfiguredError(RuntimeError):
    """R2 env vars are missing; avatar upload is unavailable."""


class R2ObjectError(RuntimeError):
    """Failed an R2 operation (non-missing)."""


class R2ObjectMissingError(R2ObjectError):
    """HeadObject reported the key does not exist."""


@dataclass(frozen=True, slots=True)
class R2ObjectHead:
    """Subset of HeadObject we care about for confirm checks."""

    content_type: str | None
    content_length: int | None


def r2_configured(settings: Settings) -> bool:
    """True when all required R2 settings are non-empty."""
    return bool(
        settings.r2_account_id.strip()
        and settings.r2_access_key_id.strip()
        and settings.r2_secret_access_key.strip()
        and settings.r2_bucket.strip()
        and settings.r2_public_base_url.strip()
    )


def public_object_url(settings: Settings, key: str) -> str:
    """Build the CDN URL for an object key."""
    base = settings.r2_public_base_url.rstrip('/')
    return f'{base}/{key.lstrip("/")}'


def key_from_public_url(settings: Settings, url: str) -> str | None:
    """Return the object key if ``url`` is under our public base, else None."""
    if not settings.r2_public_base_url.strip():
        return None
    base = settings.r2_public_base_url.rstrip('/')
    cleaned = url.strip()
    if not cleaned.startswith(base + '/'):
        return None
    key = cleaned[len(base) + 1 :]
    return key or None


def is_our_public_avatar_url(settings: Settings, url: str) -> bool:
    """Whether ``url`` is an HTTPS object under the configured media base.

    Does **not** assert caller ownership of ``avatars/{user_id}/…`` — callers that
    mutate ``avatar_url`` must enforce that separately (prefer upload/confirm).
    """
    key = key_from_public_url(settings, url)
    if key is None or not key.startswith('avatars/'):
        return False
    parsed = urlparse(url)
    return parsed.scheme == 'https' and bool(parsed.netloc)


@lru_cache
def _s3_client_for(
    account_id: str,
    access_key_id: str,
    secret_access_key: str,
) -> S3Client:
    """Cached low-level S3 client pointed at R2."""
    return boto3.client(
        's3',
        endpoint_url=f'https://{account_id}.r2.cloudflarestorage.com',
        aws_access_key_id=access_key_id,
        aws_secret_access_key=secret_access_key,
        region_name='auto',
        config=Config(
            signature_version='s3v4',
            s3={'addressing_style': 'path'},
        ),
    )


def get_s3_client(settings: Settings | None = None) -> S3Client:
    """Return an R2 S3 client or raise if not configured."""
    cfg = settings or get_settings()
    if not r2_configured(cfg):
        raise R2NotConfiguredError('Cloudflare R2 is not configured')
    return _s3_client_for(
        cfg.r2_account_id.strip(),
        cfg.r2_access_key_id.strip(),
        cfg.r2_secret_access_key.strip(),
    )


# Immutable UUID avatar keys — long CDN cache is safe.
AVATAR_CACHE_CONTROL = 'public, max-age=31536000, immutable'


def generate_presigned_put_url(
    settings: Settings,
    *,
    key: str,
    content_type: str,
    content_length: int,
    expires_in: int,
) -> str:
    """Mint a time-limited PUT URL on the R2 S3 API hostname.

    Signs ``ContentType``, ``ContentLength``, and ``CacheControl`` so the browser
    PUT must match (size cannot exceed the declared upload-slot byte_size).
    """
    client = get_s3_client(settings)
    url: str = client.generate_presigned_url(
        'put_object',
        Params={
            'Bucket': settings.r2_bucket.strip(),
            'Key': key,
            'ContentType': content_type,
            'ContentLength': content_length,
            'CacheControl': AVATAR_CACHE_CONTROL,
        },
        ExpiresIn=expires_in,
    )
    return url


def _head_object_sync(settings: Settings, key: str) -> R2ObjectHead:
    client = get_s3_client(settings)
    try:
        response = client.head_object(
            Bucket=settings.r2_bucket.strip(),
            Key=key,
        )
    except ClientError as exc:
        code = ''
        response_meta = exc.response if isinstance(exc.response, dict) else {}
        err = response_meta.get('Error')
        if isinstance(err, dict):
            raw_code = err.get('Code')
            if isinstance(raw_code, str):
                code = raw_code
        http_status = response_meta.get('ResponseMetadata', {}).get('HTTPStatusCode')
        if code in {'404', 'NoSuchKey', 'NotFound'} or http_status == 404:
            raise R2ObjectMissingError(f'object not found: {key}') from exc
        detail = code or http_status
        raise R2ObjectError(f'head_object failed: {key} ({detail})') from exc
    length_raw = response.get('ContentLength')
    length = int(length_raw) if isinstance(length_raw, int) else None
    ctype = response.get('ContentType')
    content_type = ctype if isinstance(ctype, str) else None
    return R2ObjectHead(content_type=content_type, content_length=length)


def _delete_object_sync(settings: Settings, key: str) -> None:
    client = get_s3_client(settings)
    client.delete_object(Bucket=settings.r2_bucket.strip(), Key=key)


def _get_object_prefix_sync(settings: Settings, key: str, *, max_bytes: int) -> bytes:
    client = get_s3_client(settings)
    end = max(0, max_bytes - 1)
    try:
        response = client.get_object(
            Bucket=settings.r2_bucket.strip(),
            Key=key,
            Range=f'bytes=0-{end}',
        )
    except ClientError as exc:
        code = ''
        response_meta = exc.response if isinstance(exc.response, dict) else {}
        err = response_meta.get('Error')
        if isinstance(err, dict):
            raw_code = err.get('Code')
            if isinstance(raw_code, str):
                code = raw_code
        http_status = response_meta.get('ResponseMetadata', {}).get(
            'HTTPStatusCode',
        )
        if code in {'404', 'NoSuchKey', 'NotFound', 'InvalidRange'} or http_status in {
            404,
            416,
        }:
            raise R2ObjectMissingError(f'object not found: {key}') from exc
        detail = code or http_status
        raise R2ObjectError(f'get_object failed: {key} ({detail})') from exc
    body = response['Body'].read(max_bytes)
    return bytes(body)


async def head_object(settings: Settings, key: str) -> R2ObjectHead:
    """HeadObject in a worker thread (boto3 is sync)."""
    return await asyncio.to_thread(_head_object_sync, settings, key)


async def get_object_prefix(
    settings: Settings,
    key: str,
    *,
    max_bytes: int = 32,
) -> bytes:
    """Read the first ``max_bytes`` of an object (for magic-byte sniffing)."""
    return await asyncio.to_thread(
        _get_object_prefix_sync,
        settings,
        key,
        max_bytes=max_bytes,
    )


async def delete_object(settings: Settings, key: str) -> None:
    """Best-effort DeleteObject in a worker thread."""
    await asyncio.to_thread(_delete_object_sync, settings, key)
