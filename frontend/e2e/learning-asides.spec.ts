import type {
  CreateLearningAsideRequest,
  ResolveLearningAsideRequest,
  SendNotebookChatMessageRequest,
  UpdateLearningUpdateRequest,
} from '@/lib/types/api'
import { expect, test } from './support/fixtures'
import {
  ANSWER,
  CONCLUSION,
  DIVE_ANSWER,
  DIVE_QUESTION,
  DRAFT,
  NOTEBOOK,
  PASSAGE,
  QUESTION,
  SOURCES,
  seedAnsweredQuestion,
  seedResolvedDive,
} from './support/notebook'
import {
  chatMessage,
  diveComposer,
  errorToast,
  mainComposer,
  nextFrames,
  openNotebook,
  studio,
  watchChatMessage,
  whatYouLearned,
} from './support/notebook-page'

// Deep dives ("learning asides") on the notebook page, against the mocked
// API in ./support/mock-api.ts: no backend, database or model.

test('the first question of a new chat stays on screen, and its answer shows numbered citations and a titled References list', async ({
  page,
  api,
}) => {
  // A notebook without a chat yet. The model takes its time, as models do,
  // so the new session's first read comes back before the answer.
  api.chatReplies.push(ANSWER)
  const answerNow = api.hold('POST', /^\/chat\/execute$/)
  const readNow = api.hold('GET', /^\/chat\/sessions\/[^/]+$/)
  await openNotebook(page)

  await mainComposer(page).fill(QUESTION)
  await mainComposer(page).press('ControlOrMeta+Enter')
  await expect(chatMessage(page, QUESTION)).toBeVisible()
  const questionLeft = await watchChatMessage(page, QUESTION)

  // The session's first read: nothing is stored yet. The page renders what
  // it read before the model answers. (How long the model takes changes
  // nothing for a correct page; waiting lets a wrong one show the gap.)
  const firstRead = page.waitForEvent('requestfinished', (request) =>
    /^\/api\/chat\/sessions\/[^/]+$/.test(new URL(request.url()).pathname)
  )
  readNow()
  await firstRead
  await nextFrames(page)
  answerNow()

  const answer = chatMessage(page, 'Self-attention lets every token')
  await expect(answer).toBeVisible()
  await expect(chatMessage(page, QUESTION)).toBeVisible()
  // Citations are numbered in the order the sources are first cited...
  await expect(answer.getByRole('button', { name: '1', exact: true })).toHaveCount(2)
  await expect(answer.getByRole('button', { name: '2', exact: true })).toHaveCount(1)
  // ...and the References list names each source by its title, not its ID.
  await expect(answer.getByText(/^References:/)).toBeVisible()
  for (const title of ['Attention Is All You Need', 'The Illustrated Transformer']) {
    await expect(answer.getByRole('button', { name: title })).toBeVisible()
  }
  await expect(answer).not.toContainText('source:')
  // The question never left the chat while the answer was on its way.
  expect(await questionLeft()).toBe(false)

  // The first message created the session; the turn went to it, with both
  // sources in its context.
  expect(api.callsTo('POST', '/chat/sessions').map((call) => call.body)).toEqual([
    { notebook_id: NOTEBOOK.id, title: QUESTION },
  ])
  const [turn] = api.callsTo<SendNotebookChatMessageRequest>('POST', '/chat/execute')
  expect(turn.body).toMatchObject({ session_id: api.sessions[0].id, message: QUESTION })
  expect(turn.body.context.sources).toHaveLength(SOURCES.length)

  // The outline names a section after the question once the API has stored
  // it, never after the temporary ID it had on its way.
  const storedQuestion = api.sessions[0].messages[0]
  const namedSections = () =>
    api
      .callsTo<{ sections: Array<{ start_message_id: string }> }>(
        'POST',
        '/learning/sections/sync'
      )
      .flatMap((call) => call.body.sections.map((section) => section.start_message_id))
  await expect.poll(namedSections).toEqual([storedQuestion.id])
  expect(api.sections.map((section) => section.start_message_id)).toEqual([
    storedQuestion.id,
  ])
})

