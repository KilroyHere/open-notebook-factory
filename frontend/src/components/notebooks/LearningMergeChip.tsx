'use client'

import { useId, useState, type ComponentProps } from 'react'
import { ChevronDown, Sparkles } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import { leadingWords } from '@/lib/utils/learning-asides'
import { cn } from '@/lib/utils'
import { LearningMergeEvent } from './LearningThreadLinks'

/**
 * The collapsed form of a merge summary on the reply that used it: a small
 * "Used what you learned" chip that expands into the full summary card.
 */
export function LearningMergeChip(
  props: ComponentProps<typeof LearningMergeEvent>
) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const summaryId = useId()

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={summaryId}
        onClick={() => setExpanded((open) => !open)}
        className="inline-flex max-w-full items-center gap-1.5 self-start rounded-full border border-teal/40 bg-teal-tint px-2.5 py-1 text-xs text-foreground hover:bg-accent"
      >
        <Sparkles className="h-3.5 w-3.5 shrink-0 text-teal" aria-hidden />
        <span className="min-w-0 truncate">
          {t('learningAsides.usedWhatYouLearned', {
            summary: leadingWords(props.update.conclusion),
          })}
        </span>
        <ChevronDown
          aria-hidden
          className={cn(
            'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
            expanded && 'rotate-180'
          )}
        />
      </button>
      <div id={summaryId} hidden={!expanded}>
        {expanded && <LearningMergeEvent {...props} />}
      </div>
    </div>
  )
}
