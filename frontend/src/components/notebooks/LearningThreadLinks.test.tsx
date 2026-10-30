import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import {
  evidenceButtonLabels,
  evidenceCitations,
  LearningMergeEvent,
  LearningThreadLinks,
  learningMergesForMessage,
} from './LearningThreadLinks'
import { buildReferenceTitles } from '@/lib/utils/learning-asides'
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
    fireEvent.click(screen.getByRole('button', { name: 'common.insight 1' }))
    expect(onReferenceClick).toHaveBeenCalledWith('source_insight', 'lemma')
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

  it('renders math in open questions instead of raw LaTeX', () => {
    const withMath = {
      ...resolvedAside,
      updates: [
        {
          ...resolvedAside.updates[0],
          open_questions: ['Why divide by $\\sqrt{d_k}$ and not $d_k$?'],
        },
      ],
    }
    const { container } = render(
      <LearningMergeEvent aside={withMath} update={withMath.updates[0]} />
    )

    expect(container.querySelector('.katex')).not.toBeNull()
    expect(container.textContent).not.toContain('$\\sqrt')
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

describe('evidenceButtonLabels', () => {
  const t = (key: string) => key

  it('uses known titles and numbers unknown documents per type', () => {
    const evidence = evidenceCitations([
      'source:xh9gyghko5bnl78ad8tp',
      'source:known',
      'source:other',
      'note:n1',
    ])

    expect(
      evidenceButtonLabels(evidence, { 'source:known': 'Known paper' }, t)
    ).toEqual(['common.source 1', 'Known paper', 'common.source 3', 'common.note 1'])
  })

  it('matches notebook records whose IDs carry the table prefix', () => {
    const titles = buildReferenceTitles(
      [
        { id: 'source:abc', title: 'Paper' },
        { id: 'source:untitled', title: null },
      ],
      [{ id: 'note:n1', title: '  Margin  ' }]
    )

    expect(titles).toEqual({ 'source:abc': 'Paper', 'note:n1': 'Margin' })
    expect(
      evidenceButtonLabels(
        evidenceCitations(['source:abc', 'source:untitled', 'note:n1']),
        titles,
        t
      )
    ).toEqual(['Paper', 'common.source 2', 'Margin'])
  })
})
