import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { toast } from 'sonner'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLearningAsides } from './use-learning-asides'
import { learningApi } from '@/lib/api/learning'
import { QUERY_KEYS } from '@/lib/api/query-client'
import type {
  LearningAside,
  LearningJourney,
  LearningUpdate,
} from '@/lib/types/api'

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
const aside: LearningAside = {
  id: 'learning_aside:one',
  journey_id: 'learning_journey:one',
  parent_session_id: 'chat_session:main',
  chat_session_id: 'chat_session:one',
  title: 'Why a bound',
  status: 'active',
  anchor: { type: 'message', message_id: 'ai:1', content: 'Answer' },
  messages: [],
  updates: [],
  created,
  updated: created,
}

function renderAsides() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  )
  const hook = renderHook(
    ({ mainSessionId }: { mainSessionId: string }) =>
      useLearningAsides({
        notebookId: 'notebook:1',
        mainSessionId,
        buildContext: async () => ({}),
      }),
    { wrapper, initialProps: { mainSessionId: 'chat_session:main' } }
  )
  return { ...hook, client }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined
  let reject: (error: unknown) => void = () => undefined
  const promise = new Promise<T>((done, fail) => {
    resolve = done
    reject = fail
  })
  return { promise, resolve, reject }
}

const conclusion: LearningUpdate = {
  id: 'learning_update:one',
  aside_id: 'learning_aside:resolved',
  conclusion: 'Jensen gives a lower bound because log is concave.',
  open_questions: [],
  citations: [],
  include_in_main: true,
  version: 1,
  created,
  updated: created,
}
const resolvedAside: LearningAside = {
  ...aside,
  id: 'learning_aside:resolved',
  status: 'resolved',
  updates: [conclusion],
}
const journey: LearningJourney = {
  id: 'learning_journey:one',
  notebook_id: 'notebook:1',
  main_session_id: 'chat_session:main',
  status: 'active',
  asides: [resolvedAside],
  updates: [conclusion],
  created,
  updated: created,
}
const listedInclusion = (result: {
  current: ReturnType<typeof useLearningAsides>
}) => result.current.asides[0]?.updates[0]?.include_in_main

