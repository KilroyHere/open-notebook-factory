import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { LearningJourneyRail } from './LearningJourneyRail'
import {
  LearningAside,
  LearningSection,
  NotebookChatMessage,
} from '@/lib/types/api'

function openTab(name: string) {
  fireEvent.mouseDown(screen.getByRole('tab', { name }), {
    button: 0,
    ctrlKey: false,
  })
}

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
      applied_message_id: 'ai:merged',
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

    openTab('learningAsides.map')

    expect(
      screen.getByText('Concavity produces the lower bound.')
    ).toBeInTheDocument()
  })

  it('keeps a sheet visible without the desktop rail width', () => {
    const { container } = render(
      <LearningJourneyRail
        presentation="sheet"
        messages={messages}
        asides={[aside]}
        activeAsideId={null}
        onShowMain={vi.fn()}
        onOpenAside={vi.fn()}
        onNavigateToMessage={vi.fn()}
      />
    )

    const root = container.firstElementChild as HTMLElement
    expect(root).toHaveAttribute('data-presentation', 'sheet')
    expect(root.classList.contains('flex')).toBe(true)
    expect(root.classList.contains('h-full')).toBe(true)
    expect(root.classList.contains('flex-col')).toBe(true)
    expect(root.classList.contains('hidden')).toBe(false)
    expect(root.classList.contains('lg:block')).toBe(false)
    expect(root.classList.contains('lg:hidden')).toBe(false)
    expect(root.classList.contains('w-72')).toBe(false)
    expect(
      screen.queryByRole('button', { name: 'Collapse learningAsides.journey' })
    ).not.toBeInTheDocument()
  })

  it('nests parked asides and lists open questions under the resolved aside', () => {
    const onOpenAside = vi.fn()
    const onNavigateToMessage = vi.fn()
    const withQuestions: LearningAside = {
      ...aside,
      updates: [
        {
          ...aside.updates[0],
          open_questions: ['Does this hold for discrete latents?'],
        },
      ],
    }
    const parked: LearningAside = {
      ...aside,
      id: 'learning_aside:parked',
      title: 'Gaussian prior',
      status: 'parked',
      anchor: {
        type: 'message',
        message_id: 'human:two',
        content: 'Held for later.',
      },
      updates: [],
    }
    const thread: NotebookChatMessage[] = [
      ...messages,
      { id: 'human:two', type: 'human', content: 'What is the KL term?' },
    ]

    render(
      <LearningJourneyRail
        messages={thread}
        asides={[withQuestions, parked]}
        activeAsideId={null}
        onShowMain={vi.fn()}
        onOpenAside={onOpenAside}
        onNavigateToMessage={onNavigateToMessage}
      />
    )

    const outline = screen.getByRole('tabpanel', {
      name: 'learningAsides.outline',
    })
    const text = outline.textContent ?? ''
    expect(text.indexOf('Explain the ELBO.')).toBeLessThan(
      text.indexOf('Why Jensen applies')
    )
    expect(text.indexOf('Why Jensen applies')).toBeLessThan(
      text.indexOf('learningAsides.openQuestions')
    )
    expect(text.indexOf('learningAsides.openQuestions')).toBeLessThan(
      text.indexOf('What is the KL term?')
    )
    expect(text.indexOf('What is the KL term?')).toBeLessThan(
      text.indexOf('Gaussian prior')
    )
    expect(text.indexOf('learningAsides.status.parked')).toBeGreaterThan(
      text.indexOf('What is the KL term?')
    )

    fireEvent.click(screen.getByText('Does this hold for discrete latents?'))
    expect(onOpenAside).not.toHaveBeenCalled()
    expect(onNavigateToMessage).not.toHaveBeenCalled()

    fireEvent.click(screen.getByText('Gaussian prior'))
    expect(onOpenAside).toHaveBeenCalledWith('learning_aside:parked')

    fireEvent.click(screen.getByRole('button', { name: /What is the KL term\?/ }))
    expect(onNavigateToMessage).toHaveBeenCalledWith('human:two')
  })

  it('nests a child dive under its parent branch', () => {
    const child: LearningAside = {
      ...aside,
      id: 'learning_aside:child',
      parent_aside_id: aside.id,
      title: 'Discrete latents',
      status: 'active',
      anchor: {
        type: 'message',
        content: 'Does this hold for discrete latents?',
      },
      updates: [],
    }
    const parent: LearningAside = {
      ...aside,
      updates: [
        {
          ...aside.updates[0],
          open_questions: ['Does this hold for discrete latents?'],
        },
      ],
    }
    render(
      <LearningJourneyRail
        messages={messages}
        asides={[parent, child]}
        activeAsideId={null}
        onShowMain={vi.fn()}
        onOpenAside={vi.fn()}
        onNavigateToMessage={vi.fn()}
      />
    )

    const outline = screen.getByRole('tabpanel', {
      name: 'learningAsides.outline',
    })
    const outlineText = outline.textContent ?? ''
    expect(outlineText.indexOf('Why Jensen applies')).toBeLessThan(
      outlineText.indexOf('Discrete latents')
    )
    expect(outlineText).not.toContain('learningAsides.openQuestions')
    expect(outlineText.indexOf('Explain the ELBO.')).toBeLessThan(
      outlineText.indexOf('Discrete latents')
    )

    openTab('learningAsides.map')
    const map = screen.getByRole('tabpanel', { name: 'learningAsides.map' })
    const mapText = map.textContent ?? ''
    expect(mapText.indexOf('Why Jensen applies')).toBeLessThan(
      mapText.indexOf('Discrete latents')
    )
    expect(within(map).getAllByText('Discrete latents')).toHaveLength(1)
  })

  it('shows a durable section title and saves rename or pin', () => {
    const onRenameSection = vi.fn()
    const onTogglePinSection = vi.fn()
    const section: LearningSection = {
      id: 'learning_section:one',
      journey_id: 'learning_journey:one',
      title: 'Evidence lower bound',
      pinned: false,
      start_message_id: 'human:one',
      created: '2026-10-29T00:00:00Z',
      updated: '2026-10-29T00:00:00Z',
    }
    render(
      <LearningJourneyRail
        messages={messages}
        asides={[aside]}
        sections={[section]}
        activeAsideId={null}
        onShowMain={vi.fn()}
        onOpenAside={vi.fn()}
        onNavigateToMessage={vi.fn()}
        onRenameSection={onRenameSection}
        onTogglePinSection={onTogglePinSection}
      />
    )

    expect(
      screen.getByRole('button', { name: /Evidence lower bound/ })
    ).toBeInTheDocument()
    expect(screen.queryByText('Explain the ELBO.')).not.toBeInTheDocument()

    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.pinSection' })
    )
    expect(onTogglePinSection).toHaveBeenCalledWith(section.id, true)

    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.renameSection' })
    )
    const input = screen.getByRole('textbox', {
      name: 'learningAsides.sectionTitlePlaceholder',
    })
    fireEvent.change(input, { target: { value: 'ELBO derivation' } })
    fireEvent.blur(input)
    expect(onRenameSection).toHaveBeenCalledWith(section.id, 'ELBO derivation')
  })

  it('floats a pinned section above later turns', () => {
    const thread: NotebookChatMessage[] = [
      ...messages,
      { id: 'human:two', type: 'human', content: 'What is the KL term?' },
    ]
    const sections: LearningSection[] = [
      {
        id: 'learning_section:one',
        journey_id: 'learning_journey:one',
        title: 'Evidence lower bound',
        pinned: false,
        start_message_id: 'human:one',
        created: '2026-10-29T00:00:00Z',
        updated: '2026-10-29T00:00:00Z',
      },
      {
        id: 'learning_section:two',
        journey_id: 'learning_journey:one',
        title: 'KL divergence',
        pinned: true,
        start_message_id: 'human:two',
        created: '2026-10-29T00:00:00Z',
        updated: '2026-10-29T00:00:00Z',
      },
    ]
    render(
      <LearningJourneyRail
        messages={thread}
        asides={[aside]}
        sections={sections}
        activeAsideId={null}
        onShowMain={vi.fn()}
        onOpenAside={vi.fn()}
        onNavigateToMessage={vi.fn()}
      />
    )

    const outline = screen.getByRole('tabpanel', {
      name: 'learningAsides.outline',
    })
    const text = outline.textContent ?? ''
    expect(text.indexOf('KL divergence')).toBeLessThan(
      text.indexOf('Evidence lower bound')
    )
    expect(text.indexOf('Evidence lower bound')).toBeLessThan(
      text.indexOf('Why Jensen applies')
    )
  })

  it('maps main, aside, resolution, and merge without one node per message', () => {
    const onShowMain = vi.fn()
    const onOpenAside = vi.fn()
    const onNavigateToMessage = vi.fn()
    const discarded: LearningAside = {
      ...aside,
      id: 'learning_aside:discarded',
      title: 'Discarded dive',
      status: 'discarded',
      updates: [
        {
          ...aside.updates[0],
          id: 'learning_update:discarded',
          aside_id: 'learning_aside:discarded',
          applied_message_id: 'ai:discarded',
        },
      ],
    }

    render(
      <LearningJourneyRail
        messages={messages}
        asides={[aside, discarded]}
        activeAsideId={null}
        onShowMain={onShowMain}
        onOpenAside={onOpenAside}
        onNavigateToMessage={onNavigateToMessage}
      />
    )

    openTab('learningAsides.map')
    const panel = screen.getByRole('tabpanel', { name: 'learningAsides.map' })

    expect(within(panel).queryByText('Explain the ELBO.')).not.toBeInTheDocument()
    expect(within(panel).queryByText('It is a lower bound.')).not.toBeInTheDocument()
    expect(within(panel).queryByText('Discarded dive')).not.toBeInTheDocument()
    expect(within(panel).getByText('Why Jensen applies')).toBeInTheDocument()
    expect(
      within(panel).getByText('Concavity produces the lower bound.')
    ).toBeInTheDocument()

    fireEvent.click(
      within(panel).getByRole('button', { name: 'learningAsides.mainThread' })
    )
    expect(onShowMain).toHaveBeenCalledTimes(1)
    expect(onNavigateToMessage).not.toHaveBeenCalled()

    fireEvent.click(
      within(panel).getByText('Concavity produces the lower bound.')
    )
    expect(onOpenAside).toHaveBeenCalledWith('learning_aside:one')

    fireEvent.click(within(panel).getByText('Why Jensen applies'))
    expect(onOpenAside).toHaveBeenCalledWith('learning_aside:one')

    fireEvent.click(
      within(panel).getByRole('button', {
        name: 'learningAsides.viewMergedResponse',
      })
    )
    expect(onNavigateToMessage).toHaveBeenCalledWith('ai:merged')
  })

  it('expands the map over the rail and closes back to the outline', () => {
    render(
      <LearningJourneyRail
        messages={messages}
        asides={[aside]}
        activeAsideId={null}
        onShowMain={vi.fn()}
        onOpenAside={vi.fn()}
        onNavigateToMessage={vi.fn()}
      />
    )

    openTab('learningAsides.map')
    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.map' }))

    expect(
      screen.getByRole('button', { name: 'learningAsides.outline' })
    ).toBeInTheDocument()
    expect(
      screen.getByText('Concavity produces the lower bound.')
    ).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.outline' }))

    expect(
      screen.queryByRole('button', { name: 'learningAsides.outline' })
    ).not.toBeInTheDocument()
    expect(
      screen.getByRole('tab', { name: 'learningAsides.outline' })
    ).toHaveAttribute('data-state', 'active')
    expect(screen.getByText('Explain the ELBO.')).toBeInTheDocument()
  })
})
