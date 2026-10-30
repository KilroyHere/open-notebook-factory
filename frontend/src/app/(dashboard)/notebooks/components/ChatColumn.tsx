'use client'

import { useEffect, useLayoutEffect, useRef } from 'react'
import { toast } from 'sonner'
import { useModalManager } from '@/lib/hooks/use-modal-manager'
import { ChatPanel } from '@/components/sources/ChatPanel'
import { LearningAsidePanel } from '@/components/notebooks/LearningAsidePanel'
import {
  InlineDivesProvider,
  type InlineDivesController,
} from '@/components/notebooks/InlineDivesContext'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { GitBranch } from 'lucide-react'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { NotebookWorkspace } from '@/lib/hooks/use-notebook-workspace'
import { inlineDiveDomId } from '@/lib/utils/chat-navigation'

interface ChatColumnProps {
  workspace: NotebookWorkspace
  isLoading: boolean
}

/**
 * The center column: the main chat, with dives as threads under their
 * answers, and the full-height dive view over it when a long dive, the aside
 * list or a deeply nested dive is open. The chat stays mounted under that
 * view so its scroll position and draft survive the round trip.
 */
export function ChatColumn({ workspace, isLoading }: ChatColumnProps) {
  const { t } = useTranslation()
  const { openModal } = useModalManager()
  const { chat, learning } = workspace
  const fullHeight = learning.panelOpen

  const handleReferenceClick = (type: string, id: string) => {
    const modalType =
      type === 'source_insight' ? 'insight' : (type as 'source' | 'note' | 'insight')
    try {
      openModal(modalType, id)
    } catch {
      toast.error(t('common.noResults'))
    }
  }

  // Leaving the full-height view returns the cursor to where it was, or to
  // the dive's row when that is what opened it.
  const returnFocus = useRef<Element | null>(null)
  useLayoutEffect(() => {
    if (fullHeight) returnFocus.current = document.activeElement
  }, [fullHeight])
  const expandedDiveId = workspace.expandedDiveId
  const wasFullHeight = useRef(fullHeight)
  useEffect(() => {
    const left = wasFullHeight.current && !fullHeight
    wasFullHeight.current = fullHeight
    if (!left) return
    const previous = returnFocus.current
    returnFocus.current = null
    if (document.activeElement && document.activeElement !== document.body) {
      return
    }
    const target =
      previous instanceof HTMLElement && previous.isConnected
        ? previous
        : expandedDiveId
          ? document.getElementById(inlineDiveDomId(expandedDiveId))?.querySelector('button')
          : null
    target?.focus({ preventScroll: true })
  }, [fullHeight, expandedDiveId])

  const dives: InlineDivesController = {
    expandedAsideId: expandedDiveId,
    activeAside: learning.activeAside,
    creating: learning.creating,
    attention: workspace.attention,
    onAttended: workspace.onAttended,
    sendingAsideId: learning.sendingAsideId,
    pendingMessage: learning.pendingMessage,
    resolvingAsideId: learning.resolvingAsideId,
    isAsideLoading: learning.isAsideLoading,
    onExpand: workspace.expandDive,
    onCollapse: workspace.collapseDive,
    onOpenFullHeight: workspace.openAsideFull,
    onSendMessage: (asideId, message) =>
      learning.sendMessage({ asideId, message }),
    onDraftResolution: learning.draftResolution,
    onResolve: (asideId, data) => learning.resolveAside({ asideId, data }),
    onUpdateStatus: (asideId, status) =>
      learning.updateStatus({ asideId, status }),
    onSetIncludeInMain: learning.setIncludeInMain,
    onGoDeeperOnSelection: workspace.openAsideFromDiveSelection,
    notebookId: workspace.notebookId,
  }

  const resumableAside = learning.asides.find(
    (aside) => aside.id === learning.resume?.recommended_aside_id
  )
  const activeAsideId = learning.activeAsideId

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
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
      {resumableAside && !fullHeight && expandedDiveId !== resumableAside.id && (
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
            onClick={() => workspace.openAside(resumableAside.id)}
          >
            {t('learningAsides.resume')}
          </Button>
        </div>
      )}
      <div
        inert={fullHeight}
        data-main-chat
        className="flex min-h-0 min-w-0 flex-1 flex-col"
      >
        <InlineDivesProvider value={dives}>
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
            onGoDeeperOnSelection={workspace.openAsideFromSelection}
            onOpenAsides={chat.currentSessionId ? learning.openList : undefined}
            asideCount={
              learning.asides.filter((aside) => aside.status !== 'discarded')
                .length
            }
            learningAsides={learning.asides}
            onOpenLearningAside={workspace.openAside}
            onNavigateToMessage={workspace.navigateToMainMessage}
            onDiveIntoQuestion={workspace.diveIntoQuestion}
            onParkQuestion={workspace.parkQuestion}
            referenceTitles={workspace.referenceTitles}
            workspaceMode
          />
        </InlineDivesProvider>
      </div>
      {fullHeight && (
        <div className="absolute inset-0 z-10 flex min-h-0 min-w-0 flex-col bg-background">
          <LearningAsidePanel
            open
            onOpenChange={(open) => {
              if (!open) workspace.exitFullHeight()
            }}
            asides={workspace.knownAsides}
            activeAside={learning.activeAside}
            isLoading={learning.isLoading || learning.isCreating}
            isSending={!!activeAsideId && learning.sendingAsideId === activeAsideId}
            pendingMessage={
              activeAsideId && learning.sendingAsideId === activeAsideId
                ? learning.pendingMessage
                : null
            }
            isResolving={
              !!activeAsideId && learning.resolvingAsideId === activeAsideId
            }
            isAsideLoading={learning.isAsideLoading}
            onSelectAside={workspace.openAsideFull}
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
            onSetIncludeInMain={learning.setIncludeInMain}
            referenceTitles={workspace.referenceTitles}
            onGoDeeperOnSelection={workspace.openAsideFromDiveSelection}
            notebookId={workspace.notebookId}
            attention={workspace.attention}
            onAttended={workspace.onAttended}
          />
        </div>
      )}
    </div>
  )
}
