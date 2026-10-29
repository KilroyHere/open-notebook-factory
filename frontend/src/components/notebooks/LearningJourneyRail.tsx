'use client'

import {
  CheckCircle2,
  Circle,
  GitBranch,
  ListTree,
  Map,
  MessageSquare,
  Pause,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CollapsibleColumn,
  createCollapseButton,
} from '@/components/notebooks/CollapsibleColumn'
import {
  LearningAside,
  NotebookChatMessage,
} from '@/lib/types/api'
import { useNotebookColumnsStore } from '@/lib/stores/notebook-columns-store'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'

interface LearningJourneyRailProps {
  messages: NotebookChatMessage[]
  asides: LearningAside[]
  activeAsideId: string | null
  onShowMain: () => void
  onOpenAside: (asideId: string) => void
  onNavigateToMessage: (messageId: string) => void
}

function compact(value: string, limit = 72): string {
  const normalized = value.replace(/\s+/g, ' ').trim()
  return normalized.length > limit
    ? `${normalized.slice(0, limit).trimEnd()}…`
    : normalized
}

interface OutlineTurn {
  anchor: NotebookChatMessage
  messageIds: string[]
  asides: LearningAside[]
}

function buildOutline(
  messages: NotebookChatMessage[],
  asides: LearningAside[]
): { turns: OutlineTurn[]; loose: LearningAside[] } {
  const turns: OutlineTurn[] = []
  for (const message of messages) {
    const current = turns.at(-1)
    if (!current || message.type === 'human') {
      turns.push({ anchor: message, messageIds: [message.id], asides: [] })
    } else {
      current.messageIds.push(message.id)
    }
  }

  const loose: LearningAside[] = []
  for (const aside of asides) {
    const messageId = aside.anchor.message_id
    const turn = messageId
      ? turns.find((item) => item.messageIds.includes(messageId))
      : undefined
    if (turn) {
      turn.asides.push(aside)
    } else {
      loose.push(aside)
    }
  }
  return { turns, loose }
}

function AsideOutlineItem({
  aside,
  active,
  onOpen,
}: {
  aside: LearningAside
  active: boolean
  onOpen: (asideId: string) => void
}) {
  const { t } = useTranslation()
  const update = aside.updates.at(-1)
  return (
    <button
      type="button"
      className={`w-full rounded-md border p-3 text-left ${
        active ? 'border-teal bg-teal-tint' : 'bg-card hover:bg-accent/40'
      }`}
      onClick={() => onOpen(aside.id)}
    >
      <div className="flex items-center gap-2">
        {aside.status === 'resolved' ? (
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-fern" />
        ) : aside.status === 'parked' ? (
          <Pause className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        ) : (
          <Circle className="h-3.5 w-3.5 shrink-0 text-teal" />
        )}
        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {aside.title}
        </span>
        <Badge variant="outline" className="shrink-0">
          {t(`learningAsides.status.${aside.status}`)}
        </Badge>
      </div>
      <p className="mt-1.5 line-clamp-2 text-xs text-muted-foreground">
        {update?.conclusion ?? aside.anchor.content}
      </p>
    </button>
  )
}

