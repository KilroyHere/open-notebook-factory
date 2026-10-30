# API Reference

Everything the UI does goes through the REST API, so anything you can do in the app you can also script.

**The live OpenAPI schema is the reference.** The running API serves it, generated from the code, so it is always current:

- Swagger UI: `http://localhost:5055/docs` (try requests in the browser)
- ReDoc: `http://localhost:5055/redoc`
- Raw schema: `http://localhost:5055/openapi.json` (for client generators)

This page covers what the schema doesn't tell you: the prefix, auth, async jobs, streaming and errors. It deliberately doesn't list every endpoint.

## Base URL and prefix

All application endpoints are under **`/api`** (every router is mounted with `prefix="/api"` in `api/main.py`). The API listens on port 5055.

- Direct: `http://localhost:5055/api/notebooks`
- Through the frontend: the Next.js server proxies `/api/*` to the API, so `http://localhost:3000/api/notebooks` (or port 8502 in the Docker image) works too.

Outside `/api`: `GET /health` returns `{"status": "healthy"}`, and `GET /` returns a short status message.

## Authentication

If `OPEN_NOTEBOOK_PASSWORD` (or `OPEN_NOTEBOOK_PASSWORD_FILE`) is set, every request needs:

```
Authorization: Bearer <password>
```

```bash
curl http://localhost:5055/api/notebooks -H "Authorization: Bearer $OPEN_NOTEBOOK_PASSWORD"
```

- If no password is set, auth is disabled and all requests pass.
- These paths never need auth: `/`, `/health`, `/docs`, `/redoc`, `/openapi.json`, `/api/auth/status`, `/api/config`. `OPTIONS` (CORS preflight) requests also pass.
- A missing, malformed or wrong header returns `401`.
- Non-ASCII passwords are supported; send them UTF-8 encoded.

This is a single shared password (`api/auth.py`), not user accounts. See [security.md](security.md).

## Resource map

Use `/docs` for request and response shapes. This map shows where things are:

| Area | Paths |
|---|---|
| Notebooks | `/api/notebooks`, `/api/notebooks/{id}/sources/{source_id}` (link/unlink), `/api/recently-viewed` |
| Sources | `/api/sources` (multipart create with optional file upload), `/api/sources/json`, `/api/sources/{id}/status`, `/api/sources/{id}/retry`, `/api/sources/{id}/insights`, `/api/sources/{id}/download` |
| Notes, insights | `/api/notes`, `/api/insights/{id}`, `/api/insights/{id}/save-as-note` |
| Chat | `/api/chat/sessions`, `/api/chat/execute`, `/api/chat/context`; source chat under `/api/sources/{id}/chat/sessions` |
| Learning asides | `/api/learning/journeys`, `/api/learning/journeys/resume`, `/api/learning/asides`, `/api/learning/asides/{id}/messages`, `/api/learning/asides/{id}/draft-resolution`, `/api/learning/asides/{id}/resolve`, `/api/learning/updates/{id}` (include a conclusion in main chat or leave it out), `/api/learning/sections/sync`, `/api/learning/sections/{id}` |
| Search and Ask | `/api/search`, `/api/search/ask` (streaming), `/api/search/ask/simple` |
| Transformations | `/api/transformations`, `/api/transformations/execute`, `/api/transformations/default-prompt` |
| Models and providers | `/api/models`, `/api/models/defaults`, `/api/models/sync`, `/api/models/auto-assign`, `/api/providers` |
| Credentials | `/api/credentials`, `/api/credentials/{id}/test`, `/api/credentials/{id}/discover`, `/api/credentials/{id}/register-models`, `/api/credentials/migrate-*` |
| Podcasts | `/api/podcasts/generate`, `/api/podcasts/episodes`, `/api/episode-profiles`, `/api/speaker-profiles` |
| Background jobs | `/api/commands/jobs`, `/api/commands/jobs/{job_id}` |
| Embeddings | `/api/embed`, `/api/embeddings/rebuild` |
| Settings and config | `/api/settings`, `/api/config`, `/api/capabilities`, `/api/languages`, `/api/auth/status` |

## Learning context in notebook chat

`POST /api/chat/execute` adds the session's accepted learning conclusions (the latest included resolution of each aside that is not discarded, see [ADR-014](decisions/ADR-014-learning-aside-context.md)) to the model's context itself. Any `learning_updates` sent in its `context` are ignored. `POST /api/chat/context` with a `session_id` returns the same conclusions as `context.learning_updates`, for display and the token count.

