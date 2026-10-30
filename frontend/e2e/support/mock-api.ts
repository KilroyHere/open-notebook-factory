import type { BrowserContext, Route } from '@playwright/test'
import type {
  BuildContextRequest,
  BuildContextResponse,
  CreateLearningAsideRequest,
  CreateNotebookChatSessionRequest,
  LearningAside,
  LearningJourney,
  LearningJourneyResume,
  LearningResolutionDraft,
  LearningSection,
  LearningUpdate,
  NoteResponse,
  NotebookChatMessage,
  NotebookChatSessionWithMessages,
  NotebookResponse,
  ResolveLearningAsideRequest,
  SendLearningAsideMessageRequest,
  SendNotebookChatMessageRequest,
  SourceListResponse,
  UpdateLearningUpdateRequest,
} from '@/lib/types/api'

/** One request the app sent to the API, as the mock received it. */
export interface ApiCall<Body = unknown> {
  method: string
  /** The path below `/api`, e.g. `/learning/asides`. */
  path: string
  query: URLSearchParams
  /** The parsed JSON body (the raw text if it is not JSON). */
  body: Body
}

interface Reply {
  status?: number
  body: unknown
}

/** A request a test answers late, or with an error, instead of right away. */
interface Interception {
  method: string
  path: RegExp
  /** The reply waits for this, so a test can look at the UI in between. */
  until: Promise<unknown>
  /**
   * Answer with this error instead of the usual reply: JSON with `detail`,
   * or a plain-text body when `detail` is null (an unhandled server error).
   */
  failure?: { status: number; detail: string | null }
  /** Only the next matching request (otherwise every one until released). */
  once: boolean
}

type Handler = (call: ApiCall, ...params: string[]) => Reply

type Journey = Omit<LearningJourney, 'asides' | 'updates' | 'sections'>

const ok = (body: unknown): Reply => ({ body })
const fail = (status: number, detail: string): Reply => ({ status, body: { detail } })

function parseBody(raw: string | null): unknown {
  if (!raw) return undefined
  try {
    return JSON.parse(raw)
  } catch {
    return raw
  }
}

/**
 * An in-memory stand-in for the Open Notebook API, installed in the browser
 * with `context.route`. It keeps the notebook, its chat sessions and
 * messages, and the learning journey's sections, asides (deep dives) and
 * their conclusions, so a GET after a POST or PATCH sees the change, the way
 * the real API does. What a model would write comes from replies the test
 * queues (`chatReplies`, `asideReplies`, `draft`).
 *
 * Every request is recorded in `calls`. A request no handler knows is
 * answered with 501 and listed in `unhandled`; one that leaves the app's own
 * origin is aborted and listed in `escaped`. The test fixture fails a test
 * when either list is not empty.
 */
export class MockApi {
  readonly notebook: NotebookResponse
  readonly sources: SourceListResponse[]
  readonly notes: NoteResponse[] = []
  readonly sessions: NotebookChatSessionWithMessages[] = []
  readonly journeys: Journey[] = []
  readonly asides: LearningAside[] = []
  readonly sections: LearningSection[] = []

  /** Main-chat answers, used in order. */
  readonly chatReplies: string[] = []
  /** Answers inside deep dives, used in order. */
  readonly asideReplies: string[] = []
  /** What "Wrap up" drafts. */
  draft: LearningResolutionDraft | null = null

  readonly calls: ApiCall[] = []
  readonly unhandled: string[] = []
  readonly escaped: string[] = []

  private readonly interceptions: Interception[] = []
  private readonly releases = new Set<() => void>()
  private clock = Date.parse('2026-01-05T09:00:00.000Z')
  private lastId = 0

  constructor({
    notebook,
    sources,
  }: {
    notebook: NotebookResponse
    sources: SourceListResponse[]
  }) {
    // Copies, so one test's changes never reach the next one's seed.
    this.notebook = structuredClone(notebook)
    this.sources = structuredClone(sources)
  }

