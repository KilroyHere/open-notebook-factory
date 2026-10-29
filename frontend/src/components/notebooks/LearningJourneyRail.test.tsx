import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LearningJourneyRail } from './LearningJourneyRail'
import { LearningAside, NotebookChatMessage } from '@/lib/types/api'

const messages: NotebookChatMessage[] = [
  { id: 'human:one', type: 'human', content: 'Explain the ELBO.' },
  { id: 'ai:one', type: 'ai', content: 'It is a lower bound.' },
]

const aside: LearningAside = {
  id: 'learning_aside:one',
  journey_id: 'learning_journey:one',
  parent_session_id: 'chat_session:one',
  chat_session_id: 'chat_session:aside',
  title: 'Why Jensen applies',
  status: 'resolved',
  anchor: {
    type: 'message',
    message_id: 'ai:one',
    content: 'It is a lower bound.',
  },
  messages: [],
  updates: [
    {
      id: 'learning_update:one',
      aside_id: 'learning_aside:one',
      conclusion: 'Concavity produces the lower bound.',
      open_questions: [],
      citations: [],
      include_in_main: true,
      version: 1,
      created: '2026-10-29T00:00:00Z',
      updated: '2026-10-29T00:00:00Z',
    },
  ],
  created: '2026-10-29T00:00:00Z',
  updated: '2026-10-29T00:00:00Z',
}

describe('LearningJourneyRail', () => {
  it('navigates the main outline and resolved deep dives', () => {
    const onShowMain = vi.fn()
    const onOpenAside = vi.fn()
    const onNavigateToMessage = vi.fn()
    render(
      <LearningJourneyRail
        messages={messages}
        asides={[aside]}
        activeAsideId={null}
        onShowMain={onShowMain}
        onOpenAside={onOpenAside}
        onNavigateToMessage={onNavigateToMessage}
      />
    )

    fireEvent.click(screen.getByText('Explain the ELBO.'))
    expect(onNavigateToMessage).toHaveBeenCalledWith('human:one')

    fireEvent.click(screen.getByText('Why Jensen applies'))
    expect(onOpenAside).toHaveBeenCalledWith('learning_aside:one')

    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.mainThread' })
    )
    expect(onShowMain).toHaveBeenCalled()
  })

  it('renders a map derived from the same aside data', () => {
    render(
      <LearningJourneyRail
        messages={messages}
        asides={[aside]}
        activeAsideId={aside.id}
        onShowMain={vi.fn()}
        onOpenAside={vi.fn()}
        onNavigateToMessage={vi.fn()}
      />
    )

    fireEvent.click(
      screen.getByRole('tab', { name: 'learningAsides.map' })
    )

    expect(screen.getByText('Concavity produces the lower bound.')).toBeInTheDocument()
  })
})
