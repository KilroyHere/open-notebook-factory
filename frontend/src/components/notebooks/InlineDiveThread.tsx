'use client'

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  GitBranch,
  Loader2,
  Maximize2,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import type {
  LearningAside,
  LearningAsideStatus,
  NotebookChatMessage,
} from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useAsideResolution } from '@/lib/hooks/use-aside-resolution'
import {
  CHAT_SCROLLER_SELECTOR,
  inlineDiveDomId,
  revealInChat,
} from '@/lib/utils/chat-navigation'
import {
  childDives,
  INLINE_DIVE_MAX_DEPTH,
  isPassageDive,
  leadingWords,
  type ReferenceTitles,
} from '@/lib/utils/learning-asides'
import { cn } from '@/lib/utils'
import { ASIDE_STATUS_KEYS, asideStatusVariant, isOpenDive } from './aside-status'
import { AsideComposer } from './AsideComposer'
import { AsidePassage } from './AsidePassage'
import { AsideResolveForm } from './AsideResolveForm'
import { AsideStatusActions } from './AsideStatusActions'
import { AsideSummary } from './AsideSummary'
import { AsideTranscript } from './AsideTranscript'
import { useInlineDives } from './InlineDivesContext'

const resolveNothing = () => Promise.resolve()

export interface InlineDiveThreadProps {
  aside: LearningAside
  /** Every dive the chat knows, for nested dives and open questions. */
  asides: LearningAside[]
  /** 0 for a dive off a message, 1 for one off its open questions, … */
  depth?: number
  /** Opens a dive outside the notebook chat, or an existing child dive. */
  onOpenAside: (asideId: string) => void
  onNavigateToMessage: (messageId: string) => void
  onReferenceClick?: (type: string, id: string) => void
  onDiveIntoQuestion?: (parent: LearningAside, question: string) => void
  onParkQuestion?: (parent: LearningAside, question: string) => void
  referenceTitles?: ReferenceTitles
}

/** Shown where a new dive will appear while it is being created. */
export function DiveOpening() {
  const { t } = useTranslation()
  return (
    <p
      role="status"
      className="flex items-center gap-2 rounded-md border border-dashed px-2.5 py-1.5 text-xs text-muted-foreground"
    >
      <Loader2 className="h-3.5 w-3.5 animate-spin text-teal" />
      {t('learningAsides.opening')}
    </p>
  )
}

function OpenFullHeightButton({
  onClick,
  className,
}: {
  onClick: () => void
  className?: string
}) {
  const { t } = useTranslation()
  return (
    <Button variant="ghost" size="sm" className={className} onClick={onClick}>
      <Maximize2 className="mr-1.5 h-3.5 w-3.5" />
      {t('learningAsides.openFullHeight')}
    </Button>
  )
}

/**
 * A dive as a thread inside the main chat, under the answer it came from.
 * Collapsed it is one row: "Deep dive · title" with its status, or
 * "Learned: …" once resolved. Expanded it holds the transcript, a question
 * box and the dive's actions (Wrap up, Save for later, Discard, Open full
 * height), or the resolved summary. Dives started from its open questions,
 * or from a passage selected in one of its answers, nest under it; one
 * level deeper they are rows that open full height.
 */
