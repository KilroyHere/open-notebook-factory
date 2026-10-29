import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LearningAsidePanel } from './LearningAsidePanel'
import { LearningAside } from '@/lib/types/api'

const aside: LearningAside = {
  id: 'learning_aside:one',
  journey_id: 'learning_journey:one',
  parent_session_id: 'chat_session:main',
  chat_session_id: 'chat_session:aside',
  title: 'Why does Jensen apply?',
  status: 'active',
  anchor: {
    type: 'message',
    message_id: 'message:one',
    content: 'The ELBO follows from Jensen’s inequality.',
  },
  messages: [
    {
      id: 'human:one',
      type: 'human',
      content: 'Why does that inequality apply here?',
    },
    {
      id: 'ai:one',
      type: 'ai',
      content: 'The logarithm is concave, so Jensen gives a lower bound.',
    },
  ],
  updates: [],
  created: '2026-10-28T00:00:00Z',
  updated: '2026-10-28T00:00:00Z',
}

const baseProps = {
  open: true,
  onOpenChange: vi.fn(),
  asides: [aside],
  isLoading: false,
  isSending: false,
  isResolving: false,
  isAsideLoading: false,
  onSelectAside: vi.fn(),
  onSendMessage: vi.fn().mockResolvedValue(undefined),
  onResolve: vi.fn().mockResolvedValue(undefined),
  onUpdateStatus: vi.fn().mockResolvedValue(undefined),
}

describe('LearningAsidePanel', () => {
  it('lists durable asides and opens the selected one', () => {
    const onSelectAside = vi.fn()
    render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={undefined}
        onSelectAside={onSelectAside}
      />
    )

    fireEvent.click(screen.getByText('Why does Jensen apply?'))

    expect(onSelectAside).toHaveBeenCalledWith('learning_aside:one')
    expect(screen.getByRole('dialog').className).toContain('max-w-[100vw]')
  })

  it('sends a focused follow-up message', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined)
    render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={aside}
        onSendMessage={onSendMessage}
      />
    )

    const input = screen.getByPlaceholderText(
      'learningAsides.askPlaceholder'
    )
    fireEvent.change(input, {
      target: { value: 'Can you show the algebra?' },
    })
    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.send' })
    )

    await waitFor(() =>
      expect(onSendMessage).toHaveBeenCalledWith(
        'learning_aside:one',
        'Can you show the algebra?'
      )
    )
  })

  it('prefills and submits a user-approved learning update', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined)
    render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={aside}
        onResolve={onResolve}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.resolve' })
    )

    const conclusion = await screen.findByPlaceholderText(
      'learningAsides.conclusionPlaceholder'
    )
    expect(conclusion).toHaveValue(
      'The logarithm is concave, so Jensen gives a lower bound.'
    )
    fireEvent.change(
      screen.getByPlaceholderText('learningAsides.relevancePlaceholder'),
      { target: { value: 'This justifies the first derivation step.' } }
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.resolve' })
    )

    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledWith('learning_aside:one', {
        conclusion:
          'The logarithm is concave, so Jensen gives a lower bound.',
        relevance: 'This justifies the first derivation step.',
        citations: [],
        include_in_main: true,
        save_as_note: false,
      })
    )
  })

  it('does not offer destructive discard after an aside is resolved', () => {
    render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={{ ...aside, status: 'resolved' }}
      />
    )

    expect(
      screen.queryByRole('button', { name: 'learningAsides.discard' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'learningAsides.resolveAgain' })
    ).toBeInTheDocument()
  })

  it('explains that saved notes become shared notebook context', async () => {
    render(<LearningAsidePanel {...baseProps} activeAside={aside} />)
    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.resolve' })
    )

    const saveAsNote = await screen.findByText('learningAsides.saveAsNote')
    fireEvent.click(saveAsNote)

    expect(
      screen.getByText('learningAsides.saveAsNoteHint')
    ).toBeInTheDocument()
  })
})