  /**
   * Route the browser context's requests: `/api/*` on `appOrigin` to this
   * mock, and anything on another origin to `escaped` (aborted).
   */
  async install(context: BrowserContext, appOrigin: string): Promise<void> {
    await context.route(
      (url) => /^https?:$/.test(url.protocol) && url.origin !== appOrigin,
      async (route) => {
        this.escaped.push(`${route.request().method()} ${route.request().url()}`)
        await route.abort('blockedbyclient')
      }
    )
    await context.route(
      (url) => url.origin === appOrigin && url.pathname.startsWith('/api/'),
      (route) => this.handle(route)
    )
  }

  /** The requests made to `path` (below `/api`) with `method`, oldest first. */
  callsTo<Body = unknown>(method: string, path: string | RegExp): ApiCall<Body>[] {
    return this.calls.filter(
      (call) =>
        call.method === method &&
        (typeof path === 'string' ? call.path === path : path.test(call.path))
    ) as ApiCall<Body>[]
  }

  /**
   * Answer the next `method` request to a matching path with an error, once
   * `until` settles when it is given. The body is `{"detail": ...}` like the
   * API's own errors, or, with `detail: null`, the plain text an unhandled
   * server error (or a proxy in between) sends.
   */
  failNext(
    method: string,
    path: RegExp,
    {
      status = 500,
      detail = 'Mock failure',
      until = Promise.resolve(),
    }: { status?: number; detail?: string | null; until?: Promise<unknown> } = {}
  ): void {
    this.interceptions.push({
      method,
      path,
      until,
      failure: { status, detail },
      once: true,
    })
  }

  /**
   * Keep every `method` request to a matching path waiting until the
   * returned function is called; then each gets its usual reply.
   */
  hold(method: string, path: RegExp): () => void {
    const { promise, resolve } = Promise.withResolvers<void>()
    const interception: Interception = { method, path, until: promise, once: false }
    const release = () => {
      this.releases.delete(release)
      const index = this.interceptions.indexOf(interception)
      if (index >= 0) this.interceptions.splice(index, 1)
      resolve()
    }
    this.interceptions.push(interception)
    this.releases.add(release)
    return release
  }

  /** Let every held request through (the fixture does this after a test). */
  releaseAll(): void {
    for (const release of [...this.releases]) release()
  }

  // ---- Seeding (the handlers use the same methods) ----------------------

  addSession(title: string): NotebookChatSessionWithMessages {
    const created = this.now()
    const session: NotebookChatSessionWithMessages = {
      id: this.nextId('chat_session'),
      title,
      notebook_id: this.notebook.id,
      created,
      updated: created,
      model_override: null,
      messages: [],
    }
    this.sessions.push(session)
    return session
  }

  addMessage(
    messages: NotebookChatMessage[],
    type: NotebookChatMessage['type'],
    content: string
  ): NotebookChatMessage {
    const message: NotebookChatMessage = {
      id: this.nextId('msg', '-'),
      type,
      content,
      timestamp: this.now(),
    }
    messages.push(message)
    return message
  }

  createAside(request: CreateLearningAsideRequest): LearningAside {
    // Like the API: the parent is the given dive, or the dive whose own
    // session the new one branches from; otherwise it starts on the main
    // session's journey.
    const parent = request.parent_aside_id
      ? this.aside(request.parent_aside_id)
      : this.asides.find(
          (aside) => aside.chat_session_id === request.parent_session_id
        )
    const journey = parent
      ? this.journey(parent.journey_id)
      : this.journeyFor(request.parent_session_id, true)
    const created = this.now()
    const aside: LearningAside = {
      id: this.nextId('learning_aside'),
      journey_id: journey.id,
      parent_aside_id: parent?.id ?? null,
      parent_session_id: request.parent_session_id,
      chat_session_id: this.nextId('chat_session'),
      title: (request.title || request.anchor.content.slice(0, 80)).trim(),
      status: 'active',
      anchor: request.anchor,
      messages: [],
      updates: [],
      created,
      updated: created,
    }
    this.asides.push(aside)
    journey.active_session_id = aside.chat_session_id
    return aside
  }

