'use client'

import type { ReactNode } from 'react'
import { CheckCircle2 } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { ReferencedMarkdown } from '@/components/common/ReferencedMarkdown'
import type { LearningAside, LearningUpdate } from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { ReferenceTitles } from '@/lib/utils/learning-asides'
import { cn } from '@/lib/utils'
import { IncludeInMainToggle, type SetIncludeInMain } from './IncludeInMainToggle'
import {
  LearningEvidenceButtons,
  LearningQuestionList,
} from './LearningUpdateParts'

/**
 * What a resolved dive concluded: the conclusion, why it matters, its open
 * questions (each can start or park a nested dive), the evidence and
 * whether main chat uses it, with the caller's actions underneath.
 */
export function AsideSummary({
  aside,
  update,
  asides,
  onOpenAside,
  onDiveIntoQuestion,
  onParkQuestion,
  onReferenceClick,
  onSetIncludeInMain,
  referenceTitles,
  className,
  children,
}: {
  aside: LearningAside
  update: LearningUpdate
  asides: LearningAside[]
  onOpenAside?: (asideId: string) => void
  onDiveIntoQuestion?: (parent: LearningAside, question: string) => void
  onParkQuestion?: (parent: LearningAside, question: string) => void
  onReferenceClick?: (type: string, id: string) => void
  /** "Use in main chat" for this conclusion; hidden without it. */
  onSetIncludeInMain?: SetIncludeInMain
  referenceTitles?: ReferenceTitles
  className?: string
  /** Actions under the summary. */
  children?: ReactNode
}) {
  const { t } = useTranslation()

  return (
    <div className={cn('min-w-0 rounded-md border bg-card p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 text-fern" />
          <h3 className="text-sm font-semibold">{t('learningAsides.summary')}</h3>
        </div>
        <Badge variant="outline">{t('learningAsides.status.resolved')}</Badge>
      </div>
      <div className="mt-3">
        <ReferencedMarkdown
          content={update.conclusion}
          onReferenceClick={onReferenceClick}
          referenceTitles={referenceTitles}
        />
      </div>
      {update.relevance && (
        <div className="mt-3 border-t pt-3">
          <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('learningAsides.whyItMatters')}
          </p>
          <div className="min-w-0 text-muted-foreground">
            <ReferencedMarkdown
              content={update.relevance}
              onReferenceClick={onReferenceClick}
              referenceTitles={referenceTitles}
            />
          </div>
        </div>
      )}
      {update.open_questions.length > 0 && (
        <div className="mt-3 border-t pt-3">
          <LearningQuestionList
            questions={update.open_questions}
            asides={asides}
            parentAside={aside}
            onOpenAside={onOpenAside}
            onDiveIntoQuestion={onDiveIntoQuestion}
            onParkQuestion={onParkQuestion}
          />
        </div>
      )}
      <LearningEvidenceButtons
        citations={update.citations}
        onReferenceClick={onReferenceClick}
        referenceTitles={referenceTitles}
        className="mt-3 border-t pt-3"
      />
      {/* A superseded version can never reach main chat, so it has no switch. */}
      {onSetIncludeInMain && !update.superseded && (
        <IncludeInMainToggle
          update={update}
          onChange={onSetIncludeInMain}
          className="mt-3 border-t pt-3"
        />
      )}
      {children && (
        <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">{children}</div>
      )}
    </div>
  )
}
