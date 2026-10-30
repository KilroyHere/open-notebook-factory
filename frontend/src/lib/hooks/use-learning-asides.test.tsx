import type { ReactNode } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useLearningAsides } from './use-learning-asides'
import { learningApi } from '@/lib/api/learning'
import type { LearningAside } from '@/lib/types/api'

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
  return renderHook(
    ({ mainSessionId }: { mainSessionId: string }) =>
      useLearningAsides({
        notebookId: 'notebook:1',
        mainSessionId,
        buildContext: async () => ({}),
      }),
    { wrapper, initialProps: { mainSessionId: 'chat_session:main' } }
  )
}

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
})
