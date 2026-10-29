'use client'

import { useEffect, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  GitBranch,
  Loader2,
  Pause,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import {
  LearningAside,
  LearningAsideStatus,
  ResolveLearningAsideRequest,
} from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import { createLearningUpdateDraft } from '@/lib/utils/learning-asides'
import {
  LearningEvidenceButtons,
  LearningQuestionList,
} from '@/components/notebooks/LearningThreadLinks'

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
}

const statusTranslationKeys: Record<LearningAsideStatus, string> = {
  active: 'learningAsides.status.active',
  parked: 'learningAsides.status.parked',
  resolved: 'learningAsides.status.resolved',
  discarded: 'learningAsides.status.discarded',
}

function statusVariant(
  status: LearningAsideStatus
): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'active') return 'default'
  if (status === 'discarded') return 'destructive'
  return 'outline'
}

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
  onResolve,
  onUpdateStatus,
  onNavigateToMessage,
  onReferenceClick,
  onDiveIntoQuestion,
  onParkQuestion,
}: LearningAsidePanelProps) {
  const { t } = useTranslation()
  const [showList, setShowList] = useState(!activeAside)
  const [input, setInput] = useState('')
  const [showResolution, setShowResolution] = useState(false)
  const [conclusion, setConclusion] = useState('')
  const [relevance, setRelevance] = useState('')
  const [includeInMain, setIncludeInMain] = useState(true)
  const [saveAsNote, setSaveAsNote] = useState(false)
  const [showTranscript, setShowTranscript] = useState(true)
  const activeAsideId = activeAside?.id
  const latestAnswerContent =
    [...(activeAside?.messages ?? [])]
      .reverse()
      .find((message) => message.type === 'ai')?.content ?? ''
  const latestAnswerDraft = createLearningUpdateDraft(latestAnswerContent)
  const latestUpdate = activeAside?.updates.at(-1)
  const parentAside = activeAside?.parent_aside_id
    ? asides.find((aside) => aside.id === activeAside.parent_aside_id)
    : undefined

  useEffect(() => {
    if (activeAsideId) {
      setShowList(false)
      setConclusion(latestAnswerDraft)
      setRelevance('')
      setShowResolution(false)
      setShowTranscript(activeAside?.status !== 'resolved')
    } else {
      setShowList(true)
    }
  }, [activeAside?.status, activeAsideId, latestAnswerDraft])

  const visibleAsides = asides.filter(
    (aside) => aside.status !== 'discarded'
  )

  const send = async () => {
    if (!activeAside || !input.trim() || isSending) return
    try {
      await onSendMessage(activeAside.id, input.trim())
      setInput('')
    } catch {
      // The mutation owns the translated error toast.
    }
  }

  const resolve = async () => {
    if (!activeAside || !conclusion.trim() || isResolving) return
    const citationMatches = `${conclusion}\n${relevance}`.match(
      /\[(?:source|note|source_insight):[^\]]+\]/g
    )
    const citations = Array.from(
      new Set((citationMatches ?? []).map((value) => value.slice(1, -1)))
    )
    try {
      await onResolve(activeAside.id, {
        conclusion: conclusion.trim(),
        relevance: relevance.trim() || undefined,
        citations,
        include_in_main: includeInMain,
        save_as_note: saveAsNote,
      })
      setShowResolution(false)
    } catch {
      // The mutation owns the translated error toast.
    }
  }

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
                          {aside.status === 'resolved' && aside.updates.at(-1)
                            ? aside.updates.at(-1)!.conclusion
                            : aside.anchor.content}
                        </p>
                      </div>
                      <Badge className="shrink-0" variant={statusVariant(aside.status)}>
                        {t(statusTranslationKeys[aside.status])}
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
                  {activeAside.anchor.content}
                </p>
              )}
            </div>

            <ScrollArea
              className="min-h-0 min-w-0 flex-1 overflow-x-hidden"
              viewportClassName="[&>div]:!block [&>div]:!w-full [&>div]:!min-w-0"
            >
              <div className="min-w-0 max-w-full space-y-4 overflow-x-hidden p-5">
                {activeAside.status === 'resolved' && latestUpdate && (
                  <div className="rounded-md border bg-card p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-fern" />
                        <h3 className="text-sm font-semibold">
                          {t('learningAsides.summary')}
                        </h3>
                      </div>
                      <Badge variant="outline">
                        {t('learningAsides.status.resolved')}
                      </Badge>
                    </div>
                    <div className="mt-3">
                      <MarkdownRenderer>
                        {latestUpdate.conclusion}
                      </MarkdownRenderer>
                    </div>
                    {latestUpdate.relevance && (
                      <div className="mt-3 border-t pt-3">
                        <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {t('learningAsides.whyItMatters')}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {latestUpdate.relevance}
                        </p>
                      </div>
                    )}
                    {latestUpdate.open_questions.length > 0 && (
                      <div className="mt-3 border-t pt-3">
                        <LearningQuestionList
                          questions={latestUpdate.open_questions}
                          asides={asides}
                          parentAside={activeAside}
                          onOpenAside={onSelectAside}
                          onDiveIntoQuestion={onDiveIntoQuestion}
                          onParkQuestion={onParkQuestion}
                        />
                      </div>
                    )}
                    <LearningEvidenceButtons
                      citations={latestUpdate.citations}
                      onReferenceClick={onReferenceClick}
                      className="mt-3 border-t pt-3"
                    />
                    <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => setShowTranscript((value) => !value)}
                      >
                        {showTranscript
                          ? t('learningAsides.hideTranscript')
                          : t('learningAsides.viewTranscript')}
                      </Button>
                      {latestUpdate.applied_message_id && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            returnToMainMessage(
                              latestUpdate.applied_message_id!
                            )
                          }
                        >
                          {t('learningAsides.viewMergedResponse')}
                        </Button>
                      )}
                    </div>
                  </div>
                )}
                {(showTranscript || activeAside.status !== 'resolved') &&
                  (activeAside.messages.length === 0 ? (
                    // Journey listings carry asides without transcripts; the
                    // detail query fills them in, so wait before calling the
                    // aside empty.
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      {isAsideLoading
                        ? t('common.loading')
                        : t('learningAsides.askHint')}
                    </p>
                  ) : (
                    activeAside.messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex ${
                          message.type === 'human'
                            ? 'justify-end'
                            : 'justify-start'
                        }`}
                      >
                        <div
                          className={`min-w-0 max-w-[88%] overflow-hidden break-words rounded-md border px-3 py-2 text-sm [&_*]:max-w-full ${
                            message.type === 'human' ? 'bg-muted' : 'bg-card'
                          }`}
                        >
                          {message.type === 'ai' ? (
                            <MarkdownRenderer>
                              {message.content}
                            </MarkdownRenderer>
                          ) : (
                            <p className="whitespace-pre-wrap">
                              {message.content}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  ))}
                {isSending && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('common.processing')}
                  </div>
                )}
              </div>
            </ScrollArea>

            {showResolution ? (
              <div className="max-h-[55svh] space-y-4 overflow-y-auto border-t p-5">
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    {t('learningAsides.conclusion')}
                  </label>
                  <Textarea
                    value={conclusion}
                    onChange={(event) => setConclusion(event.target.value)}
                    placeholder={t('learningAsides.conclusionPlaceholder')}
                    rows={5}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    {t('learningAsides.relevance')}
                  </label>
                  <Textarea
                    value={relevance}
                    onChange={(event) => setRelevance(event.target.value)}
                    placeholder={t('learningAsides.relevancePlaceholder')}
                    rows={2}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={includeInMain}
                    onCheckedChange={(checked) =>
                      setIncludeInMain(checked === true)
                    }
                  />
                  {t('learningAsides.includeInMain')}
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={saveAsNote}
                    onCheckedChange={(checked) =>
                      setSaveAsNote(checked === true)
                    }
                  />
                  {t('learningAsides.saveAsNote')}
                </label>
                {saveAsNote && (
                  <p className="pl-6 text-xs text-muted-foreground">
                    {t('learningAsides.saveAsNoteHint')}
                  </p>
                )}
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setShowResolution(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={resolve}
                    disabled={
                      !conclusion.trim() || isResolving || isAsideLoading
                    }
                  >
                    {isResolving && (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {t('learningAsides.resolve')}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 border-t p-4">
                {activeAside.status !== 'resolved' &&
                  activeAside.status !== 'discarded' && (
                    <div className="flex gap-2">
                      <Textarea
                        value={input}
                        onChange={(event) => setInput(event.target.value)}
                        placeholder={t('learningAsides.askPlaceholder')}
                        className="min-h-[42px] flex-1 resize-none"
                        rows={1}
                        disabled={isSending || isAsideLoading}
                        onKeyDown={(event) => {
                          if (
                            event.key === 'Enter' &&
                            (event.metaKey || event.ctrlKey)
                          ) {
                            event.preventDefault()
                            void send()
                          }
                        }}
                      />
                      <Button
                        size="icon"
                        className="h-[42px] w-[42px]"
                        onClick={() => void send()}
                        disabled={!input.trim() || isSending || isAsideLoading}
                        aria-label={t('learningAsides.send')}
                      >
                        {isSending ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  )}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex gap-1">
                    {activeAside.status === 'active' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isAsideLoading}
                        onClick={() =>
                          void onUpdateStatus(
                            activeAside.id,
                            'parked'
                          ).catch(() => undefined)
                        }
                      >
                        <Pause className="mr-1.5 h-3.5 w-3.5" />
                        {t('learningAsides.park')}
                      </Button>
                    )}
                    {activeAside.status === 'parked' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isAsideLoading}
                        onClick={() =>
                          void onUpdateStatus(
                            activeAside.id,
                            'active'
                          ).catch(() => undefined)
                        }
                      >
                        <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                        {t('learningAsides.reopen')}
                      </Button>
                    )}
                    {activeAside.status !== 'discarded' &&
                      activeAside.status !== 'resolved' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={isAsideLoading}
                        className="text-destructive hover:text-destructive"
                        onClick={() =>
                          void onUpdateStatus(
                            activeAside.id,
                            'discarded'
                          ).catch(() => undefined)
                        }
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        {t('learningAsides.discard')}
                      </Button>
                    )}
                  </div>
                  {activeAside.status !== 'discarded' && (
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isAsideLoading}
                      onClick={() => setShowResolution(true)}
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
