'use client'

import { useId } from 'react'
import type { LearningAside } from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  learnedConclusions,
  toPlainTextPreview,
} from '@/lib/utils/learning-asides'
import { cn } from '@/lib/utils'
import {
  IncludeInMainToggle,
  type SetIncludeInMain,
} from './IncludeInMainToggle'

/**
 * "What you've learned": the current conclusion of every resolved dive, in
 * journey order, each with its "Use in main chat" switch. A conclusion
 * opens its dive. Nothing shows until a dive is resolved.
 */
export function LearnedConclusions({
  asides,
  activeAsideId = null,
  onOpenAside,
  onSetIncludeInMain,
}: {
  asides: LearningAside[]
  /** The dive on screen, marked like in the outline. */
  activeAsideId?: string | null
  onOpenAside: (asideId: string) => void
  /** Without it the list is read-only. */
  onSetIncludeInMain?: SetIncludeInMain
}) {
  const { t } = useTranslation()
  const headingId = useId()
  const learned = learnedConclusions(asides)
  if (learned.length === 0) return null

  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
      >
        {t('learningAsides.whatYouLearned')}
      </h3>
      <ul className="space-y-2">
        {learned.map(({ aside, update }) => (
          <li
            key={update.id}
            className={cn(
              'min-w-0 rounded-md border p-3',
              aside.id === activeAsideId ? 'border-teal bg-teal-tint' : 'bg-card'
            )}
          >
            <button
              type="button"
              className="block w-full min-w-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={() => onOpenAside(aside.id)}
            >
              {/* A conclusion main chat leaves out reads quieter. */}
              <span
                className={cn(
                  'line-clamp-3 break-words text-xs',
                  !update.include_in_main && 'text-muted-foreground'
                )}
              >
                {toPlainTextPreview(update.conclusion)}
              </span>
            </button>
            {onSetIncludeInMain && (
              <IncludeInMainToggle
                update={update}
                onChange={onSetIncludeInMain}
                className="mt-2"
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
