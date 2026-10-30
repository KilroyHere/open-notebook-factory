import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotebookChat } from './use-notebook-chat'
import { chatApi } from '@/lib/api/chat'
import { QUERY_KEYS } from '@/lib/api/query-client'
import type {
  BuildContextResponse,
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
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }))

const created = '2026-10-29T00:00:00Z'
const NO_NOTES: NoteResponse[] = []
const NO_SOURCES: SourceListResponse[] = []
const NOTHING_SELECTED: ContextSelections = { sources: {}, notes: {} }

function source(id: string, updated = created): SourceListResponse {
  return {
    id,
    title: id,
    asset: null,
    embedded: false,
    embedded_chunks: 0,
    insights_count: 0,
    created,
    updated,
  }
}

function contextResponse(
  overrides: Partial<BuildContextResponse> = {}
): BuildContextResponse {
  return {
    context: { sources: [], notes: [] },
    token_count: 120,
    char_count: 480,
    learning_updates_omitted: 0,
    ...overrides,
  }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

interface Props {
  sources: SourceListResponse[]
  selections: ContextSelections
}

function renderChat(initial: Partial<Props> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(
    ({ sources, selections }: Props) =>
      useNotebookChat({
        notebookId: 'notebook:1',
        sources,
        notes: NO_NOTES,
        contextSelections: selections,
      }),
    {
      wrapper,
      initialProps: {
        sources: initial.sources ?? NO_SOURCES,
        selections: initial.selections ?? NOTHING_SELECTED,
      },
    }
  )
  return { ...hook, client }
}

describe('useNotebookChat context', () => {
  beforeEach(() => {
    vi.mocked(chatApi.buildContext).mockReset()
    vi.mocked(chatApi.listSessions).mockResolvedValue([])
    vi.mocked(chatApi.buildContext).mockResolvedValue(contextResponse())
  })

  it('counts what the current selection sends', async () => {
    vi.mocked(chatApi.buildContext).mockResolvedValue(
      contextResponse({ token_count: 1500, char_count: 6000 })
    )
    const selections: ContextSelections = {
      sources: { 'source:a': 'insights', 'source:b': 'off' },
      notes: {},
    }
    const { result } = renderChat({
      sources: [source('source:a'), source('source:b')],
      selections,
    })

    await waitFor(() => expect(result.current.tokenCount).toBe(1500))
    expect(result.current.charCount).toBe(6000)
    expect(chatApi.buildContext).toHaveBeenCalledWith({
      notebook_id: 'notebook:1',
      session_id: undefined,
      context_config: {
        sources: { 'source:a': 'insights', 'source:b': 'not in' },
        notes: {},
      },
    })
  })

  it('says how many accepted conclusions the context limit left out', async () => {
    vi.mocked(chatApi.buildContext).mockResolvedValue(
      contextResponse({ learning_updates_omitted: 2 })
    )
    const { result } = renderChat()

    await waitFor(() => expect(result.current.learningUpdatesOmitted).toBe(2))
  })

  it('counts none left out when the reply does not say', async () => {
    const older: Partial<BuildContextResponse> = contextResponse()
    delete older.learning_updates_omitted
    vi.mocked(chatApi.buildContext).mockResolvedValue(older as BuildContextResponse)
    const { result } = renderChat()

    await waitFor(() => expect(result.current.tokenCount).toBe(120))
    expect(result.current.learningUpdatesOmitted).toBe(0)
  })

  it('recounts when the chat context is invalidated', async () => {
    const { result, client } = renderChat()
    await waitFor(() => expect(result.current.tokenCount).toBe(120))

    vi.mocked(chatApi.buildContext).mockResolvedValue(
      contextResponse({ token_count: 1700 })
    )
    await act(() =>
      client.invalidateQueries({
        queryKey: QUERY_KEYS.notebookChatContext('notebook:1'),
      })
    )

    await waitFor(() => expect(result.current.tokenCount).toBe(1700))
  })

  it('builds a fresh context for every message it sends', async () => {
    const { result } = renderChat()
    await waitFor(() => expect(chatApi.buildContext).toHaveBeenCalledTimes(1))

    vi.mocked(chatApi.buildContext).mockResolvedValue(
      contextResponse({
        context: { sources: [{ id: 'source:a' }], notes: [] },
        token_count: 900,
      })
    )
    let context: unknown
    await act(async () => {
      context = await result.current.buildContext()
    })

    // Cached counts are not enough for a turn: it is rebuilt every time.
    expect(chatApi.buildContext).toHaveBeenCalledTimes(2)
    expect(context).toEqual({ sources: [{ id: 'source:a' }], notes: [] })
    expect(result.current.tokenCount).toBe(900)
  })

  it('recounts when a source changes but the selection does not', async () => {
    const selections: ContextSelections = {
      sources: { 'source:a': 'full' },
      notes: {},
    }
    const { rerender } = renderChat({
      sources: [source('source:a')],
      selections,
    })
    await waitFor(() => expect(chatApi.buildContext).toHaveBeenCalledTimes(1))

    // The source finished processing: same ID and mode, new content.
    rerender({
      sources: [source('source:a', '2026-10-29T00:05:00Z')],
      selections,
    })

    await waitFor(() => expect(chatApi.buildContext).toHaveBeenCalledTimes(2))
  })

  it('keeps the counts of the current selection when an older reply comes late', async () => {
    const older = deferred<BuildContextResponse>()
    vi.mocked(chatApi.buildContext)
      .mockReturnValueOnce(older.promise)
      .mockResolvedValue(contextResponse({ token_count: 200 }))
    const sources = [source('source:a')]
    const { result, rerender } = renderChat({
      sources,
      selections: { sources: { 'source:a': 'full' }, notes: {} },
    })

    rerender({
      sources,
      selections: { sources: { 'source:a': 'insights' }, notes: {} },
    })
    await waitFor(() => expect(result.current.tokenCount).toBe(200))
    await act(async () => {
      older.resolve(contextResponse({ token_count: 999 }))
      await older.promise
    })

    expect(result.current.tokenCount).toBe(200)
  })
})
