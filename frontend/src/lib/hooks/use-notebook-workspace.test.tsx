import { act, renderHook, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useNotebookWorkspace } from './use-notebook-workspace'
import { useNotebookChat } from './use-notebook-chat'
import { useLearningAsides } from './use-learning-asides'
import type { LearningAside } from '@/lib/types/api'

vi.mock('./use-notebook-chat')
vi.mock('./use-learning-asides')

const { focusChatMessage } = vi.hoisted(() => ({ focusChatMessage: vi.fn() }))
vi.mock('@/lib/utils/chat-navigation', () => ({ focusChatMessage }))

const created = '2026-10-29T00:00:00Z'
const answer = { id: 'ai:1', type: 'ai' as const, content: 'The ELBO is a bound.' }

function dive(overrides: Partial<LearningAside> = {}): LearningAside {
  return {
    id: 'learning_aside:root',
    journey_id: 'learning_journey:one',
    parent_session_id: 'chat_session:main',
    chat_session_id: 'chat_session:root',
    title: 'Why a bound',
    status: 'active',
    anchor: { type: 'message', message_id: 'ai:1', content: answer.content },
    messages: [],
    updates: [],
    created,
    updated: created,
    ...overrides,
  }
}

const root = dive()
const child = dive({
  id: 'learning_aside:child',
  parent_aside_id: root.id,
  title: 'Gaussian prior',
  anchor: { type: 'message', content: 'Why a Gaussian prior?' },
})
const grandchild = dive({
  id: 'learning_aside:grandchild',
  parent_aside_id: child.id,
  title: 'Conjugacy',
  anchor: { type: 'message', content: 'What is conjugacy?' },
})

function learningMock(overrides: Record<string, unknown> = {}) {
  return {
    asides: [root, child, grandchild],
    sections: [],
    panelOpen: false,
    activeAsideId: null,
    activeAside: undefined,
    openAside: vi.fn(),
    expandAside: vi.fn(),
    collapseAside: vi.fn(),
    closeAside: vi.fn(),
    setPanelOpen: vi.fn(),
    openList: vi.fn(),
    createAside: vi.fn(),
    sendMessage: vi.fn().mockResolvedValue(undefined),
    updateStatus: vi.fn().mockResolvedValue(undefined),
    syncSections: vi.fn().mockResolvedValue(undefined),
    updateSection: vi.fn(),
    refreshJourney: vi.fn(),
    ...overrides,
  } as unknown as ReturnType<typeof useLearningAsides>
}

function renderWorkspace(learning = learningMock()) {
  vi.mocked(useLearningAsides).mockReturnValue(learning)
  const { result } = renderHook(() =>
    useNotebookWorkspace({
      notebookId: 'notebook:1',
      sources: [],
      notes: [],
      contextSelections: { sources: {}, notes: {} },
    })
  )
  return { result, learning }
}

