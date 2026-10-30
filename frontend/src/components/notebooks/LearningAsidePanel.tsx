'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, CheckCircle2, GitBranch, Loader2, X } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  LearningAside,
  LearningAsideStatus,
  LearningResolutionDraft,
  ResolveLearningAsideRequest,
} from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import { useAsideResolution } from '@/lib/hooks/use-aside-resolution'
import {
  ReferenceTitles,
  toPlainTextPreview,
} from '@/lib/utils/learning-asides'
import { ASIDE_STATUS_KEYS, asideStatusVariant, isOpenDive } from './aside-status'
import { AsideComposer } from './AsideComposer'
import { AsideResolveForm } from './AsideResolveForm'
import { AsideStatusActions } from './AsideStatusActions'
import { AsideSummary } from './AsideSummary'
import { AsideTranscript } from './AsideTranscript'

interface LearningAsidePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asides: LearningAside[]
  activeAside?: LearningAside
  isLoading: boolean
  isSending: boolean
  isResolving: boolean
  isAsideLoading: boolean
  onSelectAside: (asideId: string) => void
  onSendMessage: (asideId: string, message: string) => Promise<unknown>
  /** Model-drafted resolution; on failure the panel uses a local draft. */
  onDraftResolution?: (asideId: string) => Promise<LearningResolutionDraft>
  onResolve: (
    asideId: string,
    data: ResolveLearningAsideRequest
  ) => Promise<unknown>
  onUpdateStatus: (
    asideId: string,
    status: Exclude<LearningAsideStatus, 'resolved'>
  ) => Promise<unknown>
  onNavigateToMessage: (messageId: string) => void
  onReferenceClick?: (type: string, id: string) => void
  onDiveIntoQuestion?: (parent: LearningAside, question: string) => void
  onParkQuestion?: (parent: LearningAside, question: string) => void
  /** Source and note titles for the evidence buttons. */
  referenceTitles?: ReferenceTitles
}

/**
 * The full-height dive view: the list of asides, or one dive with its
 * breadcrumb, summary, transcript and composer. The transcript, composer
 * and wrap-up form are the same parts the inline dive thread uses.
 */
