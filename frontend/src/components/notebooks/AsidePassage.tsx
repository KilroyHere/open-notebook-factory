'use client'

import { useTranslation } from '@/lib/hooks/use-translation'
import { toPlainTextPreview } from '@/lib/utils/learning-asides'
import { cn } from '@/lib/utils'

/** The passage a dive started from, for a dive about part of an answer. */
export function AsidePassage({
  content,
  className,
}: {
  content: string
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <figure
      className={cn(
        'min-w-0 border-l-2 pl-2 text-xs text-muted-foreground',
        className
      )}
    >
      <figcaption className="font-medium">
        {t('learningAsides.selectedPassage')}
      </figcaption>
      <blockquote className="mt-0.5 line-clamp-3 break-words">
        {toPlainTextPreview(content)}
      </blockquote>
    </figure>
  )
}
