# PDR-003: Open Notebook Factory has its own name, images and channels

- **Status**: Accepted
- **Date**: 2026-10
- **Related**: [VISION.md](../../../VISION.md), [Syncing with Upstream](../syncing-upstream.md), [ADR-014](ADR-014-learning-aside-context.md), [ADR-015](ADR-015-inline-deep-dives.md)

## Context

This repository is a fork of [Open Notebook](https://github.com/lfnovo/open-notebook). On top of its 1.15.0 release it adds deep dives, the Journey tab and the learning API. Its README, install steps, update check and help links still pointed at the original project. Following the docs installed upstream's image, which has none of these features, and questions went to a community that supports the original project.

## Decision

The maintainer gave the fork its own identity:

- **Name.** It is called **Open Notebook Factory**. The app, the API docs and the documentation use that name. "Open Notebook" names the original project, which is credited as the base. Code names stay as they are (`open_notebook`, `OPEN_NOTEBOOK_*`, stored keys and paths).
- **Images.** It publishes its own images at `ghcr.io/kilroyhere/open-notebook-factory`, and the docs install those. The update check compares the installed version with this repository.
- **Channels.** It runs no community channels: no Discord, X account, website or Discussions. Bugs and questions go to this repository's Issues, and vulnerabilities to its private security advisories.
- **Upstream.** It keeps merging upstream `main`, as described in [Syncing with Upstream](../syncing-upstream.md).

## Alternatives considered

- **Keep the name and label it a fork.** Upstream merges would conflict less, but the two projects would be hard to tell apart.
- **Point people at the original project's channels.** Those support Open Notebook, not this fork's features.
- **Document only the build from source.** It always matches the code, but takes longer to install. It stays available as `docker-compose.host.yml`.

## Consequences

- **Merge conflicts.** Upstream merges conflict wherever the name, image names or links differ. The syncing guide lists those places, and `tests/test_project_links.py` fails if an upstream link comes back into app code.
- **Releases.** The fork owns its releases: `v1-latest` exists only after this repository publishes one.
- **Numbering clashes.** If upstream claims the numbers of the fork's migrations (26–29) or decision records (ADR-014 onward), the fork's must be renumbered. Databases that already ran the fork's migrations need a plan first (see the syncing guide).
