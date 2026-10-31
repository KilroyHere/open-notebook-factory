# Development

Documentation for people (and coding agents) working on the Open Notebook Factory codebase.

## Start here

1. **[Development Setup](development-setup.md)**: install, configure and run the stack from source.
2. **[Contributing](contributing.md)**: the Issues → PRs workflow, commit and CHANGELOG conventions, and the checks CI runs.
3. **[Change Playbooks](change-playbooks.md)**: step-by-step recipes for common changes (new field, endpoint, provider, migration, command, language).

The normative rules for coding agents (and humans in a hurry) are in the `AGENTS.md` files: [root](../../AGENTS.md), [backend](../../open_notebook/AGENTS.md) (also covers `api/`, `commands/`, `prompts/`) and [frontend](../../frontend/AGENTS.md).

## Reference

| Page | What it covers |
|---|---|
| [Architecture](architecture.md) | Processes, code layout, data model, workflows, model calls, background jobs |
| [Credentials](credentials.md) | Provider credentials, encryption, provider registry, provisioning |
| [Content Processing](content-processing.md) | Chunking, embedding, context building, encryption utility |
| [Podcasts](podcasts.md) | Episode and speaker profiles, model resolution, job lifecycle |
| [Prompts](prompts.md) | Prompt templates and `Prompter` |
| [Frontend](frontend.md) | Next.js layers and data flows |
| [API Reference](api-reference.md) | `/api` prefix, auth, async jobs, streaming, errors; the live schema is at `/docs` |
| [Code Standards](code-standards.md) | Tooling, async, database access, error handling |
| [Testing](testing.md) | Test layout, commands and patterns |
| [Security](security.md) | Query, template and file-handling safety; secrets; review checklist |
| [Design Principles](design-principles.md) | Engineering practices and anti-patterns |
| [Decision Records](decisions/README.md) | ADRs and PDRs: why things are the way they are |
| [VISION.md](../../VISION.md) | Product identity, current posture and priorities |
| [Maintainer Guide](maintainer-guide.md) | Triage, reviews, labels |
| [Syncing with Upstream](syncing-upstream.md) | Merging Open Notebook's `main` into the fork, migration numbers, where conflicts are expected |

## Getting help

- **[GitHub Issues](https://github.com/KilroyHere/open-notebook-factory/issues)**: bugs, questions, ideas, design proposals and approved work items
- **Security vulnerabilities**: report them privately through a [security advisory](https://github.com/KilroyHere/open-notebook-factory/security/advisories/new)

## Libraries it depends on

Luis Novo, the author of Open Notebook, maintains these. A bug whose cause is in one of them is fixed there first.

- [Esperanto](https://github.com/lfnovo/esperanto): one interface over the AI providers
- [Content Core](https://github.com/lfnovo/content-core): content extraction
- [Podcast Creator](https://github.com/lfnovo/podcast-creator): podcast generation
- [surreal-commands](https://github.com/lfnovo/surreal-commands): the background job queue