export function InlineDiveThread(props: InlineDiveThreadProps) {
  const {
    aside,
    asides,
    depth = 0,
    onOpenAside,
    onNavigateToMessage,
    onReferenceClick,
    onDiveIntoQuestion,
    onParkQuestion,
    referenceTitles,
  } = props
  const { t } = useTranslation()
  const controller = useInlineDives()
  const bodyId = useId()
  const containerRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLButtonElement>(null)
  // Where the row was on screen before a toggle, to keep it there after.
  const rowTopBeforeToggle = useRef<number | null>(null)
  const [showTranscript, setShowTranscript] = useState(false)
  const [focusRequest, setFocusRequest] = useState(0)

  const inline = Boolean(controller) && depth <= INLINE_DIVE_MAX_DEPTH
  const expanded = inline && controller?.expandedAsideId === aside.id
  // The journey lists dives without transcripts; the open one has its own.
  const dive =
    expanded && controller?.activeAside?.id === aside.id
      ? controller.activeAside
      : aside
  const latestUpdate = dive.updates.at(-1)
  const resolved = dive.status === 'resolved' && Boolean(latestUpdate)
  const sending = controller?.sendingAsideId === aside.id
  const isAsideLoading = expanded && (controller?.isAsideLoading ?? false)
  const resolution = useAsideResolution({
    aside: expanded ? dive : undefined,
    onDraftResolution: controller?.onDraftResolution,
    onResolve: controller?.onResolve ?? resolveNothing,
    isResolving: controller?.resolvingAsideId === aside.id,
  })

  // A resolved dive reopens on its summary, its transcript folded away.
  useEffect(() => {
    if (!expanded) setShowTranscript(false)
  }, [expanded])

  // Bring the thread into view or focus its question box when asked to,
  // while it shows the dive. A folded row leaves the request to the view
  // that does (the full-height view, where the main chat stays mounted
  // under it): taking it here would clear it before that view saw it.
  const attention = controller?.attention
  const onAttended = controller?.onAttended
  useEffect(() => {
    if (!expanded) return
    if (!attention || attention.asideId !== aside.id || !onAttended) return
    if (attention.focus) setFocusRequest((count) => count + 1)
    // Wait for the chat's own scroll to the latest message when it mounts
    // (a phone switching back to the Chat tab), so this one wins.
    const timer = window.setTimeout(() => {
      onAttended(attention)
      if (attention.scroll && containerRef.current) {
        revealInChat(containerRef.current, attention.scroll)
      }
    }, 0)
    return () => window.clearTimeout(timer)
  }, [expanded, attention, aside.id, onAttended])

  // Expanding this dive can fold another one above it; keep this row where
  // the learner clicked it.
  useLayoutEffect(() => {
    const before = rowTopBeforeToggle.current
    rowTopBeforeToggle.current = null
    const row = rowRef.current
    if (before === null || !row) return
    const shift = row.getBoundingClientRect().top - before
    if (Math.abs(shift) < 1) return
    const scroller = row.closest<HTMLElement>(CHAT_SCROLLER_SELECTOR)
    if (scroller) scroller.scrollTop += shift
  }, [expanded])

  const toggle = () => {
    if (!controller) {
      onOpenAside(aside.id)
      return
    }
    if (!inline) {
      controller.onOpenFullHeight(aside.id)
      return
    }
    rowTopBeforeToggle.current = rowRef.current?.getBoundingClientRect().top ?? null
    if (expanded) controller.onCollapse(aside.id)
    else controller.onExpand(aside.id)
  }

  // Saved for later, a dive folds to its row; discarded, it disappears and
  // the cursor goes back to its answer.
  const updateStatus = async (
    asideId: string,
    status: Exclude<LearningAsideStatus, 'resolved'>
  ) => {
    const answer = containerRef.current?.closest<HTMLElement>('[tabindex="-1"]')
    await controller?.onUpdateStatus(asideId, status)
    if (status === 'parked') {
      controller?.onCollapse(asideId)
      rowRef.current?.focus({ preventScroll: true })
    } else if (status === 'discarded' && document.activeElement === document.body) {
      answer?.focus({ preventScroll: true })
    }
  }

  const children = depth <= INLINE_DIVE_MAX_DEPTH ? childDives(asides, aside.id) : []
  const creatingChild = controller?.creating?.parentAsideId === aside.id
  // A passage selected in one of this dive's answers starts a dive nested
  // under this one.
  const goDeeperInDive = controller?.onGoDeeperOnSelection
  const onGoDeeperOnSelection = goDeeperInDive
    ? (message: NotebookChatMessage, passage: string) =>
        goDeeperInDive(dive, message, passage)
    : undefined
  const label =
    resolved && latestUpdate
      ? t('learningAsides.learnedRow', {
          summary: leadingWords(latestUpdate.conclusion),
        })
      : t('learningAsides.deepDiveRow', { title: aside.title })

  return (
    <div
      ref={containerRef}
      id={inlineDiveDomId(aside.id)}
      data-inline-dive={aside.id}
      className="min-w-0 scroll-mt-6"
    >
      <button
        ref={rowRef}
        type="button"
        aria-expanded={inline ? expanded : undefined}
        aria-controls={inline ? bodyId : undefined}
        onClick={toggle}
        className={cn(
          'flex w-full min-w-0 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
          expanded ? 'border-teal/60 bg-teal-tint' : 'bg-card'
        )}
      >
        {resolved ? (
          <CheckCircle2 aria-hidden className="h-3.5 w-3.5 shrink-0 text-fern" />
        ) : (
          <GitBranch aria-hidden className="h-3.5 w-3.5 shrink-0 text-teal" />
        )}
        <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
        {!resolved && (
          <Badge variant={asideStatusVariant(dive.status)} className="shrink-0">
            {t(ASIDE_STATUS_KEYS[dive.status])}
          </Badge>
        )}
        {inline ? (
          <ChevronDown
            aria-hidden
            className={cn(
              'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
              expanded && 'rotate-180'
            )}
          />
        ) : (
          <>
            <Maximize2
              aria-hidden
              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
            />
            {controller && (
              <span className="sr-only">{t('learningAsides.openFullHeight')}</span>
            )}
          </>
        )}
      </button>

      {inline && (
        <div id={bodyId} hidden={!expanded}>
          {expanded && controller && (
            <div className="mt-1.5 min-w-0 space-y-3 border-l-2 border-teal/40 pl-3">
              {isPassageDive(dive) && <AsidePassage content={dive.anchor.content} />}
              {resolved && latestUpdate ? (
                <>
                  <AsideSummary
                    aside={dive}
                    update={latestUpdate}
                    asides={asides}
                    onOpenAside={onOpenAside}
                    onDiveIntoQuestion={onDiveIntoQuestion}
                    onParkQuestion={onParkQuestion}
                    onReferenceClick={onReferenceClick}
                    onSetIncludeInMain={controller.onSetIncludeInMain}
                    referenceTitles={referenceTitles}
                    className="p-3"
                  >
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
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setShowTranscript((value) => !value)}
                    >
                      {showTranscript
                        ? t('learningAsides.hideTranscript')
                        : t('learningAsides.viewTranscript')}
                    </Button>
                    {!resolution.isOpen && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isAsideLoading}
                        onClick={() => void resolution.start()}
                      >
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                        {t('learningAsides.resolveAgain')}
                      </Button>
                    )}
                    <OpenFullHeightButton
                      onClick={() => controller.onOpenFullHeight(aside.id)}
                    />
                  </AsideSummary>
                  {showTranscript && (
                    <AsideTranscript
                      aside={dive}
                      isAsideLoading={isAsideLoading}
                      isSending={sending}
                      onSendMessage={controller.onSendMessage}
                      onReferenceClick={onReferenceClick}
                      referenceTitles={referenceTitles}
                      onGoDeeperOnSelection={onGoDeeperOnSelection}
                      notebookId={controller.notebookId}
                    />
                  )}
                  {resolution.isOpen && (
                    <AsideResolveForm
                      resolution={resolution}
                      isResolving={controller.resolvingAsideId === aside.id}
                      isAsideLoading={isAsideLoading}
                      className="rounded-md border bg-card p-3"
                    />
                  )}
                </>
              ) : (
                <>
                  <AsideTranscript
                    aside={dive}
                    isAsideLoading={isAsideLoading}
                    isSending={sending}
                    pendingMessage={sending ? controller.pendingMessage : null}
                    onSendMessage={controller.onSendMessage}
                    onReferenceClick={onReferenceClick}
                    referenceTitles={referenceTitles}
                    onGoDeeperOnSelection={onGoDeeperOnSelection}
                    notebookId={controller.notebookId}
                  />
                  {resolution.isOpen ? (
                    <AsideResolveForm
                      resolution={resolution}
                      isResolving={controller.resolvingAsideId === aside.id}
                      isAsideLoading={isAsideLoading}
                      className="rounded-md border bg-card p-3"
                    />
                  ) : (
                    isOpenDive(dive.status) && (
                      <div className="space-y-2">
                        <AsideComposer
                          key={aside.id}
                          asideId={aside.id}
                          isSending={sending}
                          disabled={isAsideLoading}
                          onSendMessage={controller.onSendMessage}
                          focusRequest={focusRequest}
                        />
                        <div className="flex flex-wrap items-center gap-1">
                          <Button
                            variant="secondary"
                            size="sm"
                            disabled={isAsideLoading}
                            onClick={() => void resolution.start()}
                          >
                            <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                            {t('learningAsides.wrapUp')}
                          </Button>
                          <AsideStatusActions
                            aside={dive}
                            disabled={isAsideLoading}
                            onUpdateStatus={updateStatus}
                          />
                          <OpenFullHeightButton
                            className="ml-auto"
                            onClick={() => controller.onOpenFullHeight(aside.id)}
                          />
                        </div>
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}

      {(children.length > 0 || creatingChild) && (
        <div className="ml-3 mt-1.5 min-w-0 space-y-1.5 border-l border-teal/40 pl-2">
          {children.map((child) => (
            <InlineDiveThread
              key={child.id}
              {...props}
              aside={child}
              depth={depth + 1}
            />
          ))}
          {creatingChild && <DiveOpening />}
        </div>
      )}
    </div>
  )
}
