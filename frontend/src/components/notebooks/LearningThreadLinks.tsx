'use client'

import {
  ArrowUpRight,
  CheckCircle2,
  FileText,
  GitBranch,
  Lightbulb,
  MessagesSquare,
  StickyNote,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ReferencedMarkdown } from '@/components/common/ReferencedMarkdown'
import { LearningAside, LearningUpdate } from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  childDiveForQuestion,
  toPlainTextPreview,
} from '@/lib/utils/learning-asides'
import { cn } from '@/lib/utils'

interface LearningThreadLinksProps {
  messageId: string
  asides: LearningAside[]
  onOpenAside: (asideId: string) => void
  onNavigateToMessage: (messageId: string) => void
  onReferenceClick?: (type: string, id: string) => void
  onDiveIntoQuestion?: (parent: LearningAside, question: string) => void
  onParkQuestion?: (parent: LearningAside, question: string) => void
}

export interface EvidenceCitation {
  type: 'source' | 'note' | 'source_insight'
  id: string
}

const EVIDENCE_CITATION =
  /^(?:\[)?(source_insight|source|note):([^\]\s]+)(?:\])?$/

export function parseEvidenceCitation(citation: string): EvidenceCitation | null {
  const match = EVIDENCE_CITATION.exec(citation.trim())
  if (!match) return null
  return {
    type: match[1] as EvidenceCitation['type'],
    id: match[2],
  }
}

export function evidenceCitations(citations: string[]): EvidenceCitation[] {
  const seen = new Set<string>()
  const results: EvidenceCitation[] = []
  for (const citation of citations) {
    const parsed = parseEvidenceCitation(citation)
    if (!parsed) continue
    const key = `${parsed.type}:${parsed.id}`
    if (seen.has(key)) continue
    seen.add(key)
    results.push(parsed)
  }
  return results
}

export function learningMergesForMessage(
  asides: LearningAside[],
  messageId: string
): Array<{ aside: LearningAside; update: LearningUpdate }> {
  const merges: Array<{ aside: LearningAside; update: LearningUpdate }> = []
  for (const aside of asides) {
    if (aside.status === 'discarded') continue
    for (const update of aside.updates) {
      if (update.applied_message_id === messageId) {
        merges.push({ aside, update })
      }
    }
  }
  return merges
}

function evidenceLabel(
  type: EvidenceCitation['type'],
  t: (key: string) => string
): string {
  if (type === 'source_insight') return t('common.insight')
  if (type === 'note') return t('common.note')
  return t('common.source')
}

export function LearningEvidenceButtons({
  citations,
  onReferenceClick,
  className,
}: {
  citations: string[]
  onReferenceClick?: (type: string, id: string) => void
  className?: string
}) {
  const { t } = useTranslation()
  if (!onReferenceClick) return null
  const evidence = evidenceCitations(citations)
  if (evidence.length === 0) return null

  return (
    <div className={cn('mt-2 flex flex-wrap gap-1', className)}>
      {evidence.map((item) => (
        <Button
          key={`${item.type}:${item.id}`}
          variant="outline"
          size="sm"
          className="h-7 max-w-full"
          onClick={() => onReferenceClick(item.type, item.id)}
        >
          {item.type === 'note' ? (
            <StickyNote className="h-3.5 w-3.5 text-teal" />
          ) : item.type === 'source_insight' ? (
            <Lightbulb className="h-3.5 w-3.5 text-teal" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-teal" />
          )}
          <span className="truncate">
            {evidenceLabel(item.type, t)} {item.id}
          </span>
        </Button>
      ))}
    </div>
  )
}

