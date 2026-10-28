'use client'

import { useMemo } from 'react'
import { useNotebookChat } from '@/lib/hooks/use-notebook-chat'
import { useLearningAsides } from '@/lib/hooks/use-learning-asides'
import { useNotes } from '@/lib/hooks/use-notes'
import { ChatPanel } from '@/components/sources/ChatPanel'
import { LearningAsidePanel } from '@/components/notebooks/LearningAsidePanel'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { AlertCircle, GitBranch } from 'lucide-react'
import { ContextSelections } from '../[id]/page'
import { useTranslation } from '@/lib/hooks/use-translation'
import { NotebookChatMessage, SourceListResponse } from '@/lib/types/api'

interface ChatColumnProps {
  notebookId: string
  contextSelections: ContextSelections
  sources: SourceListResponse[]
  sourcesLoading: boolean
}

export function ChatColumn({ notebookId, contextSelections, sources, sourcesLoading }: ChatColumnProps) {
  const { t } = useTranslation()

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

  const resumableAside = learning.asides.find((aside) =>
    learning.resume?.open_aside_ids.includes(aside.id)
  )

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

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col gap-2">
      {resumableAside && !learning.panelOpen && (
        <div className="flex items-center justify-between gap-3 rounded-md border bg-card px-3 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <GitBranch className="h-4 w-4 shrink-0 text-teal" />
            <p className="truncate text-xs text-muted-foreground">
              {t('learningAsides.resumePrompt', { title: resumableAside.title })}
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
      <ChatPanel
      title={t('chat.chatWithNotebook')}
      contextType="notebook"
      messages={chat.messages}
      isStreaming={chat.isSending}
      contextIndicators={null}
      onSendMessage={(message, modelOverride) => chat.sendMessage(message, modelOverride)}
      modelOverride={chat.currentSession?.model_override ?? chat.pendingModelOverride ?? undefined}
      onModelChange={(model) => chat.setModelOverride(model ?? null)}
      sessions={chat.sessions}
      currentSessionId={chat.currentSessionId}
      onCreateSession={(title) => chat.createSession(title)}
      onSelectSession={chat.switchSession}
      onUpdateSession={(sessionId, title) => chat.updateSession(sessionId, { title })}
      onDeleteSession={chat.deleteSession}
      loadingSessions={chat.loadingSessions}
      notebookContextStats={contextStats}
      notebookId={notebookId}
      onOpenAside={handleOpenAside}
      onOpenAsides={chat.currentSessionId ? learning.openList : undefined}
      asideCount={learning.asides.filter((aside) => aside.status !== 'discarded').length}
      />
      <LearningAsidePanel
        open={learning.panelOpen}
        onOpenChange={learning.setPanelOpen}
        asides={learning.asides}
        activeAside={learning.activeAside}
        isLoading={learning.isLoading || learning.isCreating}
        isSending={learning.isSending}
        isResolving={learning.isResolving}
        onSelectAside={learning.openAside}
        onSendMessage={(asideId, message) =>
          learning.sendMessage({ asideId, message })
        }
        onResolve={(asideId, data) =>
          learning.resolveAside({ asideId, data })
        }
        onUpdateStatus={(asideId, status) =>
          learning.updateStatus({ asideId, status })
        }
      />
    </div>
  )
}