describe('useNotebookWorkspace dives', () => {
  beforeEach(() => {
    focusChatMessage.mockReset()
    vi.mocked(useNotebookChat).mockReturnValue({
      messages: [{ id: 'human:1', type: 'human', content: 'Explain the ELBO.' }, answer],
      currentSessionId: 'chat_session:main',
      buildContext: vi.fn(),
      tokenCount: 0,
      charCount: 0,
    } as unknown as ReturnType<typeof useNotebookChat>)
  })

  it('opens a dive under its answer and asks to scroll to it', () => {
    const { result, learning } = renderWorkspace()

    act(() => result.current.openAside(root.id))

    expect(learning.expandAside).toHaveBeenCalledWith(root.id)
    expect(learning.openAside).not.toHaveBeenCalled()
    expect(result.current.attention).toEqual({
      asideId: root.id,
      scroll: 'start',
      focus: false,
    })
  })

  it('nests one level inline and opens deeper dives full height', () => {
    const { result, learning } = renderWorkspace()

    act(() => result.current.openAside(child.id))
    expect(learning.expandAside).toHaveBeenLastCalledWith(child.id)

    act(() => result.current.openAside(grandchild.id))
    expect(learning.openAside).toHaveBeenCalledWith(grandchild.id)
  })

  it('opens full height a dive whose answer is not in this chat', () => {
    const elsewhere = dive({
      id: 'learning_aside:elsewhere',
      anchor: { type: 'message', message_id: 'ai:gone', content: 'Gone' },
    })
    const { result, learning } = renderWorkspace(
      learningMock({ asides: [elsewhere] })
    )

    act(() => result.current.openAside(elsewhere.id))

    expect(learning.openAside).toHaveBeenCalledWith(elsewhere.id)
    expect(learning.expandAside).not.toHaveBeenCalled()
  })

  it('reports the dive on screen inline or full height', () => {
    const inline = renderWorkspace(
      learningMock({ activeAside: root, activeAsideId: root.id })
    ).result.current
    expect(inline.expandedDiveId).toBe(root.id)
    expect(inline.shownAsideId).toBe(root.id)

    const full = renderWorkspace(
      learningMock({ activeAside: grandchild, activeAsideId: grandchild.id, panelOpen: true })
    ).result.current
    expect(full.expandedDiveId).toBeNull()
    expect(full.shownAsideId).toBe(grandchild.id)
  })

  it('creates Go deeper dives inline and focuses them once open', async () => {
    const createAside = vi.fn().mockImplementation(async (input) => {
      input.onOpened?.(root)
      return root
    })
    const { result } = renderWorkspace(learningMock({ createAside }))

    act(() => result.current.openAsideFromMessage(answer))

    await waitFor(() =>
      expect(result.current.attention).toEqual({
        asideId: root.id,
        scroll: 'nearest',
        focus: true,
      })
    )
    expect(createAside).toHaveBeenCalledWith(
      expect.objectContaining({
        message_id: 'ai:1',
        content: answer.content,
        presentation: 'inline',
      })
    )
  })

  it('goes deeper on a passage as a dive under its answer', async () => {
    const createAside = vi.fn().mockResolvedValue(root)
    const { result } = renderWorkspace(learningMock({ createAside }))

    act(() => result.current.openAsideFromSelection(answer, `  ${'x'.repeat(20_010)}  `))
    act(() => result.current.openAsideFromSelection(answer, '   '))

    await waitFor(() => expect(createAside).toHaveBeenCalledTimes(1))
    const input = createAside.mock.calls[0][0]
    expect(input).toEqual(
      expect.objectContaining({
        type: 'message',
        message_id: 'ai:1',
        locator: 'selection',
        presentation: 'inline',
      })
    )
    // The backend keeps at most 20,000 characters of an anchor.
    expect(input.content).toHaveLength(20_000)
  })

  it('nests Dive in under an inline parent and asks the question', async () => {
    const created = dive({ id: 'learning_aside:new', parent_aside_id: root.id })
    const createAside = vi.fn().mockResolvedValue(created)
    const { result, learning } = renderWorkspace(
      learningMock({ asides: [root], createAside })
    )

    act(() => result.current.diveIntoQuestion(root, 'Why a bound?'))

    await waitFor(() =>
      expect(learning.sendMessage).toHaveBeenCalledWith({
        asideId: created.id,
        message: 'Why a bound?',
      })
    )
    expect(createAside).toHaveBeenCalledWith(
      expect.objectContaining({ parentAside: root, presentation: 'inline' })
    )
  })

  it('opens Dive in full height when the child would nest too deep', async () => {
    const createAside = vi.fn().mockResolvedValue(grandchild)
    const { result } = renderWorkspace(
      learningMock({ asides: [root, child], createAside })
    )

    act(() => result.current.diveIntoQuestion(child, 'What is conjugacy?'))

    await waitFor(() =>
      expect(createAside).toHaveBeenCalledWith(
        expect.objectContaining({ parentAside: child, presentation: 'full' })
      )
    )
  })

  it('closes every dive for the main thread and keeps one open when leaving full height', () => {
    const { result, learning } = renderWorkspace(
      learningMock({ activeAside: root, activeAsideId: root.id, panelOpen: true })
    )

    act(() => result.current.exitFullHeight())
    expect(learning.setPanelOpen).toHaveBeenCalledWith(false)
    expect(learning.closeAside).not.toHaveBeenCalled()

    act(() => result.current.showMainThread())
    expect(learning.closeAside).toHaveBeenCalled()
  })

  it('passes on how many conclusions the context limit left out', () => {
    vi.mocked(useNotebookChat).mockReturnValue({
      messages: [],
      currentSessionId: 'chat_session:main',
      buildContext: vi.fn(),
      tokenCount: 3900,
      charCount: 15000,
      learningUpdatesOmitted: 3,
    } as unknown as ReturnType<typeof useNotebookChat>)

    const { result } = renderWorkspace()

    expect(result.current.contextStats).toEqual(
      expect.objectContaining({ tokenCount: 3900, learningUpdatesOmitted: 3 })
    )
  })

  it('leaves full height to go back to a message', () => {
    vi.useFakeTimers()
    try {
      const { result, learning } = renderWorkspace(
        learningMock({ activeAside: grandchild, activeAsideId: grandchild.id, panelOpen: true })
      )

      act(() => result.current.navigateToMainMessage('ai:1'))
      // The grandchild cannot show inline, so it closes.
      expect(learning.closeAside).toHaveBeenCalled()
      act(() => vi.runAllTimers())
      expect(focusChatMessage).toHaveBeenCalledWith('ai:1')
    } finally {
      vi.useRealTimers()
    }
  })
})