test('Go deeper opens a dive under the answer, and Wrap up resolves it into what was learned', async ({
  page,
  api,
}) => {
  const { session, answer: answerMessage } = seedAnsweredQuestion(api)
  api.asideReplies.push(DIVE_ANSWER)
  api.draft = DRAFT
  await openNotebook(page)

  const answer = chatMessage(page, 'Self-attention lets every token')
  await answer.getByRole('button', { name: 'Go deeper' }).click()

  // The dive opens inline, under the answer it came from, ready for a
  // question; the main chat's message box stays on screen and usable.
  const dive = answer.getByRole('button', { name: /dive\W+Self-attention lets every token/i })
  await expect(dive).toHaveAttribute('aria-expanded', 'true')
  await expect(diveComposer(page)).toBeFocused()
  await mainComposer(page).click({ trial: true, timeout: 5_000 })
  const [created] = api.callsTo<CreateLearningAsideRequest>('POST', '/learning/asides')
  expect(created.body).toMatchObject({
    notebook_id: NOTEBOOK.id,
    parent_session_id: session.id,
  })
  expect(created.body.anchor).toEqual({
    type: 'message',
    message_id: answerMessage.id,
    content: ANSWER,
  })

  // Ask in the dive.
  await diveComposer(page).fill(DIVE_QUESTION)
  await diveComposer(page).press('ControlOrMeta+Enter')
  await expect(answer.getByText(DIVE_QUESTION)).toBeVisible()
  await expect(answer.getByText(/push the softmax into regions with tiny gradients/)).toBeVisible()
  expect(api.callsTo('POST', /^\/learning\/asides\/[^/]+\/messages$/)).toHaveLength(1)

  // Wrap up prefills the AI draft, without the raw citation markers.
  await answer.getByRole('button', { name: 'Wrap up' }).click()
  await expect(page.getByLabel(/What did you learn/i)).toHaveValue(CONCLUSION)
  await expect(page.getByLabel(/affect the main conversation/i)).toHaveValue(DRAFT.relevance)
  await expect(page.getByPlaceholder(/question worth its own dive/i)).toHaveValue(
    DRAFT.open_questions[0]
  )
  expect(api.callsTo('POST', /^\/learning\/asides\/[^/]+\/draft-resolution$/)).toHaveLength(1)

  await page.getByRole('button', { name: 'Resolve aside' }).click()

  // The dive becomes what was learned: no more questions, and Studio lists it.
  await expect(
    answer.getByRole('button', { name: /Learned\W+Dividing by the square root/i })
  ).toBeVisible()
  await expect(dive).toHaveCount(0)
  await expect(diveComposer(page)).toHaveCount(0)
  await expect(mainComposer(page)).toBeVisible()
  const [resolved] = api.callsTo<ResolveLearningAsideRequest>(
    'POST',
    /^\/learning\/asides\/[^/]+\/resolve$/
  )
  expect(resolved.body).toEqual({
    conclusion: CONCLUSION,
    relevance: DRAFT.relevance,
    open_questions: DRAFT.open_questions,
    citations: DRAFT.citations,
    include_in_main: true,
    save_as_note: false,
  })
  await expect(await whatYouLearned(page)).toContainText(CONCLUSION)
})

test('"Use in main chat" in the Journey leaves a learned conclusion out of main chat', async ({
  page,
  api,
}) => {
  const { update } = seedResolvedDive(api)
  await openNotebook(page)

  const toggle = (await whatYouLearned(page)).getByRole('checkbox', {
    name: /Use in main chat\W+Dividing by the square root/i,
  })
  await expect(toggle).toBeChecked()
  await toggle.click()

  await expect(toggle).not.toBeChecked()
  const patches = () =>
    api.callsTo<UpdateLearningUpdateRequest>('PATCH', `/learning/updates/${update.id}`)
  await expect.poll(() => patches().map((call) => call.body)).toEqual([
    { include_in_main: false },
  ])
  // The journey is read again once the change is saved; it stays unticked.
  const journeyReadsSincePatch = () =>
    api.calls
      .slice(api.calls.indexOf(patches()[0]))
      .filter((call) => call.method === 'GET' && call.path === '/learning/journeys')
  await expect.poll(() => journeyReadsSincePatch().length).toBeGreaterThan(0)
  await expect(toggle).not.toBeChecked()
  expect(api.findUpdate(update.id)?.include_in_main).toBe(false)

  // A fresh page load reads the saved choice back.
  await page.reload()
  await expect(mainComposer(page)).toBeVisible()
  await expect(
    (await whatYouLearned(page)).getByRole('checkbox', {
      name: /Use in main chat\W+Dividing by the square root/i,
    })
  ).not.toBeChecked()
})

