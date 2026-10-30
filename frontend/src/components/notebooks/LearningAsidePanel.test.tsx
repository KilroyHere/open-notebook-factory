import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { LearningAsidePanel } from './LearningAsidePanel'
import { clearAsideDrafts } from './AsideComposer'
import { LearningAside, LearningResolutionDraft } from '@/lib/types/api'

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
  afterEach(() => clearAsideDrafts())

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

    const input = screen.getByLabelText('learningAsides.askPlaceholder')
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

  it('sends with the same Ctrl+Enter shortcut as main chat and says so', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined)
    render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={aside}
        onSendMessage={onSendMessage}
      />
    )

    const input = screen.getByLabelText('learningAsides.askPlaceholder')
    expect(input).toHaveAttribute(
      'placeholder',
      'learningAsides.askPlaceholder (chat.pressToSend)'
    )
    fireEvent.change(input, { target: { value: 'Show the algebra' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onSendMessage).not.toHaveBeenCalled()

    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    await waitFor(() =>
      expect(onSendMessage).toHaveBeenCalledWith(
        'learning_aside:one',
        'Show the algebra'
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
      screen.getByRole('button', { name: 'learningAsides.wrapUp' })
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
        open_questions: [],
        citations: [],
        include_in_main: true,
        save_as_note: false,
      })
    )
  })

  it('waits for the aside transcript instead of calling it empty', () => {
    const summary = { ...aside, messages: [] }
    const { rerender } = render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={summary}
        isAsideLoading
      />
    )

    expect(screen.getByText('common.loading')).toBeInTheDocument()
    expect(screen.queryByText('learningAsides.askHint')).not.toBeInTheDocument()

    rerender(
      <LearningAsidePanel {...baseProps} activeAside={aside} />
    )

    expect(
      screen.getByText('Why does that inequality apply here?')
    ).toBeInTheDocument()
  })

  it('prefills every field from the model draft and sends edited open questions', async () => {
    let finishDraft: (value: LearningResolutionDraft) => void = () => undefined
    const onDraftResolution = vi.fn(
      () =>
        new Promise<LearningResolutionDraft>((resolve) => {
          finishDraft = resolve
        })
    )
    const onResolve = vi.fn().mockResolvedValue(undefined)
    render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={aside}
        onDraftResolution={onDraftResolution}
        onResolve={onResolve}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.wrapUp' })
    )

    expect(onDraftResolution).toHaveBeenCalledWith('learning_aside:one')
    expect(
      await screen.findByText('learningAsides.drafting')
    ).toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('learningAsides.conclusionPlaceholder')
    ).toBeDisabled()
    const submit = screen
      .getAllByRole('button', { name: 'learningAsides.resolve' })
      .at(-1)!
    expect(submit).toBeDisabled()

    finishDraft({
      conclusion: 'Log is concave, so Jensen bounds $\\log p(x)$.',
      // A marker that slipped through is still kept out of the field.
      relevance: 'It justifies the first derivation step [note:margin].',
      open_questions: ['When is the bound tight?', 'Why a Gaussian prior?'],
      citations: ['source:paper'],
    })

    // Raw record IDs never reach the editable fields; math stays as written.
    await waitFor(() =>
      expect(
        screen.getByPlaceholderText('learningAsides.conclusionPlaceholder')
      ).toHaveValue('Log is concave, so Jensen bounds $\\log p(x)$.')
    )
    expect(screen.queryByText('learningAsides.drafting')).not.toBeInTheDocument()
    expect(
      screen.getByPlaceholderText('learningAsides.relevancePlaceholder')
    ).toHaveValue('It justifies the first derivation step.')
    const questions = screen.getAllByPlaceholderText(
      'learningAsides.openQuestionPlaceholder'
    )
    expect(questions.map((input) => (input as HTMLInputElement).value)).toEqual([
      'When is the bound tight?',
      'Why a Gaussian prior?',
    ])

    fireEvent.click(
      screen.getAllByRole('button', {
        name: 'learningAsides.removeOpenQuestion',
      })[1]
    )
    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.addOpenQuestion' })
    )
    const added = screen
      .getAllByPlaceholderText('learningAsides.openQuestionPlaceholder')
      .at(-1)!
    fireEvent.change(added, { target: { value: '  What does the KL gap mean? ' } })
    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.addOpenQuestion' })
    )
    // A citation the learner types is sent along with the draft's.
    fireEvent.change(
      screen.getByPlaceholderText('learningAsides.relevancePlaceholder'),
      {
        target: {
          value: 'It justifies the first derivation step [source:typed].',
        },
      }
    )

    fireEvent.click(
      screen.getAllByRole('button', { name: 'learningAsides.resolve' }).at(-1)!
    )

    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledWith('learning_aside:one', {
        conclusion: 'Log is concave, so Jensen bounds $\\log p(x)$.',
        relevance: 'It justifies the first derivation step [source:typed].',
        open_questions: [
          'When is the bound tight?',
          'What does the KL gap mean?',
        ],
        citations: ['source:paper', 'note:margin', 'source:typed'],
        include_in_main: true,
        save_as_note: false,
      })
    )
  })

  it('falls back to the last answer when the model draft fails', async () => {
    const onDraftResolution = vi.fn().mockRejectedValue(new Error('502'))
    render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={aside}
        onDraftResolution={onDraftResolution}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.wrapUp' })
    )

    expect(
      await screen.findByText('learningAsides.draftFailed')
    ).toBeInTheDocument()
    const conclusion = screen.getByPlaceholderText(
      'learningAsides.conclusionPlaceholder'
    )
    expect(conclusion).toHaveValue(
      'The logarithm is concave, so Jensen gives a lower bound.'
    )
    expect(conclusion).not.toBeDisabled()
    expect(
      screen.queryAllByPlaceholderText('learningAsides.openQuestionPlaceholder')
    ).toHaveLength(0)
  })

  it('updates a resolution from what was already approved', async () => {
    const onDraftResolution = vi.fn()
    render(
      <LearningAsidePanel
        {...baseProps}
        onDraftResolution={onDraftResolution}
        activeAside={{
          ...aside,
          status: 'resolved',
          updates: [
            {
              id: 'learning_update:one',
              aside_id: aside.id,
              conclusion: 'Approved conclusion.',
              relevance: 'Approved relevance.',
              open_questions: ['Approved question?'],
              citations: [],
              include_in_main: true,
              version: 1,
              created: aside.created,
              updated: aside.updated,
            },
          ],
        }}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.resolveAgain' })
    )

    expect(
      await screen.findByPlaceholderText('learningAsides.conclusionPlaceholder')
    ).toHaveValue('Approved conclusion.')
    expect(
      screen.getByPlaceholderText('learningAsides.relevancePlaceholder')
    ).toHaveValue('Approved relevance.')
    expect(
      screen.getByPlaceholderText('learningAsides.openQuestionPlaceholder')
    ).toHaveValue('Approved question?')
    expect(onDraftResolution).not.toHaveBeenCalled()
  })

  it('updates a resolution main chat leaves out without putting it back', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined)
    const leftOut: LearningAside = {
      ...aside,
      status: 'resolved',
      updates: [
        {
          id: 'learning_update:one',
          aside_id: aside.id,
          conclusion: 'Approved conclusion.',
          open_questions: [],
          citations: [],
          include_in_main: false,
          version: 1,
          created: aside.created,
          updated: aside.updated,
        },
      ],
    }
    const { rerender } = render(
      <LearningAsidePanel {...baseProps} onResolve={onResolve} activeAside={leftOut} />
    )
    const useInMain = () =>
      screen.getByRole('checkbox', { name: 'learningAsides.includeInMain' })

    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.resolveAgain' })
    )
    expect(useInMain()).not.toBeChecked()
    fireEvent.click(
      screen.getAllByRole('button', { name: 'learningAsides.resolve' }).at(-1)!
    )
    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledWith(
        aside.id,
        expect.objectContaining({ include_in_main: false })
      )
    )

    // A first wrap-up of another dive starts included again.
    const other: LearningAside = { ...aside, id: 'learning_aside:other' }
    rerender(
      <LearningAsidePanel {...baseProps} onResolve={onResolve} activeAside={other} />
    )
    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.wrapUp' }))
    expect(useInMain()).toBeChecked()
  })

  it('keeps an approved resolution\'s evidence without showing its IDs', async () => {
    const onResolve = vi.fn().mockResolvedValue(undefined)
    render(
      <LearningAsidePanel
        {...baseProps}
        onResolve={onResolve}
        activeAside={{
          ...aside,
          status: 'resolved',
          updates: [
            {
              id: 'learning_update:one',
              aside_id: aside.id,
              conclusion: 'Approved conclusion [source:paper].',
              relevance: 'Approved relevance.',
              open_questions: [],
              citations: ['source:paper', 'note:margin'],
              include_in_main: true,
              version: 1,
              created: aside.created,
              updated: aside.updated,
            },
          ],
        }}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.resolveAgain' })
    )
    expect(
      await screen.findByPlaceholderText('learningAsides.conclusionPlaceholder')
    ).toHaveValue('Approved conclusion.')
    fireEvent.click(
      screen.getAllByRole('button', { name: 'learningAsides.resolve' }).at(-1)!
    )

    await waitFor(() =>
      expect(onResolve).toHaveBeenCalledWith(
        'learning_aside:one',
        expect.objectContaining({
          conclusion: 'Approved conclusion.',
          citations: ['source:paper', 'note:margin'],
        })
      )
    )
  })

  it('asks the question of an empty nested dive in one click', async () => {
    const onSendMessage = vi.fn().mockResolvedValue(undefined)
    const child: LearningAside = {
      ...aside,
      id: 'learning_aside:child',
      parent_aside_id: aside.id,
      title: 'Why a Gaussian prior?',
      anchor: { type: 'message', content: 'Why a Gaussian prior?' },
      messages: [],
    }
    render(
      <LearningAsidePanel
        {...baseProps}
        asides={[aside, child]}
        activeAside={child}
        onSendMessage={onSendMessage}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.askThisQuestion' })
    )

    await waitFor(() =>
      expect(onSendMessage).toHaveBeenCalledWith(
        'learning_aside:child',
        'Why a Gaussian prior?'
      )
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
      screen.getByRole('button', { name: 'learningAsides.wrapUp' })
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

  it('switches the resolved conclusion in or out of main chat', () => {
    const onSetIncludeInMain = vi.fn()
    const update = {
      id: 'learning_update:one',
      aside_id: aside.id,
      conclusion: 'Jensen gives a lower bound because log is concave.',
      open_questions: [],
      citations: [],
      include_in_main: false,
      version: 1,
      created: aside.created,
      updated: aside.updated,
    }
    const { rerender } = render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={{ ...aside, status: 'resolved', updates: [update] }}
        onSetIncludeInMain={onSetIncludeInMain}
      />
    )

    const toggle = screen.getByRole('checkbox', {
      name: 'learningAsides.useInMainChatFor',
    })
    expect(toggle).not.toBeChecked()
    fireEvent.click(toggle)
    expect(onSetIncludeInMain).toHaveBeenCalledWith(update, true)

    // A version a newer resolution replaced can never reach main chat.
    rerender(
      <LearningAsidePanel
        {...baseProps}
        activeAside={{
          ...aside,
          status: 'resolved',
          updates: [{ ...update, superseded: true }],
        }}
        onSetIncludeInMain={onSetIncludeInMain}
      />
    )
    expect(screen.queryByRole('checkbox')).toBeNull()
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
        referenceTitles={{ 'source:paper': 'Attention Is All You Need' }}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'Attention Is All You Need' })
    )
    // Unknown titles get a numbered label instead of the record ID.
    fireEvent.click(screen.getByRole('button', { name: 'common.note 1' }))
    fireEvent.click(
      screen.getByRole('button', { name: 'common.insight 1' })
    )
    expect(
      screen.queryByRole('button', { name: /paper|margin|lemma/ })
    ).not.toBeInTheDocument()

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
  it('renders math in why it matters like the conclusion', () => {
    const resolved: LearningAside = {
      ...aside,
      status: 'resolved',
      updates: [
        {
          id: 'learning_update:one',
          aside_id: aside.id,
          conclusion: 'Scores are divided by $\\sqrt{d_k}$.',
          relevance: 'It explains the $\\sqrt{d_k}$ factor in the formula.',
          open_questions: [],
          citations: [],
          include_in_main: true,
          applied_message_id: 'ai:merged',
          version: 1,
          created: aside.created,
          updated: aside.updated,
        },
      ],
    }
    const { container } = render(
      <LearningAsidePanel {...baseProps} activeAside={resolved} />
    )

    expect(screen.queryByText(/\$\\sqrt/)).not.toBeInTheDocument()
    expect(container.querySelectorAll('.katex')).toHaveLength(2)
  })

  it('renders aside citations as numbered references like main chat', () => {
    const onReferenceClick = vi.fn()
    const cited: LearningAside = {
      ...aside,
      messages: [
        aside.messages[0],
        {
          id: 'ai:cited',
          type: 'ai',
          content: 'Scaled attention divides by the key size [source:6tsit42].',
        },
      ],
    }
    render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={cited}
        onReferenceClick={onReferenceClick}
      />
    )

    expect(screen.queryByText(/\[source:6tsit42\]/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '1' }))
    expect(onReferenceClick).toHaveBeenCalledWith('source', '6tsit42')
    expect(screen.getByText(/common\.references/)).toBeInTheDocument()
  })

  it('offers a way back to the merged reply after resolving', async () => {
    const onOpenChange = vi.fn()
    const onNavigateToMessage = vi.fn()
    const update = {
      id: 'learning_update:one',
      aside_id: aside.id,
      conclusion: 'Jensen gives a lower bound.',
      open_questions: [],
      citations: [],
      include_in_main: true,
      applied_message_id: 'ai:merged',
      version: 1,
      created: aside.created,
      updated: aside.updated,
    }
    const { rerender } = render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={{ ...aside, status: 'resolved', updates: [update] }}
        onOpenChange={onOpenChange}
        onNavigateToMessage={onNavigateToMessage}
      />
    )

    fireEvent.click(
      screen.getByText('learningAsides.returnToMain').closest('button')!
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)
    await waitFor(() =>
      expect(onNavigateToMessage).toHaveBeenCalledWith('ai:merged')
    )
    expect(onNavigateToMessage).toHaveBeenCalledTimes(1)

    // Not merged into the main chat: fall back to the origin message.
    rerender(
      <LearningAsidePanel
        {...baseProps}
        activeAside={{
          ...aside,
          status: 'resolved',
          updates: [{ ...update, applied_message_id: null }],
        }}
        onOpenChange={onOpenChange}
        onNavigateToMessage={onNavigateToMessage}
      />
    )
    fireEvent.click(
      screen.getByText('learningAsides.returnToMain').closest('button')!
    )
    await waitFor(() =>
      expect(onNavigateToMessage).toHaveBeenLastCalledWith('message:one')
    )
  })

  it('does not leave an unresolved aside on its own', () => {
    const onNavigateToMessage = vi.fn()
    render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={aside}
        onNavigateToMessage={onNavigateToMessage}
      />
    )
    expect(
      screen.queryByText('learningAsides.returnToMain')
    ).not.toBeInTheDocument()
    expect(onNavigateToMessage).not.toHaveBeenCalled()
  })

  it('saves an active dive for later and reopens a parked one', async () => {
    const onUpdateStatus = vi.fn().mockResolvedValue(undefined)
    const { rerender } = render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={aside}
        onUpdateStatus={onUpdateStatus}
      />
    )

    fireEvent.click(
      screen.getByRole('button', { name: 'learningAsides.saveForLater' })
    )
    expect(onUpdateStatus).toHaveBeenCalledWith('learning_aside:one', 'parked')

    rerender(
      <LearningAsidePanel
        {...baseProps}
        activeAside={{ ...aside, status: 'parked' }}
        onUpdateStatus={onUpdateStatus}
      />
    )
    expect(
      screen.queryByRole('button', { name: 'learningAsides.saveForLater' })
    ).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'learningAsides.reopen' }))
    expect(onUpdateStatus).toHaveBeenLastCalledWith('learning_aside:one', 'active')
  })

  it('shows the question being answered and frees the box for the next', async () => {
    let fail: (error: Error) => void = () => undefined
    const onSendMessage = vi.fn(
      () =>
        new Promise((_, reject) => {
          fail = reject
        })
    )
    const { rerender } = render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={aside}
        onSendMessage={onSendMessage}
      />
    )
    const input = screen.getByLabelText('learningAsides.askPlaceholder')
    fireEvent.change(input, { target: { value: 'Why concave?' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    expect(onSendMessage).toHaveBeenCalledWith('learning_aside:one', 'Why concave?')
    expect(input).toHaveValue('')
    rerender(
      <LearningAsidePanel
        {...baseProps}
        activeAside={aside}
        onSendMessage={onSendMessage}
        isSending
        pendingMessage="Why concave?"
      />
    )
    expect(screen.getByText('Why concave?')).toBeInTheDocument()
    expect(screen.getByText('common.processing')).toBeInTheDocument()

    // A failed send gives the question back to retry.
    fail(new Error('502'))
    await waitFor(() => expect(input).toHaveValue('Why concave?'))
  })

  it('takes the cursor along when it opens over the chat', () => {
    render(<LearningAsidePanel {...baseProps} activeAside={aside} />)

    expect(document.activeElement).toBe(
      screen.getByRole('region', { name: aside.title })
    )
  })

  it('quotes the passage of a dive started from a selection', () => {
    render(
      <LearningAsidePanel
        {...baseProps}
        activeAside={{
          ...aside,
          anchor: { ...aside.anchor, content: 'Jensen’s inequality', locator: 'selection' },
        }}
      />
    )

    expect(screen.getByText('learningAsides.selectedPassage')).toBeInTheDocument()
    expect(screen.getByText('Jensen’s inequality')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'learningAsides.backToOrigin' })
    ).toBeInTheDocument()
  })
})
