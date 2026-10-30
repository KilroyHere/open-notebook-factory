import { createEvent, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SelectionActions } from './SelectionActions'

const { mutate } = vi.hoisted(() => ({ mutate: vi.fn() }))
vi.mock('@/lib/hooks/use-notes', () => ({
  useCreateNote: () => ({ mutate, isPending: false }),
}))

const ANSWER = 'The probability that a latent explains the data.'

function select(node: Node, start: number, end: number) {
  const range = document.createRange()
  range.setStart(node, start)
  range.setEnd(node, end)
  const selection = window.getSelection()!
  selection.removeAllRanges()
  selection.addRange(range)
}

function renderAnswer(props: Partial<Parameters<typeof SelectionActions>[0]> = {}) {
  const onGoDeeper = vi.fn()
  render(
    <>
      <SelectionActions onGoDeeper={onGoDeeper} notebookId="notebook:1" {...props}>
        <p>{ANSWER}</p>
      </SelectionActions>
      <p>Elsewhere on the page</p>
    </>
  )
  return { onGoDeeper, text: screen.getByText(ANSWER).firstChild! }
}

describe('SelectionActions', () => {
  beforeEach(() => mutate.mockReset())
  afterEach(() => window.getSelection()?.removeAllRanges())

  it('offers Go deeper on a passage selected in the answer', () => {
    const { onGoDeeper, text } = renderAnswer()

    select(text, 4, 15)
    fireEvent.mouseUp(text)

    const toolbar = screen.getByRole('toolbar', {
      name: 'learningAsides.selectionActions',
    })
    // Screen readers hear that the actions follow the answer.
    expect(screen.getByText('learningAsides.selectionActionsHint')).toBeInTheDocument()
    // Real buttons, after the answer in the tab order.
    const goDeeper = within(toolbar).getByRole('button', {
      name: 'learningAsides.goDeeper',
    })
    expect(
      screen.getByText(ANSWER).compareDocumentPosition(toolbar) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy()
    goDeeper.focus()
    expect(document.activeElement).toBe(goDeeper)

    fireEvent.click(goDeeper)
    expect(onGoDeeper).toHaveBeenCalledWith('probability')
    expect(window.getSelection()?.isCollapsed).toBe(true)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('saves the passage as a note', () => {
    const { text } = renderAnswer()

    select(text, 4, 15)
    fireEvent.mouseUp(text)
    fireEvent.click(screen.getByRole('button', { name: 'common.saveToNote' }))

    expect(mutate).toHaveBeenCalledWith({
      content: 'probability',
      note_type: 'ai',
      notebook_id: 'notebook:1',
    })
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('keeps the selection when a toolbar button is pressed', () => {
    const { text } = renderAnswer()
    select(text, 4, 15)
    fireEvent.mouseUp(text)

    const toolbar = screen.getByRole('toolbar')
    const press = createEvent.mouseDown(toolbar)
    fireEvent(toolbar, press)
    expect(press.defaultPrevented).toBe(true)
  })

  it('waits for a touch selection to settle', async () => {
    const { text } = renderAnswer()

    select(text, 4, 15)
    document.dispatchEvent(new Event('selectionchange'))

    expect(await screen.findByRole('toolbar')).toBeInTheDocument()
  })

  it('ignores selections outside the answer or with nothing selected', () => {
    const { text } = renderAnswer()

    select(screen.getByText('Elsewhere on the page').firstChild!, 0, 9)
    fireEvent.mouseUp(text)
    expect(screen.queryByRole('toolbar')).toBeNull()

    select(text, 4, 4)
    fireEvent.mouseUp(text)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('goes away on Escape until the selection changes', async () => {
    const { text } = renderAnswer()
    select(text, 4, 15)
    fireEvent.mouseUp(text)

    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('toolbar')).toBeNull()
    fireEvent.mouseUp(text)
    expect(screen.queryByRole('toolbar')).toBeNull()

    select(text, 0, 15)
    fireEvent.mouseUp(text)
    await waitFor(() => expect(screen.getByRole('toolbar')).toBeInTheDocument())
  })

  it('goes away when the learner presses elsewhere, not on itself', () => {
    const { text } = renderAnswer()
    select(text, 4, 15)
    fireEvent.mouseUp(text)

    fireEvent.pointerDown(screen.getByRole('toolbar'))
    expect(screen.getByRole('toolbar')).toBeInTheDocument()

    fireEvent.pointerDown(screen.getByText('Elsewhere on the page'))
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('stays out of the way while the chat is covered', () => {
    render(
      <div inert>
        <SelectionActions onGoDeeper={vi.fn()}>
          <p>{ANSWER}</p>
        </SelectionActions>
      </div>
    )
    const text = screen.getByText(ANSWER).firstChild!

    select(text, 4, 15)
    fireEvent.mouseUp(text)
    expect(screen.queryByRole('toolbar')).toBeNull()
  })

  it('renders only the answer when there is nothing to offer', () => {
    const { text } = renderAnswer({ onGoDeeper: undefined, notebookId: undefined })

    select(text, 4, 15)
    fireEvent.mouseUp(text)
    expect(screen.queryByRole('toolbar')).toBeNull()
    expect(screen.queryByText('learningAsides.selectionActionsHint')).toBeNull()
  })
})
