'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import {
  keepPreviousData,
  useQuery,
  useMutation,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { useTranslation } from '@/lib/hooks/use-translation'
import { chatApi } from '@/lib/api/chat'
import { QUERY_KEYS } from '@/lib/api/query-client'
import {
  BuildContextRequest,
  NotebookChatMessage,
  NotebookChatSessionWithMessages,
  CreateNotebookChatSessionRequest,
  UpdateNotebookChatSessionRequest,
  SourceListResponse,
  NoteResponse
} from '@/lib/types/api'
import type { ContextSelections } from '@/lib/types/notebook-context'
import { isPendingMessage, PENDING_MESSAGE_PREFIX } from '@/lib/utils/chat-messages'

/** A turn's session as the turn shows it: its question last, then the reply. */
interface TurnView {
  sessionId: string
  messages: NotebookChatMessage[]
  /** The model has not answered yet. */
  answering: boolean
}

const NO_MESSAGES: NotebookChatMessage[] = []

interface UseNotebookChatParams {
  notebookId: string
  sources: SourceListResponse[]
  notes: NoteResponse[]
  contextSelections: ContextSelections
}

/** What each source and note sends with a turn, by ID, in the API's terms. */
function buildContextConfig(
  sources: SourceListResponse[],
  notes: NoteResponse[],
  selections: ContextSelections
): BuildContextRequest['context_config'] {
  const config: BuildContextRequest['context_config'] = { sources: {}, notes: {} }
  for (const source of sources) {
    const mode = selections.sources[source.id]
    config.sources[source.id] =
      mode === 'insights' ? 'insights' : mode === 'full' ? 'full content' : 'not in'
  }
  for (const note of notes) {
    config.notes[note.id] =
      selections.notes[note.id] === 'full' ? 'full content' : 'not in'
  }
  return config
}

