# Triage rules

Repository-specific rules layered over the plugin's maturity-ladder preset. They refine the
preset; they never contradict it silently. The human version, with reply templates, is
[docs/7-DEVELOPMENT/maintainer-guide.md → Issue Management](../docs/7-DEVELOPMENT/maintainer-guide.md#issue-management).

## What reaches Issues

This fork has no Discussions: everything arrives as an Issue. **Reproducible bugs** and
**installation reports** come through their forms; **questions, ideas, feature requests and
design proposals** come as blank issues. An idea is triaged like any other issue: into
`needs-vision` or `needs-design` while the call is open, and into `ready` only when someone
will build it. An idea that belongs in the original project is pointed to
[Open Notebook](https://github.com/lfnovo/open-notebook) upstream.

## The queue

The bug and installation forms are meant to apply `needs-triage`; the label must exist
(recreate it if missing). An issue needs triage when it carries `needs-triage` **or no state
label at all**. Skip issues labeled `tracked-in-umbrella` (they are triaged inside their
umbrella) and `umbrella` issues themselves (graduated as a whole when the vision call is made).

## States (one per issue)

| Label | Meaning | Assigned by triage |
|---|---|---|
| `needs-triage` | new report not yet classified | no (intake) |
| `needs-info` | waiting on the reporter to confirm or provide more information | yes |
| `needs-design` | wanted, but the *how* is not resolved | yes |
| `needs-vision` | unsure if/how it fits — strategic call for the maintainers, judged against VISION.md | no (recognised; the maintainer sets it) |
| `ready` | approved and sufficiently specified — the dev loop can pick it up | yes |
| closed | not a bug, duplicate, superseded, already fixed, upstream-only, or declined | yes, with the reason and an open door |

`ready` is a promise of execution: an issue lands there when its problem, pointers and
acceptance criteria are complete **and** someone will build it next. A well-specified bug
with an open PR that fixes it is `ready` (the PR closes it).

## Labels that are not states (never touched by triage)

- **Type** (one): `bug`, `enhancement`, `documentation`, `installation` (intake, applied by
  the form). Feature requests carry `enhancement`.
- **Area** (one, always): `area: chat`, `area: search`, `area: sources`, `area: notebooks`,
  `area: podcast`, `area: providers`, `area: embeddings`, `area: ui`, `area: database`,
  `area: offline`, `area: deploy` (installation reports route here), `area: i18n`.
  The guide asks triage to add the area; the plugin's triage only proposes it — the
  maintainer applies it.
- **Ecosystem / bundling** (any number): `upstream`, `content-core`, `esperanto`,
  `podcast-creator`, `bundled`, `umbrella`, `tracked-in-umbrella`, `good first issue`,
  `help wanted`, `released`.

The label set is curated — **never invent a label**; raise it instead.

## Close criteria particular to this project

- **Root cause upstream** (`content-core`, `esperanto`, `podcast-creator`): keep the issue
  open with `upstream` + the library label only when a downstream bump or docs change is
  needed here; otherwise close pointing at the upstream issue (open it first).
- **Not reproducible with the supplied steps** and no answer after `needs-info`: close with
  an open door ("reopen with the logs and we will look again").
- **Already fixed on `main`**: close naming the PR; point testers at the `v1-dev` image
  (rebuilt on every push to `main`) and say it ships with the next release.
- **Duplicate**: close with the canonical link; a duplicate report that adds a new
  environment or a new symptom is a comment on the canonical issue, not a separate one.

## Vision-fit heuristics

- Fit is judged against `VISION.md` (the *IS / IS NOT* list and the principles) and the
  decision records in `docs/7-DEVELOPMENT/decisions/` — never against taste. The
  load-bearing ones: PDR-001 (single-user first, multi-user compatible), PDR-002
  (provider-agnostic core; provider-exclusive capabilities need a PDR), ADR-007 (opt-in
  heavy runtimes), ADR-008 (notebook-scoped search).
- Current posture (VISION.md → Current Posture): the fork's work goes into learning with
  your research (deep dives, what you've learned, the Journey tab and the plans on its
  horizon); the core experience comes from upstream. A request for another new surface that
  fits the identity is `needs-vision`, not `needs-design`.
- A request that keeps coming back against a principle is a signal to revisit the principle
  through a decision record — not to make a quiet exception.
