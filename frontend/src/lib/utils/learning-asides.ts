import type { SourceInsightResponse } from '@/lib/api/insights'
import {
  LearningAside,
  LearningJourney,
  LearningUpdate,
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

/**
 * The dive started from one of `parentId`'s open questions. A dive about a
 * passage selected in the parent never stands for a question, even when the
 * passage reads the same.
 */
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
      !isPassageDive(aside) &&
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

/**
 * Titles of cited documents, keyed `source:<id>` / `note:<id>` /
 * `source_insight:<id>` without the record prefix.
 */
export type ReferenceTitles = Record<string, string>

function bareRecordId(id: string, table: string): string {
  return id.startsWith(`${table}:`) ? id.slice(table.length + 1) : id
}

export function referenceTitleKey(type: string, id: string): string {
  return `${type}:${bareRecordId(id, type)}`
}

/**
 * The titles a References list and a learning update's evidence buttons can
 * show: each source's and note's title, and each insight's type (the
 * transformation that made it, such as "Dense Summary").
 */
export function buildReferenceTitles(
  sources: Pick<SourceListResponse, 'id' | 'title'>[] = [],
  notes: Pick<NoteResponse, 'id' | 'title'>[] = [],
  insights: Pick<SourceInsightResponse, 'id' | 'insight_type'>[] = []
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
  for (const insight of insights) {
    const title = insight.insight_type?.trim()
    if (title) titles[referenceTitleKey('source_insight', insight.id)] = title
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

/**
 * The conclusion an aside stands on: its latest resolution, unless a newer
 * one replaced it. Only this version can reach main chat.
 */
export function currentConclusion(
  aside: Pick<LearningAside, 'updates'>
): LearningUpdate | undefined {
  const latest = aside.updates.at(-1)
  return latest && !latest.superseded ? latest : undefined
}

export interface LearnedConclusion {
  aside: LearningAside
  update: LearningUpdate
}

/**
 * What the journey's resolved asides concluded, in journey order: each
 * one's current conclusion, used in main chat or not. Open and discarded
 * asides have none.
 */
export function learnedConclusions(asides: LearningAside[]): LearnedConclusion[] {
  const learned: LearnedConclusion[] = []
  for (const aside of asides) {
    if (aside.status !== 'resolved') continue
    const update = currentConclusion(aside)
    if (update) learned.push({ aside, update })
  }
  return learned
}

/** `updates` with the `include_in_main` of `updateId` set to `include`. */
export function withIncludeInMain(
  updates: LearningUpdate[],
  updateId: string,
  include: boolean
): LearningUpdate[] {
  return updates.map((update) =>
    update.id === updateId ? { ...update, include_in_main: include } : update
  )
}

/** `journey` with one conclusion used in main chat or left out, wherever it lists it. */
export function journeyWithIncludeInMain(
  journey: LearningJourney,
  updateId: string,
  include: boolean
): LearningJourney {
  return {
    ...journey,
    asides: journey.asides.map((aside) =>
      aside.updates.some((update) => update.id === updateId)
        ? { ...aside, updates: withIncludeInMain(aside.updates, updateId, include) }
        : aside
    ),
    updates: withIncludeInMain(journey.updates, updateId, include),
  }
}

export interface JourneyStats {
  /** Resolved asides whose current conclusion is used in main chat. */
  learned: number
  /** Open questions on latest conclusions that no dive has picked up yet. */
  openQuestions: number
  /** Asides parked to come back to. */
  savedForLater: number
}

/** Summary counts for a journey, from the asides the journey API returns. */
export function journeyStats(asides: LearningAside[]): JourneyStats {
  const stats: JourneyStats = { learned: 0, openQuestions: 0, savedForLater: 0 }
  for (const aside of asides) {
    if (aside.status === 'discarded') continue
    if (aside.status === 'parked') stats.savedForLater++
    const latest = currentConclusion(aside)
    if (!latest) continue
    // The same conclusions "What you've learned" lists (learnedConclusions),
    // counted when main chat uses them.
    if (aside.status === 'resolved' && latest.include_in_main) stats.learned++
    stats.openQuestions += normalizeOpenQuestions(latest.open_questions).filter(
      (question) => !childDiveForQuestion(asides, aside.id, question)
    ).length
  }
  return stats
}

/** The first few words of a conclusion as plain text, for a compact label. */
export function leadingWords(content: string, count = 8): string {
  const words = toPlainTextPreview(content).split(/\s+/).filter(Boolean)
  if (words.length <= count) return words.join(' ')
  return `${words.slice(0, count).join(' ')}…`
}

/** The backend keeps at most this many characters of an aside's anchor. */
export const MAX_ANCHOR_CHARS = 20_000

/** `anchor.locator` of a dive started from a passage the learner selected. */
export const PASSAGE_LOCATOR = 'selection'

/** Whether a dive is about a selected passage rather than a whole answer. */
export function isPassageDive(aside: Pick<LearningAside, 'anchor'>): boolean {
  return aside.anchor.locator === PASSAGE_LOCATOR
}

/**
 * How deep a dive may nest and still expand inside the main chat: a dive
 * off a message (depth 0) and the dives started from its open questions
 * (depth 1). Deeper dives open in the full-height view.
 */
export const INLINE_DIVE_MAX_DEPTH = 1

/** The dives started from `parentId`'s open questions, discarded ones left out. */
export function childDives(
  asides: LearningAside[],
  parentId: string
): LearningAside[] {
  return asides.filter(
    (aside) => aside.parent_aside_id === parentId && aside.status !== 'discarded'
  )
}

/**
 * The dive at the top of `aside`'s nesting chain and how many parents lie
 * between them. `null` when the chain is broken: a parent is missing,
 * discarded, or the chain loops.
 */
export function diveLineage(
  aside: LearningAside,
  asides: LearningAside[]
): { root: LearningAside; depth: number } | null {
  const byId = new Map(asides.map((item) => [item.id, item]))
  const seen = new Set([aside.id])
  let root = aside
  let depth = 0
  while (root.parent_aside_id) {
    const parent = byId.get(root.parent_aside_id)
    if (!parent || parent.status === 'discarded' || seen.has(parent.id)) {
      return null
    }
    seen.add(parent.id)
    root = parent
    depth += 1
  }
  return { root, depth }
}

/**
 * Whether a dive can show as a thread inside the main chat: it is not
 * discarded, its chain is intact and shallow enough, and the dive at the
 * top of it branched from one of `messageIds`.
 */
export function canOpenInline(
  aside: LearningAside,
  asides: LearningAside[],
  messageIds: ReadonlySet<string>
): boolean {
  if (aside.status === 'discarded') return false
  const lineage = diveLineage(aside, asides)
  if (!lineage || lineage.depth > INLINE_DIVE_MAX_DEPTH) return false
  const messageId = lineage.root.anchor.message_id
  return Boolean(messageId && messageIds.has(messageId))
}

/** `asides` plus `extra` when the list does not have it yet. */
export function withAside(
  asides: LearningAside[],
  extra?: LearningAside
): LearningAside[] {
  if (!extra || asides.some((aside) => aside.id === extra.id)) return asides
  return [...asides, extra]
}