export function LearningQuestionList({
  questions,
  asides = [],
  parentAside,
  onOpenAside,
  onDiveIntoQuestion,
  onParkQuestion,
}: {
  questions: string[]
  asides?: LearningAside[]
  parentAside?: LearningAside
  onOpenAside?: (asideId: string) => void
  onDiveIntoQuestion?: (parent: LearningAside, question: string) => void
  onParkQuestion?: (parent: LearningAside, question: string) => void
}) {
  const { t } = useTranslation()
  const visible = questions.map((question) => question.trim()).filter(Boolean)
  if (visible.length === 0) return null
  const interactive = Boolean(
    parentAside && (onDiveIntoQuestion || onParkQuestion)
  )

  return (
    <div className="mt-2">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {t('learningAsides.openQuestions')}
      </p>
      <ul className="mt-1 list-disc space-y-2 pl-4 text-xs text-muted-foreground">
        {visible.map((question) => {
          const child =
            parentAside && interactive
              ? childDiveForQuestion(asides, parentAside.id, question)
              : undefined
          if (!interactive || !parentAside) {
            return <li key={question}>{question}</li>
          }
          if (child && onOpenAside) {
            return (
              <li key={question}>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto max-w-full justify-start whitespace-normal px-2 py-1 text-left"
                  onClick={() => onOpenAside(child.id)}
                >
                  {question}
                </Button>
              </li>
            )
          }
          return (
            <li key={question}>
              <p>{question}</p>
              <div className="mt-1 flex flex-wrap gap-1">
                {onDiveIntoQuestion && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7"
                    onClick={() => onDiveIntoQuestion(parentAside, question)}
                  >
                    {t('learningAsides.diveIn')}
                  </Button>
                )}
                {onParkQuestion && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7"
                    onClick={() => onParkQuestion(parentAside, question)}
                  >
                    {t('learningAsides.parkQuestion')}
                  </Button>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

export function LearningMergeEvent({
  aside,
  update,
  asides = [],
  onOpenAside,
  onReferenceClick,
  onDiveIntoQuestion,
  onParkQuestion,
}: {
  aside: LearningAside
  update: LearningUpdate
  asides?: LearningAside[]
  onOpenAside?: (asideId: string) => void
  onReferenceClick?: (type: string, id: string) => void
  onDiveIntoQuestion?: (parent: LearningAside, question: string) => void
  onParkQuestion?: (parent: LearningAside, question: string) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="rounded-md border border-teal/40 bg-card p-3">
      <div className="flex items-center gap-1.5">
        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-fern" />
        <p className="text-xs font-semibold">{t('learningAsides.summary')}</p>
      </div>
      <div className="mt-1 min-w-0">
        <ReferencedMarkdown
          content={update.conclusion}
          onReferenceClick={onReferenceClick}
        />
      </div>
      {update.relevance && (
        <div className="mt-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {t('learningAsides.whyItMatters')}
          </p>
          <div className="mt-1 min-w-0 text-muted-foreground">
            <ReferencedMarkdown
              content={update.relevance}
              onReferenceClick={onReferenceClick}
            />
          </div>
        </div>
      )}
      <LearningQuestionList
        questions={update.open_questions}
        asides={asides}
        parentAside={aside}
        onOpenAside={onOpenAside}
        onDiveIntoQuestion={onDiveIntoQuestion}
        onParkQuestion={onParkQuestion}
      />
      <LearningEvidenceButtons
        citations={update.citations}
        onReferenceClick={onReferenceClick}
      />
      <p className="mt-2 text-xs text-muted-foreground">
        {t('learningAsides.origin')}{' '}
        <span className="font-medium text-teal">{aside.title}</span>
      </p>
      {onOpenAside && (
        <div className="mt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onOpenAside(aside.id)}
          >
            <MessagesSquare className="mr-1.5 h-3.5 w-3.5" />
            {t('learningAsides.viewTranscript')}
          </Button>
        </div>
      )}
    </div>
  )
}

export function LearningThreadLinks({
  messageId,
  asides,
  onOpenAside,
  onNavigateToMessage,
  onReferenceClick,
  onDiveIntoQuestion,
  onParkQuestion,
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
