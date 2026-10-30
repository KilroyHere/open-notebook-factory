'use client'

import { useRef, useState } from 'react'
import {
  CheckCircle2,
  Circle,
  GitBranch,
  ListTree,
  Map as MapIcon,
  MessageSquare,
  Pause,
  Pencil,
  Pin,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { LearningQuestionList } from '@/components/notebooks/LearningThreadLinks'
import {
  LearningAside,
  LearningSection,
  NotebookChatMessage,
} from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import {
  childDiveForQuestion,
  toPlainTextPreview,
} from '@/lib/utils/learning-asides'

interface LearningJourneyRailProps {
  messages: NotebookChatMessage[]
  asides: LearningAside[]
  activeAsideId: string | null
  onShowMain: () => void
  onOpenAside: (asideId: string) => void
  onNavigateToMessage: (messageId: string) => void
  onDiveIntoQuestion?: (parent: LearningAside, question: string) => void
  onParkQuestion?: (parent: LearningAside, question: string) => void
  sections?: LearningSection[]
  onRenameSection?: (sectionId: string, title: string) => void
  onTogglePinSection?: (sectionId: string, pinned: boolean) => void
}

function rootAsides(asides: LearningAside[]): LearningAside[] {
  const ids = new Set(asides.map((aside) => aside.id))
  return asides.filter(
    (aside) => !aside.parent_aside_id || !ids.has(aside.parent_aside_id)
  )
}

function childAsides(asides: LearningAside[], parentId: string): LearningAside[] {
  return asides.filter((aside) => aside.parent_aside_id === parentId)
}

function compact(value: string, limit = 72): string {
  const normalized = toPlainTextPreview(value)
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

function latestUpdate(aside: LearningAside) {
  return aside.updates.at(-1)
}

function mergedUpdate(aside: LearningAside) {
  return [...aside.updates].reverse().find((update) => update.applied_message_id)
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
  const update = latestUpdate(aside)
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
        {toPlainTextPreview(update?.conclusion ?? aside.anchor.content)}
      </p>
    </button>
  )
}

function OpenQuestions({
  aside,
  asides,
  onOpenAside,
  onDiveIntoQuestion,
  onParkQuestion,
}: {
  aside: LearningAside
  asides: LearningAside[]
  onOpenAside: (asideId: string) => void
  onDiveIntoQuestion?: (parent: LearningAside, question: string) => void
  onParkQuestion?: (parent: LearningAside, question: string) => void
}) {
  if (aside.status !== 'resolved') return null
  const questions = (latestUpdate(aside)?.open_questions ?? []).filter(
    (question) =>
      question.trim() && !childDiveForQuestion(asides, aside.id, question)
  )
  if (questions.length === 0) return null
  return (
    <div className="px-1">
      <LearningQuestionList
        questions={questions}
        asides={asides}
        parentAside={aside}
        onOpenAside={onOpenAside}
        onDiveIntoQuestion={onDiveIntoQuestion}
        onParkQuestion={onParkQuestion}
      />
    </div>
  )
}

function AsideOutlineGroup({
  asides,
  allAsides,
  activeAsideId,
  onOpenAside,
  onDiveIntoQuestion,
  onParkQuestion,
  depth = 0,
}: {
  asides: LearningAside[]
  allAsides: LearningAside[]
  activeAsideId: string | null
  onOpenAside: (asideId: string) => void
  onDiveIntoQuestion?: (parent: LearningAside, question: string) => void
  onParkQuestion?: (parent: LearningAside, question: string) => void
  depth?: number
}) {
  const { t } = useTranslation()
  const parked = asides.filter((aside) => aside.status === 'parked')
  const nested = asides.filter((aside) => aside.status !== 'parked')
  if (asides.length === 0 || depth > 8) return null

  const branch = (aside: LearningAside) => {
    const children = childAsides(allAsides, aside.id)
    return (
      <div key={aside.id} className="space-y-1.5">
        <AsideOutlineItem
          aside={aside}
          active={aside.id === activeAsideId}
          onOpen={onOpenAside}
        />
        <OpenQuestions
          aside={aside}
          asides={allAsides}
          onOpenAside={onOpenAside}
          onDiveIntoQuestion={onDiveIntoQuestion}
          onParkQuestion={onParkQuestion}
        />
        {children.length > 0 && (
          <AsideOutlineGroup
            asides={children}
            allAsides={allAsides}
            activeAsideId={activeAsideId}
            onOpenAside={onOpenAside}
            onDiveIntoQuestion={onDiveIntoQuestion}
            onParkQuestion={onParkQuestion}
            depth={depth + 1}
          />
        )}
      </div>
    )
  }

  return (
    <div className="mt-1 space-y-2 border-l border-teal/40 pl-3">
      {nested.map(branch)}
      {parked.length > 0 && (
        <div className="space-y-2 rounded-md border bg-card p-2">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {t('learningAsides.status.parked')}
          </p>
          {parked.map(branch)}
        </div>
      )}
    </div>
  )
}

function MapBranch({
  aside,
  asides,
  activeAsideId,
  onOpenAside,
  onNavigateToMessage,
  depth = 0,
}: {
  aside: LearningAside
  asides: LearningAside[]
  activeAsideId: string | null
  onOpenAside: (asideId: string) => void
  onNavigateToMessage: (messageId: string) => void
  depth?: number
}) {
  const { t } = useTranslation()
  const latest = latestUpdate(aside)
  const appliedMessageId = mergedUpdate(aside)?.applied_message_id
  const showResolution = aside.status === 'resolved' && Boolean(latest)
  const children = depth > 8 ? [] : childAsides(asides, aside.id)
  return (
    <div className="relative mb-3">
      <span className="absolute -left-5 top-5 h-px w-5 bg-border" />
      <button
        type="button"
        className={`w-full rounded-md border p-3 text-left ${
          aside.id === activeAsideId ? 'border-teal bg-teal-tint' : 'bg-card'
        }`}
        onClick={() => onOpenAside(aside.id)}
      >
        <div className="flex items-center gap-1.5">
          <GitBranch className="h-3.5 w-3.5 text-teal" />
          <span className="truncate text-xs font-medium">{aside.title}</span>
        </div>
      </button>
      {(showResolution || appliedMessageId || children.length > 0) && (
        <div className="ml-4 mt-2 space-y-2 border-l border-border pl-3">
          {showResolution && latest && (
            <button
              type="button"
              className="w-full rounded-md border bg-card p-3 text-left"
              onClick={() => onOpenAside(aside.id)}
            >
              <div className="flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-fern" />
                <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                  {t('learningAsides.summary')}
                </span>
              </div>
              <p className="mt-1 line-clamp-3 text-[11px] text-muted-foreground">
                {toPlainTextPreview(latest.conclusion)}
              </p>
            </button>
          )}
          {appliedMessageId && (
            <button
              type="button"
              className="w-full rounded-md border bg-card p-3 text-left text-xs font-medium"
              onClick={() => onNavigateToMessage(appliedMessageId)}
            >
              {t('learningAsides.viewMergedResponse')}
            </button>
          )}
          {children.length > 0 && (
            <div className="relative ml-5 border-l border-border pl-5 pt-1">
              {children.map((child) => (
                <MapBranch
                  key={child.id}
                  aside={child}
                  asides={asides}
                  activeAsideId={activeAsideId}
                  onOpenAside={onOpenAside}
                  onNavigateToMessage={onNavigateToMessage}
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface OutlineGroup {
  key: string
  index: number
  turn: OutlineTurn
  section?: LearningSection
}

function groupOutlineTurns(
  turns: OutlineTurn[],
  sections: LearningSection[]
): OutlineGroup[] {
  const byMessage = new Map(
    sections.map((section) => [section.start_message_id, section])
  )
  const groups = turns.map((turn, index) => ({
    key: byMessage.get(turn.anchor.id)?.id ?? turn.anchor.id,
    index,
    turn,
    section: byMessage.get(turn.anchor.id),
  }))
  return [
    ...groups.filter((group) => group.section?.pinned),
    ...groups.filter((group) => !group.section?.pinned),
  ]
}

function TurnHeading({
  index,
  turn,
  section,
  onNavigateToMessage,
  onRenameSection,
  onTogglePinSection,
}: {
  index: number
  turn: OutlineTurn
  section?: LearningSection
  onNavigateToMessage: (messageId: string) => void
  onRenameSection?: (sectionId: string, title: string) => void
  onTogglePinSection?: (sectionId: string, pinned: boolean) => void
}) {
  const { t } = useTranslation()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(section?.title ?? '')
  const committed = useRef(false)
  const heading = section?.title ?? compact(turn.anchor.content)

  const commit = () => {
    if (committed.current) return
    committed.current = true
    const next = draft.trim()
    setEditing(false)
    if (!section || !next || next === section.title) return
    onRenameSection?.(section.id, next)
  }

  if (editing && section) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          commit()
        }}
      >
        <input
          aria-label={t('learningAsides.sectionTitlePlaceholder')}
          className="w-full rounded-sm border bg-card px-2 py-1.5 text-xs"
          value={draft}
          autoFocus
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
        />
      </form>
    )
  }

  return (
    <div className="flex items-start gap-1">
      <button
        type="button"
        className="block min-w-0 flex-1 rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        onClick={() => onNavigateToMessage(turn.anchor.id)}
      >
        <span className="mr-1.5 font-mono text-[10px]">{index + 1}</span>
        {heading}
        {section?.pinned && (
          <Pin className="ml-1 inline h-3 w-3 text-teal" aria-hidden />
        )}
      </button>
      {section && onTogglePinSection && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2"
          aria-label={
            section.pinned
              ? t('learningAsides.unpinSection')
              : t('learningAsides.pinSection')
          }
          onClick={() => onTogglePinSection(section.id, !section.pinned)}
        >
          <Pin className="h-3.5 w-3.5" />
        </Button>
      )}
      {section && onRenameSection && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 shrink-0 px-2"
          aria-label={t('learningAsides.renameSection')}
          onClick={() => {
            committed.current = false
            setDraft(section.title)
            setEditing(true)
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  )
}

function JourneyMap({
  asides,
  activeAsideId,
  onShowMain,
  onOpenAside,
  onNavigateToMessage,
}: {
  asides: LearningAside[]
  activeAsideId: string | null
  onShowMain: () => void
  onOpenAside: (asideId: string) => void
  onNavigateToMessage: (messageId: string) => void
}) {
  const { t } = useTranslation()
  const roots = rootAsides(asides)
  return (
    <div>
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
        {roots.map((aside) => (
          <MapBranch
            key={aside.id}
            aside={aside}
            asides={asides}
            activeAsideId={activeAsideId}
            onOpenAside={onOpenAside}
            onNavigateToMessage={onNavigateToMessage}
          />
        ))}
      </div>
    </div>
  )
}

export function LearningJourneyRail({
  messages,
  asides,
  activeAsideId,
  onShowMain,
  onOpenAside,
  onNavigateToMessage,
  onDiveIntoQuestion,
  onParkQuestion,
  sections = [],
  onRenameSection,
  onTogglePinSection,
}: LearningJourneyRailProps) {
  const { t } = useTranslation()
  const [tab, setTab] = useState('outline')
  const [mapExpanded, setMapExpanded] = useState(false)

  const visibleAsides = asides.filter((aside) => aside.status !== 'discarded')
  const roots = rootAsides(visibleAsides)
  const { turns, loose } = buildOutline(messages, roots)
  const outlineGroups = groupOutlineTurns(turns, sections)

  const closeMap = () => {
    setMapExpanded(false)
    setTab('outline')
  }

  const map = (
    <JourneyMap
      asides={visibleAsides}
      activeAsideId={activeAsideId}
      onShowMain={onShowMain}
      onOpenAside={onOpenAside}
      onNavigateToMessage={onNavigateToMessage}
    />
  )

  // The Studio column owns the frame (title, collapse); this fills it.
  return (
    <div
      data-journey
      className="relative flex h-full min-h-0 w-full min-w-0 flex-1 flex-col"
    >
      {mapExpanded && (
        <div className="absolute inset-0 z-20 flex min-h-0 flex-col bg-card">
          <div className="flex items-center gap-2 border-b px-4 py-3">
            <MapIcon className="h-4 w-4 shrink-0 text-teal" />
            <h2 className="min-w-0 flex-1 text-sm font-semibold">
              {t('learningAsides.map')}
            </h2>
            <Button type="button" variant="ghost" size="sm" onClick={closeMap}>
              <ListTree className="h-3.5 w-3.5" />
              {t('learningAsides.outline')}
            </Button>
          </div>
          <ScrollArea
            className="min-h-0 flex-1"
            viewportClassName="[&>div]:!block [&>div]:!w-full [&>div]:!min-w-0"
          >
            <div className="p-4">{map}</div>
          </ScrollArea>
        </div>
      )}
      <Tabs
        value={tab}
        onValueChange={setTab}
        className="flex min-h-0 flex-1 flex-col"
      >
        <TabsList className="mx-4 mt-3 grid grid-cols-2">
          <TabsTrigger value="outline" className="gap-1.5">
            <ListTree className="h-3.5 w-3.5" />
            {t('learningAsides.outline')}
          </TabsTrigger>
          <TabsTrigger value="map" className="gap-1.5">
            <MapIcon className="h-3.5 w-3.5" />
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
                type="button"
                variant={activeAsideId ? 'ghost' : 'secondary'}
                size="sm"
                className="w-full justify-start"
                onClick={onShowMain}
              >
                <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                {t('learningAsides.mainThread')}
              </Button>

              {outlineGroups.length > 0 && (
                <div>
                  <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {t('learningAsides.chatOutline')}
                  </p>
                  <div className="space-y-3 border-l pl-3">
                    {outlineGroups.map((group) => (
                      <div key={group.key}>
                        <TurnHeading
                          index={group.index}
                          turn={group.turn}
                          section={group.section}
                          onNavigateToMessage={onNavigateToMessage}
                          onRenameSection={onRenameSection}
                          onTogglePinSection={onTogglePinSection}
                        />
                        <AsideOutlineGroup
                          asides={group.turn.asides}
                          allAsides={visibleAsides}
                          activeAsideId={activeAsideId}
                          onOpenAside={onOpenAside}
                          onDiveIntoQuestion={onDiveIntoQuestion}
                          onParkQuestion={onParkQuestion}
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {loose.length > 0 && (
                <AsideOutlineGroup
                  asides={loose}
                  allAsides={visibleAsides}
                  activeAsideId={activeAsideId}
                  onOpenAside={onOpenAside}
                  onDiveIntoQuestion={onDiveIntoQuestion}
                  onParkQuestion={onParkQuestion}
                />
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
          <div className="flex h-full min-h-0 flex-col">
            <div className="px-4 pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => setMapExpanded(true)}
              >
                <MapIcon className="h-3.5 w-3.5" />
                {t('learningAsides.map')}
              </Button>
            </div>
            <ScrollArea
              className="min-h-0 flex-1"
              viewportClassName="[&>div]:!block [&>div]:!w-full [&>div]:!min-w-0"
            >
              {!mapExpanded && <div className="p-4">{map}</div>}
            </ScrollArea>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  )
}
