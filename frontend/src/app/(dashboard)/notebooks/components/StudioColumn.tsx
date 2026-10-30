'use client'

import { useState, type ComponentProps } from 'react'
import { GitBranch, PanelRight, StickyNote } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CollapsibleColumn,
  CollapseColumnButton,
} from '@/components/notebooks/CollapsibleColumn'
import { JourneyStats } from '@/components/notebooks/JourneyStats'
import { LearningJourneyRail } from '@/components/notebooks/LearningJourneyRail'
import { useNotebookColumnsStore } from '@/lib/stores/notebook-columns-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import type { NotebookWorkspace } from '@/lib/hooks/use-notebook-workspace'
import { cn } from '@/lib/utils'
import { NotesColumn } from './NotesColumn'

export type StudioTab = 'journey' | 'notes'

type StudioNotesProps = Omit<
  ComponentProps<typeof NotesColumn>,
  'embedded' | 'allowCollapse'
>

interface StudioColumnProps {
  workspace: NotebookWorkspace
  notes: StudioNotesProps
  /** `rail`: the collapsible desktop column. `sheet`: a full-width mobile tab. */
  presentation?: 'rail' | 'sheet'
  /**
   * Called before a Journey action that shows something in the chat (a
   * branch, a message, the main thread), so the mobile layout can switch back
   * to the Chat tab. A branch opens under its message there, scrolled into
   * view, or full height when it is nested too deep.
   */
  onShowConversation?: () => void
}

/**
 * The right-hand Studio: the learning journey (stats, outline, map) and the
 * notebook's notes. Opens on Journey once the journey has a deep dive, on
 * Notes before that, until the learner picks a tab.
 */
export function StudioColumn({
  workspace,
  notes,
  presentation = 'rail',
  onShowConversation,
}: StudioColumnProps) {
  const { t } = useTranslation()
  const { studioCollapsed, toggleStudio } = useNotebookColumnsStore()
  const [chosenTab, setChosenTab] = useState<StudioTab | null>(null)
  const { chat, learning } = workspace

  const visibleAsides = learning.asides.filter(
    (aside) => aside.status !== 'discarded'
  )
  const tab: StudioTab =
    chosenTab ?? (visibleAsides.length > 0 ? 'journey' : 'notes')
  const label = t('notebooks.studio')

  const thenShowConversation =
    <Args extends unknown[]>(action: (...args: Args) => void) =>
    (...args: Args) => {
      onShowConversation?.()
      action(...args)
    }

  const body = (
    <Tabs
      value={tab}
      onValueChange={(value) => setChosenTab(value as StudioTab)}
      className="flex h-full min-h-0 flex-1 flex-col gap-0"
    >
      <div className="flex items-center gap-2 border-b px-3 py-2">
        <TabsList
          aria-label={label}
          className="grid min-w-0 flex-1 grid-cols-2"
        >
          <TabsTrigger value="journey" className="gap-1.5">
            <GitBranch className="h-3.5 w-3.5" />
            {/* The short name fits beside Notes in a narrow column. */}
            {t('learningAsides.journeyTab')}
          </TabsTrigger>
          <TabsTrigger value="notes" className="gap-1.5">
            <StickyNote className="h-3.5 w-3.5" />
            {t('common.notes')}
          </TabsTrigger>
        </TabsList>
        {presentation === 'rail' && (
          <CollapseColumnButton onToggle={toggleStudio} label={label} side="right" />
        )}
      </div>
      <TabsContent
        value="journey"
        forceMount
        className="flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden"
      >
        {visibleAsides.length > 0 && <JourneyStats asides={visibleAsides} />}
        <LearningJourneyRail
          messages={chat.messages}
          asides={learning.asides}
          activeAsideId={workspace.shownAsideId}
          onShowMain={thenShowConversation(workspace.showMainThread)}
          onOpenAside={thenShowConversation(workspace.openAside)}
          onNavigateToMessage={thenShowConversation(
            workspace.navigateToMainMessage
          )}
          onDiveIntoQuestion={thenShowConversation(workspace.diveIntoQuestion)}
          onParkQuestion={workspace.parkQuestion}
          sections={learning.sections}
          onRenameSection={workspace.renameSection}
          onTogglePinSection={workspace.togglePinSection}
          onSetIncludeInMain={learning.setIncludeInMain}
          omittedConclusions={chat.learningUpdatesOmitted}
          keptConclusionIds={chat.keptLearningUpdateIds}
        />
      </TabsContent>
      <TabsContent
        value="notes"
        forceMount
        className="min-h-0 flex-1 data-[state=inactive]:hidden"
      >
        <NotesColumn {...notes} embedded />
      </TabsContent>
    </Tabs>
  )

  if (presentation === 'sheet') {
    return (
      <div
        data-presentation="sheet"
        className="flex h-full min-h-0 w-full min-w-0 flex-col rounded-lg border bg-card"
      >
        {body}
      </div>
    )
  }

  return (
    <div
      data-presentation="rail"
      className={cn(
        'hidden min-h-0 shrink-0 flex-col lg:flex',
        studioCollapsed ? 'w-12' : 'w-80 xl:w-96'
      )}
    >
      <CollapsibleColumn
        isCollapsed={studioCollapsed}
        onToggle={toggleStudio}
        collapsedIcon={PanelRight}
        collapsedLabel={label}
      >
        <aside
          aria-label={label}
          className="flex h-full min-h-0 flex-1 flex-col border-l bg-card"
        >
          {body}
        </aside>
      </CollapsibleColumn>
    </div>
  )
}
