import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LearningThreadLinks } from './LearningThreadLinks'
import { LearningAside } from '@/lib/types/api'

const resolvedAside: LearningAside = {
  id: 'learning_aside:one',
  journey_id: 'learning_journey:one',
  parent_session_id: 'chat_session:one',
  chat_session_id: 'chat_session:aside',
  title: 'Why Jensen applies',
  status: 'resolved',
  anchor: {
    type: 'message',
    message_id: 'ai:origin',
    content: 'Origin answer',
  },
  messages: [],
  updates: [
    {
      id: 'learning_update:one',
      aside_id: 'learning_aside:one',
      conclusion: 'The logarithm is concave.',
      relevance: 'This establishes the lower bound.',
      open_questions: [],
      citations: [],
      include_in_main: true,
      applied_message_id: 'ai:merged',
      version: 1,
      created: '2026-10-29T00:00:00Z',
      updated: '2026-10-29T00:00:00Z',
    },
  ],
  created: '2026-10-29T00:00:00Z',
  updated: '2026-10-29T00:00:00Z',
}

describe('LearningThreadLinks', () => {
  it('shows a resolved capsule at its origin with transcript and merge links', () => {
    const onOpenAside = vi.fn()
    const onNavigateToMessage = vi.fn()
    render(
      <LearningThreadLinks
        messageId="ai:origin"
        asides={[resolvedAside]}
        onOpenAside={onOpenAside}
        onNavigateToMessage={onNavigateToMessage}
      />
    )

    expect(screen.getByText('The logarithm is concave.')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.viewTranscript' })
    )
    expect(onOpenAside).toHaveBeenCalledWith(resolvedAside.id)

    fireEvent.click(
      screen.getByRole('button', {
        name: 'learningAsides.viewMergedResponse',
      })
    )
    expect(onNavigateToMessage).toHaveBeenCalledWith('ai:merged')
  })

  it('omits branches anchored to another message', () => {
    const { container } = render(
      <LearningThreadLinks
        messageId="ai:other"
        asides={[resolvedAside]}
        onOpenAside={vi.fn()}
        onNavigateToMessage={vi.fn()}
      />
    )
    expect(container).toBeEmptyDOMElement()
  })
})
