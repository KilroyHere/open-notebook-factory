'use client'

import {
  ArrowUpRight,
  CheckCircle2,
  GitBranch,
  MessagesSquare,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { LearningAside } from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  ReferenceTitles,
  toPlainTextPreview,
} from '@/lib/utils/learning-asides'
import {
  LearningEvidenceButtons,
  LearningQuestionList,
} from './LearningUpdateParts'

interface LearningThreadLinksProps {
  messageId: string
  asides: LearningAside[]
  onOpenAside: (asideId: string) => void
  onNavigateToMessage: (messageId: string) => void
  onReferenceClick?: (type: string, id: string) => void
  onDiveIntoQuestion?: (parent: LearningAside, question: string) => void
  onParkQuestion?: (parent: LearningAside, question: string) => void
  referenceTitles?: ReferenceTitles
}

export function LearningThreadLinks({
  messageId,
  asides,
  onOpenAside,
  onNavigateToMessage,
  onReferenceClick,
  onDiveIntoQuestion,
  onParkQuestion,
  referenceTitles,
}: LearningThreadLinksProps) {
  const { t } = useTranslation()
  const branches = asides.filter(
    (aside) =>
      aside.status !== 'discarded' && aside.anchor.message_id === messageId
  )
  if (branches.length === 0) return null

  return (
    <div className="mt-2 space-y-2 border-l-2 border-teal/40 pl-3">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <GitBranch className="h-3.5 w-3.5 text-teal" />
        {t('learningAsides.branchCount', { count: branches.length })}
      </div>
      {branches.map((aside) => {
        const latestUpdate = aside.updates.at(-1)
        if (aside.status === 'resolved' && latestUpdate) {
          return (
            <div
              key={aside.id}
              className="min-w-0 rounded-md border bg-card p-3"
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-fern" />
                    <p className="truncate text-xs font-semibold">
                      {aside.title}
                    </p>
                  </div>
                  <p className="mt-1 line-clamp-3 break-words text-xs text-muted-foreground">
                    {toPlainTextPreview(latestUpdate.conclusion)}
                  </p>
                  {latestUpdate.relevance && (
                    <div className="mt-1">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        {t('learningAsides.whyItMatters')}
                      </p>
                      <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
                        {toPlainTextPreview(latestUpdate.relevance)}
                      </p>
                    </div>
                  )}
                  <LearningQuestionList
                    questions={latestUpdate.open_questions}
                    asides={asides}
                    parentAside={aside}
                    onOpenAside={onOpenAside}
                    onDiveIntoQuestion={onDiveIntoQuestion}
                    onParkQuestion={onParkQuestion}
                  />
                  <LearningEvidenceButtons
                    citations={latestUpdate.citations}
                    onReferenceClick={onReferenceClick}
                    referenceTitles={referenceTitles}
                  />
                </div>
                <Badge variant="outline" className="shrink-0">
                  {t('learningAsides.status.resolved')}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenAside(aside.id)}
                >
                  <MessagesSquare className="mr-1.5 h-3.5 w-3.5" />
                  {t('learningAsides.viewTranscript')}
                </Button>
                {latestUpdate.applied_message_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onNavigateToMessage(latestUpdate.applied_message_id!)
                    }
                  >
                    <ArrowUpRight className="mr-1.5 h-3.5 w-3.5" />
                    {t('learningAsides.viewMergedResponse')}
                  </Button>
                )}
              </div>
            </div>
          )
        }

        return (
          <Button
            key={aside.id}
            variant="ghost"
            size="sm"
            className="h-auto max-w-full justify-start whitespace-normal py-1.5 text-left"
            onClick={() => onOpenAside(aside.id)}
          >
            <GitBranch className="h-3.5 w-3.5 shrink-0 text-teal" />
            <span className="min-w-0 truncate">{aside.title}</span>
            <Badge variant="outline" className="ml-auto shrink-0">
              {t(`learningAsides.status.${aside.status}`)}
            </Badge>
          </Button>
        )
      })}
    </div>
  )
}
