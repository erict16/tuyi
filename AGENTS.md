# Agent instructions

Before starting any task, read `docs/MEMORY.md` and every document in `docs/` relevant to the requested work. Treat these documents as durable project memory.

Preferred CLI is `python -m tuyi` (frozen names `tuyi` / `tuyi-cli`). User data lives under `~/.tuyi_*`. Older config filenames listed as `PREVIOUS_*` in `backend/app_meta.py` migrate once; do not write new files under those names.

Before handing off every task, record its completed work, current state, and any changed decision in `docs/MEMORY.md`. Update the relevant document in `docs/` when the task changes a project decision, workflow, version, packaging rule, or acceptance criterion.

## Cursor Cloud specific instructions

- Environment install: `pip install -r requirements.txt` and `frontend/npm install` (see `.cursor/environment.json`).
- Prefer `python -m tuyi` for CLI.
- Verify with `python -m unittest discover -s tests` when touching backend/CLI. For UI, `cd frontend && npm run build`.
- Do not bundle ODA. Do not add paid licensing.
- Secrets (API keys for DeepL/Azure/etc.) stay in Cursor Dashboard Secrets, not in this file.
