"""Compat: python -m dwglot is the same as python -m tuyi."""
from backend.cli import main

raise SystemExit(main())