  /** Store `request` as the aside's next conclusion and mark it resolved. */
  resolveAside(
    aside: LearningAside,
    request: ResolveLearningAsideRequest
  ): LearningUpdate {
    const created = this.now()
    for (const older of aside.updates) older.superseded = true
    const update: LearningUpdate = {
      id: this.nextId('learning_update'),
      aside_id: aside.id,
      conclusion: request.conclusion,
      relevance: request.relevance ?? null,
      open_questions: request.open_questions ?? [],
      citations: request.citations ?? [],
      include_in_main: request.include_in_main,
      saved_note_id: null,
      applied_message_id: null,
      version: aside.updates.length + 1,
      superseded: false,
      created,
      updated: created,
    }
    aside.updates.push(update)
    aside.status = 'resolved'
    aside.updated = created
    const journey = this.journey(aside.journey_id)
    if (journey.active_session_id === aside.chat_session_id) {
      journey.active_session_id = aside.parent_session_id
    }
    return update
  }

  findUpdate(updateId: string): LearningUpdate | undefined {
    return this.asides
      .flatMap((aside) => aside.updates)
      .find((update) => update.id === updateId)
  }

  // ---- Request handling -------------------------------------------------

  private async handle(route: Route): Promise<void> {
    const request = route.request()
    const url = new URL(request.url())
    const call: ApiCall = {
      method: request.method(),
      path: url.pathname.slice('/api'.length),
      query: url.searchParams,
      body: parseBody(request.postData()),
    }
    this.calls.push(call)

    const interception = this.interceptions.find(
      (item) => item.method === call.method && item.path.test(call.path)
    )
    if (interception) {
      if (interception.once) {
        this.interceptions.splice(this.interceptions.indexOf(interception), 1)
      }
      await interception.until
      const failure = interception.failure
      if (failure) {
        await route.fulfill(
          failure.detail === null
            ? { status: failure.status, contentType: 'text/plain', body: 'Internal Server Error' }
            : { status: failure.status, json: { detail: failure.detail } }
        )
        return
      }
    }

    // Read the state only now, so a held request sees what changed meanwhile.
    let reply: Reply | undefined
    try {
      reply = this.dispatch(call)
    } catch (error) {
      // A request the mock's state cannot serve is a broken test, not an
      // API error for the app to handle: report it like an unmocked one.
      this.unhandled.push(`${call.method} ${call.path}${url.search} (${error})`)
      await route.fulfill({ status: 500, json: { detail: String(error) } })
      return
    }
    if (!reply) {
      this.unhandled.push(`${call.method} ${call.path}${url.search}`)
      await route.fulfill({
        status: 501,
        json: { detail: `Not mocked in e2e: ${call.method} ${call.path}` },
      })
      return
    }
    await route.fulfill({ status: reply.status ?? 200, json: reply.body })
  }

  private dispatch(call: ApiCall): Reply | undefined {
    for (const [method, pattern, handler] of this.routes) {
      if (method !== call.method) continue
      const match = pattern.exec(call.path)
      if (match) return handler(call, ...match.slice(1).map(decodeURIComponent))
    }
    return undefined
  }

