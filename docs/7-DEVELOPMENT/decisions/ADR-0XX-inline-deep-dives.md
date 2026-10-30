# ADR-0XX: Deep dives open inline under their answer; full height is the fallback

- **Status**: Accepted
- **Date**: 2026-10
- **Related**: [ADR-014](ADR-014-learning-aside-context.md) (learning asides)

## Context

A learning aside used to replace the main chat in the center column, so a learner who branched off an answer lost their place in the conversation they were studying. Asides also nest (a dive started from an open question), and some dives grow long enough to want the whole column. The presentation has to keep the learner's place without letting nested threads squeeze the chat into an unreadable column.

## Decision

The notebook page keeps one open dive at a time (`useLearningAsides` view state: the open aside plus a `fullHeight` flag). A dive opens as a thread under the assistant answer it branched from when `canOpenInline` holds: its parent chain is intact, it is at most `INLINE_DIVE_MAX_DEPTH` (1) levels below a dive anchored to an answer in the current chat. Anything else — deeper dives, dives whose answer is not in this chat, the aside list, and "Open full height" — uses the full-height view, which covers the chat column while the chat stays mounted (and `inert`) underneath. Message rows read the open dive and its actions from an `InlineDivesContext` provided by the chat column, so the generic `ChatPanel` does not thread dive state through every message. The transcript, composer, status actions, summary and wrap-up form are shared parts used by both presentations.

## Alternatives considered

- **Keep replacing the chat**: rejected; it is the lost-place problem.
- **A side drawer or a separate Studio pane for the open dive**: rejected; it competes with Sources and Studio for width and still separates the dive from the passage it is about.
- **Unlimited inline nesting**: rejected; every level indents the thread, and a third level leaves a phone with a sliver of text.
- **Several dives expanded at once**: rejected for now; one open dive keeps focus, the transcript query and the composer unambiguous.

## Consequences

- The learner's scroll position and main draft survive a dive, inline or full height.
- Nesting depth is a presentation rule only; the backend still allows any depth, and deeper dives stay reachable from Studio and the full-height view.
- Scroll handling (keeping the clicked row in place, revealing a dive opened from Studio) lives in the thread component and targets the chat's own scroller, so it depends on the chat list being a Radix `ScrollArea` viewport.
- A dive that is open inline but scrolled out of view is still "the open dive"; Studio's Journey marks it and Main thread closes it.
