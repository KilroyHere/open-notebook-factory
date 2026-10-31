# Open Notebook Factory — Agent Rules

Open Notebook Factory is a fork of [lfnovo/open-notebook](https://github.com/lfnovo/open-notebook), an open-source, privacy-focused alternative to Google's Notebook LM: an AI-powered research assistant with multi-provider AI support, fully self-hostable. The fork adds deep dives (learning asides) and merges upstream `main` from time to time.

This file holds the project-wide rules every coding session needs. Component rules: [open_notebook/AGENTS.md](open_notebook/AGENTS.md) (backend — also covers `api/`, `commands/`, `prompts/`) and [frontend/AGENTS.md](frontend/AGENTS.md). Knowledge lives in the docs (see [Where to look](#where-to-look)) — read it on demand instead of guessing.

## Stack, ports, startup order

Three tiers: Next.js frontend (3000) → FastAPI (5055) → SurrealDB (8000).

Start in this order — each tier depends on the one below:

1. `make database` — SurrealDB (API fails without it)
2. `make api` — FastAPI; **schema migrations run automatically on startup** (check logs)
3. `make worker-start` — surreal-commands worker. **Required**: podcasts, embeddings and source processing are async jobs that silently queue forever without it
4. `make frontend` — UI (depends on the API for all data)

Or all at once: `make start-all` (status: `make status`, stop: `make stop-all`). First-time setup (`uv sync`, `npm install`, a `.env` with `SURREAL_URL=ws://localhost:8000/rpc`): [development-setup.md](docs/7-DEVELOPMENT/development-setup.md).

## Commands

- Tests: `uv run pytest tests/`
- Python lint/format/typecheck: `uv run ruff check . --fix` · `uv run ruff format .` · `uv run python -m mypy .`
- Frontend (inside `frontend/`): `npm run lint` · `npm run test` · `npm run build` · `npm run test:e2e` (Playwright, [testing.md](docs/7-DEVELOPMENT/testing.md#end-to-end-tests-playwright))
- CI runs `uv run ruff check .`, `uv run ruff format --check .`, mypy, pytest and, in `frontend/`, `npm run lint`, `npm run test:coverage`, `npm run build` and `npm run test:e2e`; all must pass
- Docker release: `make docker-release` (see `.github/RELEASE_PROCESS.md`)

## Hard rules

- **Async-first**: every DB query, graph invocation and AI call is `await`-ed. No sync DB access.
- **Never commit secrets.** Credentials are encrypted at rest and require `OPEN_NOTEBOOK_ENCRYPTION_KEY` to be set.
- CORS is wide-open and auth is a simple password middleware — **dev defaults, not production hardening**. Don't build features that assume otherwise.
- **Migration numbers**: upstream's migrations stop at 25; the fork's are 26–29 and must stay after upstream's. A new migration takes the next free number. When an upstream merge brings a number the fork already uses, renumber the fork's after upstream's ([syncing-upstream.md](docs/7-DEVELOPMENT/syncing-upstream.md#3-check-the-migration-numbers)).
- **Name**: user-facing text says Open Notebook Factory ("Open Notebook" is the original project); code identifiers (`open_notebook`, `OPEN_NOTEBOOK_*`) keep their names.
- Product direction questions (does this feature fit?) → [VISION.md](VISION.md). Past decisions ("why is it like this?") → [docs/7-DEVELOPMENT/decisions/](docs/7-DEVELOPMENT/decisions/). Structural decisions made while coding should produce a new decision record there.
- **Conventional Commits** for commits and PR titles (`fix(podcasts): …`, `feat(providers): …`, `docs: …`).
- **Every user-visible change adds a CHANGELOG entry** under `## [Unreleased]`, in the one section for its type (`### Added` / `### Changed` / `### Deprecated` / `### Removed` / `### Fixed` / `### Security`); never create a duplicate section. Details: [contributing.md](docs/7-DEVELOPMENT/contributing.md#changelog).
- Maintainer profile lives in `.maintainer/`; do not run release or triage workflows without it. The fork has no GitHub Discussions.

## Where to look

| Need | Location |
|---|---|
| Architecture (processes, layout, data model, workflows) | [docs/7-DEVELOPMENT/architecture.md](docs/7-DEVELOPMENT/architecture.md) |
| Step-by-step recipes (add endpoint, provider, migration, command, i18n…) | [docs/7-DEVELOPMENT/change-playbooks.md](docs/7-DEVELOPMENT/change-playbooks.md) |
| Dev environment setup | [docs/7-DEVELOPMENT/development-setup.md](docs/7-DEVELOPMENT/development-setup.md) |
| Code standards & testing | [docs/7-DEVELOPMENT/code-standards.md](docs/7-DEVELOPMENT/code-standards.md) · [testing.md](docs/7-DEVELOPMENT/testing.md) |
| Product identity & current posture | [VISION.md](VISION.md) |
| Decision log (ADRs/PDRs) | [docs/7-DEVELOPMENT/decisions/](docs/7-DEVELOPMENT/decisions/) |
| Contribution process (Issues → PRs) | [docs/7-DEVELOPMENT/contributing.md](docs/7-DEVELOPMENT/contributing.md) |
| Merging upstream (migration numbers, expected conflicts) | [docs/7-DEVELOPMENT/syncing-upstream.md](docs/7-DEVELOPMENT/syncing-upstream.md) |
| User/operator docs (install, configure, troubleshoot) | [docs/](docs/index.md) |
