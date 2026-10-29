'use client'

import type { ComponentProps } from 'react'
import { FileText, Library, StickyNote } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CollapsibleColumn,
  createCollapseButton,
} from '@/components/notebooks/CollapsibleColumn'
import { useNotebookColumnsStore } from '@/lib/stores/notebook-columns-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import { NotesColumn } from './NotesColumn'
import { SourcesColumn } from './SourcesColumn'

type SourcesRailProps = Omit<
  ComponentProps<typeof SourcesColumn>,
  'embedded' | 'allowCollapse'
>
type NotesRailProps = Omit<ComponentProps<typeof NotesColumn>, 'embedded'>

interface KnowledgeRailProps {
  sources: SourcesRailProps
  notes: NotesRailProps
}

export function KnowledgeRail({ sources, notes }: KnowledgeRailProps) {
  const { t } = useTranslation()
  const { knowledgeCollapsed, toggleKnowledge } = useNotebookColumnsStore()
  const label = t('notebooks.knowledge')

  return (
    <div
      className={cn(
        'hidden min-h-0 shrink-0 flex-col lg:flex',
        knowledgeCollapsed ? 'w-12' : 'w-80 xl:w-96'
      )}
    >
      <CollapsibleColumn
        isCollapsed={knowledgeCollapsed}
        onToggle={toggleKnowledge}
        collapsedIcon={Library}
        collapsedLabel={label}
      >
        <div className="flex h-full min-h-0 flex-1 flex-col border-r bg-card">
          <Tabs
            defaultValue="sources"
            className="h-full min-h-0 gap-0"
          >
            <div className="flex items-center gap-2 border-b px-3 py-2">
              <TabsList className="grid min-w-0 flex-1 grid-cols-2">
                <TabsTrigger value="sources" className="gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  {t('navigation.sources')}
                </TabsTrigger>
                <TabsTrigger value="notes" className="gap-1.5">
                  <StickyNote className="h-3.5 w-3.5" />
                  {t('common.notes')}
                </TabsTrigger>
              </TabsList>
              {createCollapseButton(toggleKnowledge, label)}
            </div>
            <TabsContent
              value="sources"
              forceMount
              className="min-h-0 data-[state=inactive]:hidden"
            >
              <SourcesColumn {...sources} embedded allowCollapse={false} />
            </TabsContent>
            <TabsContent
              value="notes"
              forceMount
              className="min-h-0 data-[state=inactive]:hidden"
            >
              <NotesColumn {...notes} embedded />
            </TabsContent>
          </Tabs>
        </div>
      </CollapsibleColumn>
    </div>
  )
}