for (const { reason, detail, message } of [
  {
    reason: "the server's reason",
    detail: 'The database is not reachable',
    message: 'The database is not reachable',
  },
  // A plain-text 500: the toast says what failed, in the page's language,
  // instead of the HTTP client's "Request failed with status code 500".
  {
    reason: 'a translated message when the server gives none',
    detail: null,
    message: 'Could not change whether main chat uses this conclusion',
  },
]) {
  test(`a "Use in main chat" change that fails is undone, with ${reason}`, async ({
    page,
    api,
  }) => {
    const { update } = seedResolvedDive(api)
    const { promise: failure, resolve: failNow } = Promise.withResolvers<void>()
    api.failNext('PATCH', /^\/learning\/updates\//, { status: 500, detail, until: failure })
    await openNotebook(page)

    const toggle = (await whatYouLearned(page)).getByRole('checkbox', {
      name: /Use in main chat\W+Dividing by the square root/i,
    })
    await expect(toggle).toBeChecked()
    await toggle.click()

    // The box unticks at once, while the request is on its way...
    await expect(toggle).not.toBeChecked()
    await expect
      .poll(() => api.callsTo('PATCH', `/learning/updates/${update.id}`).length)
      .toBe(1)
    // (The journey reload that follows the failure waits, so only the app's
    // own undo can tick the box again: when the API is down, that reload
    // fails too.)
    const releaseJourney = api.hold('GET', /^\/learning\/journeys$/)
    failNow()

    // ...and is ticked again, with a message, when the request fails.
    await expect(toggle).toBeChecked()
    await expect(errorToast(page)).toHaveText(message)
    releaseJourney()
    expect(api.findUpdate(update.id)?.include_in_main).toBe(true)
  })
}

test('selecting part of an answer offers Go deeper, which opens a dive about that passage', async ({
  page,
  api,
}) => {
  const { answer: answerMessage } = seedAnsweredQuestion(api)
  await openNotebook(page)

  const answer = chatMessage(page, 'Self-attention lets every token')
  await answer.getByText(/^Multi-head attention runs several/).selectText()

  const toolbar = page.getByRole('toolbar', { name: /Selected text/i })
  await expect(toolbar).toBeVisible()
  await toolbar.getByRole('button', { name: 'Go deeper' }).click()

  // The dive is anchored to the passage, its citations written back as
  // markers, and opens under the answer quoting it.
  await expect
    .poll(() => api.callsTo('POST', '/learning/asides').length)
    .toBe(1)
  const [created] = api.callsTo<CreateLearningAsideRequest>('POST', '/learning/asides')
  expect(created.body.anchor).toEqual({
    type: 'message',
    message_id: answerMessage.id,
    content: PASSAGE,
    locator: 'selection',
  })
  expect(created.body.title).toMatch(/^Multi-head attention runs several/)
  await expect(toolbar).toBeHidden()
  await expect(
    answer.getByRole('button', { name: /dive\W+Multi-head attention runs several/i })
  ).toHaveAttribute('aria-expanded', 'true')
  await expect(answer.getByRole('figure', { name: /On this passage/i })).toContainText(
    'so each head can focus on a different relationship'
  )
  await expect(diveComposer(page)).toBeFocused()
  // Studio's Journey now lists the dive.
  await expect(studio(page)).toContainText('Multi-head attention runs several')
})