export function useNotebookChat({ notebookId, sources, notes, contextSelections }: UseNotebookChatParams) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [turnView, setTurnView] = useState<TurnView | null>(null)
  const [isSending, setIsSending] = useState(false)
  // Pending model override for when user changes model before a session exists
  const [pendingModelOverride, setPendingModelOverride] = useState<string | null>(null)

  // Fetch sessions for this notebook
  const {
    data: sessions = [],
    isLoading: loadingSessions,
    refetch: refetchSessions
  } = useQuery({
    queryKey: QUERY_KEYS.notebookChatSessions(notebookId),
    queryFn: () => chatApi.listSessions(notebookId),
    enabled: !!notebookId
  })

  // Fetch current session with messages
  const { data: currentSession } = useQuery({
    queryKey: QUERY_KEYS.notebookChatSession(currentSessionId!),
    queryFn: () => chatApi.getSession(currentSessionId!),
    enabled: !!notebookId && !!currentSessionId
  })

  // The messages on screen are always the selected session's: as the API
  // last returned them, or as a turn of that session has them while the
  // model answers (a read landing meanwhile predates the turn; a new
  // session's first read is empty), and after it until the session is read.
  const messages = useMemo(() => {
    const turnShown =
      turnView?.sessionId === currentSessionId &&
      (turnView.answering || !currentSession)
    if (turnView && turnShown) return turnView.messages
    return currentSession?.messages ?? NO_MESSAGES
  }, [turnView, currentSessionId, currentSession])

  // Auto-select most recent session when sessions are loaded
  useEffect(() => {
    if (sessions.length > 0 && !currentSessionId) {
      // Sessions are sorted by created date desc from API
      const mostRecentSession = sessions[0]
      setCurrentSessionId(mostRecentSession.id)
    }
  }, [sessions, currentSessionId])

  // Create session mutation
  const createSessionMutation = useMutation({
    mutationFn: (data: CreateNotebookChatSessionRequest) =>
      chatApi.createSession(data),
    onSuccess: (newSession) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.notebookChatSessions(notebookId)
      })
      setCurrentSessionId(newSession.id)
      toast.success(t('chat.sessionCreated'))
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }, message?: string };
      toast.error(getApiErrorMessage(error.response?.data?.detail || error.message, (key) => t(key), 'apiErrors.failedToCreateSession'))
    }
  })

  // Update session mutation
  const updateSessionMutation = useMutation({
    mutationFn: ({ sessionId, data }: {
      sessionId: string
      data: UpdateNotebookChatSessionRequest
    }) => chatApi.updateSession(sessionId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.notebookChatSessions(notebookId)
      })
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.notebookChatSession(currentSessionId!)
      })
      toast.success(t('chat.sessionUpdated'))
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }, message?: string };
      toast.error(getApiErrorMessage(error.response?.data?.detail || error.message, (key) => t(key), 'apiErrors.failedToUpdateSession'))
    }
  })

  // Delete session mutation
  const deleteSessionMutation = useMutation({
    mutationFn: (sessionId: string) =>
      chatApi.deleteSession(sessionId),
    onSuccess: (_, deletedId) => {
      queryClient.invalidateQueries({
        queryKey: QUERY_KEYS.notebookChatSessions(notebookId)
      })
      if (currentSessionId === deletedId) {
        setCurrentSessionId(null)
      }
      setTurnView((view) => (view?.sessionId === deletedId ? null : view))
      toast.success(t('chat.sessionDeleted'))
    },
    onError: (err: unknown) => {
      const error = err as { response?: { data?: { detail?: string } }, message?: string };
      toast.error(getApiErrorMessage(error.response?.data?.detail || error.message, (key) => t(key), 'apiErrors.failedToDeleteSession'))
    }
  })

  // The context a turn sends, built by the API from the selected sources and
  // notes plus the session's accepted learning conclusions. Each request has
  // its own cache entry, so a late reply for an older selection never
  // overwrites the counts of the current one, and anything that changes what
  // main chat receives can invalidate QUERY_KEYS.notebookChatContext.
  const contextRequest = useMemo<BuildContextRequest>(
    () => ({
      notebook_id: notebookId,
      session_id: currentSessionId ?? undefined,
      context_config: buildContextConfig(sources, notes, contextSelections),
    }),
    [notebookId, currentSessionId, sources, notes, contextSelections]
  )
  const contextQuery = useMemo(
    () => ({
      queryKey: [...QUERY_KEYS.notebookChatContext(notebookId), contextRequest] as const,
      queryFn: () => chatApi.buildContext(contextRequest),
      retry: false,
      // An entry carries the full text a turn would send; drop it as soon as
      // its selection is no longer the current one.
      gcTime: 0,
    }),
    [notebookId, contextRequest]
  )
  const { data: context } = useQuery({
    ...contextQuery,
    enabled: !!notebookId,
    // Keep showing the last counts while a new selection is counted.
    placeholderData: keepPreviousData,
  })
  // The accepted conclusions that context keeps, so the ones it leaves out
  // can be told apart (`undefined` until a context is counted).
  const keptLearningUpdateIds = useMemo<ReadonlySet<string> | undefined>(() => {
    if (!context) return undefined
    const ids = new Set<string>()
    for (const entry of context.context.learning_updates ?? []) {
      if (typeof entry.id === 'string') ids.add(entry.id)
    }
    return ids
  }, [context])

  // A source or note can change without changing the selection (a source
  // finishes processing, gets an insight, a note is edited): count again.
  const countedContent = useRef({ sources, notes })
  useEffect(() => {
    const previous = countedContent.current
    countedContent.current = { sources, notes }
    if (previous.sources === sources && previous.notes === notes) return
    // A count already on its way read the old content, so it is restarted.
    // (A first count for a new selection has no data yet and is joined, not
    // restarted.)
    void queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.notebookChatContext(notebookId),
    })
  }, [notebookId, notes, queryClient, sources])

  // What a turn sends is always built fresh by its own request. It must not
  // join a count in flight: a recount (a conclusion switched, a dive
  // resolved) cancels that count, and the turn would fail with it. The reply
  // also updates the counts.
  const buildContext = useCallback(async () => {
    const response = await chatApi.buildContext(contextRequest)
    queryClient.setQueryData(contextQuery.queryKey, response)
    return response.context
  }, [contextQuery.queryKey, contextRequest, queryClient])

  // Send message (synchronous, no streaming)
  const sendMessage = useCallback(async (message: string, modelOverride?: string) => {
    let sessionId = currentSessionId

    // Auto-create session if none exists
    if (!sessionId) {
      try {
        const defaultTitle = message.length > 30
          ? `${message.substring(0, 30)}...`
          : message
        const newSession = await chatApi.createSession({
          notebook_id: notebookId,
          title: defaultTitle,
          // Include pending model override when creating session
          model_override: pendingModelOverride ?? undefined
        })
        sessionId = newSession.id
        setCurrentSessionId(sessionId)
        // Clear pending model override now that it's applied to the session
        setPendingModelOverride(null)
        queryClient.invalidateQueries({
          queryKey: QUERY_KEYS.notebookChatSessions(notebookId)
        })
      } catch (err: unknown) {
        const error = err as { response?: { data?: { detail?: string } }, message?: string };
        toast.error(getApiErrorMessage(error.response?.data?.detail || error.message, (key) => t(key), 'apiErrors.failedToCreateSession'))
        return
      }
    }

    // Add user message optimistically
    const userMessage: NotebookChatMessage = {
      id: `${PENDING_MESSAGE_PREFIX}${Date.now()}`,
      type: 'human',
      content: message,
      timestamp: new Date().toISOString()
    }
    const turnSessionId = sessionId
    const sessionKey = QUERY_KEYS.notebookChatSession(turnSessionId)
    // The question shows at once, after what the session shows now. The turn
    // only ever changes its own session's view, whichever session is
    // selected when the reply comes.
    const stored = queryClient.getQueryData<NotebookChatSessionWithMessages>(sessionKey)
    setTurnView((view) => {
      const shown =
        view?.sessionId === turnSessionId && (view.answering || !stored)
          ? view.messages
          : stored?.messages ?? NO_MESSAGES
      return { sessionId: turnSessionId, messages: [...shown, userMessage], answering: true }
    })
    setIsSending(true)

    try {
      // Build context and send message
      const context = await buildContext()
      const response = await chatApi.sendMessage({
        session_id: sessionId,
        message,
        context,
        model_override: modelOverride ?? (currentSession?.model_override ?? undefined)
      })

      // A read of the session still on its way started before this reply
      // and knows nothing of the turn: drop it, and keep the reply in the
      // cache too, so neither puts the earlier conversation back.
      await queryClient.cancelQueries({ queryKey: sessionKey, exact: true })
      queryClient.setQueryData<NotebookChatSessionWithMessages>(
        sessionKey,
        (cached) => (cached ? { ...cached, messages: response.messages } : cached)
      )
      setTurnView({ sessionId: turnSessionId, messages: response.messages, answering: false })
    } catch (err: unknown) {
      const error = err as { response?: { data?: { detail?: string } }, message?: string };
      console.error('Error sending message:', error)
      toast.error(getApiErrorMessage(error.response?.data?.detail || error.message, (key) => t(key), 'apiErrors.failedToSendMessage'))
      // Remove optimistic message on error
      setTurnView((view) =>
        view?.sessionId === turnSessionId
          ? {
              sessionId: turnSessionId,
              messages: view.messages.filter((msg) => !isPendingMessage(msg)),
              answering: false,
            }
          : view
      )
    } finally {
      setIsSending(false)
    }

    // Read the session afresh. A refetch would join a first read still in
    // flight (one with no data yet is not restarted), so cancel that first.
    await queryClient.cancelQueries({ queryKey: sessionKey, exact: true })
    await queryClient.refetchQueries({ queryKey: sessionKey, exact: true })
    // Once read, the session shows as stored (unless another turn started).
    if (queryClient.getQueryData(sessionKey)) {
      setTurnView((view) =>
        view?.sessionId === turnSessionId && !view.answering ? null : view
      )
    }
  }, [
    notebookId,
    currentSessionId,
    currentSession,
    pendingModelOverride,
    buildContext,
    queryClient,
    t
  ])

  // Switch session
  const switchSession = useCallback((sessionId: string) => {
    setCurrentSessionId(sessionId)
  }, [])

  // Create session
  const createSession = useCallback((title?: string) => {
    return createSessionMutation.mutate({
      notebook_id: notebookId,
      title
    })
  }, [createSessionMutation, notebookId])

  // Update session
  const updateSession = useCallback((sessionId: string, data: UpdateNotebookChatSessionRequest) => {
    return updateSessionMutation.mutate({
      sessionId,
      data
    })
  }, [updateSessionMutation])

  // Delete session
  const deleteSession = useCallback((sessionId: string) => {
    return deleteSessionMutation.mutate(sessionId)
  }, [deleteSessionMutation])

  // Set model override - handles both existing sessions and pending state
  const setModelOverride = useCallback((model: string | null) => {
    if (currentSessionId) {
      // Session exists - update it directly
      updateSessionMutation.mutate({
        sessionId: currentSessionId,
        data: { model_override: model }
      })
    } else {
      // No session yet - store as pending
      setPendingModelOverride(model)
    }
  }, [currentSessionId, updateSessionMutation])

  return {
    // State
    sessions,
    currentSession: currentSession || sessions.find(s => s.id === currentSessionId),
    currentSessionId,
    messages,
    isSending,
    loadingSessions,
    tokenCount: context?.token_count ?? 0,
    charCount: context?.char_count ?? 0,
    /** Accepted conclusions the context limit keeps out of main chat. */
    learningUpdatesOmitted: context?.learning_updates_omitted ?? 0,
    /** IDs of the accepted conclusions main chat's counted context keeps. */
    keptLearningUpdateIds,
    pendingModelOverride,

    // Actions
    createSession,
    updateSession,
    deleteSession,
    switchSession,
    sendMessage,
    buildContext,
    setModelOverride,
    refetchSessions
  }
}
