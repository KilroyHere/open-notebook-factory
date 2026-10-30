"""Draft the resolution a learner carries back from an aside.

A single structured LLM call, not a LangGraph graph: the learner reviews and
edits the draft before anything is saved, so there is no state to checkpoint.
"""

import re
from typing import Any, Dict, Iterable, List, Optional, Sequence

from ai_prompter import Prompter
from langchain_core.output_parsers.pydantic import PydanticOutputParser
from pydantic import BaseModel, Field

from open_notebook.ai.provision import provision_langchain_model
from open_notebook.exceptions import (
    ExternalServiceError,
    IncompleteGenerationError,
    OpenNotebookError,
)
from open_notebook.utils import clean_thinking_content
from open_notebook.utils.error_classifier import classify_error
from open_notebook.utils.text_utils import extract_text_content

RESOLUTION_DRAFT_MAX_TOKENS = 4096
MAX_OPEN_QUESTIONS = 3
# The branch point matters, not the whole main conversation.
PARENT_CONTEXT_TURNS = 6
PARENT_TURN_CHARS = 4_000
TRANSCRIPT_TURN_CHARS = 12_000

# Document citations a learner can open from a learning update.
_DOCUMENT_CITATION = re.compile(
    r"\[((?:source_insight|source|note|insight):[^\]\s]+)\]"
)
# Internal learning/chat identifiers that must never reach the learner.
_INTERNAL_ID = re.compile(
    r"\[?\b(?:learning_aside|learning_update|learning_journey|learning_section|"
    r"chat_session|message):[^\]\s,;.]+\]?"
)
_CITATION_BODY = r"\[(?:source_insight|source|note|insight):[^\]\s]+\]"
# A marker opening a line takes the spaces after it; any other marker takes the
# spaces before it, so "bound [source:x]." becomes "bound.".
_LEADING_CITATION_MARKER = re.compile(rf"^[ \t]*(?:{_CITATION_BODY}[ \t]*)+", re.M)
_CITATION_MARKER = re.compile(rf"[ \t]*{_CITATION_BODY}")
_BLANK_BRACKETS = re.compile(r"\[\s*\]")
_SPACE_BEFORE_PUNCT = re.compile(r"[ \t]+([.,;:!?])")
_MULTI_SPACE = re.compile(r"[ \t]{2,}")


class LearningResolutionDraft(BaseModel):
    """What the model is asked to return."""

    conclusion: str = Field(
        description="What the learner learned in this aside, 1 to 4 specific sentences"
    )
    relevance: str = Field(
        default="",
        description="How the conclusion affects the main conversation, 1 or 2 sentences",
    )
    open_questions: List[str] = Field(
        default_factory=list,
        description=(
            "1 to 3 self-contained questions the learner would ask next about "
            "what the aside left unexplored; empty only if nothing is left open"
        ),
    )


class LearningResolutionDraftResult(LearningResolutionDraft):
    """The draft shown to the learner.

    Text fields carry no ``[source:...]`` markers: raw record IDs read as
    broken text in an editable field. The documents the draft relied on are
    returned in ``citations`` so the resolution still records its evidence.
    """

    citations: List[str] = Field(default_factory=list)


def _role_label(role: str) -> str:
    if role in {"human", "user"}:
        return "LEARNER"
    if role in {"ai", "assistant"}:
        return "ASSISTANT"
    return role.upper() or "UNKNOWN"


def _clip(value: str, limit: int) -> str:
    value = value.strip()
    return value if len(value) <= limit else f"{value[:limit].rstrip()} …"


def _format_turns(turns: Iterable[Dict[str, str]], limit: int) -> str:
    return "\n\n".join(
        f"{_role_label(turn.get('role', ''))}: {_clip(turn.get('content', ''), limit)}"
        for turn in turns
        if turn.get("content", "").strip()
    )


def document_citations(text: str) -> List[str]:
    """Return the distinct document citations in ``text`` in first-seen order."""
    seen: Dict[str, None] = {}
    for match in _DOCUMENT_CITATION.finditer(text):
        seen.setdefault(match.group(1), None)
    return list(seen)