export function LearningAsidePanel({
  open,
  onOpenChange,
  asides,
  activeAside,
  isLoading,
  isSending,
  isResolving,
  isAsideLoading,
  onSelectAside,
  onSendMessage,
  onDraftResolution,
  onResolve,
  onUpdateStatus,
  onNavigateToMessage,
  onReferenceClick,
  onDiveIntoQuestion,
  onParkQuestion,
  referenceTitles,
}: LearningAsidePanelProps) {
  const { t } = useTranslation()
  const [showList, setShowList] = useState(!activeAside)
  const [showTranscript, setShowTranscript] = useState(true)
  const resolution = useAsideResolution({
    aside: activeAside,
    onDraftResolution,
    onResolve,
    isResolving,
  })
  const activeAsideId = activeAside?.id
  const latestUpdate = activeAside?.updates.at(-1)
  // After resolving, the way back lands on the reply that received the
  // conclusion, or on the message the aside branched from.
  const returnTarget =
    [...(activeAside?.updates ?? [])]
      .reverse()
      .find((update) => update.applied_message_id)?.applied_message_id ??
    activeAside?.anchor.message_id
  const parentAside = activeAside?.parent_aside_id
    ? asides.find((aside) => aside.id === activeAside.parent_aside_id)
    : undefined

  useEffect(() => {
    if (activeAsideId) {
      setShowList(false)
      setShowTranscript(activeAside?.status !== 'resolved')
    } else {
      setShowList(true)
    }
  }, [activeAside?.status, activeAsideId])

  const visibleAsides = asides.filter(
    (aside) => aside.status !== 'discarded'
  )

  const returnToMainMessage = (messageId: string) => {
    onOpenChange(false)
    window.setTimeout(() => onNavigateToMessage(messageId), 0)
  }

  if (!open) return null

  return (
    <section className="grid h-full min-h-0 min-w-0 flex-1 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-background">
        <header className="flex min-w-0 items-center justify-between gap-3 border-b px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
            {!showList && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowList(true)}
                aria-label={t('learningAsides.backToList')}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
            )}
            {showList && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onOpenChange(false)}
              >
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                {t('learningAsides.mainThread')}
              </Button>
            )}
            <GitBranch className="h-4 w-4 text-teal" />
            <h2 className="min-w-0 break-words text-sm font-semibold">
              {showList
                ? t('learningAsides.journey')
                : activeAside?.title ?? t('learningAsides.untitled')}
            </h2>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={() => onOpenChange(false)}
            aria-label={t('learningAsides.returnToMain')}
          >
            <X className="h-4 w-4" />
          </Button>
        </header>

        {showList ? (
          <ScrollArea
            className="min-h-0 min-w-0 flex-1 overflow-x-hidden"
            viewportClassName="[&>div]:!block [&>div]:!w-full [&>div]:!min-w-0"
          >
            <div className="min-w-0 max-w-full space-y-3 overflow-x-hidden p-5">
              <p className="text-sm text-muted-foreground">
                {t('learningAsides.listDescription')}
              </p>
              {isLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="h-5 w-5 animate-spin" />
                </div>
              ) : visibleAsides.length === 0 ? (
                <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
                  {t('learningAsides.empty')}
                </div>
              ) : (
                visibleAsides.map((aside) => (
                  <button
                    key={aside.id}
                    type="button"
                    className="min-w-0 w-full max-w-full overflow-hidden rounded-md border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSelectAside(aside.id)}
                  >
                    <div className="flex min-w-0 max-w-full items-start justify-between gap-3 overflow-hidden">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {aside.title}
                        </p>
                        <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
                          {toPlainTextPreview(
                            aside.status === 'resolved' && aside.updates.at(-1)
                              ? aside.updates.at(-1)!.conclusion
                              : aside.anchor.content
                          )}
                        </p>
                      </div>
                      <Badge className="shrink-0" variant={asideStatusVariant(aside.status)}>
                        {t(ASIDE_STATUS_KEYS[aside.status])}
                      </Badge>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        ) : activeAside ? (
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">
            <div className="border-b bg-muted/30 px-4 py-2">
              <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                <button
                  type="button"
                  className="hover:text-foreground hover:underline"
                  onClick={() => onOpenChange(false)}
                >
                  {t('learningAsides.mainThread')}
                </button>
                <span aria-hidden>/</span>
                {parentAside ? (
                  <button
                    type="button"
                    className="max-w-[12rem] truncate hover:text-foreground hover:underline"
                    onClick={() => onSelectAside(parentAside.id)}
                  >
                    {parentAside.title}
                  </button>
                ) : (
                  <span>{t('learningAsides.origin')}</span>
                )}
                <span aria-hidden>/</span>
                <span className="truncate">{activeAside.title}</span>
                {parentAside && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() => onSelectAside(parentAside.id)}
                  >
                    <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                    {t('learningAsides.backToParent')}
                  </Button>
                )}
                {activeAside.anchor.message_id && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2"
                    onClick={() =>
                      returnToMainMessage(activeAside.anchor.message_id!)
                    }
                  >
                    <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                    {t('learningAsides.backToOrigin')}
                  </Button>
                )}
              </div>
              {!activeAside.anchor.message_id && (
                <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">
                  {toPlainTextPreview(activeAside.anchor.content)}
                </p>
              )}
            </div>

            <ScrollArea
              className="min-h-0 min-w-0 flex-1 overflow-x-hidden"
              viewportClassName="[&>div]:!block [&>div]:!w-full [&>div]:!min-w-0"
            >
              <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden p-5">
                {activeAside.status === 'resolved' && latestUpdate && (
                  <AsideSummary
                    aside={activeAside}
                    update={latestUpdate}
                    asides={asides}
                    onOpenAside={onSelectAside}
                    onDiveIntoQuestion={onDiveIntoQuestion}
                    onParkQuestion={onParkQuestion}
                    onReferenceClick={onReferenceClick}
                    referenceTitles={referenceTitles}
                  >
                    <Button
                      size="sm"
                      onClick={() =>
                        returnTarget
                          ? returnToMainMessage(returnTarget)
                          : onOpenChange(false)
                      }
                    >
                      <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />
                      {t('learningAsides.returnToMain')}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowTranscript((value) => !value)}
                    >
                      {showTranscript
                        ? t('learningAsides.hideTranscript')
                        : t('learningAsides.viewTranscript')}
                    </Button>
                  </AsideSummary>
                )}
                {(showTranscript || activeAside.status !== 'resolved') && (
                  <AsideTranscript
                    aside={activeAside}
                    isAsideLoading={isAsideLoading}
                    isSending={isSending}
                    onSendMessage={onSendMessage}
                    onReferenceClick={onReferenceClick}
                    referenceTitles={referenceTitles}
                  />
                )}
              </div>
            </ScrollArea>

            {resolution.isOpen ? (
              <AsideResolveForm
                resolution={resolution}
                isResolving={isResolving}
                isAsideLoading={isAsideLoading}
                className="max-h-[55svh] overflow-y-auto border-t p-5"
              />
            ) : (
              <div className="space-y-3 border-t p-4">
                {isOpenDive(activeAside.status) && (
                  <AsideComposer
                    key={activeAside.id}
                    asideId={activeAside.id}
                    isSending={isSending}
                    disabled={isAsideLoading}
                    onSendMessage={onSendMessage}
                  />
                )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-1">
                    <AsideStatusActions
                      aside={activeAside}
                      disabled={isAsideLoading}
                      onUpdateStatus={onUpdateStatus}
                    />
                  </div>
                  {activeAside.status !== 'discarded' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isAsideLoading}
                      onClick={() => void resolution.start()}
                    >
                      <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      {activeAside.status === 'resolved'
                        ? t('learningAsides.resolveAgain')
                        : t('learningAsides.resolve')}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        )}
    </section>
  )
}
