'use client'

import { useId } from 'react'
import { AlertTriangle } from 'lucide-react'
import type { LearningAside, LearningUpdate } from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  learnedConclusions,
  leftOutConclusionIds,
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
 * opens its dive. When main chat's context limit leaves some out, a note
 * says how many and suggests switching off the ones no longer needed, and
 * each one left out says so under it. Nothing shows until a dive is
 * resolved.
 */
export function LearnedConclusions({
  asides,
  omitted = 0,
  keptUpdateIds,
  activeAsideId = null,
  onOpenAside,
  onSetIncludeInMain,
}: {
  asides: LearningAside[]
  /** Used conclusions the context limit keeps out of main chat. */
  omitted?: number
  /** IDs of the conclusions main chat's counted context keeps. */
  keptUpdateIds?: ReadonlySet<string>
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
  const leftOut = leftOutConclusionIds(learned, keptUpdateIds, omitted)

  return (
    <section aria-labelledby={headingId}>
      <h3
        id={headingId}
        className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground"
      >
        {t('learningAsides.whatYouLearned')}
      </h3>
      {/* Always mounted, so a count that appears or changes after a switch
          is announced. */}
      <div role="status">
        {omitted > 0 && (
          <p className="mb-2 flex gap-1.5 rounded-md border border-warn/30 bg-warn-tint px-2.5 py-2 text-xs">
            <AlertTriangle aria-hidden className="mt-px h-3.5 w-3.5 shrink-0 text-warn" />
            <span>{t('learningAsides.conclusionsLeftOut', { count: omitted })}</span>
          </p>
        )}
      </div>
      <ul className="space-y-2">
        {learned.map(({ aside, update }) => (
          <ConclusionItem
            key={update.id}
            aside={aside}
            update={update}
            active={aside.id === activeAsideId}
            leftOut={leftOut.has(update.id)}
            onOpenAside={onOpenAside}
            onSetIncludeInMain={onSetIncludeInMain}
          />
        ))}
      </ul>
    </section>
  )
}

function ConclusionItem({
  aside,
  update,
  active,
  leftOut,
  onOpenAside,
  onSetIncludeInMain,
}: {
  aside: LearningAside
  update: LearningUpdate
  active: boolean
  /** Checked, but main chat's context limit leaves it out. */
  leftOut: boolean
  onOpenAside: (asideId: string) => void
  onSetIncludeInMain?: SetIncludeInMain
}) {
  const { t } = useTranslation()
  const noteId = useId()
  const describedBy = leftOut ? noteId : undefined

  return (
    <li
      className={cn(
        'min-w-0 rounded-md border p-3',
        active ? 'border-teal bg-teal-tint' : 'bg-card'
      )}
    >
      <button
        type="button"
        className="block w-full min-w-0 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-describedby={describedBy}
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
      {leftOut && (
        <p
          id={noteId}
          className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-warn"
        >
          <AlertTriangle aria-hidden className="h-3 w-3 shrink-0" />
          {t('learningAsides.leftOutOfMainChat')}
        </p>
      )}
      {onSetIncludeInMain && (
        <IncludeInMainToggle
          update={update}
          onChange={onSetIncludeInMain}
          describedBy={describedBy}
          className="mt-2"
        />
      )}
    </li>
  )
}
