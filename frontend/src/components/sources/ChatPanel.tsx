'use client'

import { memo, useCallback, useState, useRef, useEffect, useId } from 'react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Bot, User, Send, Loader2, FileText, Lightbulb, StickyNote, MessageSquare, GitBranch } from 'lucide-react'
import { ReferencedMarkdown } from '@/components/common/ReferencedMarkdown'
import {
  SourceChatMessage,
  SourceChatContextIndicator,
  BaseChatSession,
  LearningAside
} from '@/lib/types/api'
import { ModelSelector } from './ModelSelector'
import {
  ContextChip,
  type NotebookContextStats,
} from '@/components/common/ContextChip'
import { SessionManager } from '@/components/sources/SessionManager'
import { MessageActions } from '@/components/sources/MessageActions'
import { SelectionActions } from '@/components/sources/SelectionActions'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { toast } from 'sonner'
import { useTranslation } from '@/lib/hooks/use-translation'
import { LearningThreadLinks } from '@/components/notebooks/LearningThreadLinks'
import { learningMergesForMessage } from '@/components/notebooks/LearningUpdateParts'
import { LearningMergeChip } from '@/components/notebooks/LearningMergeChip'
import {
  chatMessageDomId,
  focusChatMessage,
  messageIdFromChatHash,
  scrollChatToEnd,
} from '@/lib/utils/chat-navigation'
import { cn } from '@/lib/utils'
import type { ReferenceTitles } from '@/lib/utils/learning-asides'
import { isSendShortcut, sendShortcutHint } from '@/lib/utils/composer-shortcut'

interface ChatPanelProps {
  messages: SourceChatMessage[]
  isStreaming: boolean
  contextIndicators: SourceChatContextIndicator | null
  onSendMessage: (message: string, modelOverride?: string) => void
  modelOverride?: string
  onModelChange?: (model?: string) => void
  // Session management props
  sessions?: BaseChatSession[]
  currentSessionId?: string | null
  onCreateSession?: (title: string) => void
  onSelectSession?: (sessionId: string) => void
  onDeleteSession?: (sessionId: string) => void
  onUpdateSession?: (sessionId: string, title: string) => void
  loadingSessions?: boolean
  // Generic props for reusability
  title?: string
  contextType?: 'source' | 'notebook'
  // Notebook context stats (for notebook chat)
  notebookContextStats?: NotebookContextStats
  // Notebook ID for saving notes
  notebookId?: string
  // Learning-aside actions (notebook chat only)
  onOpenAside?: (message: SourceChatMessage) => void
  /** "Go deeper" on a passage selected in an assistant answer. */
  onGoDeeperOnSelection?: (message: SourceChatMessage, passage: string) => void
  onOpenAsides?: () => void
  asideCount?: number
  learningAsides?: LearningAside[]
  onOpenLearningAside?: (asideId: string) => void
  onNavigateToMessage?: (messageId: string) => void
  onDiveIntoQuestion?: (parent: LearningAside, question: string) => void
  onParkQuestion?: (parent: LearningAside, question: string) => void
  /** Source and note titles for learning-update evidence buttons. */
  referenceTitles?: ReferenceTitles
  workspaceMode?: boolean
}

