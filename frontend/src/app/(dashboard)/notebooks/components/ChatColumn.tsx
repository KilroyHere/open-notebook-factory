'use client'

import { useEffect, useMemo, useRef } from 'react'
import { toast } from 'sonner'
import { useNotebookChat } from '@/lib/hooks/use-notebook-chat'
import { useLearningAsides } from '@/lib/hooks/use-learning-asides'
import { useNotes } from '@/lib/hooks/use-notes'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { ChatPanel } from '@/components/sources/ChatPanel'
import { LearningAsidePanel } from '@/components/notebooks/LearningAsidePanel'
import { LearningJourneyRail } from '@/components/notebooks/LearningJourneyRail'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, GitBranch } from 'lucide-react'
import { ContextSelections } from '../[id]/page'
import { useTranslation } from '@/lib/hooks/use-translation'
import { LearningAside, NotebookChatMessage, SourceListResponse } from '@/lib/types/api'
import { focusChatMessage } from '@/lib/utils/chat-navigation'
import { childDiveForQuestion, createAsideTitle } from '@/lib/utils/learning-asides'

interface ChatColumnProps {
  notebookId: string
  contextSelections: ContextSelections
  sources: SourceListResponse[]
  sourcesLoading: boolean
  mobileSurface?: 'chat' | 'journey'
  onLeaveJourney?: () => void
}

