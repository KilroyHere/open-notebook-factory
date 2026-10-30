import type { NotebookResponse, SourceListResponse } from '@/lib/types/api'
import { MockApi } from './mock-api'

// The notebook every test opens: two processed sources, no notes.

export const NOTEBOOK: NotebookResponse = {
  id: 'notebook:transformers',
  name: 'Transformers 101',
  description: 'How attention-based models read text',
  archived: false,
  created: '2026-01-05T08:00:00.000Z',
  updated: '2026-01-05T08:00:00.000Z',
  source_count: 2,
  note_count: 0,
}

function source(id: string, title: string): SourceListResponse {
  return {
    id,
    title,
    topics: [],
    asset: null,
    embedded: true,
    embedded_chunks: 12,
    insights_count: 0,
    created: '2026-01-05T08:00:00.000Z',
    updated: '2026-01-05T08:00:00.000Z',
    status: 'completed',
  }
}

export const SOURCES = [
  source('source:attention', 'Attention Is All You Need'),
  source('source:illustrated', 'The Illustrated Transformer'),
]

// What the models "say". Citations use the API's `[source:id]` markers.

export const QUESTION = 'How does self-attention work?'

/** The answer's second paragraph, the passage a selection test picks. */
export const PASSAGE =
  'Multi-head attention runs several attention functions in parallel, so each head can focus on a different relationship [source:illustrated]. ' +
  'Scaled dot-product attention divides the scores by the square root of the key dimension [source:attention].'

export const ANSWER =
  'Self-attention lets every token weigh every other token when it builds its representation [source:attention].\n\n' +
  PASSAGE

export const DIVE_QUESTION = 'Why divide by the square root of the key dimension?'

export const DIVE_ANSWER =
  'Without the scaling, dot products grow with the key dimension and push the softmax into regions with tiny gradients [source:attention].'

/** What "Wrap up" drafts for the dive. */
export const DRAFT = {
  conclusion:
    'Dividing by the square root of the key dimension keeps the softmax gradients usable [source:attention].',
  relevance: 'It explains the scaling step in the main answer.',
  open_questions: ['Does the scaling still matter for small key dimensions?'],
  citations: ['source:attention'],
}

/** The drafted conclusion as the form shows it, without citation markers. */
export const CONCLUSION =
  'Dividing by the square root of the key dimension keeps the softmax gradients usable.'

export function createMockApi(): MockApi {
  return new MockApi({ notebook: NOTEBOOK, sources: SOURCES })
}

/** A main-chat session with one earlier exchange, before QUESTION is asked. */
export function seedConversation(api: MockApi) {
  const session = api.addSession('Getting started')
  api.addMessage(session.messages, 'human', 'What are these two sources about?')
  api.addMessage(
    session.messages,
    'ai',
    'Both explain the Transformer, a model that reads text with attention.'
  )
  return { session }
}

/** A main-chat session in which QUESTION got ANSWER. */
export function seedAnsweredQuestion(api: MockApi) {
  const session = api.addSession(QUESTION)
  const question = api.addMessage(session.messages, 'human', QUESTION)
  const answer = api.addMessage(session.messages, 'ai', ANSWER)
  return { session, question, answer }
}

/**
 * The same session with a deep dive on ANSWER that was wrapped up with
 * CONCLUSION, which main chat uses.
 */
export function seedResolvedDive(api: MockApi) {
  const { session, answer } = seedAnsweredQuestion(api)
  const aside = api.createAside({
    notebook_id: NOTEBOOK.id,
    parent_session_id: session.id,
    title: 'Self-attention lets every token weigh every other token',
    anchor: { type: 'message', message_id: answer.id, content: ANSWER },
  })
  api.addMessage(aside.messages, 'human', DIVE_QUESTION)
  api.addMessage(aside.messages, 'ai', DIVE_ANSWER)
  const update = api.resolveAside(aside, {
    conclusion: CONCLUSION,
    relevance: DRAFT.relevance,
    open_questions: [],
    citations: DRAFT.citations,
    include_in_main: true,
    save_as_note: false,
  })
  return { session, answer, aside, update }
}