export function LearningJourneyRail({
  messages,
  asides,
  activeAsideId,
  onShowMain,
  onOpenAside,
  onNavigateToMessage,
}: LearningJourneyRailProps) {
  const { t } = useTranslation()
  const { journeyCollapsed, toggleJourney } = useNotebookColumnsStore()
  const visibleAsides = asides.filter((aside) => aside.status !== 'discarded')
  const { turns, loose } = buildOutline(messages, visibleAsides)
  const label = t('learningAsides.journey')

  return (
    <div
      className={cn(
        'hidden h-full min-h-0 shrink-0 lg:block',
        journeyCollapsed ? 'w-12' : 'w-72 xl:w-80'
      )}
    >
    <CollapsibleColumn
      isCollapsed={journeyCollapsed}
      onToggle={toggleJourney}
      collapsedIcon={GitBranch}
      collapsedLabel={label}
    >
    <aside className="flex h-full min-h-0 flex-col border-l bg-muted/20">
      <div className="border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-teal" />
          <h2 className="min-w-0 flex-1 text-sm font-semibold">
            {label}
          </h2>
          {createCollapseButton(toggleJourney, label, 'right')}
        </div>
      </div>
      <Tabs defaultValue="outline" className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-4 mt-3 grid grid-cols-2">
          <TabsTrigger value="outline" className="gap-1.5">
            <ListTree className="h-3.5 w-3.5" />
            {t('learningAsides.outline')}
          </TabsTrigger>
          <TabsTrigger value="map" className="gap-1.5">
            <Map className="h-3.5 w-3.5" />
            {t('learningAsides.map')}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="outline" className="min-h-0 flex-1">
          <ScrollArea
            className="h-full"
            viewportClassName="[&>div]:!block [&>div]:!w-full [&>div]:!min-w-0"
          >
            <div className="space-y-4 p-4">
              <Button
                variant={activeAsideId ? 'ghost' : 'secondary'}
                size="sm"
                className="w-full justify-start"
                onClick={onShowMain}
              >
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                {t('learningAsides.mainThread')}
              </Button>

              {turns.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {t('learningAsides.chatOutline')}
                  </p>
                  <div className="space-y-3 border-l pl-3">
                    {turns.map((turn, index) => (
                      <div key={turn.anchor.id}>
                        <button
                          type="button"
                          className="block w-full rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                          onClick={() => onNavigateToMessage(turn.anchor.id)}
                        >
                          <span className="mr-1.5 font-mono text-[10px]">
                            {index + 1}
                          </span>
                          {compact(turn.anchor.content)}
                        </button>
                        {turn.asides.length > 0 && (
                          <div className="mt-1 space-y-2 border-l border-teal/40 pl-3">
                            {turn.asides.map((aside) => (
                              <AsideOutlineItem
                                key={aside.id}
                                aside={aside}
                                active={aside.id === activeAsideId}
                                onOpen={onOpenAside}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loose.length > 0 && (
                <div className="space-y-2">
                  {loose.map((aside) => (
                    <AsideOutlineItem
                      key={aside.id}
                      aside={aside}
                      active={aside.id === activeAsideId}
                      onOpen={onOpenAside}
                    />
                  ))}
                </div>
              )}

              {visibleAsides.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  {t('learningAsides.empty')}
                </p>
              )}
            </div>
          </ScrollArea>
        </TabsContent>

        <TabsContent value="map" className="min-h-0 flex-1">
          <ScrollArea
            className="h-full"
            viewportClassName="[&>div]:!block [&>div]:!w-full [&>div]:!min-w-0"
          >
            <div className="p-4">
              <button
                type="button"
                className="relative z-10 flex w-full items-center gap-2 rounded-md border bg-card p-3 text-left"
                onClick={onShowMain}
              >
                <MessageSquare className="h-4 w-4 text-teal" />
                <span className="text-xs font-semibold">
                  {t('learningAsides.mainThread')}
                </span>
              </button>
              <div className="relative ml-5 border-l border-border pb-2 pl-5 pt-3">
                {visibleAsides.map((aside) => {
                  const update = aside.updates.at(-1)
                  return (
                    <div key={aside.id} className="relative mb-3">
                      <span className="absolute -left-5 top-5 h-px w-5 bg-border" />
                      <button
                        type="button"
                        className={`w-full rounded-md border p-3 text-left ${
                          aside.id === activeAsideId
                            ? 'border-teal bg-teal-tint'
                            : 'bg-card'
                        }`}
                        onClick={() => onOpenAside(aside.id)}
                      >
                        <div className="flex items-center gap-1.5">
                          <GitBranch className="h-3.5 w-3.5 text-teal" />
                          <span className="truncate text-xs font-medium">
                            {aside.title}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[11px] text-muted-foreground">
                          {compact(
                            update?.conclusion ?? aside.anchor.content,
                            90
                          )}
                        </p>
                      </button>
                    </div>
                  )
                })}
              </div>
            </div>
          </ScrollArea>
        </TabsContent>
      </Tabs>
    </aside>
    </CollapsibleColumn>
    </div>
  )
}
