import apiClient from './client'
import {
  CreateLearningAsideRequest,
  DraftLearningResolutionRequest,
  LearningAside,
  LearningAsideStatus,
  LearningJourney,
  LearningJourneyResume,
  LearningResolutionDraft,
  LearningSection,
  ResolveLearningAsideRequest,
  SendLearningAsideMessageRequest,
} from '@/lib/types/api'

export const learningApi = {
  getJourney: async (notebookId: string, mainSessionId: string) => {
    const response = await apiClient.get<LearningJourney | null>(
      '/learning/journeys',
      {
        params: {
          notebook_id: notebookId,
          main_session_id: mainSessionId,
        },
      }
    )
    return response.data
  },

  getResume: async (notebookId: string, mainSessionId: string) => {
    const response = await apiClient.get<LearningJourneyResume>(
      '/learning/journeys/resume',
      {
        params: {
          notebook_id: notebookId,
          main_session_id: mainSessionId,
        },
      }
    )
    return response.data
  },

  createAside: async (data: CreateLearningAsideRequest) => {
    const response = await apiClient.post<LearningAside>(
      '/learning/asides',
      data
    )
    return response.data
  },

  getAside: async (asideId: string) => {
    const response = await apiClient.get<LearningAside>(
      `/learning/asides/${asideId}`
    )
    return response.data
  },

  updateAside: async (
    asideId: string,
    data: { title?: string; status?: Exclude<LearningAsideStatus, 'resolved'> }
  ) => {
    const response = await apiClient.patch<LearningAside>(
      `/learning/asides/${asideId}`,
      data
    )
    return response.data
  },

  sendMessage: async (
    asideId: string,
    data: SendLearningAsideMessageRequest
  ) => {
    const response = await apiClient.post<LearningAside>(
      `/learning/asides/${asideId}/messages`,
      data
    )
    return response.data
  },

  draftResolution: async (
    asideId: string,
    data: DraftLearningResolutionRequest = {}
  ) => {
    const response = await apiClient.post<LearningResolutionDraft>(
      `/learning/asides/${asideId}/draft-resolution`,
      data
    )
    return response.data
  },

  resolveAside: async (
    asideId: string,
    data: ResolveLearningAsideRequest
  ) => {
    const response = await apiClient.post<LearningAside>(
      `/learning/asides/${asideId}/resolve`,
      data
    )
    return response.data
  },

  syncSections: async (data: {
    notebook_id: string
    main_session_id: string
    sections: Array<{ start_message_id: string; title: string }>
  }) => {
    const response = await apiClient.post<LearningSection[]>(
      '/learning/sections/sync',
      data
    )
    return response.data
  },

  updateSection: async (
    sectionId: string,
    data: { title?: string; pinned?: boolean }
  ) => {
    const response = await apiClient.patch<LearningSection>(
      `/learning/sections/${sectionId}`,
      data
    )
    return response.data
  },
}
