'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNotebookChat } from '@/lib/hooks/use-notebook-chat'
import {
  useLearningAsides,
  type CreateAsideInput,
} from '@/lib/hooks/use-learning-asides'
import type { ContextSelections } from '@/lib/types/notebook-context'
import type {
  LearningAside,
  NotebookChatMessage,
  NoteResponse,
  SourceListResponse,
} from '@/lib/types/api'
import { focusChatMessage } from '@/lib/utils/chat-navigation'
import {
  buildReferenceTitles,
  canOpenInline,
  childDiveForQuestion,
  createAsideTitle,
  diveLineage,
  INLINE_DIVE_MAX_DEPTH,
  MAX_ANCHOR_CHARS,
  PASSAGE_LOCATOR,
  withAside,
} from '@/lib/utils/learning-asides'

interface UseNotebookWorkspaceParams {
  notebookId: string
  sources: SourceListResponse[]
  notes: NoteResponse[]
  contextSelections: ContextSelections
}

/**
 * Where to take the learner once a dive's thread is on screen. The thread
 * that matches `asideId` handles it and reports back with `onAttended`.
 */
export interface DiveAttention {
  asideId: string
  /** Bring the thread into view: its row near the top, or just into view. */
  scroll: 'start' | 'nearest' | null
  /** Put the cursor in its question box. */
  focus: boolean
}

// Moving the cursor into a dive on touch screens would open the keyboard
// over what the learner wanted to read, so only pointer devices get it
// when they open an existing dive.
function prefersComposerFocus(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: fine)').matches === true
  )
}

/** A selected passage as a dive's anchor: trimmed, and no longer than the backend keeps. */
function passageAnchorContent(passage: string): string {
  return passage.trim().slice(0, MAX_ANCHOR_CHARS).trim()
}

/**
 * The notebook page's conversation state: the main chat, its learning journey,
 * and the actions both the chat column and the Studio column use. The page
 * owns one instance so the two columns read the same queries and the same
 * open-aside state instead of each mounting its own.
 *
 * A dive opens as a thread under the message it came from when it can (see
 * `canOpenInline`); a dive nested too deep, or whose message is not in this
 * chat, opens in the full-height view instead.
 */
