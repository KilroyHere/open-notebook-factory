import { QueryClient } from '@tanstack/react-query'
import { isNotFoundError } from '@/lib/utils/error-handler'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes
      gcTime: 10 * 60 * 1000, // 10 minutes
      // Retry transient failures, but never retry 404s: the item was
      // deleted (or never existed) and retrying cannot change that.
      retry: (failureCount, error) => !isNotFoundError(error) && failureCount < 2,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 1,
    },
  },
})

export const QUERY_KEYS = {
  notebooks: ['notebooks'] as const,
  notebook: (id: string) => ['notebooks', id] as const,
  notes: (notebookId?: string) => ['notes', notebookId] as const,
  note: (id: string) => ['notes', id] as const,
  sources: (notebookId?: string) => ['sources', notebookId] as const,
  sourcesInfinite: (notebookId: string) => ['sources', 'infinite', notebookId] as const,
  source: (id: string) => ['sources', id] as const,
  /**
   * A source's insights. Kept outside `['sources']`, so the broad source
   * invalidations do not fetch them again on top of their own refresh.
   */
  sourceInsights: (sourceId: string) => ['insights', 'source', sourceId] as const,
  settings: ['settings'] as const,
  sourceChatSessions: (sourceId: string) => ['source-chat', sourceId, 'sessions'] as const,
  sourceChatSession: (sourceId: string, sessionId: string) => ['source-chat', sourceId, 'sessions', sessionId] as const,
  notebookChatSessions: (notebookId: string) => ['notebook-chat', notebookId, 'sessions'] as const,
  notebookChatSession: (sessionId: string) => ['notebook-chat', 'sessions', sessionId] as const,
  /** Every chat context built for a notebook (one entry per selection and session). */
  notebookChatContext: (notebookId: string) => ['notebook-chat', notebookId, 'context'] as const,
  learningJourney: (notebookId: string, sessionId: string) => ['learning', notebookId, sessionId] as const,
  learningAside: (asideId: string) => ['learning', 'asides', asideId] as const,
  learningResume: (notebookId: string, sessionId: string) => ['learning', notebookId, sessionId, 'resume'] as const,
  podcastEpisodes: ['podcasts', 'episodes'] as const,
  podcastEpisode: (episodeId: string) => ['podcasts', 'episodes', episodeId] as const,
  episodeProfiles: ['podcasts', 'episode-profiles'] as const,
  speakerProfiles: ['podcasts', 'speaker-profiles'] as const,
  languages: ['languages'] as const,
}
