"""Shared crypto helpers used across domains (rate-limit keys, etc.)."""

from __future__ import annotations

import hashlib


def hash_rate_limit_subject(raw: str) -> str:
    """SHA-256 hex digest for rate-limit subject keys (emails, IPs, etc.)."""
    return hashlib.sha256(raw.encode('utf-8')).hexdigest()