def sanitize_draft_text(
    text: str,
    allowed_citations: Sequence[str],
    internal_ids: Sequence[str] = (),
) -> str:
    """Strip internal identifiers and citations the aside never used."""
    allowed = set(allowed_citations)

    def keep_known_citation(match: re.Match[str]) -> str:
        return match.group(0) if match.group(1) in allowed else ""

    cleaned = _INTERNAL_ID.sub("", text)
    for internal_id in internal_ids:
        if not internal_id:
            continue
        cleaned = cleaned.replace(f"[{internal_id}]", "")
        # Bare matches only for ID-shaped values (UUIDs), never short words.
        if len(internal_id) >= 8:
            cleaned = cleaned.replace(internal_id, "")
    cleaned = _DOCUMENT_CITATION.sub(keep_known_citation, cleaned)
    cleaned = _BLANK_BRACKETS.sub("", cleaned)
    cleaned = _SPACE_BEFORE_PUNCT.sub(r"\1", cleaned)
    cleaned = _MULTI_SPACE.sub(" ", cleaned)
    return "\n".join(line.rstrip() for line in cleaned.strip().splitlines())


def strip_document_citations(text: str) -> str:
    """Remove document citation markers, keeping the surrounding prose tidy."""
    cleaned = _LEADING_CITATION_MARKER.sub("", text)
    cleaned = _CITATION_MARKER.sub("", cleaned)
    cleaned = _SPACE_BEFORE_PUNCT.sub(r"\1", cleaned)
    return "\n".join(line.rstrip() for line in cleaned.strip().splitlines())


def _clean_draft(
    draft: LearningResolutionDraft,
    allowed_citations: Sequence[str],
    internal_ids: Sequence[str],
) -> LearningResolutionDraftResult:
    def clean(value: str) -> str:
        return sanitize_draft_text(value, allowed_citations, internal_ids)

    conclusion = clean(draft.conclusion)
    relevance = clean(draft.relevance)
    questions: List[str] = []
    for question in draft.open_questions:
        cleaned_question = strip_document_citations(clean(str(question)))
        if cleaned_question and cleaned_question not in questions:
            questions.append(cleaned_question)
    return LearningResolutionDraftResult(
        conclusion=strip_document_citations(conclusion),
        relevance=strip_document_citations(relevance),
        open_questions=questions[:MAX_OPEN_QUESTIONS],
        citations=document_citations(f"{conclusion}\n{relevance}"),
    )


async def draft_learning_resolution(
    *,
    title: str,
    anchor: str,
    parent_context: Sequence[Dict[str, str]],
    transcript: Sequence[Dict[str, str]],
    model_id: Optional[str],
    internal_ids: Sequence[str] = (),
) -> LearningResolutionDraftResult:
    """Ask the aside's chat model for an editable resolution draft.

    ``parent_context`` is the aside's ``context_snapshot`` and ``transcript``
    the aside's own messages, both as ``{"role", "content"}`` dicts.
    ``internal_ids`` lists record and message IDs that must not appear in the
    draft even if the model echoes them. Document citations the draft used
    are moved out of the text into ``citations``.
    """
    transcript_text = _format_turns(transcript, TRANSCRIPT_TURN_CHARS)
    allowed_citations = document_citations(transcript_text)
    data: Dict[str, Any] = {
        "title": title,
        "anchor": anchor,
        "parent_context": _format_turns(
            list(parent_context)[-PARENT_CONTEXT_TURNS:], PARENT_TURN_CHARS
        ),
        "transcript": transcript_text,
        "citations": ", ".join(f"[{citation}]" for citation in allowed_citations),
    }
    try:
        parser: PydanticOutputParser[LearningResolutionDraft] = PydanticOutputParser(
            pydantic_object=LearningResolutionDraft
        )
        prompt = Prompter(
            prompt_template="learning/resolution_draft",
            parser=parser,  # type: ignore[arg-type]
        ).render(data=data)
        model = await provision_langchain_model(
            prompt,
            model_id,
            "chat",
            max_tokens=RESOLUTION_DRAFT_MAX_TOKENS,
            structured=dict(type="json"),
        )
        ai_message = await model.ainvoke(prompt)
        content = clean_thinking_content(extract_text_content(ai_message.content))
        if not content.strip():
            raise IncompleteGenerationError(
                "The model returned an empty resolution draft."
            )
        try:
            draft = parser.parse(content)
        except Exception as exc:
            raise ExternalServiceError(
                "The model did not return a usable resolution draft."
            ) from exc
    except OpenNotebookError:
        raise
    except Exception as e:
        error_class, message = classify_error(e)
        raise error_class(message) from e

    cleaned = _clean_draft(draft, allowed_citations, internal_ids)
    if not cleaned.conclusion:
        raise IncompleteGenerationError(
            "The model returned a resolution draft without a conclusion."
        )
    return cleaned
