import { describe, expect, it } from 'vitest'
import { getApiErrorMessage } from './error-handler'

const t = (key: string) => `t:${key}`

describe('getApiErrorMessage', () => {
  // Insight generation on a source with no text (#1394): the API's 400 detail
  // and the worker's failure message both map to one translated string.
  it.each(['Source has no text content', 'There is no text content to transform'])(
    'maps %j to the translated empty-source message',
    (detail) => {
      expect(getApiErrorMessage(detail, t, 'common.error')).toBe('t:apiErrors.sourceHasNoText')
    }
  )

  it('falls back to the given key when there is no server detail', () => {
    // SourceDetailContent passes '' for a network error with no response.
    expect(getApiErrorMessage('', t, 'common.error')).toBe('t:common.error')
  })

  it('returns an unmapped server detail as is', () => {
    expect(getApiErrorMessage('Something specific', t, 'common.error')).toBe('Something specific')
  })

  // Hooks pass `error.response?.data?.detail || error.message`: without a
  // server detail that is the HTTP client's own English message, which says
  // less than the translated fallback.
  it.each([
    'Request failed with status code 500',
    'Network Error',
    'timeout of 600000ms exceeded',
    'timeout exceeded',
    'Request aborted',
    'canceled',
  ])('shows the translated fallback instead of the HTTP client message %j', (message) => {
    expect(getApiErrorMessage(message, t, 'learningAsides.includeInMainFailed')).toBe(
      't:learningAsides.includeInMainFailed'
    )
  })

  it('shows the generic translated message when the caller names no fallback', () => {
    expect(getApiErrorMessage('Request failed with status code 502', t)).toBe(
      't:apiErrors.genericError'
    )
  })

  it('shows the fallback for an error whose response carries no detail', () => {
    // A plain-text 500 (an unhandled server error, or a proxy in between).
    const error = Object.assign(new Error('Request failed with status code 500'), {
      isAxiosError: true,
      response: { status: 500, data: 'Internal Server Error' },
    })
    expect(getApiErrorMessage(error, t, 'sources.failedToAddSource')).toBe(
      't:sources.failedToAddSource'
    )
  })

  it('shows the fallback when the detail is not text, like a validation error list', () => {
    const error = {
      message: 'Request failed with status code 422',
      response: { status: 422, data: { detail: [{ loc: ['body', 'title'], msg: 'Field required' }] } },
    }
    expect(getApiErrorMessage(error, t, 'common.error')).toBe('t:common.error')
  })

  it('keeps a server detail that only resembles a client message', () => {
    const detail = 'Request failed with status code 500 from the embedding provider'
    expect(getApiErrorMessage(detail, t, 'common.error')).toBe(detail)
    expect(
      getApiErrorMessage({ response: { data: { detail } }, message: 'x' }, t, 'common.error')
    ).toBe(detail)
  })
})