describe('useLearningAsides', () => {
  beforeEach(() => {
    vi.mocked(learningApi.getJourney).mockResolvedValue(null)
    vi.mocked(learningApi.getResume).mockResolvedValue({
      accepted_findings: [],
      open_aside_ids: [],
      recommended_action: 'continue_main',
    })
    vi.mocked(learningApi.getAside).mockResolvedValue(aside)
    vi.mocked(learningApi.createAside).mockResolvedValue(aside)
  })

  it('creates an inline dive without covering the chat', async () => {
    let finish: (value: LearningAside) => void = () => undefined
    vi.mocked(learningApi.createAside).mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve
        })
    )
    const onOpened = vi.fn()
    const { result } = renderAsides()

    let creating: Promise<unknown> = Promise.resolve()
    act(() => {
      creating = result.current.createAside({
        type: 'message',
        message_id: 'ai:1',
        content: 'Answer',
        locator: 'selection',
        presentation: 'inline',
        onOpened,
      })
    })
    await waitFor(() => expect(result.current.creating).toEqual({ messageId: 'ai:1' }))
    expect(result.current.panelOpen).toBe(false)

    await act(async () => {
      finish(aside)
      await creating
    })

    expect(result.current.activeAsideId).toBe(aside.id)
    expect(result.current.panelOpen).toBe(false)
    expect(result.current.creating).toBeNull()
    expect(onOpened).toHaveBeenCalledWith(aside)
    // Only the anchor reaches the API, titled from the passage.
    expect(learningApi.createAside).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Answer',
        anchor: {
          type: 'message',
          message_id: 'ai:1',
          content: 'Answer',
          source_id: undefined,
          locator: 'selection',
        },
      })
    )
  })

  it('still opens other new dives full height', async () => {
    const { result } = renderAsides()

    await act(async () => {
      await result.current.createAside({ type: 'message', content: 'Question?' })
    })

    expect(result.current.activeAsideId).toBe(aside.id)
    expect(result.current.panelOpen).toBe(true)
  })

  it('shows the question on its way until the answer arrives', async () => {
    let answer: (value: LearningAside) => void = () => undefined
    vi.mocked(learningApi.sendMessage).mockImplementation(
      () =>
        new Promise((resolve) => {
          answer = resolve
        })
    )
    const { result } = renderAsides()
    act(() => result.current.expandAside(aside.id))

    let sending: Promise<unknown> = Promise.resolve()
    act(() => {
      sending = result.current.sendMessage({ asideId: aside.id, message: 'Why?' })
    })
    await waitFor(() => expect(result.current.pendingMessage).toBe('Why?'))
    expect(result.current.sendingAsideId).toBe(aside.id)

    await act(async () => {
      answer({ ...aside, messages: [{ id: 'h', type: 'human', content: 'Why?' }] })
      await sending
    })
    expect(result.current.pendingMessage).toBeNull()
    expect(result.current.sendingAsideId).toBeNull()
  })

  it('loads an expanded dive\'s transcript once, then keeps it through refetches', async () => {
    const { result } = renderAsides()

    act(() => result.current.expandAside(aside.id))
    expect(result.current.isAsideLoading).toBe(true)
    await waitFor(() => expect(result.current.activeAside).toEqual(aside))
    expect(result.current.isAsideLoading).toBe(false)
    expect(learningApi.getAside).toHaveBeenCalledWith(aside.id)
  })

  it('closes a dive once it is discarded', async () => {
    vi.mocked(learningApi.updateAside).mockResolvedValue({
      ...aside,
      status: 'discarded',
    })
    const { result } = renderAsides()
    act(() => result.current.openAside(aside.id))

    await act(async () => {
      await result.current.updateStatus({ asideId: aside.id, status: 'discarded' })
    })

    expect(result.current.activeAsideId).toBeNull()
    expect(result.current.panelOpen).toBe(false)
  })

  it('folds only the dive that is open inline', () => {
    const { result } = renderAsides()

    act(() => result.current.openAside(aside.id))
    act(() => result.current.collapseAside(aside.id))
    // A fold from the chat does not close the full-height view.
    expect(result.current.panelOpen).toBe(true)

    act(() => result.current.expandAside(aside.id))
    act(() => result.current.collapseAside('learning_aside:other'))
    expect(result.current.activeAsideId).toBe(aside.id)
    act(() => result.current.collapseAside(aside.id))
    expect(result.current.activeAsideId).toBeNull()
  })

  it('closes the open dive when the learner switches chat session', () => {
    const { result, rerender } = renderAsides()
    act(() => result.current.openAside(aside.id))

    rerender({ mainSessionId: 'chat_session:other' })

    expect(result.current.activeAsideId).toBeNull()
    expect(result.current.panelOpen).toBe(false)
  })

  describe('using a conclusion in main chat', () => {
    beforeEach(() => {
      vi.mocked(toast.error).mockClear()
      vi.mocked(learningApi.updateLearningUpdate).mockReset()
      vi.mocked(learningApi.getJourney).mockResolvedValue(journey)
    })

    it('leaves a conclusion out at once, saves it and recounts the chat context', async () => {
      const saving = deferred<LearningUpdate>()
      vi.mocked(learningApi.updateLearningUpdate).mockReturnValue(saving.promise)
      const { result, client } = renderAsides()
      await waitFor(() => expect(listedInclusion(result)).toBe(true))
      const invalidate = vi.spyOn(client, 'invalidateQueries')

      act(() => result.current.setIncludeInMain(conclusion, false))

      // The switch and Studio's counts move before the server answers.
      await waitFor(() => expect(listedInclusion(result)).toBe(false))
      expect(learningApi.updateLearningUpdate).toHaveBeenCalledWith(
        'learning_update:one',
        { include_in_main: false }
      )
      expect(invalidate).not.toHaveBeenCalled()

      await act(async () => {
        saving.resolve({ ...conclusion, include_in_main: false })
        await saving.promise
      })

      await waitFor(() =>
        expect(invalidate).toHaveBeenCalledWith({
          queryKey: QUERY_KEYS.notebookChatContext('notebook:1'),
        })
      )
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: QUERY_KEYS.learningJourney('notebook:1', 'chat_session:main'),
      })
      expect(invalidate).toHaveBeenCalledWith({
        queryKey: QUERY_KEYS.learningAside(resolvedAside.id),
      })
      expect(toast.error).not.toHaveBeenCalled()
    })

    it('puts the switch back and says why when saving fails', async () => {
      vi.mocked(learningApi.updateLearningUpdate).mockRejectedValue({
        response: {
          data: { detail: 'Version 1 of this conclusion was replaced by version 2.' },
        },
      })
      const { result } = renderAsides()
      await waitFor(() => expect(listedInclusion(result)).toBe(true))
      // The refetch after the failure returns what the server kept.
      vi.mocked(learningApi.getJourney).mockClear()

      act(() => result.current.setIncludeInMain(conclusion, false))

      await waitFor(() =>
        expect(toast.error).toHaveBeenCalledWith(
          'Version 1 of this conclusion was replaced by version 2.'
        )
      )
      expect(listedInclusion(result)).toBe(true)
      await waitFor(() => expect(learningApi.getJourney).toHaveBeenCalled())
    })

    it('sends quick clicks one after another and keeps the last one on screen', async () => {
      const first = deferred<LearningUpdate>()
      const second = deferred<LearningUpdate>()
      vi.mocked(learningApi.updateLearningUpdate)
        .mockReturnValueOnce(first.promise)
        .mockReturnValueOnce(second.promise)
      const { result } = renderAsides()
      await waitFor(() => expect(listedInclusion(result)).toBe(true))

      act(() => result.current.setIncludeInMain(conclusion, false))
      act(() => result.current.setIncludeInMain(conclusion, true))
      await waitFor(() => expect(listedInclusion(result)).toBe(true))
      // The second waits for the first, so the server sees them in order.
      expect(learningApi.updateLearningUpdate).toHaveBeenCalledTimes(1)
      vi.mocked(learningApi.getJourney).mockClear()

      await act(async () => {
        first.resolve({ ...conclusion, include_in_main: false })
        await first.promise
      })
      await waitFor(() =>
        expect(learningApi.updateLearningUpdate).toHaveBeenLastCalledWith(
          'learning_update:one',
          { include_in_main: true }
        )
      )
      // No refetch, and the first reply does not undo the second click,
      // while that click is still on its way.
      expect(learningApi.getJourney).not.toHaveBeenCalled()
      expect(listedInclusion(result)).toBe(true)

      await act(async () => {
        second.resolve({ ...conclusion, include_in_main: true })
        await second.promise
      })
      await waitFor(() => expect(learningApi.getJourney).toHaveBeenCalled())
      expect(listedInclusion(result)).toBe(true)
    })

    it('also switches the open dive, so its summary agrees', async () => {
      vi.mocked(learningApi.getAside).mockResolvedValue(resolvedAside)
      const saving = deferred<LearningUpdate>()
      vi.mocked(learningApi.updateLearningUpdate).mockReturnValue(saving.promise)
      const { result } = renderAsides()
      act(() => result.current.expandAside(resolvedAside.id))
      await waitFor(() => expect(result.current.activeAside).toEqual(resolvedAside))

      act(() => result.current.setIncludeInMain(conclusion, false))

      await waitFor(() =>
        expect(result.current.activeAside?.updates[0].include_in_main).toBe(false)
      )
    })

    it('recounts the chat context once an aside is resolved', async () => {
      vi.mocked(learningApi.resolveAside).mockResolvedValue(resolvedAside)
      const { result, client } = renderAsides()
      const invalidate = vi.spyOn(client, 'invalidateQueries')

      await act(async () => {
        await result.current.resolveAside({
          asideId: aside.id,
          data: {
            conclusion: conclusion.conclusion,
            include_in_main: true,
            save_as_note: false,
          },
        })
      })

      expect(invalidate).toHaveBeenCalledWith({
        queryKey: QUERY_KEYS.notebookChatContext('notebook:1'),
      })
    })
  })
})
