import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotebookChat } from './use-notebook-chat'
import { chatApi } from '@/lib/api/chat'
import { QUERY_KEYS } from '@/lib/api/query-client'
import type {
  BuildContextResponse,
  NotebookChatMessage,
  NotebookChatSessionWithMessages,
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

  it('knows which accepted conclusions the counted context keeps', async () => {
    let finish: (response: BuildContextResponse) => void = () => undefined
    vi.mocked(chatApi.buildContext).mockReturnValue(
      new Promise((resolve) => {
        finish = resolve
      })
    )
    const { result } = renderChat()
    // Nothing is known before the first count.
    expect(result.current.keptLearningUpdateIds).toBeUndefined()

    finish(
      contextResponse({
        context: {
          sources: [],
          notes: [],
          learning_updates: [
            { id: 'learning_update:a', conclusion: 'A' },
            { id: 'learning_update:b', conclusion: 'B' },
          ],
        },
        learning_updates_omitted: 1,
      })
    )

    await waitFor(() =>
      expect(result.current.keptLearningUpdateIds).toEqual(
        new Set(['learning_update:a', 'learning_update:b'])
      )
    )
  })

  it("knows no kept conclusions while the last session's count stands in for a new one", async () => {
    const A = {
      id: 'chat_session:A',
      title: 'A',
      notebook_id: 'notebook:1',
      created,
      updated: created,
      message_count: 0,
      model_override: null,
    }
    const B = { ...A, id: 'chat_session:B', title: 'B' }
    vi.mocked(chatApi.listSessions).mockResolvedValue([A, B])
    vi.mocked(chatApi.getSession).mockImplementation(async (id: string) => ({
      ...(id === A.id ? A : B),
      messages: [],
    }))
    const countB = deferred<BuildContextResponse>()
    vi.mocked(chatApi.buildContext).mockImplementation(async (request) =>
      request.session_id === B.id
        ? countB.promise
        : contextResponse({
            context: {
              sources: [],
              notes: [],
              learning_updates: [{ id: 'learning_update:a1', conclusion: 'A1' }],
            },
            learning_updates_omitted: 2,
          })
    )
    const { result } = renderChat()
    await waitFor(() =>
      expect(result.current.keptLearningUpdateIds).toEqual(new Set(['learning_update:a1']))
    )

    act(() => result.current.switchSession(B.id))
    await waitFor(() =>
      expect(chatApi.buildContext).toHaveBeenCalledWith(
        expect.objectContaining({ session_id: B.id })
      )
    )

    // A's counts still show while B is counted, but A's kept conclusions say
    // nothing about B's: none can be marked as left out yet.
    expect(result.current.currentSessionId).toBe(B.id)
    expect(result.current.keptLearningUpdateIds).toBeUndefined()

    await act(async () => {
      countB.resolve(
        contextResponse({
          context: {
            sources: [],
            notes: [],
            learning_updates: [{ id: 'learning_update:b1', conclusion: 'B1' }],
          },
        })
      )
      await countB.promise
    })
    await waitFor(() =>
      expect(result.current.keptLearningUpdateIds).toEqual(new Set(['learning_update:b1']))
    )
  })

  it("counts no conclusions left out while another session's count stands in", async () => {
    const A = {
      id: 'chat_session:A',
      title: 'A',
      notebook_id: 'notebook:1',
      created,
      updated: created,
      message_count: 0,
      model_override: null,
    }
    const B = { ...A, id: 'chat_session:B', title: 'B' }
    vi.mocked(chatApi.listSessions).mockResolvedValue([A, B])
    vi.mocked(chatApi.getSession).mockImplementation(async (id: string) => ({
      ...(id === A.id ? A : B),
      messages: [],
    }))
    const countB = deferred<BuildContextResponse>()
    vi.mocked(chatApi.buildContext).mockImplementation(async (request) =>
      request.session_id === B.id
        ? countB.promise
        : contextResponse({ learning_updates_omitted: 2 })
    )
    const { result } = renderChat()
    await waitFor(() => expect(result.current.learningUpdatesOmitted).toBe(2))

    act(() => result.current.switchSession(B.id))
    await waitFor(() =>
      expect(chatApi.buildContext).toHaveBeenCalledWith(
        expect.objectContaining({ session_id: B.id })
      )
    )

    // A's two left-out conclusions are not B's.
    expect(result.current.learningUpdatesOmitted).toBe(0)
    await act(async () => {
      countB.resolve(contextResponse({ learning_updates_omitted: 1 }))
      await countB.promise
    })
    await waitFor(() => expect(result.current.learningUpdatesOmitted).toBe(1))
  })

  it('keeps none when the context carries no conclusions', async () => {
    const { result } = renderChat()

    await waitFor(() => expect(result.current.tokenCount).toBe(120))
    expect(result.current.keptLearningUpdateIds).toEqual(new Set())
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
    // The reply reaches the counts through the query cache, which notifies
    // its observers on its own schedule.
    await waitFor(() => expect(result.current.tokenCount).toBe(900))
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

describe('useNotebookChat messages', () => {
  const session = {
    id: 'chat_session:new',
    title: 'Why is the ELBO a bound?',
    notebook_id: 'notebook:1',
    created,
    updated: created,
    message_count: 0,
    model_override: null,
  }
  const question: NotebookChatMessage = {
    id: 'human:1',
    type: 'human',
    content: 'Why is the ELBO a bound?',
  }
  const reply: NotebookChatMessage = {
    id: 'ai:1',
    type: 'ai',
    content: 'Jensen: the log of an expectation bounds the expected log.',
  }
  const turn = { session_id: session.id, messages: [question, reply] }

  beforeEach(() => {
    vi.mocked(chatApi.getSession).mockReset()
    vi.mocked(chatApi.sendMessage).mockReset()
    vi.mocked(chatApi.listSessions).mockResolvedValue([])
    vi.mocked(chatApi.createSession).mockResolvedValue(session)
    vi.mocked(chatApi.buildContext).mockResolvedValue(contextResponse())
  })

  it("keeps a new session's first question on screen while its reply is on its way", async () => {
    const firstRead = deferred<NotebookChatSessionWithMessages>()
    const answer = deferred<typeof turn>()
    vi.mocked(chatApi.getSession)
      .mockReturnValueOnce(firstRead.promise)
      .mockResolvedValue({ ...session, messages: [question, reply] })
    vi.mocked(chatApi.sendMessage).mockReturnValue(answer.promise)
    const { result } = renderChat()

    let sending: Promise<unknown> = Promise.resolve()
    await act(async () => {
      sending = result.current.sendMessage(question.content)
    })
    await waitFor(() => expect(chatApi.getSession).toHaveBeenCalledTimes(1))
    // The new session's first read comes back while the model is still
    // answering, with nothing stored yet.
    await act(async () => {
      firstRead.resolve({ ...session, messages: [] })
      await firstRead.promise
    })
    await waitFor(() =>
      expect(result.current.currentSession).toMatchObject({ messages: [] })
    )

    expect(result.current.messages.map((message) => message.content)).toEqual([
      question.content,
    ])

    await act(async () => {
      answer.resolve(turn)
      await sending
    })
    expect(result.current.messages).toEqual([question, reply])
  })

  it('shows the session switched to while a reply for another one is on its way, and after it', async () => {
    const A = { ...session, id: 'chat_session:A', title: 'A' }
    const B = { ...session, id: 'chat_session:B', title: 'B' }
    const stored: Record<string, NotebookChatMessage[]> = {
      [A.id]: [
        { id: 'human:a', type: 'human', content: 'question in A' },
        { id: 'ai:a', type: 'ai', content: 'answer in A' },
      ],
      [B.id]: [
        { id: 'human:b', type: 'human', content: 'question in B' },
        { id: 'ai:b', type: 'ai', content: 'answer in B' },
      ],
    }
    vi.mocked(chatApi.listSessions).mockResolvedValue([A, B])
    vi.mocked(chatApi.getSession).mockImplementation(async (id: string) => ({
      ...(id === A.id ? A : B),
      messages: stored[id],
    }))
    const answer = deferred<typeof turn>()
    vi.mocked(chatApi.sendMessage).mockReturnValue(answer.promise)
    const { result } = renderChat()
    await waitFor(() => expect(result.current.messages).toEqual(stored[A.id]))

    let sending: Promise<unknown> = Promise.resolve()
    await act(async () => {
      sending = result.current.sendMessage('follow-up in A')
    })
    await waitFor(() => expect(chatApi.sendMessage).toHaveBeenCalled())

    // The learner opens B while A's reply is on its way.
    act(() => result.current.switchSession(B.id))
    await waitFor(() => expect(result.current.messages).toEqual(stored[B.id]))

    stored[A.id] = [
      ...stored[A.id],
      { id: 'human:a2', type: 'human', content: 'follow-up in A' },
      { id: 'ai:a2', type: 'ai', content: 'reply in A' },
    ]
    await act(async () => {
      answer.resolve({ session_id: A.id, messages: stored[A.id] })
      await sending
    })

    // The reply belongs to A: B stays on screen...
    expect(result.current.currentSessionId).toBe(B.id)
    expect(result.current.messages).toEqual(stored[B.id])
    // ...and A shows it when the learner comes back.
    act(() => result.current.switchSession(A.id))
    await waitFor(() => expect(result.current.messages).toEqual(stored[A.id]))
  })

  describe('with two sessions', () => {
    const A = { ...session, id: 'chat_session:A', title: 'A' }
    const B = { ...session, id: 'chat_session:B', title: 'B' }
    let stored: Record<string, NotebookChatMessage[]>
    const contents = (messages: NotebookChatMessage[]) =>
      messages.map((message) => message.content)

    beforeEach(() => {
      stored = {
        [A.id]: [
          { id: 'human:a', type: 'human', content: 'question in A' },
          { id: 'ai:a', type: 'ai', content: 'answer in A' },
        ],
        [B.id]: [
          { id: 'human:b', type: 'human', content: 'question in B' },
          { id: 'ai:b', type: 'ai', content: 'answer in B' },
        ],
      }
      vi.mocked(chatApi.listSessions).mockResolvedValue([A, B])
      vi.mocked(chatApi.getSession).mockImplementation(async (id: string) => ({
        ...(id === A.id ? A : B),
        messages: stored[id],
      }))
    })

    it("shows a session's history with a question sent before the session was first read", async () => {
      const firstReadOfB = deferred<NotebookChatSessionWithMessages>()
      let readsOfB = 0
      vi.mocked(chatApi.getSession).mockImplementation(async (id: string) => {
        if (id !== B.id) return { ...A, messages: stored[A.id] }
        readsOfB += 1
        return readsOfB === 1 ? firstReadOfB.promise : { ...B, messages: stored[B.id] }
      })
      const answer = deferred<typeof turn>()
      vi.mocked(chatApi.sendMessage).mockReturnValue(answer.promise)
      const { result } = renderChat()
      await waitFor(() => expect(result.current.messages).toEqual(stored[A.id]))

      act(() => result.current.switchSession(B.id))
      // Nothing to show yet: B is being read.
      expect(result.current.messages).toEqual([])
      expect(result.current.isLoadingMessages).toBe(true)
      let sending: Promise<unknown> = Promise.resolve()
      await act(async () => {
        sending = result.current.sendMessage('follow-up in B')
      })
      expect(contents(result.current.messages)).toEqual(['follow-up in B'])
      expect(result.current.isLoadingMessages).toBe(false)

      // B's read lands while the model answers: its history shows, the
      // question after it.
      await act(async () => {
        firstReadOfB.resolve({ ...B, messages: stored[B.id] })
        await firstReadOfB.promise
      })
      await waitFor(() =>
        expect(contents(result.current.messages)).toEqual([
          'question in B',
          'answer in B',
          'follow-up in B',
        ])
      )

      stored[B.id] = [
        ...stored[B.id],
        { id: 'human:b2', type: 'human', content: 'follow-up in B' },
        { id: 'ai:b2', type: 'ai', content: 'reply in B' },
      ]
      await act(async () => {
        answer.resolve({ session_id: B.id, messages: stored[B.id] })
        await sending
      })
      expect(contents(result.current.messages)).toEqual([
        'question in B',
        'answer in B',
        'follow-up in B',
        'reply in B',
      ])
    })

    it('shows the question once when a read during its turn already has it', async () => {
      const answer = deferred<typeof turn>()
      vi.mocked(chatApi.sendMessage).mockReturnValue(answer.promise)
      const { result, client } = renderChat()
      await waitFor(() => expect(result.current.messages).toEqual(stored[A.id]))
      let sending: Promise<unknown> = Promise.resolve()
      await act(async () => {
        sending = result.current.sendMessage('follow-up in A')
      })

      // The API stores the question before the model answers; a read now has it.
      stored[A.id] = [...stored[A.id], { id: 'human:a2', type: 'human', content: 'follow-up in A' }]
      await act(async () => {
        await client.refetchQueries({ queryKey: QUERY_KEYS.notebookChatSession(A.id) })
      })

      expect(contents(result.current.messages)).toEqual([
        'question in A',
        'answer in A',
        'follow-up in A',
      ])
      await act(async () => {
        answer.resolve({ session_id: A.id, messages: [...stored[A.id], { id: 'ai:a2', type: 'ai', content: 'reply in A' }] })
        await sending
      })
    })

    it('opens the next session after the selected one is deleted, not the deleted one again', async () => {
      // A is the most recent session, and selected; after the delete the list
      // is read again, slowly.
      const rereadList = deferred<typeof A[]>()
      let listReads = 0
      vi.mocked(chatApi.listSessions).mockImplementation(async () => {
        listReads += 1
        return listReads === 1 ? [A, B] : rereadList.promise
      })
      vi.mocked(chatApi.deleteSession).mockResolvedValue(undefined)
      const { result } = renderChat()
      await waitFor(() => expect(result.current.messages).toEqual(stored[A.id]))

      await act(async () => {
        result.current.deleteSession(A.id)
      })

      await waitFor(() => expect(result.current.currentSessionId).toBe(B.id))
      expect(result.current.sessions.map((item) => item.id)).toEqual([B.id])
      await waitFor(() => expect(result.current.messages).toEqual(stored[B.id]))
      await act(async () => {
        rereadList.resolve([B])
        await rereadList.promise
      })
      expect(result.current.currentSessionId).toBe(B.id)
    })

    it('says a reply is on its way only in the session it was asked in', async () => {
      const answer = deferred<typeof turn>()
      vi.mocked(chatApi.sendMessage).mockReturnValue(answer.promise)
      const { result } = renderChat()
      await waitFor(() => expect(result.current.messages).toEqual(stored[A.id]))
      let sending: Promise<unknown> = Promise.resolve()
      await act(async () => {
        sending = result.current.sendMessage('follow-up in A')
      })
      expect(result.current.isSending).toBe(true)

      act(() => result.current.switchSession(B.id))
      await waitFor(() => expect(result.current.messages).toEqual(stored[B.id]))
      expect(result.current.isSending).toBe(false)

      act(() => result.current.switchSession(A.id))
      expect(result.current.isSending).toBe(true)
      await act(async () => {
        answer.resolve({ session_id: A.id, messages: stored[A.id] })
        await sending
      })
      expect(result.current.isSending).toBe(false)
    })

    it('keeps each session\'s question when another session asks while it is answered', async () => {
      const answerA = deferred<typeof turn>()
      const answerB = deferred<typeof turn>()
      vi.mocked(chatApi.sendMessage)
        .mockReturnValueOnce(answerA.promise)
        .mockReturnValueOnce(answerB.promise)
      const { result } = renderChat()
      await waitFor(() => expect(result.current.messages).toEqual(stored[A.id]))

      let sendingA: Promise<unknown> = Promise.resolve()
      await act(async () => {
        sendingA = result.current.sendMessage('follow-up in A')
      })
      act(() => result.current.switchSession(B.id))
      await waitFor(() => expect(result.current.messages).toEqual(stored[B.id]))
      let sendingB: Promise<unknown> = Promise.resolve()
      await act(async () => {
        sendingB = result.current.sendMessage('follow-up in B')
      })
      expect(contents(result.current.messages)).toEqual([
        'question in B',
        'answer in B',
        'follow-up in B',
      ])

      // A still shows its own question while both are answered...
      act(() => result.current.switchSession(A.id))
      expect(contents(result.current.messages)).toEqual([
        'question in A',
        'answer in A',
        'follow-up in A',
      ])
      expect(result.current.isSending).toBe(true)

      // ...and each reply lands in its own session.
      stored[A.id] = [...stored[A.id], { id: 'human:a2', type: 'human', content: 'follow-up in A' }, { id: 'ai:a2', type: 'ai', content: 'reply in A' }]
      stored[B.id] = [...stored[B.id], { id: 'human:b2', type: 'human', content: 'follow-up in B' }, { id: 'ai:b2', type: 'ai', content: 'reply in B' }]
      await act(async () => {
        answerB.resolve({ session_id: B.id, messages: stored[B.id] })
        answerA.resolve({ session_id: A.id, messages: stored[A.id] })
        await Promise.all([sendingA, sendingB])
      })
      expect(result.current.messages).toEqual(stored[A.id])
      act(() => result.current.switchSession(B.id))
      await waitFor(() => expect(result.current.messages).toEqual(stored[B.id]))
    })
  })

  it('says whether a question got its answer', async () => {
    vi.mocked(chatApi.listSessions).mockResolvedValue([session])
    vi.mocked(chatApi.getSession).mockResolvedValue({ ...session, messages: [] })
    const { result } = renderChat()
    await waitFor(() => expect(result.current.currentSessionId).toBe(session.id))

    vi.mocked(chatApi.sendMessage).mockResolvedValueOnce(turn)
    let answered: boolean | undefined
    await act(async () => {
      answered = await result.current.sendMessage(question.content)
    })
    expect(answered).toBe(true)

    vi.mocked(chatApi.sendMessage).mockRejectedValueOnce(new Error('Network Error'))
    await act(async () => {
      answered = await result.current.sendMessage('A question that fails')
    })
    expect(answered).toBe(false)
  })

  it('keeps the reply when a read sent before it comes back after it, and reads the session again', async () => {
    const earlierRead = deferred<NotebookChatSessionWithMessages>()
    vi.mocked(chatApi.getSession)
      .mockReturnValueOnce(earlierRead.promise)
      .mockResolvedValue({ ...session, messages: [question, reply] })
    vi.mocked(chatApi.sendMessage).mockResolvedValue(turn)
    const { result } = renderChat()

    let sending: Promise<unknown> = Promise.resolve()
    await act(async () => {
      sending = result.current.sendMessage(question.content)
    })
    await waitFor(() => expect(result.current.messages).toEqual([question, reply]))

    // The session's first read was sent before the turn was stored and
    // comes back last, with the conversation as it was then.
    await act(async () => {
      earlierRead.resolve({ ...session, messages: [] })
      await sending
    })

    // After the turn the session is read afresh, not taken from that read.
    expect(chatApi.getSession).toHaveBeenCalledTimes(2)
    await waitFor(() =>
      expect(result.current.currentSession).toMatchObject({
        messages: [question, reply],
      })
    )
    expect(result.current.messages).toEqual([question, reply])
  })
})
