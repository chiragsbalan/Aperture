"""Allow ``python -m app.metadata`` → CLI."""

from app.metadata.cli import main

raise SystemExit(main())
