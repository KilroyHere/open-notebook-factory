'use client'

import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  convertReferencesToCompactMarkdown,
  createCompactReferenceLinkComponent,
} from '@/lib/utils/source-references'

const noop = () => undefined

/**
 * Markdown for assistant answers: inline `[source:id]` / `[note:id]` /
 * `[source_insight:id]` references become numbered citations with a
 * References list, the same rendering the main notebook chat uses.
 */
export function ReferencedMarkdown({
  content,
  onReferenceClick,
}: {
  content: string
  onReferenceClick?: (type: string, id: string) => void
}) {
  const { t } = useTranslation()
  const markdownWithCompactRefs = convertReferencesToCompactMarkdown(
    content,
    t('common.references')
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
