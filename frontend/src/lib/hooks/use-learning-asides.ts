'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { learningApi } from '@/lib/api/learning'
import { QUERY_KEYS } from '@/lib/api/query-client'
import {
  LearningAside,
  LearningAsideAnchor,
  LearningAsideStatus,
  LearningJourney,
  LearningSection,
  LearningUpdate,
  ResolveLearningAsideRequest,
} from '@/lib/types/api'

const EMPTY_SECTIONS: LearningSection[] = []
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import {
  createAsideTitle,
  journeyWithIncludeInMain,
  withIncludeInMain,
} from '@/lib/utils/learning-asides'

/** A learner switching one conclusion in or out of main chat. */
interface InclusionChange {
  updateId: string
  asideId: string
  includeInMain: boolean
}

const INCLUSION_MUTATION_KEY = ['learning', 'updates', 'include-in-main'] as const

interface UseLearningAsidesParams {
  notebookId: string
  mainSessionId: string | null
  buildContext: () => Promise<Record<string, unknown>>
  modelOverride?: string
}

export type CreateAsideInput = LearningAsideAnchor & {
  parentAside?: Pick<LearningAside, 'id' | 'chat_session_id'>
  initialStatus?: 'parked'
  /**
   * Where the new dive opens: `inline` expands it under its message in the
   * main chat, `full` (the default) shows it in the full-height view.
   */
  presentation?: 'inline' | 'full'
  /** Called once the dive exists and is open, before the journey refetch. */
  onOpened?: (aside: LearningAside) => void
}

interface AsideView {
  /** The open dive: expanded under its message, or shown full height. */
  asideId: string | null
  /** The full-height view (one dive, or the aside list) covers the chat. */
  fullHeight: boolean
}

const CLOSED_VIEW: AsideView = { asideId: null, fullHeight: false }

/** Where an inline dive is being created: under a message or a parent dive. */
export interface CreatingDive {
  messageId?: string
  parentAsideId?: string
}

