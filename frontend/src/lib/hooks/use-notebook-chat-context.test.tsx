import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { toast } from 'sonner'
import { useNotebookChat } from './use-notebook-chat'
import { useLearningAsides } from './use-learning-asides'
import { chatApi } from '@/lib/api/chat'
import { learningApi } from '@/lib/api/learning'
import { QUERY_KEYS } from '@/lib/api/query-client'
import type {
  BuildContextResponse,
  LearningAside,
  LearningJourney,
  LearningUpdate,
  NoteResponse,
  SourceListResponse,
} from '@/lib/types/api'
import type { ContextSelections } from '@/lib/types/notebook-context'

vi.mock('@/lib/api/chat', () => ({
  chatApi: {
    listSessions: vi.fn(),
    getSession: vi.fn(),
    createSession: vi.fn(),
    updateSession: vi.fn(),
    deleteSession: vi.fn(),
    sendMessage: vi.fn(),
    buildContext: vi.fn(),
  },
}))
vi.mock('@/lib/api/learning', () => ({
  learningApi: {
    getJourney: vi.fn(),
    getResume: vi.fn(),
    getAside: vi.fn(),
    createAside: vi.fn(),
    updateAside: vi.fn(),
    sendMessage: vi.fn(),
    draftResolution: vi.fn(),
    resolveAside: vi.fn(),
    updateLearningUpdate: vi.fn(),
    syncSections: vi.fn(),
    updateSection: vi.fn(),
  },
}))
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const created = '2026-10-29T00:00:00Z'
const NO_NOTES: NoteResponse[] = []
const NO_SOURCES: SourceListResponse[] = []
const NOTHING: ContextSelections = { sources: {}, notes: {} }

function counted(tokens: number): BuildContextResponse {
  return {
    context: { sources: [], notes: [] },
    token_count: tokens,
    char_count: tokens,
    learning_updates_omitted: 0,
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

function update(id: string): LearningUpdate {
  return {
    id: `learning_update:${id}`,
    aside_id: `learning_aside:${id}`,
    conclusion: `Conclusion ${id}`,
    open_questions: [],
    citations: [],
    include_in_main: true,
    version: 1,
    created,
    updated: created,
  }
}

function resolvedAside(id: string): LearningAside {
  return {
    id: `learning_aside:${id}`,
    journey_id: 'learning_journey:1',
    parent_session_id: 'chat_session:1',
    chat_session_id: `chat_session:${id}`,
    title: id,
    status: 'resolved',
    anchor: { type: 'message', content: 'An answer', message_id: 'ai-1' },
    messages: [],
    updates: [update(id)],
    created,
    updated: created,
  }
}

function newClient() {
  // The app's defaults: queries stay fresh for a while, mutations retry once.
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: 5 * 60 * 1000 },
      mutations: { retry: 1 },
    },
  })
}