The conclusions share a budget of 4,000 tokens per turn (`LEARNING_UPDATES_TOKEN_BUDGET` in `api/routers/_chat_shared.py`). The newest are kept first; once one does not fit, it and all older ones are left out of that turn. `learning_updates_omitted` in the `POST /api/chat/context` response counts them.

To leave one conclusion out of main chat without re-resolving its aside, send `PATCH /api/learning/updates/{id}` with `{"include_in_main": false}`; `true` puts it back. It changes that version in place (no new version) and returns it. Only the latest version of an aside can be changed: a superseded version returns 400, an unknown ID 404.

## Learning asides

`POST /api/learning/asides` accepts anchor text (`anchor.content`) up to 200,000 characters, since **Go deeper** sends the whole answer; longer requests return 422. The aside stores the first 20,000 characters, cut at a word boundary and ending in "…" (`ANCHOR_CONTENT_MAX_CHARS` in `open_notebook/domain/learning.py`). The anchor's `message_id` and the aside's branch snapshot still lead to the full answer.

`POST /api/learning/asides/{id}/resolve` stores the conclusion as the aside's next version, one more than the highest stored one; resolutions sent at the same time each get their own version. With `save_as_note: true` the note is created after the version. If the note cannot be created or linked, neither is kept and the request fails (404 when the notebook no longer exists, otherwise 500), so it can simply be retried. Resolving moves the journey's `active_session_id` back to the aside's parent thread only when the journey was on that aside.

`PATCH /api/learning/asides/{id}` renames an aside or changes its status: active and parked switch between each other, and either can be discarded. A resolved aside keeps its status (resolve it again to change its conclusion) and a discarded one stays discarded; asking for any other change returns 400, and asking for the current status changes nothing.

In `PATCH /api/learning/asides/{id}` and `PATCH /api/learning/sections/{id}`, leave a field out to keep its value. An explicit `null` (for `title`, `status` or `pinned`) returns 422.

## Async operations

Source processing, embedding and podcast generation run on the background worker (see [architecture.md](architecture.md#background-jobs)). The endpoint that starts them returns right away with a record and/or a job id:

- Creating a source with `async_processing=true` (the UI does this) saves it, submits a `process_source` job and returns at once; poll `GET /api/sources/{id}/status` until it is `completed` or `failed`. Without it (the default), the request waits until processing finishes.
- `POST /api/podcasts/generate` returns a job id; poll `GET /api/podcasts/jobs/{job_id}` or list `GET /api/podcasts/episodes`.
- Any job: `GET /api/commands/jobs/{job_id}`.

If the worker isn't running, jobs stay queued.

## Streaming

`POST /api/search/ask` and the source-chat message endpoint return Server-Sent Events (`text/event-stream`). Each event is a `data: {json}` line with a `type` field. For Ask, the types are `strategy`, `answer`, `final_answer`, `complete` and `error`.

```bash
curl -N http://localhost:5055/api/search/ask \
  -H "Authorization: Bearer $OPEN_NOTEBOOK_PASSWORD" \
  -H "Content-Type: application/json" \
  -d '{"question": "What are the main findings?", "strategy_model": "model:...", "answer_model": "model:...", "final_answer_model": "model:..."}'
```

Check `/docs` for the exact request fields.

## Errors

Errors return JSON with a `detail` message. Domain errors map to status codes in `api/main.py`:

| Status | Meaning (exception) |
|---|---|
| 400 | Invalid input (`InvalidInputError`) |
| 401 | Missing or wrong password, or a provider rejected the API key (`AuthenticationError`) |
| 404 | Record not found (`NotFoundError`) |
| 413 | Request body over `OPEN_NOTEBOOK_MAX_UPLOAD_SIZE_MB` (default 100) |
| 415 | Unsupported file type (`UnsupportedTypeException`) |
| 422 | Request validation failed, or a model or provider isn't configured (`ConfigurationError`) |
| 429 | Provider rate limit (`RateLimitError`) |
| 502 | Provider unreachable or failed (`NetworkError`, `ExternalServiceError`) |
| 500 | Anything else, including database failures (`DatabaseOperationError`; see [ADR-013](decisions/ADR-013-objectmodel-get-error-contract.md)) |

## Credential encryption migration

After upgrading to 1.15 or later, existing stored API keys can be rewritten into the new encryption format with one call (there is no UI button):

```bash
curl -X POST http://localhost:5055/api/credentials/migrate-encryption \
  -H "Authorization: Bearer $OPEN_NOTEBOOK_PASSWORD"
```

It is idempotent and only rewrites a key it can decrypt. **Back up the database first:** versions before 1.15 can't read the new format. Details: [credentials.md](credentials.md#migration-paths) and [ADR-009](decisions/ADR-009-pbkdf2-credential-encryption.md).