export function useLearningAsides({
  notebookId,
  mainSessionId,
  buildContext,
  modelOverride,
}: UseLearningAsidesParams) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [view, setView] = useState<AsideView>(CLOSED_VIEW)
  const activeAsideId = view.asideId
  const panelOpen = view.fullHeight
  // A dive belongs to one main conversation: another session closes it.
  useEffect(() => {
    setView(CLOSED_VIEW)
  }, [mainSessionId])
  const [creating, setCreating] = useState<CreatingDive | null>(null)
  // The question on its way to a dive, shown in its transcript until the
  // reply arrives.
  const [pendingSend, setPendingSend] = useState<{
    asideId: string
    message: string
  } | null>(null)

  const journeyKey = useMemo(
    () =>
      mainSessionId
        ? QUERY_KEYS.learningJourney(notebookId, mainSessionId)
        : (['learning', notebookId, 'no-session'] as const),
    [mainSessionId, notebookId]
  )
  const resumeKey = useMemo(
    () =>
      mainSessionId
        ? QUERY_KEYS.learningResume(notebookId, mainSessionId)
        : (['learning', notebookId, 'no-session', 'resume'] as const),
    [mainSessionId, notebookId]
  )

  const journeyQuery = useQuery({
    queryKey: journeyKey,
    queryFn: () => learningApi.getJourney(notebookId, mainSessionId!),
    enabled: !!mainSessionId,
  })

  const resumeQuery = useQuery({
    queryKey: resumeKey,
    queryFn: () => learningApi.getResume(notebookId, mainSessionId!),
    enabled: !!mainSessionId,
  })

  const asideQuery = useQuery({
    queryKey: activeAsideId
      ? QUERY_KEYS.learningAside(activeAsideId)
      : ['learning', 'asides', 'none'],
    queryFn: () => learningApi.getAside(activeAsideId!),
    // The open dive needs its transcript inline as much as full height.
    enabled: !!activeAsideId,
  })

  const refresh = useCallback(
    async (asideId?: string) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: journeyKey }),
        queryClient.invalidateQueries({ queryKey: resumeKey }),
        ...(asideId
          ? [
              queryClient.invalidateQueries({
                queryKey: QUERY_KEYS.learningAside(asideId),
              }),
            ]
          : []),
      ])
    },
    [journeyKey, queryClient, resumeKey]
  )

  const createMutation = useMutation({
    mutationFn: async (input: CreateAsideInput) => {
      if (!mainSessionId) {
        throw new Error('A main chat session is required before opening an aside')
      }
      const { parentAside, initialStatus } = input
      // Only the anchor fields go to the API, not the presentation options.
      const anchor: LearningAsideAnchor = {
        type: input.type,
        content: input.content,
        message_id: input.message_id,
        source_id: input.source_id,
        locator: input.locator,
      }
      const title =
        createAsideTitle(anchor.content) || t('learningAsides.untitled')
      const aside = await learningApi.createAside({
        notebook_id: notebookId,
        parent_session_id: parentAside?.chat_session_id ?? mainSessionId,
        parent_aside_id: parentAside?.id,
        title,
        model_override: modelOverride,
        anchor,
      })
      if (initialStatus === 'parked') {
        return learningApi.updateAside(aside.id, { status: 'parked' })
      }
      return aside
    },
    onMutate: (input) => {
      if (input.initialStatus === 'parked') return
      if (input.presentation === 'inline') {
        setCreating({
          messageId: input.message_id,
          parentAsideId: input.parentAside?.id,
        })
        return
      }
      setView({ asideId: null, fullHeight: true })
    },
    onSuccess: async (aside, input) => {
      queryClient.setQueryData(QUERY_KEYS.learningAside(aside.id), aside)
      setCreating(null)
      if (input.initialStatus !== 'parked') {
        setView({
          asideId: aside.id,
          fullHeight: input.presentation !== 'inline',
        })
        input.onOpened?.(aside)
      }
      await refresh(aside.id)
      toast.success(t('learningAsides.created'))
    },
    onError: (error: unknown) => {
      setCreating(null)
      const apiError = error as {
        response?: { data?: { detail?: string } }
        message?: string
      }
      toast.error(
        getApiErrorMessage(
          apiError.response?.data?.detail || apiError.message,
          (key) => t(key),
          'learningAsides.createFailed'
        )
      )
    },
  })

  const sendMutation = useMutation({
    mutationFn: async ({
      asideId,
      message,
    }: {
      asideId: string
      message: string
    }) => {
      const context = await buildContext()
      return learningApi.sendMessage(asideId, {
        message,
        context,
        model_override: modelOverride,
      })
    },
    onMutate: ({ asideId, message }) => {
      setPendingSend({ asideId, message })
    },
    onSuccess: async (aside) => {
      queryClient.setQueryData(QUERY_KEYS.learningAside(aside.id), aside)
      // The transcript now holds the question and its answer.
      setPendingSend((pending) => (pending?.asideId === aside.id ? null : pending))
      await refresh(aside.id)
    },
    onError: (error: unknown, { asideId }) => {
      setPendingSend((pending) => (pending?.asideId === asideId ? null : pending))
      const apiError = error as {
        response?: { data?: { detail?: string } }
        message?: string
      }
      toast.error(
        getApiErrorMessage(
          apiError.response?.data?.detail || apiError.message,
          (key) => t(key),
          'learningAsides.sendFailed'
        )
      )
    },
  })

  // Read-only: drafts an editable resolution and saves nothing. The panel
  // falls back to a local draft on failure, so there is no error toast.
  const draftMutation = useMutation({
    mutationFn: (asideId: string) =>
      learningApi.draftResolution(asideId, { model_override: modelOverride }),
  })

  // What main chat receives changed: recount the composer's context. Not
  // awaited, since building a large notebook's context can take a while.
  const recountChatContext = useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: QUERY_KEYS.notebookChatContext(notebookId),
    })
  }, [notebookId, queryClient])

  const resolveMutation = useMutation({
    mutationFn: ({
      asideId,
      data,
    }: {
      asideId: string
      data: ResolveLearningAsideRequest
    }) => learningApi.resolveAside(asideId, data),
    onSuccess: async (aside) => {
      queryClient.setQueryData(QUERY_KEYS.learningAside(aside.id), aside)
      recountChatContext()
      await refresh(aside.id)
      toast.success(t('learningAsides.resolvedSuccess'))
    },
    onError: (error: unknown) => {
      const apiError = error as {
        response?: { data?: { detail?: string } }
        message?: string
      }
      toast.error(
        getApiErrorMessage(
          apiError.response?.data?.detail || apiError.message,
          (key) => t(key),
          'learningAsides.resolveFailed'
        )
      )
    },
  })

  const updateMutation = useMutation({
    mutationFn: ({
      asideId,
      status,
    }: {
      asideId: string
      status: Exclude<LearningAsideStatus, 'resolved'>
    }) => learningApi.updateAside(asideId, { status }),
    onSuccess: async (aside) => {
      queryClient.setQueryData(QUERY_KEYS.learningAside(aside.id), aside)
      // A discarded dive is hidden everywhere, so it cannot stay open.
      if (aside.status === 'discarded') {
        setView((current) =>
          current.asideId === aside.id ? CLOSED_VIEW : current
        )
      }
      await refresh(aside.id)
    },
    onError: (error: unknown) => {
      const apiError = error as {
        response?: { data?: { detail?: string } }
        message?: string
      }
      toast.error(
        getApiErrorMessage(
          apiError.response?.data?.detail || apiError.message,
          (key) => t(key),
          'learningAsides.updateFailed'
        )
      )
    },
  })

  // A conclusion's "Use in main chat", wherever it is listed: the journey
  // (Studio's list and counts) and the open dive (its summary).
  const showInclusion = useCallback(
    (updateId: string, asideId: string, include: boolean) => {
      queryClient.setQueryData<LearningJourney | null>(journeyKey, (current) =>
        current ? journeyWithIncludeInMain(current, updateId, include) : current
      )
      queryClient.setQueryData<LearningAside>(
        QUERY_KEYS.learningAside(asideId),
        (current) =>
          current
            ? { ...current, updates: withIncludeInMain(current.updates, updateId, include) }
            : current
      )
    },
    [journeyKey, queryClient]
  )

  const inclusionMutation = useMutation({
    mutationKey: INCLUSION_MUTATION_KEY,
    // One switch at a time, in the order they were clicked, so the server
    // ends on the learner's last click.
    scope: { id: 'learning-update-include-in-main' },
    // A refused switch (a superseded version) fails the same way twice.
    retry: false,
    mutationFn: ({ updateId, includeInMain }: InclusionChange) =>
      learningApi.updateLearningUpdate(updateId, {
        include_in_main: includeInMain,
      }),
    // The switch and Studio's counts move at once; a refetch in flight
    // must not put the old value back.
    onMutate: async ({ updateId, asideId, includeInMain }) => {
      await Promise.all([
        queryClient.cancelQueries({ queryKey: journeyKey, exact: true }),
        queryClient.cancelQueries({
          queryKey: QUERY_KEYS.learningAside(asideId),
          exact: true,
        }),
      ])
      showInclusion(updateId, asideId, includeInMain)
      return { wasIncluded: !includeInMain }
    },
    onError: (error: unknown, { updateId, asideId }, context) => {
      if (context) showInclusion(updateId, asideId, context.wasIncluded)
      const apiError = error as {
        response?: { data?: { detail?: string } }
        message?: string
      }
      toast.error(
        getApiErrorMessage(
          apiError.response?.data?.detail || apiError.message,
          (key) => t(key),
          'learningAsides.includeInMainFailed'
        )
      )
    },
    onSettled: (_update, _error, { asideId }) => {
      // Refetch after the last queued switch only: an earlier reply must
      // not flip back a switch that is still on its way.
      if (queryClient.isMutating({ mutationKey: INCLUSION_MUTATION_KEY }) > 1) {
        return
      }
      recountChatContext()
      void refresh(asideId)
    },
  })
  const { mutate: changeInclusion } = inclusionMutation
  /** Send `update` with every main-chat message, or leave it out. */
  const setIncludeInMain = useCallback(
    (update: Pick<LearningUpdate, 'id' | 'aside_id'>, includeInMain: boolean) =>
      changeInclusion({
        updateId: update.id,
        asideId: update.aside_id,
        includeInMain,
      }),
    [changeInclusion]
  )

  const syncSectionsMutation = useMutation({
    mutationFn: (
      sections: Array<{ start_message_id: string; title: string }>
    ) => {
      if (!mainSessionId) {
        throw new Error('A main chat session is required before naming sections')
      }
      return learningApi.syncSections({
        notebook_id: notebookId,
        main_session_id: mainSessionId,
        sections,
      })
    },
    onSuccess: async () => {
      await refresh()
    },
    onError: (error: unknown) => {
      const apiError = error as {
        response?: { data?: { detail?: string } }
        message?: string
      }
      toast.error(
        getApiErrorMessage(
          apiError.response?.data?.detail || apiError.message,
          (key) => t(key),
          'learningAsides.sectionSaveFailed'
        )
      )
    },
  })

  const updateSectionMutation = useMutation({
    mutationFn: ({
      sectionId,
      title,
      pinned,
    }: {
      sectionId: string
      title?: string
      pinned?: boolean
    }) => learningApi.updateSection(sectionId, { title, pinned }),
    onSuccess: async () => {
      await refresh()
    },
    onError: (error: unknown) => {
      const apiError = error as {
        response?: { data?: { detail?: string } }
        message?: string
      }
      toast.error(
        getApiErrorMessage(
          apiError.response?.data?.detail || apiError.message,
          (key) => t(key),
          'learningAsides.sectionSaveFailed'
        )
      )
    },
  })

  /** Show a dive in the full-height view. */
  const openAside = useCallback((asideId: string) => {
    setView({ asideId, fullHeight: true })
  }, [])

  /** Show a dive as a thread under its message in the main chat. */
  const expandAside = useCallback((asideId: string) => {
    setView({ asideId, fullHeight: false })
  }, [])

  /** Fold an inline dive back to its row. */
  const collapseAside = useCallback((asideId: string) => {
    setView((current) =>
      current.asideId === asideId && !current.fullHeight ? CLOSED_VIEW : current
    )
  }, [])

  const openList = useCallback(() => {
    setView({ asideId: null, fullHeight: true })
  }, [])

  /** Leave the full-height view; an open dive stays open inline. */
  const setPanelOpen = useCallback((open: boolean) => {
    setView((current) => ({ ...current, fullHeight: open }))
  }, [])

  /** No dive open, inline or full height. */
  const closeAside = useCallback(() => setView(CLOSED_VIEW), [])

  const activeAside = useMemo(() => {
    if (asideQuery.data?.id === activeAsideId) return asideQuery.data
    return journeyQuery.data?.asides.find((aside) => aside.id === activeAsideId)
  }, [activeAsideId, asideQuery.data, journeyQuery.data])

  return {
    journey: journeyQuery.data,
    resume: resumeQuery.data,
    asides: journeyQuery.data?.asides ?? [],
    sections: journeyQuery.data?.sections ?? EMPTY_SECTIONS,
    activeAside,
    activeAsideId,
    panelOpen,
    isLoading: journeyQuery.isLoading,
    isCreating: createMutation.isPending,
    /** Where an inline dive is being created, until it exists. */
    creating,
    isSending: sendMutation.isPending,
    /** The dive a question is on its way to, and that question. */
    sendingAsideId: pendingSend?.asideId ?? null,
    pendingMessage: pendingSend?.message ?? null,
    isResolving: resolveMutation.isPending,
    resolvingAsideId: resolveMutation.isPending
      ? resolveMutation.variables?.asideId ?? null
      : null,
    // Only the first load: a refetch keeps showing the transcript it has.
    isAsideLoading:
      !!activeAsideId &&
      asideQuery.isFetching &&
      asideQuery.data?.id !== activeAsideId,
    setPanelOpen,
    openAside,
    expandAside,
    collapseAside,
    closeAside,
    openList,
    refreshJourney: () => refresh(),
    createAside: createMutation.mutateAsync,
    sendMessage: sendMutation.mutateAsync,
    draftResolution: draftMutation.mutateAsync,
    resolveAside: resolveMutation.mutateAsync,
    updateStatus: updateMutation.mutateAsync,
    setIncludeInMain,
    syncSections: syncSectionsMutation.mutateAsync,
    updateSection: updateSectionMutation.mutateAsync,
  }
}
