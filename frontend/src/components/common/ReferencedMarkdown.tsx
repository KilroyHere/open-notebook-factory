'use client'

import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  type CompactReferenceLabels,
  convertReferencesToCompactMarkdown,
  createCompactReferenceLinkComponent,
  type ReferenceType,
} from '@/lib/utils/source-references'
import {
  referenceTitleKey,
  type ReferenceTitles,
} from '@/lib/utils/learning-asides'

const noop = () => undefined

const TYPE_LABEL_KEYS: Record<ReferenceType, string> = {
  source: 'common.source',
  note: 'common.note',
  source_insight: 'common.insight',
}

/**
 * Markdown for assistant answers: inline `[source:id]` / `[note:id]` /
 * `[source_insight:id]` references become numbered citations with a
 * References list, the same rendering the main notebook chat uses.
 *
 * With `referenceTitles` the References list names each item by its title,
 * or "Source 2" / "Note 1" when the title is not known, instead of its ID.
 */
export function ReferencedMarkdown({
  content,
  onReferenceClick,
  referenceTitles,
}: {
  content: string
  onReferenceClick?: (type: string, id: string) => void
  referenceTitles?: ReferenceTitles
}) {
  const { t } = useTranslation()
  const labels: CompactReferenceLabels | undefined = referenceTitles
    ? {
        title: (type, id) => referenceTitles[referenceTitleKey(type, id)],
        typeLabel: (type) => t(TYPE_LABEL_KEYS[type]),
      }
    : undefined
  const markdownWithCompactRefs = convertReferencesToCompactMarkdown(
    content,
    t('common.references'),
    labels
  )
  const LinkComponent = createCompactReferenceLinkComponent(
    onReferenceClick ?? noop
  )

  return (
    <MarkdownRenderer components={{ a: LinkComponent }}>
      {markdownWithCompactRefs}
    </MarkdownRenderer>
  )
}