  private readonly routes: Array<[string, RegExp, Handler]> = [
    // App shell: connection check, auth, update check, setup banner, and the
    // create dialogs and command palette every dashboard page mounts.
    ['GET', /^\/config$/, () =>
      ok({ version: 'e2e', latestVersion: null, hasUpdate: false, dbStatus: 'online' })],
    ['GET', /^\/auth\/status$/, () => ok({ auth_enabled: false })],
    ['GET', /^\/credentials\/status$/, () =>
      ok({ configured: {}, source: {}, encryption_configured: true })],
    ['GET', /^\/credentials\/env-status$/, () => ok({})],
    ['GET', /^\/models$/, () => ok([])],
    ['GET', /^\/models\/defaults$/, () => ok({})],
    ['GET', /^\/settings$/, () => ok({})],
    ['GET', /^\/transformations$/, () => ok([])],
    ['GET', /^\/episode-profiles$/, () => ok([])],

    // The notebook and what it holds.
    ['GET', /^\/notebooks$/, () => ok([this.notebook])],
    ['GET', /^\/notebooks\/([^/]+)$/, (_call, id) =>
      id === this.notebook.id ? ok(this.notebook) : fail(404, 'Notebook not found')],
    ['GET', /^\/sources$/, (call) =>
      ok(Number(call.query.get('offset') ?? 0) > 0 ? [] : this.sources)],
    ['GET', /^\/notes$/, () => ok(this.notes)],

    // Main chat.
    ['GET', /^\/chat\/sessions$/, () =>
      ok(
        [...this.sessions]
          .sort((a, b) => b.created.localeCompare(a.created))
          .map((session) => this.sessionSummary(session))
      )],
    ['POST', /^\/chat\/sessions$/, (call) => {
      const body = call.body as CreateNotebookChatSessionRequest
      const session = this.addSession(body.title || 'Chat Session')
      session.model_override = body.model_override ?? null
      return ok(this.sessionSummary(session))
    }],
    ['GET', /^\/chat\/sessions\/([^/]+)$/, (_call, id) => {
      const session = this.session(id)
      return session ? ok(session) : fail(404, 'Session not found')
    }],
    ['POST', /^\/chat\/context$/, (call) =>
      ok(this.buildContext(call.body as BuildContextRequest))],
    ['POST', /^\/chat\/execute$/, (call) => {
      const body = call.body as SendNotebookChatMessageRequest
      const session = this.session(body.session_id)
      if (!session) return fail(404, 'Session not found')
      this.addMessage(session.messages, 'human', body.message)
      this.addMessage(
        session.messages,
        'ai',
        this.chatReplies.shift() ?? `A mock answer to: ${body.message}`
      )
      session.updated = this.now()
      return ok({ session_id: body.session_id, messages: session.messages })
    }],

    // The learning journey: sections, deep dives and their conclusions.
    ['GET', /^\/learning\/journeys$/, (call) => {
      const journey = this.journeyFor(call.query.get('main_session_id') ?? '')
      return ok(journey ? this.journeyResponse(journey) : null)
    }],
    ['GET', /^\/learning\/journeys\/resume$/, (call) =>
      ok(this.resume(this.journeyFor(call.query.get('main_session_id') ?? '')))],
    ['POST', /^\/learning\/sections\/sync$/, (call) => {
      const body = call.body as {
        main_session_id: string
        sections: Array<{ start_message_id: string; title: string }>
      }
      // Like the API: new turns get a section, named ones keep their name,
      // and the reply lists every section of the journey.
      const journey = this.journeyFor(body.main_session_id, true)
      for (const item of body.sections) this.section(journey, item)
      return ok(this.sections.filter((section) => section.journey_id === journey.id))
    }],
    ['PATCH', /^\/learning\/sections\/([^/]+)$/, (call, id) => {
      const section = this.sections.find((item) => item.id === id)
      if (!section) return fail(404, 'Section not found')
      Object.assign(section, call.body, { updated: this.now() })
      return ok(section)
    }],
    ['POST', /^\/learning\/asides$/, (call) =>
      ok(this.createAside(call.body as CreateLearningAsideRequest))],
    ['GET', /^\/learning\/asides\/([^/]+)$/, (_call, id) => {
      const aside = this.findAside(id)
      return aside ? ok(aside) : fail(404, 'Aside not found')
    }],
    ['PATCH', /^\/learning\/asides\/([^/]+)$/, (call, id) => {
      const aside = this.findAside(id)
      if (!aside) return fail(404, 'Aside not found')
      const { status, title } = call.body as Partial<LearningAside>
      if (status !== undefined) {
        const open = aside.status === 'active' || aside.status === 'parked'
        if (!open || !['active', 'parked', 'discarded'].includes(status)) {
          return fail(400, `A ${aside.status} aside cannot become ${status}`)
        }
        aside.status = status
        const journey = this.journey(aside.journey_id)
        if (status === 'active') journey.active_session_id = aside.chat_session_id
        else if (journey.active_session_id === aside.chat_session_id) {
          journey.active_session_id = aside.parent_session_id
        }
      }
      if (title !== undefined) aside.title = title
      aside.updated = this.now()
      return ok(aside)
    }],
    ['POST', /^\/learning\/asides\/([^/]+)\/messages$/, (call, id) => {
      const aside = this.findAside(id)
      if (!aside) return fail(404, 'Aside not found')
      if (aside.status === 'discarded') {
        return fail(400, 'Discarded asides cannot receive new messages')
      }
      const body = call.body as SendLearningAsideMessageRequest
      this.addMessage(aside.messages, 'human', body.message)
      this.addMessage(
        aside.messages,
        'ai',
        this.asideReplies.shift() ?? `A mock dive answer to: ${body.message}`
      )
      // Writing to a parked dive resumes it; a resolved one stays resolved.
      if (aside.status !== 'resolved') {
        aside.status = 'active'
        this.journey(aside.journey_id).active_session_id = aside.chat_session_id
      }
      aside.updated = this.now()
      return ok(aside)
    }],
    ['POST', /^\/learning\/asides\/([^/]+)\/draft-resolution$/, (_call, id) => {
      const aside = this.findAside(id)
      if (!aside) return fail(404, 'Aside not found')
      const answer = aside.messages.findLast((message) => message.type === 'ai')
      if (!answer?.content.trim()) {
        return fail(400, 'Ask a question in this aside before drafting')
      }
      return ok(
        this.draft ?? { conclusion: answer.content, relevance: '', open_questions: [] }
      )
    }],
    ['POST', /^\/learning\/asides\/([^/]+)\/resolve$/, (call, id) => {
      const aside = this.findAside(id)
      if (!aside) return fail(404, 'Aside not found')
      if (aside.status === 'discarded') {
        return fail(400, 'Discarded asides cannot be resolved')
      }
      this.resolveAside(aside, call.body as ResolveLearningAsideRequest)
      return ok(aside)
    }],
    ['PATCH', /^\/learning\/updates\/([^/]+)$/, (call, id) => {
      const update = this.findUpdate(id)
      if (!update) return fail(404, 'Learning update not found')
      if (update.superseded) {
        return fail(400, 'Only the latest version of a conclusion can change')
      }
      update.include_in_main = (call.body as UpdateLearningUpdateRequest).include_in_main
      update.updated = this.now()
      return ok(update)
    }],
  ]

