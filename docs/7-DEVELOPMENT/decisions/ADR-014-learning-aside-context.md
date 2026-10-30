# ADR-014: Learning asides merge approved artifacts, not transcripts

- **Status**: Accepted
- **Date**: 2026-10
- **Related**: Learning Asides feature

## Context

Learners regularly interrupt a main notebook conversation to resolve a prerequisite, inspect a claim or work through mathematics. Copying an entire side conversation back into the parent recreates the context pollution that branching is meant to prevent. Chat messages also live in LangGraph's SQLite checkpoints while durable product metadata lives in SurrealDB, so checkpoint ancestry is not a sufficient persistence model.

## Decision

An aside is a child `chat_session` with a SurrealDB `learning_aside` record that stores its parent, stable anchor and a snapshot of parent context at the branch point. The child transcript remains isolated. Only an explicit, editable `learning_update` approved by the user can enter the main chat context or become a note. Journey, anchor, status and update records remain in SurrealDB; chat content continues to use the existing SQLite checkpointer.

## Alternatives considered

- **Append the full branch transcript to the parent**: rejected because it increases tokens, imports dead ends and obscures what the learner accepted.
- **Store branches only as LangGraph checkpoints**: rejected because source anchors, lifecycle, navigation and approved conclusions need durable queryable metadata.
- **Save every aside as a note**: rejected because exploratory and unresolved discussion is not automatically durable knowledge.

## Consequences

- The main prompt stays compact and receives only accepted conclusions.
- Branches remain auditable and can be reopened without rewriting earlier updates.
- The server enforces the aside lifecycle: active and parked switch freely and either can be discarded; an aside becomes resolved only by resolution and keeps that status, and discarded is final. Reopening a parked aside, or writing to it, makes it active. Resolving returns the journey to the parent thread only when the journey was on that aside, so resolving one aside never moves the learner out of another.
- Stable message identifiers and source snapshots are part of the feature contract.
- The anchor snapshot is bounded: an aside stores at most 20,000 characters of anchor text, clipped at a word boundary. The API accepts up to 200,000, so Go deeper can send a whole long answer; the anchor's message ID and the branch snapshot keep the full text.
- Those identifiers stay server-side: an aside's model sees its anchor as type and text, plus the source ID when it is a citable document. Message IDs, the UI locator and learning record IDs never reach a prompt.
- Deleting notebooks or main sessions must cascade through hidden child sessions and updates. A child session is never deleted on its own: `DELETE /api/chat/sessions/{id}` refuses an aside's session with 400, because the aside would be left pointing at a transcript that no longer exists. Asides are discarded instead.
- The child session carries its own marker, `chat_session.kind = "learning_aside"`, set when the aside is created (migration 29 marked existing ones). Session lists filter on that field; looking every session up in `learning_aside` grew with all asides in the database.
- A future learner model can consume approved updates, but explanation alone must never imply mastery.
- A nested dive receives its immediate parent's transcript up to the anchor (its `context_snapshot`) plus a bounded learning path built when each message is sent: a main-thread excerpt from the outermost aside's snapshot and each ancestor's title, anchor and latest conclusion. Ancestor transcripts are never copied, which keeps deep nesting from growing the prompt.
- Re-resolving an aside stores a new `learning_update` version. Only the latest version per aside can enter main context; older versions stay stored for audit and are reported as `superseded`.
- A resolution is stored before anything else it writes, under one more than the aside's highest version. The unique (aside, version) index settles concurrent resolutions: the one that loses the number takes the next one (up to five tries). A note requested with `save_as_note` follows; if it cannot be created, linked to the notebook or recorded on the version, the note and the version are deleted again and the request fails, so a resolution and its note are kept together or not at all.
- Whether the latest version enters main context (`include_in_main`) can be changed afterwards, in place, with `PATCH /api/learning/updates/{id}`; that switch is not versioned. A superseded version cannot be changed, since it can never enter main context.
- The server decides which conclusions enter a main-chat turn: the latest included version of each aside that is not discarded. `POST /api/chat/execute` loads them for the session itself and ignores any `learning_updates` a client sends; `POST /api/chat/context` returns the same selection for display, so the context counter and the prompt agree.
- Accepted conclusions share a fixed budget per turn, `LEARNING_UPDATES_TOKEN_BUDGET` (4,000 tokens, in `api/routers/_chat_shared.py`), measured as the model sees them. The newest are kept first and the first one that does not fit ends the selection, so a long journey cannot grow the prompt without bound; the context endpoint reports the rest as `learning_updates_omitted`.
