import {
  LearningAside,
  NoteResponse,
  SourceListResponse,
} from '@/lib/types/api'

const INLINE_REFERENCE = /\[(?:source_insight|insight|source|note):[^\]]+\]/g
const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]+\)/g
const MARKDOWN_MARKERS = /(^|\s)(?:#{1,6}|[-*>]+)\s+/g
const LATEX_COMMAND = /\\([a-zA-Z]+)/g
const LATEX_MARKERS = /[$\\{}]/g
// Emphasis underscores sit at a word edge (`_word_`, `__word__`); underscores
// between word characters belong to identifiers or math (`d_k`, `max_len`).
const EMPHASIS_UNDERSCORE = /(^|[^\p{L}\p{N}_])_+|_+(?=[^\p{L}\p{N}]|$)/gu

function truncateAtWord(value: string, limit: number): string {
  if (value.length <= limit) return value
  const candidate = value.slice(0, limit + 1)
  const boundary = candidate.lastIndexOf(' ')
  const truncated = candidate.slice(0, boundary > limit / 2 ? boundary : limit)
  return `${truncated.trimEnd()}…`
}

/**
 * Reduce Markdown/LaTeX answer text to one readable line: drops code blocks,
 * inline `[source:id]` references, heading/list/quote markers, emphasis and
 * math delimiters, while keeping identifiers such as `d_k` intact.
 */
export function toPlainTextPreview(content: string): string {
  return content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(MARKDOWN_LINK, '$1')
    .replace(INLINE_REFERENCE, '')
    .replace(MARKDOWN_MARKERS, '$1')
    .replace(/[*~`]/g, '')
    .replace(EMPHASIS_UNDERSCORE, '$1')
    .replace(LATEX_COMMAND, ' $1 ')
    .replace(LATEX_MARKERS, ' ')
    .replace(/\s+([.,;:!?)])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function createAsideTitle(content: string, limit = 72): string {
  return truncateAtWord(toPlainTextPreview(content), limit)
}

export function createLearningUpdateDraft(
  content: string,
  limit = 600
): string {
  const firstParagraph =
    content
      .split(/\n\s*\n/)
      .map((paragraph) => paragraph.trim())
      .find(Boolean) ?? ''
  return truncateAtWord(firstParagraph, limit)
}

export function childDiveForQuestion(
  asides: LearningAside[],
  parentId: string,
  question: string
): LearningAside | undefined {
  const normalized = question.trim()
  if (!normalized) return undefined
  return asides.find(
    (aside) =>
      aside.parent_aside_id === parentId &&
      aside.status !== 'discarded' &&
      aside.anchor.content.trim() === normalized
  )
}

/** Trimmed, non-empty, de-duplicated open questions in their original order. */
export function normalizeOpenQuestions(questions: string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const question of questions) {
    const trimmed = question.trim()
    if (!trimmed || seen.has(trimmed)) continue
    seen.add(trimmed)
    result.push(trimmed)
  }
  return result
}

/** Titles of cited documents, keyed `source:<id>` / `note:<id>` without the record prefix. */
export type ReferenceTitles = Record<string, string>

function bareRecordId(id: string, table: string): string {
  return id.startsWith(`${table}:`) ? id.slice(table.length + 1) : id
}

export function referenceTitleKey(type: string, id: string): string {
  return `${type}:${bareRecordId(id, type)}`
}

/** Look up the titles a learning update's evidence buttons can show. */
export function buildReferenceTitles(
  sources: Pick<SourceListResponse, 'id' | 'title'>[] = [],
  notes: Pick<NoteResponse, 'id' | 'title'>[] = []
): ReferenceTitles {
  const titles: ReferenceTitles = {}
  for (const source of sources) {
    const title = source.title?.trim()
    if (title) titles[referenceTitleKey('source', source.id)] = title
  }
  for (const note of notes) {
    const title = note.title?.trim()
    if (title) titles[referenceTitleKey('note', note.id)] = title
  }
  return titles
}

const DOCUMENT_CITATION = /\[((?:source_insight|source|note):[^\]\s]+)\]/g
const LEADING_CITATION_MARKERS =
  /^[ \t]*(?:\[(?:source_insight|source|note):[^\]\s]+\][ \t]*)+/gm
const CITATION_MARKER = /[ \t]*\[(?:source_insight|source|note):[^\]\s]+\]/g

/** Distinct `source:` / `note:` / `source_insight:` citations in `text`, first seen first. */
export function documentCitations(text: string): string[] {
  return Array.from(
    new Set(Array.from(text.matchAll(DOCUMENT_CITATION), (match) => match[1]))
  )
}

/**
 * Remove citation markers from text a learner will edit, so a draft never
 * shows raw record IDs. Math and other Markdown are left as written.
 */
export function stripCitationMarkers(text: string): string {
  return text
    .replace(LEADING_CITATION_MARKERS, '')
    .replace(CITATION_MARKER, '')
    .replace(/[ \t]+([.,;:!?])/g, '$1')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim()
}
