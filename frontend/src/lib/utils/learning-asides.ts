const INLINE_REFERENCE = /\[(?:source|note|source_insight):[^\]]+\]/g
const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]+\)/g
const MARKDOWN_MARKERS = /(^|\s)(?:#{1,6}|[-*>]+)\s+/g
const LATEX_MARKERS = /[$\\{}]/g

function truncateAtWord(value: string, limit: number): string {
  if (value.length <= limit) return value
  const candidate = value.slice(0, limit + 1)
  const boundary = candidate.lastIndexOf(' ')
  const truncated = candidate.slice(0, boundary > limit / 2 ? boundary : limit)
  return `${truncated.trimEnd()}…`
}

export function createAsideTitle(content: string, limit = 72): string {
  const plainText = content
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(MARKDOWN_LINK, '$1')
    .replace(INLINE_REFERENCE, '')
    .replace(MARKDOWN_MARKERS, '$1')
    .replace(/[*_~`]/g, '')
    .replace(LATEX_MARKERS, '')
    .replace(/\s+/g, ' ')
    .trim()

  return truncateAtWord(plainText, limit)
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
