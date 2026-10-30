'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { NotebookHeader } from '../components/NotebookHeader'
import { SourcesColumn } from '../components/SourcesColumn'
import { ChatColumn } from '../components/ChatColumn'
import { StudioColumn } from '../components/StudioColumn'
import { useNotebook } from '@/lib/hooks/use-notebooks'
import { useNotebookSources } from '@/lib/hooks/use-sources'
import { useNotes } from '@/lib/hooks/use-notes'
import { useNotebookWorkspace } from '@/lib/hooks/use-notebook-workspace'
import { useNotebookColumnsStore } from '@/lib/stores/notebook-columns-store'
import { cn } from '@/lib/utils'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { useIsDesktop } from '@/lib/hooks/use-media-query'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileText, MessageSquare, PanelRight } from 'lucide-react'
import {
  applyBulkSourceContext,
  applyBulkNoteContext,
  computeSourceSelections,
  computeNoteSelections,
  type SourceContextDefault,
  type SourceBulkAction,
  type NoteContextDefault,
} from '@/lib/utils/source-context'

// Re-exported from the shared types module for backward compatibility; several
// components historically import these from this route file.
import type { ContextMode, ContextSelections, NoteContextMode } from '@/lib/types/notebook-context'
import type { NoteResponse } from '@/lib/types/api'
export type { ContextMode, ContextSelections, NoteContextMode }

type MobileTab = 'sources' | 'chat' | 'studio'

// Stable fallback so the chat context does not rebuild on every render while
// notes are still loading.
const NO_NOTES: NoteResponse[] = []

