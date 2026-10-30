'use client'

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useNotebookChat } from '@/lib/hooks/use-notebook-chat'
import { useLearningAsides } from '@/lib/hooks/use-learning-asides'
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
  childDiveForQuestion,
  createAsideTitle,
} from '@/lib/utils/learning-asides'

interface UseNotebookWorkspaceParams {
  notebookId: string
  sources: SourceListResponse[]
  notes: NoteResponse[]
  contextSelections: ContextSelections
}

/**
 * The notebook page's conversation state: the main chat, its learning journey,
 * and the actions both the chat column and the Studio column use. The page
 * owns one instance so the two columns read the same queries and the same
 * open-aside state instead of each mounting its own.
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

  const { createAside, openAside, sendMessage, updateStatus, setPanelOpen } =
    learning

  const openAsideFromMessage = useCallback(
    (message: NotebookChatMessage) => {
      void createAside({
        type: 'message',
        message_id: message.id,
        content: message.content,
      }).catch(() => undefined)
    },
    [createAside]
  )

  // Dive in opens the child dive and asks its question right away, so the
  // learner lands on an answer instead of an empty conversation.
  const diveIntoQuestion = (parent: LearningAside, question: string) => {
    const content = question.trim()
    const existing = childDiveForQuestion(learning.asides, parent.id, content)
    if (existing) {
      openAside(existing.id)
      if (existing.messages.length === 0) {
        void sendMessage({ asideId: existing.id, message: content }).catch(
          () => undefined
        )
      }
      return
    }
    void (async () => {
      const aside = await createAside({
        type: 'message',
        content,
        parentAside: parent,
      })
      await sendMessage({ asideId: aside.id, message: content })
    })().catch(() => undefined)
  }

  const parkQuestion = (parent: LearningAside, question: string) => {
    const existing = childDiveForQuestion(learning.asides, parent.id, question)
    if (existing) {
      if (existing.status !== 'parked') {
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

  const showMainThread = () => {
    setPanelOpen(false)
  }

  const navigateToMainMessage = (messageId: string) => {
    setPanelOpen(false)
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
    }
  }, [sources, notes, contextSelections, chat.tokenCount, chat.charCount])

  return {
    notebookId,
    chat,
    learning,
    referenceTitles,
    contextStats,
    openAsideFromMessage,
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
