"""Structured logging setup."""

import logging

from app.core.config import Settings


def configure_logging(settings: Settings) -> None:
    """Configure root logging for the API process."""
    logging.basicConfig(
        level=getattr(logging, settings.log_level.upper(), logging.INFO),
        format='%(asctime)s %(levelname)s [%(name)s] %(message)s',
    )
    # httpx/httpcore are noisy at INFO (one line per request); keep warnings+.
    for name in ('httpx', 'httpcore', 'httpcore.http11'):
        logging.getLogger(name).setLevel(logging.WARNING)