export function ChatPanel({
  messages,
  isStreaming,
  contextIndicators,
  onSendMessage,
  modelOverride,
  onModelChange,
  sessions = [],
  currentSessionId,
  onCreateSession,
  onSelectSession,
  onDeleteSession,
  onUpdateSession,
  loadingSessions = false,
  title,
  contextType = 'source',
  notebookContextStats,
  notebookId,
  onOpenAside,
  onGoDeeperOnSelection,
  onOpenAsides,
  asideCount = 0,
  learningAsides = [],
  onOpenLearningAside,
  onNavigateToMessage,
  onDiveIntoQuestion,
  onParkQuestion,
  referenceTitles,
  workspaceMode = false
}: ChatPanelProps) {
  const { t } = useTranslation()
  const [sessionManagerOpen, setSessionManagerOpen] = useState(false)
  const showSessions = Boolean(
    onSelectSession && onCreateSession && onDeleteSession
  )
  const sourceCount = contextIndicators?.sources?.length ?? 0
  const insightCount = contextIndicators?.insights?.length ?? 0
  const noteCount = contextIndicators?.notes?.length ?? 0
  const hasSourceContext = sourceCount + insightCount + noteCount > 0
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const anchoredHashRef = useRef<string | null>(null)
  const { openModal } = useModalManager()

  // Stable reference-click handler so memoized messages don't re-render on
  // composer keystrokes (which no longer re-render this component at all, since
  // the input state lives in the ChatComposer child).
  const handleReferenceClick = useCallback((type: string, id: string) => {
    const modalType = type === 'source_insight' ? 'insight' : type as 'source' | 'note' | 'insight'

    try {
      openModal(modalType, id)
      // Note: The modal system uses URL parameters and doesn't throw errors for missing items.
      // The modal component itself will handle displaying "not found" states.
      // This try-catch is here for future enhancements or unexpected errors.
    } catch {
      toast.error(t('common.noResults'))
    }
  }, [openModal, t])

  // Reveal a stable message hash once that turn is in the list. Later updates
  // still follow the latest message instead of jumping back to the anchor.
  useEffect(() => {
    const hash = window.location.hash
    const anchoredId = messageIdFromChatHash(hash)
    const hashMatchesMessage =
      anchoredId !== null &&
      messages.some((message) => message.id === anchoredId)
    if (
      hashMatchesMessage &&
      anchoredId &&
      anchoredHashRef.current !== hash &&
      focusChatMessage(anchoredId)
    ) {
      anchoredHashRef.current = hash
      return
    }
    if (messagesEndRef.current) scrollChatToEnd(messagesEndRef.current)
  }, [messages])

  const asideControl = onOpenAsides ? (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 gap-1.5 px-2 text-muted-foreground"
      onClick={onOpenAsides}
    >
      <GitBranch className="h-4 w-4" />
      <span className="text-xs">
        {t('learningAsides.title')}
        {asideCount > 0 ? ` (${asideCount})` : ''}
      </span>
    </Button>
  ) : null

  const sessionControl = showSessions ? (
    <SessionPicker
      open={sessionManagerOpen}
      onOpenChange={setSessionManagerOpen}
      sessions={sessions}
      currentSessionId={currentSessionId ?? null}
      loadingSessions={loadingSessions}
      onCreateSession={(sessionTitle) => onCreateSession?.(sessionTitle)}
      onSelectSession={(sessionId) => {
        onSelectSession?.(sessionId)
        setSessionManagerOpen(false)
      }}
      onUpdateSession={(sessionId, sessionTitle) =>
        onUpdateSession?.(sessionId, sessionTitle)
      }
      onDeleteSession={(sessionId) => onDeleteSession?.(sessionId)}
    />
  ) : null

  return (
    <Card
      className={cn(
        'flex min-h-0 flex-1 flex-col overflow-hidden',
        workspaceMode
          ? 'gap-0 rounded-none border-0 bg-background py-0 shadow-none'
          : 'h-full'
      )}
    >
      {!workspaceMode && (
        <CardHeader className="flex-shrink-0 px-4 py-2">
          <div className="flex items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.13em] text-muted-foreground">
              <span aria-hidden className="h-3.5 w-[3px] rounded-full bg-teal" />
              {title || (contextType === 'source' ? t('chat.chatWith', { name: t('navigation.sources') }) : t('chat.chatWith', { name: t('common.notebook') }))}
            </CardTitle>
            <div className="flex min-w-0 items-center gap-1">
              {asideControl}
              {sessionControl}
            </div>
          </div>
        </CardHeader>
      )}
      <CardContent className="flex-1 flex flex-col min-h-0 p-0">
        <ScrollArea
          className="min-h-0 flex-1 overflow-hidden px-4"
          viewportClassName="[&>div]:!block [&>div]:!min-w-0 [&>div]:!w-full"
          ref={scrollAreaRef}
        >
          {/* Messages keep a readable line length and center in wide columns. */}
          <div className="mx-auto w-full max-w-[45rem] space-y-4 py-4">
            {messages.length === 0 ? (
              <div className="text-center text-muted-foreground py-8">
                <Bot className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-sm">
                  {t('chat.startConversation', { type: contextType === 'source' ? t('navigation.sources') : t('common.notebook') })}
                </p>
                <p className="text-xs mt-2">{t('chat.askQuestions')}</p>
              </div>
            ) : (
              messages.map((message) => (
                <ChatMessage
                  key={message.id}
                  message={message}
                  notebookId={notebookId}
                  onReferenceClick={handleReferenceClick}
                  onOpenAside={onOpenAside}
                  onGoDeeperOnSelection={onGoDeeperOnSelection}
                  learningAsides={learningAsides}
                  onOpenLearningAside={onOpenLearningAside}
                  onNavigateToMessage={onNavigateToMessage}
                  onDiveIntoQuestion={onDiveIntoQuestion}
                  onParkQuestion={onParkQuestion}
                  referenceTitles={referenceTitles}
                  wide={workspaceMode}
                />
              ))
            )}
            {isStreaming && (
              <div className="flex gap-3 justify-start">
                <div className="flex-shrink-0">
                  <div className="h-8 w-8 rounded-full bg-teal-tint flex items-center justify-center">
                    <Bot className="h-4 w-4 text-teal" />
                  </div>
                </div>
                <div className="rounded-lg px-4 py-2 bg-card border">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </ScrollArea>

        <div className="flex-shrink-0 border-t">
          {hasSourceContext && (
            <div className="flex flex-wrap gap-1.5 px-3 pt-1.5 text-xs">
              {sourceCount > 0 && (
                <Badge variant="outline" className="gap-1">
                  <FileText className="h-3 w-3" />
                  {sourceCount} {t('navigation.sources')}
                </Badge>
              )}
              {insightCount > 0 && (
                <Badge variant="outline" className="gap-1">
                  <Lightbulb className="h-3 w-3" />
                  {insightCount} {insightCount === 1 ? t('common.insight') : t('common.insights')}
                </Badge>
              )}
              {noteCount > 0 && (
                <Badge variant="outline" className="gap-1">
                  <StickyNote className="h-3 w-3" />
                  {noteCount} {noteCount === 1 ? t('common.note') : t('common.notes')}
                </Badge>
              )}
            </div>
          )}

          {workspaceMode && (onOpenAsides || showSessions) && (
            <div className="mx-auto flex w-full min-w-0 max-w-[45rem] items-center gap-1 px-2 pt-1.5">
              {asideControl}
              {sessionControl}
            </div>
          )}

          <ChatComposer
            onSendMessage={onSendMessage}
            isStreaming={isStreaming}
            modelOverride={modelOverride}
            onModelChange={onModelChange}
            contextStats={notebookContextStats}
          />
        </div>
      </CardContent>
    </Card>
  )
}

function SessionPicker({
  open,
  onOpenChange,
  sessions,
  currentSessionId,
  loadingSessions,
  onCreateSession,
  onSelectSession,
  onUpdateSession,
  onDeleteSession,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  sessions: BaseChatSession[]
  currentSessionId: string | null
  loadingSessions: boolean
  onCreateSession: (title: string) => void
  onSelectSession: (sessionId: string) => void
  onUpdateSession: (sessionId: string, title: string) => void
  onDeleteSession: (sessionId: string) => void
}) {
  const { t } = useTranslation()
  const current = sessions.find((session) => session.id === currentSessionId)
  const label = current?.title || t('chat.sessions')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <Button
        variant="ghost"
        size="sm"
        className="h-8 max-w-[12rem] gap-1.5 px-2 text-muted-foreground"
        onClick={() => onOpenChange(true)}
        disabled={loadingSessions}
        aria-label={`${t('chat.sessions')}: ${label}`}
      >
        <MessageSquare className="h-4 w-4 shrink-0" />
        <span className="truncate text-xs">{label}</span>
      </Button>
      <DialogContent className="gap-0 overflow-hidden p-0 sm:max-w-md">
        <DialogTitle className="sr-only">{t('chat.sessionsTitle')}</DialogTitle>
        <SessionManager
          sessions={sessions}
          currentSessionId={currentSessionId}
          onCreateSession={onCreateSession}
          onSelectSession={onSelectSession}
          onUpdateSession={onUpdateSession}
          onDeleteSession={onDeleteSession}
          loadingSessions={loadingSessions}
        />
      </DialogContent>
    </Dialog>
  )
}

// Composer owns the input state so keystrokes (including IME composition) only
// re-render this small component instead of the whole message history.
interface ChatComposerProps {
  onSendMessage: (message: string, modelOverride?: string) => void
  isStreaming: boolean
  modelOverride?: string
  onModelChange?: (model?: string) => void
  contextStats?: NotebookContextStats
}

function ChatComposer({
  onSendMessage,
  isStreaming,
  modelOverride,
  onModelChange,
  contextStats
}: ChatComposerProps) {
  const { t } = useTranslation()
  const chatInputId = useId()
  const [input, setInput] = useState('')

  const handleSend = () => {
    if (input.trim() && !isStreaming) {
      onSendMessage(input.trim(), modelOverride)
      setInput('')
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isSendShortcut(e)) {
      e.preventDefault()
      handleSend()
    }
  }

  const keyHint = sendShortcutHint()

  return (
    <div className="mx-auto w-full max-w-[45rem] flex-shrink-0 px-2 py-2">
      {/* One rounded input: the text on top, context, model and send inside. */}
      <div className="rounded-2xl border bg-card shadow-xs transition-[box-shadow] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        <Textarea
          id={chatInputId}
          name="chat-message"
          autoComplete="off"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`${t('chat.sendPlaceholder')} (${t('chat.pressToSend', { key: keyHint })})`}
          disabled={isStreaming}
          className="min-h-11 max-h-[160px] w-full resize-none rounded-2xl border-0 bg-transparent px-3 pt-2.5 pb-1 shadow-none focus-visible:ring-0"
          rows={1}
        />
        <div className="flex min-w-0 items-center gap-1.5 px-2 pb-2">
          {contextStats && <ContextChip stats={contextStats} />}
          <div className="ml-auto flex min-w-0 items-center gap-1.5">
            {onModelChange && (
              <ModelSelector
                currentModel={modelOverride}
                onModelChange={onModelChange}
                disabled={isStreaming}
                className="rounded-full"
              />
            )}
            <Button
              onClick={handleSend}
              disabled={!input.trim() || isStreaming}
              size="icon"
              aria-label={t('chat.sendPlaceholder')}
              className="h-8 w-8 flex-shrink-0 rounded-full"
            >
              {isStreaming ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Single chat message row. Memoized so historical messages don't re-render when
// unrelated state (e.g. the composer input) changes.
interface ChatMessageProps {
  message: SourceChatMessage
  notebookId?: string
  onReferenceClick: (type: string, id: string) => void
  onOpenAside?: (message: SourceChatMessage) => void
  onGoDeeperOnSelection?: (message: SourceChatMessage, passage: string) => void
  learningAsides?: LearningAside[]
  onOpenLearningAside?: (asideId: string) => void
  onNavigateToMessage?: (messageId: string) => void
  onDiveIntoQuestion?: (parent: LearningAside, question: string) => void
  onParkQuestion?: (parent: LearningAside, question: string) => void
  referenceTitles?: ReferenceTitles
  wide?: boolean
}

const ChatMessage = memo(function ChatMessage({
  message,
  notebookId,
  onReferenceClick,
  onOpenAside,
  onGoDeeperOnSelection,
  learningAsides = [],
  onOpenLearningAside,
  onNavigateToMessage,
  onDiveIntoQuestion,
  onParkQuestion,
  referenceTitles,
  wide = false
}: ChatMessageProps) {
  const appliedUpdates = learningMergesForMessage(learningAsides, message.id)
  return (
    <div
      id={chatMessageDomId(message.id)}
      tabIndex={-1}
      className={`flex gap-3 ${
        message.type === 'human' ? 'justify-end' : 'justify-start'
      } scroll-mt-6 rounded-md transition-[box-shadow] outline-none`}
    >
      {message.type === 'ai' && (
        <div className="flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-teal-tint flex items-center justify-center">
            <Bot className="h-4 w-4 text-teal" />
          </div>
        </div>
      )}
      {/* min-w-0 lets the column shrink beside the avatar: a wide formula,
          code block or table then scrolls inside the reply instead of
          pushing the whole answer past the chat's right edge. */}
      <div
        className={cn(
          'flex min-w-0 flex-col gap-2',
          wide && message.type === 'ai' ? 'flex-1' : 'max-w-[80%]'
        )}
      >
        {/* A reply that used an aside's conclusion says so, collapsed. */}
        {appliedUpdates.map(({ aside, update }) => (
          <LearningMergeChip
            key={`${aside.id}:${update.id}`}
            aside={aside}
            update={update}
            asides={learningAsides}
            onOpenAside={onOpenLearningAside}
            onReferenceClick={onReferenceClick}
            onDiveIntoQuestion={onDiveIntoQuestion}
            onParkQuestion={onParkQuestion}
            referenceTitles={referenceTitles}
          />
        ))}
        <div
          className={cn(
            'min-w-0 max-w-full rounded-lg border px-4 py-2',
            message.type === 'human' ? 'bg-muted' : 'bg-card'
          )}
        >
          {message.type === 'ai' ? (
            <SelectionActions
              notebookId={notebookId}
              onGoDeeper={
                onGoDeeperOnSelection
                  ? (passage) => onGoDeeperOnSelection(message, passage)
                  : undefined
              }
            >
              <ReferencedMarkdown
                content={message.content}
                onReferenceClick={onReferenceClick}
                referenceTitles={referenceTitles}
              />
            </SelectionActions>
          ) : (
            <p className="text-sm break-words">{message.content}</p>
          )}
        </div>
        {message.type === 'ai' && (
          <>
            <MessageActions
              content={message.content}
              notebookId={notebookId}
              onOpenAside={
                onOpenAside ? () => onOpenAside(message) : undefined
              }
            />
            {onOpenLearningAside && onNavigateToMessage && (
              <LearningThreadLinks
                messageId={message.id}
                asides={learningAsides}
                onOpenAside={onOpenLearningAside}
                onNavigateToMessage={onNavigateToMessage}
                onReferenceClick={onReferenceClick}
                onDiveIntoQuestion={onDiveIntoQuestion}
                onParkQuestion={onParkQuestion}
                referenceTitles={referenceTitles}
              />
            )}
          </>
        )}
      </div>
      {message.type === 'human' && (
        <div className="flex-shrink-0">
          <div className="h-8 w-8 rounded-full bg-muted border flex items-center justify-center">
            <User className="h-4 w-4 text-muted-foreground" />
          </div>
        </div>
      )}
    </div>
  )
})