  // ---- State helpers ----------------------------------------------------

  private session(id: string) {
    return this.sessions.find((session) => session.id === id)
  }

  private sessionSummary({ messages, ...session }: NotebookChatSessionWithMessages) {
    return { ...session, message_count: messages.length }
  }

  private findAside(id: string) {
    return this.asides.find((aside) => aside.id === id)
  }

  private aside(id: string): LearningAside {
    const aside = this.findAside(id)
    if (!aside) throw new Error(`Mock API has no aside ${id}`)
    return aside
  }

  private journey(id: string): Journey {
    const journey = this.journeys.find((item) => item.id === id)
    if (!journey) throw new Error(`Mock API has no journey ${id}`)
    return journey
  }

  /** The journey of a main-chat session, or undefined before its first use. */
  private journeyFor(mainSessionId: string): Journey | undefined
  /** The journey of a main-chat session, created on first use. */
  private journeyFor(mainSessionId: string, create: true): Journey
  private journeyFor(mainSessionId: string, create = false): Journey | undefined {
    const existing = this.journeys.find(
      (journey) => journey.main_session_id === mainSessionId
    )
    if (existing || !create) return existing
    const created = this.now()
    const journey: Journey = {
      id: this.nextId('learning_journey'),
      notebook_id: this.notebook.id,
      main_session_id: mainSessionId,
      active_session_id: mainSessionId,
      objective: null,
      status: 'active',
      created,
      updated: created,
    }
    this.journeys.push(journey)
    return journey
  }

