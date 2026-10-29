'use client'

import { useEffect, useRef, useState } from 'react'
import {
  ArrowLeft,
  CheckCircle2,
  GitBranch,
  Loader2,
  Pause,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { ReferencedMarkdown } from '@/components/common/ReferencedMarkdown'
import {
  LearningAside,
  LearningAsideStatus,
  LearningResolutionDraft,
  ResolveLearningAsideRequest,
} from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  createLearningUpdateDraft,
  toPlainTextPreview,
  normalizeOpenQuestions,
} from '@/lib/utils/learning-asides'
import { isSendShortcut, sendShortcutHint } from '@/lib/utils/composer-shortcut'
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
  onDraftResolution,
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
  const [openQuestions, setOpenQuestions] = useState<string[]>([])
  const [isDrafting, setIsDrafting] = useState(false)
  const [draftFailed, setDraftFailed] = useState(false)
  // Each draft request gets a number; a reply for an older one is ignored.
  const draftRequest = useRef(0)
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
    draftRequest.current += 1
    setIsDrafting(false)
    setDraftFailed(false)
    if (activeAsideId) {
      setShowList(false)
      setShowResolution(false)
      setShowTranscript(activeAside?.status !== 'resolved')
    } else {
      setShowList(true)
    }
  }, [activeAside?.status, activeAsideId])

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

  const openResolution = async () => {
    if (!activeAside) return
    const requestId = ++draftRequest.current
    setShowResolution(true)
    setDraftFailed(false)
    if (activeAside.status === 'resolved' && latestUpdate) {
      // Updating a resolution starts from what the learner already approved.
      setConclusion(latestUpdate.conclusion)
      setRelevance(latestUpdate.relevance ?? '')
      setOpenQuestions(latestUpdate.open_questions)
      return
    }
    if (!onDraftResolution || !latestAnswerContent.trim()) {
      setConclusion(latestAnswerDraft)
      setRelevance('')
      setOpenQuestions([])
      return
    }
    setConclusion('')
    setRelevance('')
    setOpenQuestions([])
    setIsDrafting(true)
    try {
      const draft = await onDraftResolution(activeAside.id)
      if (requestId !== draftRequest.current) return
      setConclusion(draft.conclusion.trim() || latestAnswerDraft)
      setRelevance(draft.relevance ?? '')
      setOpenQuestions(normalizeOpenQuestions(draft.open_questions ?? []))
    } catch {
      if (requestId !== draftRequest.current) return
      setConclusion(latestAnswerDraft)
      setDraftFailed(true)
    } finally {
      if (requestId === draftRequest.current) setIsDrafting(false)
    }
  }

  const cancelResolution = () => {
    draftRequest.current += 1
    setIsDrafting(false)
    setShowResolution(false)
  }

  const updateOpenQuestion = (index: number, value: string) => {
    setOpenQuestions((questions) =>
      questions.map((question, position) =>
        position === index ? value : question
      )
    )
  }

  const removeOpenQuestion = (index: number) => {
    setOpenQuestions((questions) =>
      questions.filter((_, position) => position !== index)
    )
  }

  const resolve = async () => {
    if (!activeAside || !conclusion.trim() || isResolving || isDrafting) return
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
        open_questions: normalizeOpenQuestions(openQuestions),
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
                          {toPlainTextPreview(
                            aside.status === 'resolved' && aside.updates.at(-1)
                              ? aside.updates.at(-1)!.conclusion
                              : aside.anchor.content
                          )}
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
                      <ReferencedMarkdown
                        content={latestUpdate.conclusion}
                        onReferenceClick={onReferenceClick}
                      />
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
                    </div>
                  </div>
                )}
                {(showTranscript || activeAside.status !== 'resolved') &&
                  (activeAside.messages.length === 0 ? (
                    isAsideLoading ? (
                      // Journey listings carry asides without transcripts; the
                      // detail query fills them in, so wait before calling the
                      // aside empty.
                      <p className="py-8 text-center text-sm text-muted-foreground">
                        {t('common.loading')}
                      </p>
                    ) : isSending ? null : (
                      <div className="flex flex-col items-center gap-3 py-8 text-center">
                        <p className="text-sm text-muted-foreground">
                          {t('learningAsides.askHint')}
                        </p>
                        {activeAside.parent_aside_id &&
                          !activeAside.anchor.message_id &&
                          activeAside.status !== 'resolved' &&
                          activeAside.status !== 'discarded' && (
                            <Button
                              variant="secondary"
                              size="sm"
                              disabled={isAsideLoading}
                              onClick={() =>
                                void onSendMessage(
                                  activeAside.id,
                                  activeAside.anchor.content
                                ).catch(() => undefined)
                              }
                            >
                              <Send className="mr-1.5 h-3.5 w-3.5" />
                              {t('learningAsides.askThisQuestion')}
                            </Button>
                          )}
                      </div>
                    )
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
                            <ReferencedMarkdown
                              content={message.content}
                              onReferenceClick={onReferenceClick}
                            />
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
              <div
                className="max-h-[55svh] space-y-4 overflow-y-auto border-t p-5"
                aria-busy={isDrafting}
              >
                {isDrafting && (
                  <p
                    role="status"
                    className="flex items-center gap-2 text-sm text-teal"
                  >
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('learningAsides.drafting')}
                  </p>
                )}
                {draftFailed && (
                  <p role="status" className="text-xs text-muted-foreground">
                    {t('learningAsides.draftFailed')}
                  </p>
                )}
                <div>
                  <label className="mb-1.5 block text-sm font-medium">
                    {t('learningAsides.conclusion')}
                  </label>
                  <Textarea
                    value={conclusion}
                    onChange={(event) => setConclusion(event.target.value)}
                    placeholder={t('learningAsides.conclusionPlaceholder')}
                    rows={5}
                    disabled={isDrafting}
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
                    disabled={isDrafting}
                  />
                </div>
                <div>
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {t('learningAsides.openQuestions')}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7"
                      disabled={isDrafting}
                      onClick={() =>
                        setOpenQuestions((questions) => [...questions, ''])
                      }
                    >
                      <Plus className="mr-1 h-3.5 w-3.5" />
                      {t('learningAsides.addOpenQuestion')}
                    </Button>
                  </div>
                  <p className="mb-2 text-xs text-muted-foreground">
                    {t('learningAsides.openQuestionsHint')}
                  </p>
                  {openQuestions.length > 0 && (
                    <ul className="space-y-2">
                      {openQuestions.map((question, index) => (
                        <li key={index} className="flex items-center gap-2">
                          <Input
                            value={question}
                            onChange={(event) =>
                              updateOpenQuestion(index, event.target.value)
                            }
                            placeholder={t(
                              'learningAsides.openQuestionPlaceholder'
                            )}
                            disabled={isDrafting}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 shrink-0"
                            disabled={isDrafting}
                            onClick={() => removeOpenQuestion(index)}
                            aria-label={t('learningAsides.removeOpenQuestion')}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
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
                  <Button variant="ghost" onClick={cancelResolution}>
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={resolve}
                    disabled={
                      !conclusion.trim() ||
                      isResolving ||
                      isDrafting ||
                      isAsideLoading
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
                        placeholder={`${t('learningAsides.askPlaceholder')} (${t('chat.pressToSend', { key: sendShortcutHint() })})`}
                        aria-label={t('learningAsides.askPlaceholder')}
                        className="min-h-[42px] flex-1 resize-none"
                        rows={1}
                        disabled={isSending || isAsideLoading}
                        onKeyDown={(event) => {
                          if (isSendShortcut(event)) {
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
                      onClick={() => void openResolution()}
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