export function useNotebookWorkspace({
  notebookId,
  sources,
  notes,
  contextSelections,
}: UseNotebookWorkspaceParams) {
  const chat = useNotebookChat({
    notebookId,
    sources,
    notes,
    contextSelections,
  })
  const learning = useLearningAsides({
    notebookId,
    mainSessionId: chat.currentSessionId,
    buildContext: chat.buildContext,
    modelOverride:
      chat.currentSession?.model_override ??
      chat.pendingModelOverride ??
      undefined,
  })

  const {
    createAside,
    sendMessage,
    updateStatus,
    expandAside,
    collapseAside,
    closeAside,
    setPanelOpen,
  } = learning

  // The asides the chat can show: the journey's, plus a dive just created
  // that the next journey refetch will list.
  const knownAsides = useMemo(
    () => withAside(learning.asides, learning.activeAside),
    [learning.asides, learning.activeAside]
  )
  // Dives hang off assistant answers, the only messages that offer them.
  const answerIds = useMemo(
    () =>
      new Set(
        chat.messages
          .filter((message) => message.type === 'ai')
          .map((message) => message.id)
      ),
    [chat.messages]
  )
  const isInline = (aside: LearningAside) =>
    canOpenInline(aside, knownAsides, answerIds)

  const [attention, setAttention] = useState<DiveAttention | null>(null)
  const onAttended = useCallback((request: DiveAttention) => {
    setAttention((current) => (current === request ? null : current))
  }, [])

  /** The dive expanded under its message, if any. */
  const expandedDiveId =
    !learning.panelOpen && learning.activeAside && isInline(learning.activeAside)
      ? learning.activeAside.id
      : null
  /** The dive on screen, inline or full height, for the Journey to mark. */
  const shownAsideId = learning.panelOpen
    ? learning.activeAsideId
    : expandedDiveId

  /** Show a dive in the full-height view. */
  const openAsideFull = learning.openAside

  /**
   * Open a dive where it lives: expanded under its message and scrolled into
   * view, or full height when it cannot be shown inline.
   */
  const openAside = (asideId: string) => {
    const aside = knownAsides.find((item) => item.id === asideId)
    if (aside && isInline(aside)) {
      expandAside(asideId)
      setAttention({ asideId, scroll: 'start', focus: prefersComposerFocus() })
    } else {
      openAsideFull(asideId)
    }
  }

  /** Expand a dive from its own row, which is already on screen. */
  const expandDive = useCallback(
    (asideId: string) => {
      expandAside(asideId)
      setAttention({ asideId, scroll: null, focus: prefersComposerFocus() })
    },
    [expandAside]
  )

  // A new dive the learner is about to question: show it and focus its box.
  const createInline = (input: CreateAsideInput) => {
    void createAside({
      ...input,
      presentation: 'inline',
      onOpened: (aside) =>
        setAttention({ asideId: aside.id, scroll: 'nearest', focus: true }),
    }).catch(() => undefined)
  }

  const openAsideFromMessage = (message: NotebookChatMessage) => {
    createInline({
      type: 'message',
      message_id: message.id,
      content: message.content,
    })
  }

  // "Go deeper" on a selected passage: a dive about that passage, under the
  // message it was selected in, titled from the passage.
  const openAsideFromSelection = (
    message: NotebookChatMessage,
    passage: string
  ) => {
    const content = passageAnchorContent(passage)
    if (!content) return
    createInline({
      type: 'message',
      message_id: message.id,
      content,
      locator: PASSAGE_LOCATOR,
    })
  }

  // A dive started inside `parent` nests under its parent's thread, unless
  // the learner is in the full-height view or the nesting would go too deep.
  const childNestsInline = (parent: LearningAside) => {
    if (learning.panelOpen || !isInline(parent)) return false
    const lineage = diveLineage(parent, knownAsides)
    return lineage !== null && lineage.depth + 1 <= INLINE_DIVE_MAX_DEPTH
  }

  // "Go deeper" on a passage selected in a dive's answer: a dive about that
  // passage, nested under the dive and anchored to that answer, a message of
  // the dive's own conversation. It opens where Dive in would open a child,
  // with the cursor in its question box, since the learner asks next.
  const openAsideFromDiveSelection = (
    parent: LearningAside,
    message: NotebookChatMessage,
    passage: string
  ) => {
    const content = passageAnchorContent(passage)
    if (!content) return
    const inline = childNestsInline(parent)
    void createAside({
      type: 'message',
      message_id: message.id,
      content,
      locator: PASSAGE_LOCATOR,
      parentAside: parent,
      presentation: inline ? 'inline' : 'full',
      onOpened: (aside) =>
        setAttention({
          asideId: aside.id,
          scroll: inline ? 'nearest' : null,
          focus: true,
        }),
    }).catch(() => undefined)
  }

  // Dive in opens the child dive and asks its question right away, so the
  // learner lands on an answer instead of an empty conversation. The child
  // nests under its parent's thread when it can (childNestsInline).
  const diveIntoQuestion = (parent: LearningAside, question: string) => {
    const content = question.trim()
    const fullHeight = learning.panelOpen
    const existing = childDiveForQuestion(knownAsides, parent.id, content)
    if (existing) {
      if (fullHeight) openAsideFull(existing.id)
      else openAside(existing.id)
      if (existing.messages.length === 0) {
        void sendMessage({ asideId: existing.id, message: content }).catch(
          () => undefined
        )
      }
      return
    }
    const inline = childNestsInline(parent)
    void (async () => {
      const aside = await createAside({
        type: 'message',
        content,
        parentAside: parent,
        presentation: inline ? 'inline' : 'full',
        onOpened: inline
          ? (child) =>
              setAttention({ asideId: child.id, scroll: 'nearest', focus: false })
          : undefined,
      })
      await sendMessage({ asideId: aside.id, message: content })
    })().catch(() => undefined)
  }

  const parkQuestion = (parent: LearningAside, question: string) => {
    const existing = childDiveForQuestion(knownAsides, parent.id, question)
    if (existing) {
      // Only an active dive can be parked: a parked one already is, and the
      // API refuses to change a resolved one.
      if (existing.status === 'active') {
        void updateStatus({ asideId: existing.id, status: 'parked' }).catch(
          () => undefined
        )
      }
      return
    }
    void createAside({
      type: 'message',
      content: question.trim(),
      parentAside: parent,
      initialStatus: 'parked',
    }).catch(() => undefined)
  }

  // Every human turn becomes a named outline section on the journey.
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

  /**
   * Leave the full-height view for the chat. The dive stays open under its
   * message when it can be shown there.
   */
  const exitFullHeight = () => {
    const active = learning.activeAside
    if (active && isInline(active)) setPanelOpen(false)
    else closeAside()
  }

  /** The main thread on its own: no dive open, inline or full height. */
  const showMainThread = () => {
    closeAside()
  }

  const navigateToMainMessage = (messageId: string) => {
    if (learning.panelOpen) exitFullHeight()
    window.setTimeout(() => focusChatMessage(messageId), 0)
  }

  const sendMainMessage = async (message: string, modelOverride?: string) => {
    await chat.sendMessage(message, modelOverride)
    await learning.refreshJourney()
  }

  // Evidence buttons name the cited source or note instead of its record ID.
  const referenceTitles = useMemo(
    () => buildReferenceTitles(sources, notes),
    [sources, notes]
  )

  const contextStats = useMemo(() => {
    let sourcesInsights = 0
    let sourcesFull = 0
    let notesCount = 0
    for (const source of sources) {
      const mode = contextSelections.sources[source.id]
      if (mode === 'insights') sourcesInsights++
      else if (mode === 'full') sourcesFull++
    }
    for (const note of notes) {
      if (contextSelections.notes[note.id] === 'full') notesCount++
    }
    return {
      sourcesInsights,
      sourcesFull,
      notesCount,
      tokenCount: chat.tokenCount,
      charCount: chat.charCount,
      learningUpdatesOmitted: chat.learningUpdatesOmitted,
    }
  }, [
    sources,
    notes,
    contextSelections,
    chat.tokenCount,
    chat.charCount,
    chat.learningUpdatesOmitted,
  ])

  return {
    notebookId,
    chat,
    learning,
    referenceTitles,
    contextStats,
    knownAsides,
    expandedDiveId,
    shownAsideId,
    attention,
    onAttended,
    openAside,
    openAsideFull,
    expandDive,
    collapseDive: collapseAside,
    exitFullHeight,
    openAsideFromMessage,
    openAsideFromSelection,
    openAsideFromDiveSelection,
    diveIntoQuestion,
    parkQuestion,
    renameSection,
    togglePinSection,
    showMainThread,
    navigateToMainMessage,
    sendMainMessage,
  }
}

export type NotebookWorkspace = ReturnType<typeof useNotebookWorkspace>
