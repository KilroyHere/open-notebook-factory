'use client'

import {
  CheckCircle2,
  FileText,
  Lightbulb,
  MessagesSquare,
  StickyNote,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ReferencedMarkdown } from '@/components/common/ReferencedMarkdown'
import { InlineMath } from '@/components/common/InlineMath'
import { LearningAside, LearningUpdate } from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  childDiveForQuestion,
  ReferenceTitles,
  referenceTitleKey,
} from '@/lib/utils/learning-asides'
import { cn } from '@/lib/utils'

// The pieces a learning update is shown with wherever it appears: its
// evidence, its open questions, and the summary on the reply that used it.

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

/**
 * The document's title when the notebook knows it, otherwise a numbered
 * generic label ("Source 1"). Record IDs are never shown.
 */
export function evidenceButtonLabels(
  evidence: EvidenceCitation[],
  titles: ReferenceTitles,
  t: (key: string) => string
): string[] {
  const counts: Partial<Record<EvidenceCitation['type'], number>> = {}
  return evidence.map((item) => {
    const position = (counts[item.type] ?? 0) + 1
    counts[item.type] = position
    return (
      titles[referenceTitleKey(item.type, item.id)] ??
      `${evidenceLabel(item.type, t)} ${position}`
    )
  })
}

export function LearningEvidenceButtons({
  citations,
  onReferenceClick,
  referenceTitles = {},
  className,
}: {
  citations: string[]
  onReferenceClick?: (type: string, id: string) => void
  referenceTitles?: ReferenceTitles
  className?: string
}) {
  const { t } = useTranslation()
  if (!onReferenceClick) return null
  const evidence = evidenceCitations(citations)
  if (evidence.length === 0) return null
  const labels = evidenceButtonLabels(evidence, referenceTitles, t)

  return (
    <div className={cn('mt-2 flex flex-wrap gap-1', className)}>
      {evidence.map((item, index) => (
        <Button
          key={`${item.type}:${item.id}`}
          variant="outline"
          size="sm"
          className="h-7 max-w-full"
          title={labels[index]}
          onClick={() => onReferenceClick(item.type, item.id)}
        >
          {item.type === 'note' ? (
            <StickyNote className="h-3.5 w-3.5 text-teal" />
          ) : item.type === 'source_insight' ? (
            <Lightbulb className="h-3.5 w-3.5 text-teal" />
          ) : (
            <FileText className="h-3.5 w-3.5 text-teal" />
          )}
          <span className="truncate">{labels[index]}</span>
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
            return (
              <li key={question}>
                <InlineMath text={question} />
              </li>
            )
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
                  <InlineMath text={question} />
                </Button>
              </li>
            )
          }
          return (
            <li key={question}>
              <p>
                <InlineMath text={question} />
              </p>
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
  referenceTitles,
}: {
  aside: LearningAside
  update: LearningUpdate
  asides?: LearningAside[]
  onOpenAside?: (asideId: string) => void
  onReferenceClick?: (type: string, id: string) => void
  onDiveIntoQuestion?: (parent: LearningAside, question: string) => void
  onParkQuestion?: (parent: LearningAside, question: string) => void
  referenceTitles?: ReferenceTitles
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
          referenceTitles={referenceTitles}
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
              referenceTitles={referenceTitles}
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
        referenceTitles={referenceTitles}
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
