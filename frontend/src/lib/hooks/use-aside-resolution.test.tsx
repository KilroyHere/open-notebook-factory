import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useAsideResolution } from './use-aside-resolution'
import type { LearningAside, LearningUpdate } from '@/lib/types/api'

const created = '2026-10-29T00:00:00Z'

function resolved(includeInMain: boolean): LearningAside {
  const update: LearningUpdate = {
    id: 'learning_update:one',
    aside_id: 'learning_aside:one',
    conclusion: 'Scaling keeps softmax soft.',
    relevance: 'Explains the formula.',
    open_questions: [],
    citations: [],
    include_in_main: includeInMain,
    version: 1,
    created,
    updated: created,
  }
  return {
    id: 'learning_aside:one',
    journey_id: 'learning_journey:one',
    parent_session_id: 'chat_session:main',
    chat_session_id: 'chat_session:one',
    title: 'Why scale',
    status: 'resolved',
    anchor: { type: 'message', content: 'An answer' },
    messages: [],
    updates: [update],
    created,
    updated: created,
  }
}

function renderResolution(aside: LearningAside) {
  const onResolve = vi.fn().mockResolvedValue(undefined)
  const hook = renderHook(
    ({ current }: { current: LearningAside }) =>
      useAsideResolution({ aside: current, onResolve, isResolving: false }),
    { initialProps: { current: aside } }
  )
  return { ...hook, onResolve }
}

describe('useAsideResolution: updating a resolution', () => {
  it('follows a main-chat switch made elsewhere while the form is open', async () => {
    const { result, rerender, onResolve } = renderResolution(resolved(true))
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.includeInMain).toBe(true)

    // The learner unticks "Use in main chat" in the summary or in Studio.
    rerender({ current: resolved(false) })
    expect(result.current.includeInMain).toBe(false)

    await act(async () => {
      await result.current.submit()
    })
    expect(onResolve).toHaveBeenCalledWith(
      'learning_aside:one',
      expect.objectContaining({ include_in_main: false })
    )
  })

  it("keeps the learner's own choice in the form", async () => {
    const { result, rerender } = renderResolution(resolved(false))
    await act(async () => {
      await result.current.start()
    })
    expect(result.current.includeInMain).toBe(false)

    act(() => result.current.setIncludeInMain(true))
    // A later change elsewhere doesn't override what they chose here.
    rerender({ current: resolved(false) })
    rerender({ current: resolved(true) })
    rerender({ current: resolved(false) })
    expect(result.current.includeInMain).toBe(true)
  })
})