describe('notebook chat context', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('sends a message even when a recount cancels the count in flight', async () => {
    const journey: LearningJourney = {
      id: 'learning_journey:1',
      notebook_id: 'notebook:1',
      main_session_id: 'chat_session:1',
      status: 'active',
      asides: [resolvedAside('a'), resolvedAside('b')],
      updates: [update('a'), update('b')],
      created,
      updated: created,
    }
    vi.mocked(chatApi.listSessions).mockResolvedValue([
      { id: 'chat_session:1', title: 'Main', notebook_id: 'notebook:1', created, updated: created, message_count: 0 },
    ] as never)
    vi.mocked(chatApi.getSession).mockResolvedValue({ id: 'chat_session:1', title: 'Main', messages: [] } as never)
    vi.mocked(chatApi.sendMessage).mockResolvedValue({ session_id: 'chat_session:1', messages: [] } as never)
    vi.mocked(chatApi.buildContext).mockResolvedValue(counted(100))
    vi.mocked(learningApi.getJourney).mockResolvedValue(journey)
    vi.mocked(learningApi.getResume).mockResolvedValue({} as never)
    vi.mocked(learningApi.updateLearningUpdate).mockImplementation(async (id) => ({
      ...update(id.split(':')[1]),
      include_in_main: false,
    }))

    const client = newClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result } = renderHook(
      () => {
        const chat = useNotebookChat({
          notebookId: 'notebook:1',
          sources: NO_SOURCES,
          notes: NO_NOTES,
          contextSelections: NOTHING,
        })
        const learning = useLearningAsides({
          notebookId: 'notebook:1',
          mainSessionId: chat.currentSessionId,
          buildContext: chat.buildContext,
        })
        return { chat, learning }
      },
      { wrapper }
    )
    await waitFor(() => expect(result.current.chat.currentSessionId).toBe('chat_session:1'))
    await waitFor(() => expect(result.current.learning.asides).toHaveLength(2))
    await waitFor(() => expect(client.isFetching()).toBe(0))

    const firstRecount = deferred<BuildContextResponse>()
    const secondRecount = deferred<BuildContextResponse>()
    vi.mocked(chatApi.buildContext)
      .mockReturnValueOnce(firstRecount.promise)
      .mockReturnValueOnce(secondRecount.promise)
    const callsBefore = vi.mocked(chatApi.buildContext).mock.calls.length

    // Switching conclusion A off recounts the composer's context (slowly).
    act(() => result.current.learning.setIncludeInMain(update('a'), false))
    await waitFor(() =>
      expect(vi.mocked(chatApi.buildContext).mock.calls.length).toBe(callsBefore + 1)
    )
    // A message is sent while that count is on its way...
    let send: Promise<void> = Promise.resolve()
    act(() => {
      send = result.current.chat.sendMessage('What follows from this?')
    })
    await waitFor(() => expect(result.current.chat.messages).toHaveLength(1))
    // ...and switching conclusion B off restarts the count before it returns.
    act(() => result.current.learning.setIncludeInMain(update('b'), false))
    await waitFor(() =>
      expect(vi.mocked(chatApi.buildContext).mock.calls.length).toBeGreaterThanOrEqual(callsBefore + 2)
    )
    vi.mocked(chatApi.buildContext).mockResolvedValue(counted(300))
    await act(async () => {
      secondRecount.resolve(counted(300))
      firstRecount.resolve(counted(200))
      await send
    })

    expect(toast.error).not.toHaveBeenCalled()
    expect(chatApi.sendMessage).toHaveBeenCalledTimes(1)
    expect(chatApi.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'What follows from this?' })
    )
  })

  it('counts again when a source changes while a count is on its way', async () => {
    const source = (updated: string): SourceListResponse => ({
      id: 'source:a',
      title: 'A source',
      asset: null,
      embedded: false,
      embedded_chunks: 0,
      insights_count: 0,
      created,
      updated,
    })
    const selection: ContextSelections = { sources: { 'source:a': 'full' }, notes: {} }
    vi.mocked(chatApi.listSessions).mockResolvedValue([])
    vi.mocked(chatApi.buildContext).mockResolvedValue(counted(100))

    const client = newClient()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    const { result, rerender } = renderHook(
      ({ sources }: { sources: SourceListResponse[] }) =>
        useNotebookChat({
          notebookId: 'notebook:1',
          sources,
          notes: NO_NOTES,
          contextSelections: selection,
        }),
      { wrapper, initialProps: { sources: [source(created)] } }
    )
    await waitFor(() => expect(result.current.tokenCount).toBe(100))

    // A recount (say, after a dive was resolved) reads the source as it was.
    const staleCount = deferred<BuildContextResponse>()
    vi.mocked(chatApi.buildContext)
      .mockReturnValueOnce(staleCount.promise)
      .mockResolvedValue(counted(900))
    void client.invalidateQueries({ queryKey: QUERY_KEYS.notebookChatContext('notebook:1') })
    await waitFor(() => expect(chatApi.buildContext).toHaveBeenCalledTimes(2))

    // The source finishes processing: same selection, new content.
    rerender({ sources: [source('2026-10-29T00:05:00Z')] })
    await act(async () => {
      staleCount.resolve(counted(100))
      await staleCount.promise
    })

    await waitFor(() => expect(result.current.tokenCount).toBe(900))
  })
})
