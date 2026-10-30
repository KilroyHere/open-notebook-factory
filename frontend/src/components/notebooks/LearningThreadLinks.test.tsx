import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LearningThreadLinks } from './LearningThreadLinks'
import { LearningMergeEvent } from './LearningUpdateParts'
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

  it('shows open questions and cited evidence on the resolved capsule', () => {
    const onReferenceClick = vi.fn()
    const aside: LearningAside = {
      ...resolvedAside,
      updates: [
        {
          ...resolvedAside.updates[0],
          open_questions: ['Why choose a Gaussian prior?'],
          citations: ['source:paper', 'note:margin', 'chapter 2'],
        },
      ],
    }
    render(
      <LearningThreadLinks
        messageId="ai:origin"
        asides={[aside]}
        onOpenAside={vi.fn()}
        onNavigateToMessage={vi.fn()}
        onReferenceClick={onReferenceClick}
        referenceTitles={{
          'source:paper': 'Attention Is All You Need',
          'note:margin': 'Margin notes',
        }}
      />
    )

    expect(screen.getByText('learningAsides.openQuestions')).toBeInTheDocument()
    expect(screen.getByText('Why choose a Gaussian prior?')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'Attention Is All You Need' })
    )
    expect(onReferenceClick).toHaveBeenCalledWith('source', 'paper')
    fireEvent.click(screen.getByRole('button', { name: 'Margin notes' }))
    expect(onReferenceClick).toHaveBeenCalledWith('note', 'margin')
    expect(
      screen.queryByRole('button', { name: /chapter 2/ })
    ).not.toBeInTheDocument()
  })

  it('renders math in the merged summary and keeps the capsule preview plain', () => {
    const update = {
      ...resolvedAside.updates[0],
      conclusion: 'Scores are divided by $\\sqrt{d_k}$.',
      relevance: 'It explains the $\\sqrt{d_k}$ factor [source:paper].',
    }
    const { container, unmount } = render(
      <LearningMergeEvent aside={resolvedAside} update={update} />
    )
    expect(screen.queryByText(/\$\\sqrt/)).not.toBeInTheDocument()
    expect(container.querySelectorAll('.katex')).toHaveLength(2)
    unmount()

    render(
      <LearningThreadLinks
        messageId="ai:origin"
        asides={[{ ...resolvedAside, updates: [update] }]}
        onOpenAside={vi.fn()}
        onNavigateToMessage={vi.fn()}
      />
    )
    expect(
      screen.getByText('Scores are divided by sqrt d_k.')
    ).toBeInTheDocument()
    expect(
      screen.getByText('It explains the sqrt d_k factor.')
    ).toBeInTheDocument()
  })

  it('starts or parks a nested dive from an open question', () => {
    const onDiveIntoQuestion = vi.fn()
    const onParkQuestion = vi.fn()
    const aside: LearningAside = {
      ...resolvedAside,
      updates: [
        {
          ...resolvedAside.updates[0],
          open_questions: ['Why choose a Gaussian prior?'],
        },
      ],
    }
    render(
      <LearningThreadLinks
        messageId="ai:origin"
        asides={[aside]}
        onOpenAside={vi.fn()}
        onNavigateToMessage={vi.fn()}
        onDiveIntoQuestion={onDiveIntoQuestion}
        onParkQuestion={onParkQuestion}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.diveIn' })
    )
    expect(onDiveIntoQuestion).toHaveBeenCalledWith(
      aside,
      'Why choose a Gaussian prior?'
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.parkQuestion' })
    )
    expect(onParkQuestion).toHaveBeenCalledWith(
      aside,
      'Why choose a Gaussian prior?'
    )
  })

  it('opens the existing child dive for a question', () => {
    const onOpenAside = vi.fn()
    const child: LearningAside = {
      ...resolvedAside,
      id: 'learning_aside:child',
      parent_aside_id: resolvedAside.id,
      title: 'Gaussian prior',
      status: 'parked',
      anchor: { type: 'message', content: 'Why choose a Gaussian prior?' },
      updates: [],
    }
    const parent: LearningAside = {
      ...resolvedAside,
      updates: [
        {
          ...resolvedAside.updates[0],
          open_questions: ['Why choose a Gaussian prior?'],
        },
      ],
    }
    render(
      <LearningThreadLinks
        messageId="ai:origin"
        asides={[parent, child]}
        onOpenAside={onOpenAside}
        onNavigateToMessage={vi.fn()}
        onDiveIntoQuestion={vi.fn()}
        onParkQuestion={vi.fn()}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Why choose a Gaussian prior?' })
    )
    expect(onOpenAside).toHaveBeenCalledWith('learning_aside:child')
    expect(
      screen.queryByRole('button', { name: 'learningAsides.diveIn' })
    ).not.toBeInTheDocument()
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