export default function NotebookPage() {
  const { t } = useTranslation()
  const params = useParams()

  // Ensure the notebook ID is properly decoded from URL
  const notebookId = params?.id ? decodeURIComponent(params.id as string) : ''

  const { data: notebook, isLoading: notebookLoading } = useNotebook(notebookId)
  const {
    sources,
    isLoading: sourcesLoading,
    refetch: refetchSources,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useNotebookSources(notebookId)
  const { data: notes, isLoading: notesLoading } = useNotes(notebookId)

  // Detect desktop so only one layout (and one chat panel) is mounted
  const isDesktop = useIsDesktop()
  const { sourcesCollapsed } = useNotebookColumnsStore()

  // Mobile tab state: Sources, Chat, or Studio (journey + notes)
  const [mobileActiveTab, setMobileActiveTab] = useState<MobileTab>('chat')

  // Context selection state
  const [contextSelections, setContextSelections] = useState<ContextSelections>({
    sources: {},
    notes: {}
  })

  // The default context mode applied to sources as they load. A bulk
  // include/exclude updates this so sources loaded later via pagination follow
  // the same intent instead of reverting to "included" (#223/#915).
  const [sourceContextDefault, setSourceContextDefault] = useState<SourceContextDefault>('include')

  // Same idea for notes loaded later (notes are binary: included/off).
  const [noteContextDefault, setNoteContextDefault] = useState<NoteContextDefault>('include')

  // Initialize and update selections when sources load or change
  useEffect(() => {
    if (sources && sources.length > 0) {
      setContextSelections(prev => ({
        ...prev,
        sources: computeSourceSelections(prev.sources, sources, sourceContextDefault),
      }))
    }
  }, [sources, sourceContextDefault])

  useEffect(() => {
    if (notes && notes.length > 0) {
      setContextSelections(prev => ({
        ...prev,
        notes: computeNoteSelections(prev.notes, notes, noteContextDefault),
      }))
    }
  }, [notes, noteContextDefault])

  const handleSourceContextModeChange = (sourceId: string, mode: ContextMode) => {
    setContextSelections(prev => ({
      ...prev,
      sources: {
        ...prev.sources,
        [sourceId]: mode
      }
    }))
  }

  const handleNoteContextModeChange = (noteId: string, mode: NoteContextMode) => {
    setContextSelections(prev => ({
      ...prev,
      notes: {
        ...prev.notes,
        [noteId]: mode
      }
    }))
  }

  // Bulk-apply a context action (insights-only / full / exclude) to every
  // source at once (#223). Also records the action as the default for sources
  // loaded later (#915).
  const handleBulkSourceContext = (action: SourceBulkAction) => {
    setSourceContextDefault(action)
    setContextSelections(prev => ({
      ...prev,
      sources: applyBulkSourceContext(prev.sources, sources ?? [], action),
    }))
  }

  // Bulk include/exclude every note from the chat context at once (#223).
  const handleBulkNoteContext = (action: NoteContextDefault) => {
    setNoteContextDefault(action)
    setContextSelections(prev => ({
      ...prev,
      notes: applyBulkNoteContext(prev.notes, notes ?? [], action),
    }))
  }

  // One conversation for both layouts and every column: the chat column and
  // the Studio's journey read the same chat and learning state.
  const workspace = useNotebookWorkspace({
    notebookId,
    sources,
    notes: notes ?? NO_NOTES,
    contextSelections,
  })

  if (notebookLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    )
  }

  if (!notebook) {
    return (
      <AppShell>
        <div className="p-6">
          <h1 className="text-2xl font-bold mb-4">{t('notebooks.notFound')}</h1>
          <p className="text-muted-foreground">{t('notebooks.notFoundDesc')}</p>
        </div>
      </AppShell>
    )
  }

  const sourcesProps = {
    sources,
    isLoading: sourcesLoading,
    notebookId,
    notebookName: notebook.name,
    onRefresh: refetchSources,
    contextSelections: contextSelections.sources,
    onContextModeChange: handleSourceContextModeChange,
    onBulkContextModeChange: handleBulkSourceContext,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  }
  const notesProps = {
    notes,
    isLoading: notesLoading,
    notebookId,
    contextSelections: contextSelections.notes,
    onContextModeChange: handleNoteContextModeChange,
    onBulkContextModeChange: handleBulkNoteContext,
  }
  const chatLoading = sourcesLoading || notesLoading

  return (
    <AppShell compactNav>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex-shrink-0 px-4 pt-2">
          <NotebookHeader notebook={notebook} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {isDesktop ? (
            <div className="flex min-h-0 flex-1 items-stretch overflow-hidden">
              <div
                className={cn(
                  'flex min-h-0 shrink-0 flex-col py-2 pl-2',
                  sourcesCollapsed ? 'w-14' : 'w-80 xl:w-96'
                )}
              >
                <SourcesColumn {...sourcesProps} />
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <ChatColumn workspace={workspace} isLoading={chatLoading} />
              </div>
              <StudioColumn workspace={workspace} notes={notesProps} />
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-4 lg:hidden">
              <div className="mb-4">
                <Tabs value={mobileActiveTab} onValueChange={(value) => setMobileActiveTab(value as MobileTab)}>
                  <TabsList aria-label={notebook.name} className="grid w-full grid-cols-3">
                    <TabsTrigger value="sources" className="min-w-0 gap-1 px-1">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">{t('navigation.sources')}</span>
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="min-w-0 gap-1 px-1">
                      <MessageSquare className="h-4 w-4 shrink-0" />
                      <span className="truncate">{t('common.chat')}</span>
                    </TabsTrigger>
                    <TabsTrigger value="studio" className="min-w-0 gap-1 px-1">
                      <PanelRight className="h-4 w-4 shrink-0" />
                      <span className="truncate">{t('notebooks.studio')}</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Mobile: Show only active tab */}
              <div className="min-h-0 flex-1 overflow-hidden">
                {mobileActiveTab === 'sources' && (
                  <SourcesColumn {...sourcesProps} allowCollapse={false} />
                )}
                {mobileActiveTab === 'chat' && (
                  <div className="flex h-full min-h-0 flex-col">
                    <ChatColumn workspace={workspace} isLoading={chatLoading} />
                  </div>
                )}
                {mobileActiveTab === 'studio' && (
                  <StudioColumn
                    workspace={workspace}
                    notes={notesProps}
                    presentation="sheet"
                    onShowConversation={() => setMobileActiveTab('chat')}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  )
}
