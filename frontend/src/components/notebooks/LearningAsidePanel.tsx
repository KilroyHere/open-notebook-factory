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
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Textarea } from '@/components/ui/textarea'
import { MarkdownRenderer } from '@/components/ui/markdown-renderer'
import {
  LearningAside,
  LearningAsideStatus,
  ResolveLearningAsideRequest,
} from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'

interface LearningAsidePanelProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  asides: LearningAside[]
  activeAside?: LearningAside
  isLoading: boolean
  isSending: boolean
  isResolving: boolean
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
  onSelectAside,
  onSendMessage,
  onResolve,
  onUpdateStatus,
}: LearningAsidePanelProps) {
  const { t } = useTranslation()
  const [showList, setShowList] = useState(!activeAside)
  const [input, setInput] = useState('')
  const [showResolution, setShowResolution] = useState(false)
  const [conclusion, setConclusion] = useState('')
  const [relevance, setRelevance] = useState('')
  const [includeInMain, setIncludeInMain] = useState(true)
  const [saveAsNote, setSaveAsNote] = useState(false)
  const activeAsideId = activeAside?.id
  const latestAnswerContent =
    [...(activeAside?.messages ?? [])]
      .reverse()
      .find((message) => message.type === 'ai')?.content ?? ''

  useEffect(() => {
    if (activeAsideId) {
      setShowList(false)
      setConclusion(latestAnswerContent)
      setRelevance('')
      setShowResolution(false)
    } else {
      setShowList(true)
    }
  }, [activeAsideId, latestAnswerContent])

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="left-auto right-0 top-0 h-svh w-full translate-x-0 translate-y-0 gap-0 rounded-none border-y-0 border-r-0 p-0 sm:max-w-[520px]"
        showCloseButton
      >
        <DialogHeader className="border-b px-5 py-4 pr-12 text-left">
          <div className="flex items-center gap-2">
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
            <GitBranch className="h-4 w-4 text-teal" />
            <DialogTitle>
              {showList
                ? t('learningAsides.title')
                : activeAside?.title ?? t('learningAsides.untitled')}
            </DialogTitle>
          </div>
        </DialogHeader>

        {showList ? (
          <ScrollArea className="min-h-0 flex-1">
            <div className="space-y-3 p-5">
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
                    className="w-full rounded-md border bg-card p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onClick={() => onSelectAside(aside.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {aside.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                          {aside.anchor.content}
                        </p>
                      </div>
                      <Badge variant={statusVariant(aside.status)}>
                        {t(statusTranslationKeys[aside.status])}
                      </Badge>
                    </div>
                  </button>
                ))
              )}
            </div>
          </ScrollArea>
        ) : activeAside ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="border-b bg-muted/30 px-5 py-3">
              <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t('learningAsides.anchor')}
              </p>
              <p className="line-clamp-3 text-sm">
                {activeAside.anchor.content}
              </p>
            </div>

            <ScrollArea className="min-h-0 flex-1">
              <div className="space-y-4 p-5">
                {activeAside.messages.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {t('learningAsides.askHint')}
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
                        className={`max-w-[88%] rounded-md border px-3 py-2 text-sm ${
                          message.type === 'human' ? 'bg-muted' : 'bg-card'
                        }`}
                      >
                        {message.type === 'ai' ? (
                          <MarkdownRenderer>{message.content}</MarkdownRenderer>
                        ) : (
                          <p className="whitespace-pre-wrap">{message.content}</p>
                        )}
                      </div>
                    </div>
                  ))
                )}
                {isSending && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    {t('common.processing')}
                  </div>
                )}
              </div>
            </ScrollArea>

            {showResolution ? (
              <div className="space-y-4 border-t p-5">
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
                <div className="flex justify-end gap-2">
                  <Button
                    variant="ghost"
                    onClick={() => setShowResolution(false)}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={resolve}
                    disabled={!conclusion.trim() || isResolving}
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
                        disabled={isSending}
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
                        disabled={!input.trim() || isSending}
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
                    {activeAside.status !== 'discarded' && (
                      <Button
                        variant="ghost"
                        size="sm"
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
      </DialogContent>
    </Dialog>
  )
}
