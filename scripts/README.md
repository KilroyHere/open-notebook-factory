# Scripts Documentation

## start_all.py

Starts and supervises the source-development stack used by `make start-all`.
It loads `.env` (overriding stale exported values), validates that host
processes use a localhost SurrealDB URL, waits for each service to become
ready, and stops the whole stack on `Ctrl+C`. API and worker output is kept in
`/tmp/open-notebook-api.log` and `/tmp/open-notebook-worker.log`; if either
process exits, the relevant log tail is printed before startup fails.

```bash
make start-all
```

## install-dev-prerequisites.sh

Installs and verifies the system tools required for source development on Debian and Ubuntu:

- Git, Make and curl
- Node.js 22
- uv and a uv-managed Python 3.12
- Docker Engine with Compose v2
- ffmpeg

The installer is idempotent and checks existing versions before replacing anything.

```bash
bash scripts/install-dev-prerequisites.sh
bash scripts/install-dev-prerequisites.sh --check
bash scripts/install-dev-prerequisites.sh --without-docker --without-ffmpeg
```

Docker installation uses Docker's signed Debian/Ubuntu package repository. If it adds your user to the `docker` group, log out and back in before running Docker without `sudo`. On WSL2, install Docker Desktop and enable WSL integration instead of installing a second Docker daemon.

## export_docs.py

Consolidates markdown documentation files for use with ChatGPT or other platforms with file upload limits.

### What It Does

- Scans all subdirectories in the `docs/` folder
- For each subdirectory, combines all `.md` files (excluding `index.md` files)
- Creates one consolidated markdown file per subdirectory
- Saves all exported files to `doc_exports/` in the project root

### Usage

```bash
# Using Makefile (recommended)
make export-docs

# Or run directly with uv
uv run python scripts/export_docs.py

# Or run with standard Python
python scripts/export_docs.py
```

### Output

The script creates `doc_exports/` directory with consolidated files like:

- `getting-started.md` - All getting-started documentation
- `user-guide.md` - All user guide content
- `features.md` - All feature documentation
- `development.md` - All development documentation
- etc.

Each exported file includes:
- A main header with the folder name
- Section headers for each source file
- Source file attribution
- The complete content from each markdown file
- Visual separators between sections

### Example Output Structure

```markdown
# Getting Started

This document consolidates all content from the getting-started documentation folder.

---

## Installation

*Source: installation.md*

[Full content of installation.md]

---

## Quick Start

*Source: quick-start.md*

[Full content of quick-start.md]

---
```

### Notes

- The `doc_exports/` directory is gitignored and safe to regenerate anytime
- Index files (`index.md`) are automatically excluded
- Files are sorted alphabetically for consistent output
- The script handles subdirectories only (ignores files in the root `docs/` folder)
