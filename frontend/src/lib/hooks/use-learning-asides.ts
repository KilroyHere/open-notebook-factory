'use client'

import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { learningApi } from '@/lib/api/learning'
import { QUERY_KEYS } from '@/lib/api/query-client'
import {
  LearningAside,
  LearningAsideAnchor,
  LearningAsideStatus,
  LearningSection,
  ResolveLearningAsideRequest,
} from '@/lib/types/api'

const EMPTY_SECTIONS: LearningSection[] = []
import { useTranslation } from '@/lib/hooks/use-translation'
import { getApiErrorMessage } from '@/lib/utils/error-handler'
import { createAsideTitle } from '@/lib/utils/learning-asides'

interface UseLearningAsidesParams {
  notebookId: string
  mainSessionId: string | null
  buildContext: () => Promise<Record<string, unknown>>
  modelOverride?: string
}

export type CreateAsideInput = LearningAsideAnchor & {
  parentAside?: Pick<LearningAside, 'id' | 'chat_session_id'>
  initialStatus?: 'parked'
}

export function useLearningAsides({
  notebookId,
  mainSessionId,
  buildContext,
  modelOverride,
}: UseLearningAsidesParams) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [activeAsideId, setActiveAsideId] = useState<string | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

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
    enabled: !!activeAsideId && panelOpen,
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
      const { parentAside, initialStatus, ...anchor } = input
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
      setActiveAsideId(null)
      setPanelOpen(true)
    },
    onSuccess: async (aside, input) => {
      queryClient.setQueryData(QUERY_KEYS.learningAside(aside.id), aside)
      if (input.initialStatus !== 'parked') {
        setActiveAsideId(aside.id)
        setPanelOpen(true)
      }
      await refresh(aside.id)
      toast.success(t('learningAsides.created'))
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
    onSuccess: async (aside) => {
      queryClient.setQueryData(QUERY_KEYS.learningAside(aside.id), aside)
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

  const openAside = useCallback((asideId: string) => {
    setActiveAsideId(asideId)
    setPanelOpen(true)
  }, [])

  const openList = useCallback(() => {
    setActiveAsideId(null)
    setPanelOpen(true)
  }, [])

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
    isSending: sendMutation.isPending,
    isResolving: resolveMutation.isPending,
    isAsideLoading: !!activeAsideId && asideQuery.isFetching,
    setPanelOpen,
    openAside,
    openList,
    refreshJourney: () => refresh(),
    createAside: createMutation.mutateAsync,
    sendMessage: sendMutation.mutateAsync,
    draftResolution: draftMutation.mutateAsync,
    resolveAside: resolveMutation.mutateAsync,
    updateStatus: updateMutation.mutateAsync,
    syncSections: syncSectionsMutation.mutateAsync,
    updateSection: updateSectionMutation.mutateAsync,
  }
}
