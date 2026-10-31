# Open Notebook Factory — Vision & Principles

This document is the product's source of truth in two layers with different lifespans: **Identity** (durable — what Open Notebook Factory is and refuses to be) and **Current Posture** (temporal — where we are in the journey and what's on the horizon). Triage and design decisions are evaluated against this document; the reasoning behind each rule lives in the [decision records](docs/7-DEVELOPMENT/decisions/README.md).

Open Notebook Factory is a fork of [Open Notebook](https://github.com/lfnovo/open-notebook) by Luis Novo. It keeps Open Notebook's identity and principles, and adds a direction of its own: helping you learn from your research.

---

## Identity

Open Notebook Factory is a **privacy-focused, self-hosted alternative to Google's Notebook LM** and a **research assistant that helps you learn**. It empowers users to:

1. **Own their research data** — full control over where data lives and who can access it
2. **Choose their AI providers** — any provider, or fully local models
3. **Customize their workflows** — adapt the tool to different research needs
4. **Access their work anywhere** — web UI, API, or integrations
5. **Learn as they research** — follow a tangent without losing their place, turn it into a conclusion, and carry that conclusion into the main conversation

### What Open Notebook Factory IS

- A **research assistant** for managing and understanding content
- A **learning companion**: an answer can open a deep dive, the dive ends in a conclusion you approve, and the main conversation builds on what you learned
- A **platform** that connects various AI providers
- A **privacy-first** tool that keeps your data under your control
- An **extensible system** with APIs and customization options

### What Open Notebook Factory IS NOT

- A document editor (use Google Docs, Notion, etc.)
- A file storage system (use Dropbox, S3, etc.)
- A general-purpose chatbot (use ChatGPT, Claude, etc.)
- A replacement for your entire workflow (it's one tool in your toolkit)

### Principles

Durable, normative rules. Each links to the decision record that established it. The first six come from Open Notebook; the last two are the fork's.

| Principle | Rule |
|---|---|
| **Privacy first** | User data stays under user control by default. Self-hosted is the primary use case; no telemetry without opt-in; no hard dependency on specific cloud services. |
| **Provider-agnostic core** | The default is portable: features must work across the provider matrix. Adopting a provider-exclusive capability is allowed but is a deliberate decision that requires a [PDR](docs/7-DEVELOPMENT/decisions/README.md) ([PDR-002](docs/7-DEVELOPMENT/decisions/PDR-002-provider-agnostic-core.md)). |
| **Simplicity over features** | Easy to understand and use, even if it means fewer features. Sensible defaults; advanced options behind progressive disclosure. |
| **API-first** | Every capability is accessible via the REST API — the UI is a client, never the only door ([ADR-003](docs/7-DEVELOPMENT/decisions/ADR-003-streamlit-to-nextjs.md)). |
| **Extensibility through standards** | Extension happens through well-defined interfaces (transformations, commands, prompt templates), not forks. |
| **Async-first** | Long-running operations never block the UI or the API ([ADR-004](docs/7-DEVELOPMENT/decisions/ADR-004-background-workers.md)). |
| **The learner approves what carries over** | A tangent's conversation stays in its dive. Only a conclusion the learner has read, edited and approved enters the main conversation, and the learner can take it out again. Explanation alone never counts as mastery ([ADR-014](docs/7-DEVELOPMENT/decisions/ADR-014-learning-aside-context.md)). |
| **Never lose your place** | Following a tangent keeps the learner in the conversation they are studying: a dive opens under the answer it came from, and the conversation's scroll position and draft survive it ([ADR-015](docs/7-DEVELOPMENT/decisions/ADR-015-inline-deep-dives.md)). |

### How we evaluate requests

A feature request that conflicts with the IS NOT list or a principle gets closed with a pointer here — kindly, and with the reasoning. A "no" protects the core value proposition; it's not a judgment of the idea. If a request keeps coming back and the principle starts to feel wrong, that's a signal to revisit the principle through a decision record — not to make a quiet exception.

---

## Current Posture

> **Reviewed: 2026-10.** This section is expected to change. Updating it is not a reversal — it's a phase change, recorded with a short PDR and an edit here.

**The phase we're in: make learning with your research work well.** The fork's work goes into deep dives, what you've learned and the Journey tab, and into the plans on the horizon below. The core experience (sources, chat, search, notes, podcasts) comes from Open Notebook, and the fork takes in upstream's improvements when it merges upstream `main`.

### Directional constraints

Decisions about the future we haven't made yet — recorded as "which door to keep open":

- **Single-user first, multi-user compatible.** Open Notebook Factory is a single-user tool. Upstream is considering multi-user ([lfnovo/open-notebook#712](https://github.com/lfnovo/open-notebook/issues/712)). New features must not gratuitously preclude multi-user (schema, auth, data scoping) ([PDR-001](docs/7-DEVELOPMENT/decisions/PDR-001-single-user-first.md)).
- **Portable by default.** Provider-exclusive capabilities (including paid-only ones) are on the table for the future — deliberately, via PDR, never by accident ([PDR-002](docs/7-DEVELOPMENT/decisions/PDR-002-provider-agnostic-core.md)).
- **Stay mergeable with upstream.** The fork merges Open Notebook's `main` from time to time. Prefer adding to shared code over rewriting it, and keep the fork's database migrations after upstream's ([Syncing with Upstream](docs/7-DEVELOPMENT/syncing-upstream.md)).

### Horizon

What the fork plans next — direction, not roadmap; no dates:

- **An Audio tab in Studio**, next to Journey and Notes.
- **Suggested questions and a summary for empty notebooks.**
- **A review quiz from what you've learned**, built from the conclusions of your deep dives.
- **A study-guide export of a journey.**

Open Notebook's own horizon (a platform update around SurrealDB v3, multi-user, new output formats, agents that use it through MCP) is described in [its VISION.md](https://github.com/lfnovo/open-notebook/blob/main/VISION.md#horizon). What upstream ships reaches the fork through the upstream merges.

---

## How this document changes

- **Identity** changes rarely and deliberately: a decision record marks the old rule as superseded, then this document is updated.
- **Posture** changes when the phase changes: a short PDR captures the why, the section above is edited, and the "Reviewed" stamp is bumped.
- Engineering practices (code standards, anti-patterns, decision framework) live in [docs/7-DEVELOPMENT/design-principles.md](docs/7-DEVELOPMENT/design-principles.md).
