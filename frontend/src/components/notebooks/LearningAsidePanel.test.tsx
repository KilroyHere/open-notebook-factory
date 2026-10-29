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
  onNavigateToMessage: vi.fn(),
}

describe('LearningAsidePanel', () => {
  it('lists durable asides and opens the selected one', () => {
    const onSelectAside = vi.fn()
    const { container } = render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={undefined}
        onSelectAside={onSelectAside}
      />
    )

    fireEvent.click(screen.getByText('Why does Jensen apply?'))

    expect(onSelectAside).toHaveBeenCalledWith('learning_aside:one')
    expect(container.querySelector('section')?.className).toContain('h-full')
    expect(
      document.querySelector('[data-slot="scroll-area-viewport"]')?.className
    ).toContain('[&>div]:!w-full')
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

  it('returns to the parent dive from a nested aside', () => {
    const onSelectAside = vi.fn()
    const parent: LearningAside = {
      ...aside,
      id: 'learning_aside:parent',
      title: 'Parent dive',
    }
    const child: LearningAside = {
      ...aside,
      id: 'learning_aside:child',
      parent_aside_id: parent.id,
      title: 'Child dive',
      anchor: { type: 'message', content: 'A follow-up question' },
    }
    render(
      <LearningAsidePanel
        {...baseProps}
        asides={[parent, child]}
        activeAside={child}
        onSelectAside={onSelectAside}
      />
    )

    expect(
      screen.getByRole('button', { name: 'Parent dive' })
    ).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.backToParent' })
    )
    expect(onSelectAside).toHaveBeenCalledWith('learning_aside:parent')
    expect(
      screen.queryByRole('button', { name: 'learningAsides.backToOrigin' })
    ).not.toBeInTheDocument()
    expect(screen.getByText('A follow-up question')).toBeInTheDocument()
    expect(screen.queryByText('learningAsides.anchor')).not.toBeInTheDocument()
  })

  it('returns to and highlights the exact origin message', async () => {
    const onOpenChange = vi.fn()
    const onNavigateToMessage = vi.fn()
    render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={aside}
        onOpenChange={onOpenChange}
        onNavigateToMessage={onNavigateToMessage}
      />
    )

    expect(screen.queryByText(aside.anchor.content)).not.toBeInTheDocument()
    expect(screen.queryByText('learningAsides.anchor')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.backToOrigin' })
    )

    expect(onOpenChange).toHaveBeenCalledWith(false)
    await waitFor(() =>
      expect(onNavigateToMessage).toHaveBeenCalledWith('message:one')
    )
  })

  it('keeps a resolved summary and expandable transcript', () => {
    const resolved: LearningAside = {
      ...aside,
      status: 'resolved',
      updates: [
        {
          id: 'learning_update:one',
          aside_id: aside.id,
          conclusion: 'Jensen gives a lower bound because log is concave.',
          relevance: 'This validates the first ELBO step.',
          open_questions: ['Why choose a Gaussian prior?'],
          citations: [],
          include_in_main: true,
          applied_message_id: 'ai:merged',
          version: 1,
          created: aside.created,
          updated: aside.updated,
        },
      ],
    }
    render(<LearningAsidePanel {...baseProps} activeAside={resolved} />)

    expect(screen.getByText('learningAsides.summary')).toBeInTheDocument()
    expect(
      screen.getByText('Jensen gives a lower bound because log is concave.')
    ).toBeInTheDocument()
    expect(
      screen.queryByText('Why does that inequality apply here?')
    ).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', {
        name: 'learningAsides.viewTranscript',
      })
    )
    expect(
      screen.getByText('Why does that inequality apply here?')
    ).toBeInTheDocument()
  })

  it('opens source, note, and insight citations from the resolved summary', () => {
    const onReferenceClick = vi.fn()
    const resolved: LearningAside = {
      ...aside,
      status: 'resolved',
      updates: [
        {
          id: 'learning_update:one',
          aside_id: aside.id,
          conclusion: 'Jensen gives a lower bound because log is concave.',
          relevance: 'This validates the first ELBO step.',
          open_questions: [],
          citations: [
            'source:paper',
            'note:margin',
            'source_insight:lemma',
            'chapter 2',
          ],
          include_in_main: true,
          applied_message_id: 'ai:merged',
          version: 1,
          created: aside.created,
          updated: aside.updated,
        },
      ],
    }
    render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={resolved}
        onReferenceClick={onReferenceClick}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: 'common.source paper' }))
    fireEvent.click(screen.getByRole('button', { name: 'common.note margin' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'common.insight lemma' })
    )

    expect(onReferenceClick).toHaveBeenNthCalledWith(1, 'source', 'paper')
    expect(onReferenceClick).toHaveBeenNthCalledWith(2, 'note', 'margin')
    expect(onReferenceClick).toHaveBeenNthCalledWith(
      3,
      'source_insight',
      'lemma'
    )
    expect(
      screen.queryByRole('button', { name: /chapter 2/ })
    ).not.toBeInTheDocument()
  })
})
