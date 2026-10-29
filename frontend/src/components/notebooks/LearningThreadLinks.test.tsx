import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  LearningMergeEvent,
  LearningThreadLinks,
  learningMergesForMessage,
} from './LearningThreadLinks'
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
      />
    )

    expect(screen.getByText('learningAsides.openQuestions')).toBeInTheDocument()
    expect(screen.getByText('Why choose a Gaussian prior?')).toBeInTheDocument()
    fireEvent.click(
      screen.getByRole('button', { name: 'common.source paper' })
    )
    expect(onReferenceClick).toHaveBeenCalledWith('source', 'paper')
    fireEvent.click(screen.getByRole('button', { name: 'common.note margin' }))
    expect(onReferenceClick).toHaveBeenCalledWith('note', 'margin')
    expect(
      screen.queryByRole('button', { name: /chapter 2/ })
    ).not.toBeInTheDocument()
  })

  it('renders the merged learning update with a link back to its aside', () => {
    const onOpenAside = vi.fn()
    const onReferenceClick = vi.fn()
    const update = {
      ...resolvedAside.updates[0],
      open_questions: ['Does the bound stay tight?'],
      citations: ['[source_insight:lemma]'],
    }
    render(
      <LearningMergeEvent
        aside={resolvedAside}
        update={update}
        onOpenAside={onOpenAside}
        onReferenceClick={onReferenceClick}
      />
    )

    expect(screen.getByText('learningAsides.summary')).toBeInTheDocument()
    expect(screen.getByText('The logarithm is concave.')).toBeInTheDocument()
    expect(screen.getByText('learningAsides.whyItMatters')).toBeInTheDocument()
    expect(
      screen.getByText('This establishes the lower bound.')
    ).toBeInTheDocument()
    expect(screen.getByText('learningAsides.origin')).toBeInTheDocument()
    expect(screen.getByText('Why Jensen applies')).toBeInTheDocument()
    expect(screen.getByText('Does the bound stay tight?')).toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.viewTranscript' })
    )
    expect(onOpenAside).toHaveBeenCalledWith(resolvedAside.id)
    fireEvent.click(
      screen.getByRole('button', { name: 'common.insight lemma' })
    )
    expect(onReferenceClick).toHaveBeenCalledWith('source_insight', 'lemma')
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

  it('opens evidence citations and finds the merge on the destination message', () => {
    const cited = {
      ...resolvedAside,
      updates: [
        {
          ...resolvedAside.updates[0],
          citations: ['source:paper', 'not-a-link'],
          open_questions: ['Why a Gaussian prior?'],
        },
      ],
    }
    const onReferenceClick = vi.fn()
    const onOpenAside = vi.fn()
    render(
      <LearningMergeEvent
        aside={cited}
        update={cited.updates[0]}
        onOpenAside={onOpenAside}
        onReferenceClick={onReferenceClick}
      />
    )

    expect(screen.getByText('Why a Gaussian prior?')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /common.source/ }))
    expect(onReferenceClick).toHaveBeenCalledWith('source', 'paper')
    expect(learningMergesForMessage([cited], 'ai:merged')).toHaveLength(1)
    expect(learningMergesForMessage([cited], 'ai:origin')).toHaveLength(0)
  })
})
