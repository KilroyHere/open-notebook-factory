'use client'

import { toast } from 'sonner'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { ChatPanel } from '@/components/sources/ChatPanel'
import { LearningAsidePanel } from '@/components/notebooks/LearningAsidePanel'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GitBranch } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { NotebookWorkspace } from '@/lib/hooks/use-notebook-workspace'

interface ChatColumnProps {
  workspace: NotebookWorkspace
  isLoading: boolean
}

export function ChatColumn({ workspace, isLoading }: ChatColumnProps) {
  const { t } = useTranslation()
  const { openModal } = useModalManager()
  const { chat, learning } = workspace

  const handleReferenceClick = (type: string, id: string) => {
    const modalType =
      type === 'source_insight' ? 'insight' : (type as 'source' | 'note' | 'insight')
    try {
      openModal(modalType, id)
    } catch {
      toast.error(t('common.noResults'))
    }
  }

  const resumableAside = learning.asides.find(
    (aside) => aside.id === learning.resume?.recommended_aside_id
  )

  // Show loading state while sources/notes are being fetched
  if (isLoading) {
    return (
      <Card className="h-full flex flex-col">
        <CardContent className="flex-1 flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </CardContent>
      </Card>
    )
  }

  return (
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
          onNavigateToMessage={workspace.navigateToMainMessage}
          onReferenceClick={handleReferenceClick}
          onDiveIntoQuestion={workspace.diveIntoQuestion}
          onParkQuestion={workspace.parkQuestion}
          referenceTitles={workspace.referenceTitles}
        />
      ) : (
        <ChatPanel
          title={t('chat.chatWithNotebook')}
          contextType="notebook"
          messages={chat.messages}
          isStreaming={chat.isSending}
          contextIndicators={null}
          onSendMessage={(message, modelOverride) =>
            void workspace.sendMainMessage(message, modelOverride)
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
          notebookContextStats={workspace.contextStats}
          notebookId={workspace.notebookId}
          onOpenAside={workspace.openAsideFromMessage}
          onOpenAsides={chat.currentSessionId ? learning.openList : undefined}
          asideCount={
            learning.asides.filter((aside) => aside.status !== 'discarded')
              .length
          }
          learningAsides={learning.asides}
          onOpenLearningAside={learning.openAside}
          onNavigateToMessage={workspace.navigateToMainMessage}
          onDiveIntoQuestion={workspace.diveIntoQuestion}
          onParkQuestion={workspace.parkQuestion}
          referenceTitles={workspace.referenceTitles}
          workspaceMode
        />
      )}
    </div>
  )
}