export function ChatColumn({ notebookId, contextSelections, sources, sourcesLoading, mobileSurface = 'chat', onLeaveJourney }: ChatColumnProps) {
  const { t } = useTranslation()
  const { openModal } = useModalManager()

  const handleReferenceClick = (type: string, id: string) => {
    const modalType =
      type === 'source_insight' ? 'insight' : (type as 'source' | 'note' | 'insight')
    try {
      openModal(modalType, id)
    } catch {
      toast.error(t('common.noResults'))
    }
  }

  // Fetch notes for this notebook
  const { data: notes = [], isLoading: notesLoading } = useNotes(notebookId)

  // Initialize notebook chat hook
  const chat = useNotebookChat({
    notebookId,
    sources,
    notes,
    contextSelections
  })
  const learning = useLearningAsides({
    notebookId,
    mainSessionId: chat.currentSessionId,
    buildContext: chat.buildContext,
    modelOverride: chat.currentSession?.model_override ?? chat.pendingModelOverride ?? undefined
  })

  const handleOpenAside = (message: NotebookChatMessage) => {
    void learning.createAside({
      type: 'message',
      message_id: message.id,
      content: message.content
    }).catch(() => undefined)
  }

  const diveIntoQuestion = (parent: LearningAside, question: string) => {
    const existing = childDiveForQuestion(learning.asides, parent.id, question)
    if (existing) {
      learning.openAside(existing.id)
      return
    }
    void learning.createAside({
      type: 'message',
      content: question.trim(),
      parentAside: parent,
    }).catch(() => undefined)
  }

  const parkQuestion = (parent: LearningAside, question: string) => {
    const existing = childDiveForQuestion(learning.asides, parent.id, question)
    if (existing) {
      if (existing.status !== 'parked') {
        void learning.updateStatus({ asideId: existing.id, status: 'parked' }).catch(() => undefined)
      }
      return
    }
    void learning.createAside({
      type: 'message',
      content: question.trim(),
      parentAside: parent,
      initialStatus: 'parked',
    }).catch(() => undefined)
  }

  const resumableAside = learning.asides.find(
    (aside) => aside.id === learning.resume?.recommended_aside_id
  )

  const sections = learning.sections
  const syncSections = learning.syncSections
  const syncedSectionIds = useRef(new Set<string>())
  useEffect(() => {
    if (!chat.currentSessionId || !syncSections) return
    const known = new Set(
      (sections ?? []).map((section) => section.start_message_id)
    )
    const missing = chat.messages.filter((message) => {
      if (message.type !== 'human' || !message.id) return false
      if (known.has(message.id) || syncedSectionIds.current.has(message.id)) {
        return false
      }
      return Boolean(
        createAsideTitle(message.content) || message.content.trim()
      )
    })
    if (missing.length === 0) return
    for (const message of missing) syncedSectionIds.current.add(message.id)
    void syncSections(
      missing.map((message) => ({
        start_message_id: message.id,
        title:
          createAsideTitle(message.content) ||
          message.content.trim().slice(0, 72),
      }))
    ).catch(() => {
      for (const message of missing) syncedSectionIds.current.delete(message.id)
    })
  }, [chat.currentSessionId, chat.messages, sections, syncSections])

  const renameSection = (sectionId: string, title: string) => {
    void learning.updateSection({ sectionId, title }).catch(() => undefined)
  }

  const togglePinSection = (sectionId: string, pinned: boolean) => {
    void learning.updateSection({ sectionId, pinned }).catch(() => undefined)
  }

  const showMainThread = () => {
    learning.setPanelOpen(false)
  }

  const navigateToMainMessage = (messageId: string) => {
    learning.setPanelOpen(false)
    window.setTimeout(() => focusChatMessage(messageId), 0)
  }

  const sendMainMessage = async (
    message: string,
    modelOverride?: string
  ) => {
    await chat.sendMessage(message, modelOverride)
    await learning.refreshJourney()
  }

  // Calculate context stats for indicator
  const contextStats = useMemo(() => {
    let sourcesInsights = 0
    let sourcesFull = 0
    let notesCount = 0

    // Count sources by mode
    sources.forEach(source => {
      const mode = contextSelections.sources[source.id]
      if (mode === 'insights') {
        sourcesInsights++
      } else if (mode === 'full') {
        sourcesFull++
      }
    })

    // Count notes that are included (not 'off')
    notes.forEach(note => {
      const mode = contextSelections.notes[note.id]
      if (mode === 'full') {
        notesCount++
      }
    })

    return {
      sourcesInsights,
      sourcesFull,
      notesCount,
      tokenCount: chat.tokenCount,
      charCount: chat.charCount
    }
  }, [sources, notes, contextSelections, chat.tokenCount, chat.charCount])

  // Show loading state while sources/notes are being fetched
  if (sourcesLoading || notesLoading) {
    return (
      <Card className="h-full flex flex-col">
        <CardContent className="flex-1 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </CardContent>
      </Card>
    )
  }

  // Show error state if data fetch failed (unlikely but good to handle)
  if (!sources && !notes) {
    return (
      <Card className="h-full flex flex-col">
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p className="text-sm">{t('chat.unableToLoadChat')}</p>
            <p className="text-xs mt-2">{t('common.refreshPage') || 'Please try refreshing the page'}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  if (mobileSurface === 'journey') {
    return (
      <LearningJourneyRail
        presentation="sheet"
        messages={chat.messages}
        asides={learning.asides}
        activeAsideId={learning.activeAsideId}
        onShowMain={() => {
          onLeaveJourney?.()
          showMainThread()
        }}
        onOpenAside={(asideId) => {
          onLeaveJourney?.()
          learning.openAside(asideId)
        }}
        onNavigateToMessage={(messageId) => {
          onLeaveJourney?.()
          navigateToMainMessage(messageId)
        }}
        onDiveIntoQuestion={(parent, question) => {
          onLeaveJourney?.()
          diveIntoQuestion(parent, question)
        }}
        onParkQuestion={parkQuestion}
        sections={learning.sections}
        onRenameSection={renameSection}
        onTogglePinSection={togglePinSection}
      />
    )
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1">
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {resumableAside && !learning.panelOpen && (
          <div className="flex items-center justify-between gap-3 border-b bg-card px-3 py-2">
            <div className="flex min-w-0 items-center gap-2">
              <GitBranch className="h-4 w-4 shrink-0 text-teal" />
              <p className="truncate text-xs text-muted-foreground">
                {t('learningAsides.resumePrompt', {
                  title: resumableAside.title,
                })}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => learning.openAside(resumableAside.id)}
            >
              {t('learningAsides.resume')}
            </Button>
        </div>
        )}
        {learning.panelOpen ? (
          <LearningAsidePanel
            open
            onOpenChange={learning.setPanelOpen}
            asides={learning.asides}
            activeAside={learning.activeAside}
            isLoading={learning.isLoading || learning.isCreating}
            isSending={learning.isSending}
            isResolving={learning.isResolving}
            isAsideLoading={learning.isAsideLoading}
            onSelectAside={learning.openAside}
            onSendMessage={(asideId, message) =>
              learning.sendMessage({ asideId, message })
            }
            onDraftResolution={learning.draftResolution}
            onResolve={(asideId, data) =>
              learning.resolveAside({ asideId, data })
            }
            onUpdateStatus={(asideId, status) =>
              learning.updateStatus({ asideId, status })
            }
            onNavigateToMessage={navigateToMainMessage}
            onReferenceClick={handleReferenceClick}
            onDiveIntoQuestion={diveIntoQuestion}
            onParkQuestion={parkQuestion}
          />
        ) : (
          <ChatPanel
            title={t('chat.chatWithNotebook')}
            contextType="notebook"
            messages={chat.messages}
            isStreaming={chat.isSending}
            contextIndicators={null}
            onSendMessage={(message, modelOverride) =>
              void sendMainMessage(message, modelOverride)
            }
            modelOverride={
              chat.currentSession?.model_override ??
              chat.pendingModelOverride ??
              undefined
            }
            onModelChange={(model) => chat.setModelOverride(model ?? null)}
            sessions={chat.sessions}
            currentSessionId={chat.currentSessionId}
            onCreateSession={(title) => chat.createSession(title)}
            onSelectSession={chat.switchSession}
            onUpdateSession={(sessionId, title) =>
              chat.updateSession(sessionId, { title })
            }
            onDeleteSession={chat.deleteSession}
            loadingSessions={chat.loadingSessions}
            notebookContextStats={contextStats}
            notebookId={notebookId}
            onOpenAside={handleOpenAside}
            onOpenAsides={
              chat.currentSessionId ? learning.openList : undefined
            }
            asideCount={
              learning.asides.filter(
                (aside) => aside.status !== 'discarded'
              ).length
            }
            learningAsides={learning.asides}
            onOpenLearningAside={learning.openAside}
            onNavigateToMessage={navigateToMainMessage}
            onDiveIntoQuestion={diveIntoQuestion}
            onParkQuestion={parkQuestion}
            workspaceMode
          />
        )}
      </div>
      <LearningJourneyRail
        messages={chat.messages}
        asides={learning.asides}
        activeAsideId={learning.activeAsideId}
        onShowMain={showMainThread}
        onOpenAside={learning.openAside}
        onNavigateToMessage={navigateToMainMessage}
        onDiveIntoQuestion={diveIntoQuestion}
        onParkQuestion={parkQuestion}
        sections={learning.sections}
        onRenameSection={renameSection}
        onTogglePinSection={togglePinSection}
      />
    </div>
  )
}
