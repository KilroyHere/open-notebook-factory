import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotebookWorkspace } from './use-notebook-workspace'
import { chatApi } from '@/lib/api/chat'
import { learningApi } from '@/lib/api/learning'
import type { LearningJourney, NotebookChatMessage } from '@/lib/types/api'

// The workspace with the real chat and learning hooks; only the API is
// mocked. Each test switches between two chat sessions.

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
const A = {
  id: 'chat_session:A',
  title: 'A',
  notebook_id: 'notebook:1',
  created,
  updated: created,
  message_count: 2,
  model_override: null,
}
const B = { ...A, id: 'chat_session:B', title: 'B' }

function message(id: string, type: 'human' | 'ai', content: string): NotebookChatMessage {
  return { id, type, content }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  const promise = new Promise<T>((done) => {
    resolve = done
  })
  return { promise, resolve }
}

describe('useNotebookWorkspace across chat sessions', () => {
  let stored: Record<string, NotebookChatMessage[]>

  // A session's journey, with a section for its first question (named on
  // an earlier visit).
  function journeyOf(sessionId: string): LearningJourney {
    const id = `learning_journey:${sessionId}`
    const [question] = stored[sessionId]
    return {
      id,
      notebook_id: 'notebook:1',
      main_session_id: sessionId,
      active_session_id: sessionId,
      objective: null,
      status: 'active',
      asides: [],
      updates: [],
      sections: [
        {
          id: `learning_section:${sessionId}`,
          journey_id: id,
          title: question.content,
          pinned: false,
          start_message_id: question.id,
          created,
          updated: created,
        },
      ],
      created,
      updated: created,
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    stored = {
      [A.id]: [
        message('human:a', 'human', 'Why is the ELBO a bound?'),
        message('ai:a', 'ai', 'Jensen.'),
      ],
      [B.id]: [
        message('human:b', 'human', 'What is a prior?'),
        message('ai:b', 'ai', 'A belief before the data.'),
      ],
    }
    vi.mocked(chatApi.listSessions).mockResolvedValue([A, B])
    vi.mocked(chatApi.getSession).mockImplementation(async (id: string) => ({
      ...(id === A.id ? A : B),
      messages: stored[id],
    }))
    vi.mocked(chatApi.buildContext).mockResolvedValue({
      context: { sources: [], notes: [] },
      token_count: 1,
      char_count: 1,
      learning_updates_omitted: 0,
    })
    vi.mocked(learningApi.getJourney).mockImplementation(async (_notebook, sessionId) =>
      journeyOf(sessionId)
    )
    vi.mocked(learningApi.getResume).mockResolvedValue({
      accepted_findings: [],
      open_aside_ids: [],
      recommended_action: 'start_aside',
    })
    vi.mocked(learningApi.syncSections).mockResolvedValue([])
  })

  function renderWorkspace() {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    )
    return renderHook(
      () =>
        useNotebookWorkspace({
          notebookId: 'notebook:1',
          sources: [],
          notes: [],
          contextSelections: { sources: {}, notes: {} },
        }),
      { wrapper }
    )
  }

  /** Sections named in one session's journey after another session's message. */
  function misplacedSections() {
    return vi.mocked(learningApi.syncSections).mock.calls.flatMap(([request]) =>
      request.sections
        .filter(
          (section) =>
            !stored[request.main_session_id].some(
              (stored) => stored.id === section.start_message_id
            )
        )
        .map((section) => `${section.start_message_id} in ${request.main_session_id}`)
    )
  }

  it("names no section of a session after the previous session's question", async () => {
    const { result } = renderWorkspace()
    await waitFor(() => expect(result.current.chat.messages).toEqual(stored[A.id]))
    await waitFor(() => expect(result.current.learning.sections).toHaveLength(1))

    act(() => result.current.chat.switchSession(B.id))
    await waitFor(() => expect(result.current.chat.messages).toEqual(stored[B.id]))
    await waitFor(() =>
      expect(result.current.learning.journey?.main_session_id).toBe(B.id)
    )

    expect(misplacedSections()).toEqual([])
  })

  it('names the question of a turn in its own session, not in the one switched to', async () => {
    const reply = deferred<{ session_id: string; messages: NotebookChatMessage[] }>()
    vi.mocked(chatApi.sendMessage).mockReturnValue(reply.promise)
    const { result } = renderWorkspace()
    await waitFor(() => expect(result.current.chat.messages).toEqual(stored[A.id]))
    await waitFor(() => expect(result.current.learning.sections).toHaveLength(1))

    let sending: Promise<void> = Promise.resolve()
    await act(async () => {
      sending = result.current.sendMainMessage('Is the bound tight?')
    })
    await waitFor(() => expect(chatApi.sendMessage).toHaveBeenCalled())
    act(() => result.current.chat.switchSession(B.id))

    stored[A.id] = [
      ...stored[A.id],
      message('human:a2', 'human', 'Is the bound tight?'),
      message('ai:a2', 'ai', 'When the posterior is exact.'),
    ]
    await act(async () => {
      reply.resolve({ session_id: A.id, messages: stored[A.id] })
      await sending
    })
    await waitFor(() =>
      expect(result.current.learning.journey?.main_session_id).toBe(B.id)
    )

    expect(result.current.chat.messages).toEqual(stored[B.id])
    expect(misplacedSections()).toEqual([])

    // Back in A, the question gets its section in A's journey.
    act(() => result.current.chat.switchSession(A.id))
    await waitFor(() => expect(result.current.chat.messages).toEqual(stored[A.id]))
    await waitFor(() =>
      expect(learningApi.syncSections).toHaveBeenCalledWith(
        expect.objectContaining({
          main_session_id: A.id,
          sections: [{ start_message_id: 'human:a2', title: 'Is the bound tight?' }],
        })
      )
    )
    expect(misplacedSections()).toEqual([])
  })
})
