'use client'

import { Layers } from 'lucide-react'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

export interface NotebookContextStats {
  sourcesInsights: number
  sourcesFull: number
  notesCount: number
  tokenCount?: number
  charCount?: number
  /** Accepted learning conclusions the context limit keeps out of main chat. */
  learningUpdatesOmitted?: number
}

// Format large numbers with K/M suffixes
export function formatContextNumber(num: number): string {
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`
  if (num >= 1000) return `${(num / 1000).toFixed(1)}K`
  return num.toString()
}

/**
 * A compact "2 sources · 1 note" chip for the composer. The per-mode breakdown
 * and the context size sit in its tooltip instead of an always-visible line.
 */
export function ContextChip({
  stats,
  className,
}: {
  stats: NotebookContextStats
  className?: string
}) {
  const { t } = useTranslation()
  const sources = stats.sourcesInsights + stats.sourcesFull
  const notes = stats.notesCount

  const parts: string[] = []
  if (sources > 0) parts.push(t('chat.contextSources', { count: sources }))
  if (notes > 0) parts.push(t('chat.contextNotes', { count: notes }))
  const label = parts.length > 0 ? parts.join(' · ') : t('chat.contextNone')

  const details: string[] = []
  if (stats.sourcesInsights > 0) {
    details.push(
      t('chat.contextInsightsOnly', { count: stats.sourcesInsights })
    )
  }
  if (stats.sourcesFull > 0) {
    details.push(t('chat.contextFullContent', { count: stats.sourcesFull }))
  }
  if (notes > 0) details.push(t('chat.contextNotesIncluded', { count: notes }))
  const omitted = stats.learningUpdatesOmitted ?? 0
  if (omitted > 0) {
    details.push(t('chat.contextConclusionsLeftOut', { count: omitted }))
  }
  const tokens = stats.tokenCount ?? 0
  const chars = stats.charCount ?? 0
  if (tokens > 0 || chars > 0) {
    details.push(
      t('chat.contextSize', {
        tokens: formatContextNumber(tokens),
        chars: formatContextNumber(chars),
      })
    )
  }
  const description = details.join('\n')

  const chip = (
    <span
      tabIndex={details.length > 0 ? 0 : undefined}
      data-testid="context-chip"
      className={cn(
        'inline-flex h-7 max-w-[14rem] shrink-0 items-center gap-1 rounded-full border px-2.5 text-xs text-muted-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring',
        className
      )}
    >
      <Layers className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="truncate">{label}</span>
      {description && <span className="sr-only">{description}</span>}
    </span>
  )

  if (!description) return chip

  return (
    <Tooltip>
      <TooltipTrigger asChild>{chip}</TooltipTrigger>
      <TooltipContent>
        <div className="space-y-0.5">
          {details.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  )
}