  private section(
    journey: Journey,
    { start_message_id, title }: { start_message_id: string; title: string }
  ): LearningSection {
    const existing = this.sections.find(
      (section) =>
        section.journey_id === journey.id &&
        section.start_message_id === start_message_id
    )
    if (existing) return existing
    const created = this.now()
    const section: LearningSection = {
      id: this.nextId('learning_section'),
      journey_id: journey.id,
      title,
      pinned: false,
      start_message_id,
      created,
      updated: created,
    }
    this.sections.push(section)
    return section
  }

  /** A journey as `GET /learning/journeys` lists it: asides without transcripts. */
  private journeyResponse(journey: Journey): LearningJourney {
    const asides = this.asides.filter((aside) => aside.journey_id === journey.id)
    return {
      ...journey,
      asides: asides.map((aside) => ({ ...aside, messages: [] })),
      updates: asides.flatMap((aside) => aside.updates),
      sections: this.sections.filter((section) => section.journey_id === journey.id),
    }
  }

  private resume(journey: Journey | undefined): LearningJourneyResume {
    if (!journey) {
      return {
        accepted_findings: [],
        open_aside_ids: [],
        recommended_action: 'start_aside',
      }
    }
    const response = this.journeyResponse(journey)
    const open = response.asides.filter(
      (aside) => aside.status === 'active' || aside.status === 'parked'
    )
    const active =
      open.find((aside) => aside.chat_session_id === journey.active_session_id) ??
      open.at(-1)
    const accepted = this.acceptedUpdates(journey).map((update) => update.conclusion)
    return {
      journey: response,
      current_point: active?.title ?? journey.objective,
      accepted_findings: accepted,
      open_aside_ids: open.map((aside) => aside.id),
      recommended_aside_id: active?.id ?? null,
      recommended_action: active
        ? 'resume_aside'
        : accepted.length > 0
          ? 'continue_main'
          : 'start_aside',
    }
  }

  /** What main chat uses: the current, included conclusion of each resolved dive. */
  private acceptedUpdates(journey: Journey): LearningUpdate[] {
    return this.asides
      .filter((aside) => aside.journey_id === journey.id && aside.status === 'resolved')
      .map((aside) => aside.updates.at(-1))
      .filter(
        (update): update is LearningUpdate =>
          !!update && update.include_in_main && !update.superseded
      )
  }

  private buildContext(request: BuildContextRequest): BuildContextResponse {
    const included = (mode: string | undefined) => !!mode && mode !== 'not in'
    const journey = request.session_id ? this.journeyFor(request.session_id) : undefined
    const learning = journey ? this.acceptedUpdates(journey) : []
    const context = {
      sources: this.sources
        .filter((source) => included(request.context_config.sources[source.id]))
        .map((source) => ({ id: source.id, title: source.title })),
      notes: this.notes
        .filter((note) => included(request.context_config.notes[note.id]))
        .map((note) => ({ id: note.id, title: note.title, content: note.content })),
      ...(learning.length > 0
        ? {
            learning_updates: learning.map((update) => ({
              conclusion: update.conclusion,
              relevance: update.relevance,
            })),
          }
        : {}),
    }
    const text = JSON.stringify(context)
    return {
      context,
      token_count: Math.ceil(text.length / 4),
      char_count: text.length,
      learning_updates_omitted: 0,
    }
  }

  private now(): string {
    this.clock += 1000
    return new Date(this.clock).toISOString()
  }

  private nextId(table: string, separator = ':'): string {
    this.lastId += 1
    return `${table}${separator}${this.lastId}`
  }
}
