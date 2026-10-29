'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { AppShell } from '@/components/layout/AppShell'
import { NotebookHeader } from '../components/NotebookHeader'
import { SourcesColumn } from '../components/SourcesColumn'
import { NotesColumn } from '../components/NotesColumn'
import { ChatColumn } from '../components/ChatColumn'
import { KnowledgeRail } from '../components/KnowledgeRail'
import { useNotebook } from '@/lib/hooks/use-notebooks'
import { useNotebookSources } from '@/lib/hooks/use-sources'
import { useNotes } from '@/lib/hooks/use-notes'
import { LoadingSpinner } from '@/components/common/LoadingSpinner'
import { useIsDesktop } from '@/lib/hooks/use-media-query'
import { useTranslation } from '@/lib/hooks/use-translation'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FileText, StickyNote, MessageSquare, GitBranch } from 'lucide-react'
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
export type { ContextMode, ContextSelections, NoteContextMode }

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

  // Detect desktop to avoid double-mounting ChatColumn
  const isDesktop = useIsDesktop()

  // Mobile tab state (Sources, Notes, Chat, or Journey)
  const [mobileActiveTab, setMobileActiveTab] = useState<'sources' | 'notes' | 'chat' | 'journey'>('chat')

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

  return (
    <AppShell>
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="flex-shrink-0 px-6 pt-4">
          <NotebookHeader notebook={notebook} />
        </div>

        <div className="flex min-h-0 flex-1 flex-col">
          {/* Mobile: Tabbed interface - only render on mobile to avoid double-mounting */}
          {!isDesktop && (
            <div className="flex min-h-0 flex-1 flex-col px-4 pb-4 pt-4 lg:hidden">
              <div className="mb-4">
                <Tabs value={mobileActiveTab} onValueChange={(value) => setMobileActiveTab(value as 'sources' | 'notes' | 'chat' | 'journey')}>
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="sources" className="min-w-0 gap-1 px-1">
                      <FileText className="h-4 w-4 shrink-0" />
                      <span className="truncate">{t('navigation.sources')}</span>
                    </TabsTrigger>
                    <TabsTrigger value="notes" className="min-w-0 gap-1 px-1">
                      <StickyNote className="h-4 w-4 shrink-0" />
                      <span className="truncate">{t('common.notes')}</span>
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="min-w-0 gap-1 px-1">
                      <MessageSquare className="h-4 w-4 shrink-0" />
                      <span className="truncate">{t('common.chat')}</span>
                    </TabsTrigger>
                    <TabsTrigger value="journey" className="min-w-0 gap-1 px-1">
                      <GitBranch className="h-4 w-4 shrink-0" />
                      <span className="truncate">{t('learningAsides.journey')}</span>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>

              {/* Mobile: Show only active tab */}
              <div className="min-h-0 flex-1 overflow-hidden">
                {mobileActiveTab === 'sources' && (
                  <SourcesColumn
                    sources={sources}
                    isLoading={sourcesLoading}
                    notebookId={notebookId}
                    notebookName={notebook?.name}
                    onRefresh={refetchSources}
                    contextSelections={contextSelections.sources}
                    onContextModeChange={handleSourceContextModeChange}
                    onBulkContextModeChange={handleBulkSourceContext}
                    hasNextPage={hasNextPage}
                    isFetchingNextPage={isFetchingNextPage}
                    fetchNextPage={fetchNextPage}
                    allowCollapse={false}
                  />
                )}
                {mobileActiveTab === 'notes' && (
                  <NotesColumn
                    notes={notes}
                    isLoading={notesLoading}
                    notebookId={notebookId}
                    contextSelections={contextSelections.notes}
                    onContextModeChange={handleNoteContextModeChange}
                    onBulkContextModeChange={handleBulkNoteContext}
                    allowCollapse={false}
                  />
                )}
                {(mobileActiveTab === 'chat' || mobileActiveTab === 'journey') && (
                  <div className="flex h-full min-h-0 flex-col">
                    <ChatColumn
                      notebookId={notebookId}
                      contextSelections={contextSelections}
                      sources={sources}
                      sourcesLoading={sourcesLoading}
                      mobileSurface={mobileActiveTab === 'journey' ? 'journey' : 'chat'}
                      onLeaveJourney={() => setMobileActiveTab('chat')}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="hidden min-h-0 flex-1 items-stretch overflow-hidden lg:flex">
            <KnowledgeRail
              sources={{
                sources,
                isLoading: sourcesLoading,
                notebookId,
                notebookName: notebook?.name,
                onRefresh: refetchSources,
                contextSelections: contextSelections.sources,
                onContextModeChange: handleSourceContextModeChange,
                onBulkContextModeChange: handleBulkSourceContext,
                hasNextPage,
                isFetchingNextPage,
                fetchNextPage,
              }}
              notes={{
                notes,
                isLoading: notesLoading,
                notebookId,
                contextSelections: contextSelections.notes,
                onContextModeChange: handleNoteContextModeChange,
                onBulkContextModeChange: handleBulkNoteContext,
              }}
            />
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <ChatColumn
                notebookId={notebookId}
                contextSelections={contextSelections}
                sources={sources}
                sourcesLoading={sourcesLoading}
              />
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  )
}
