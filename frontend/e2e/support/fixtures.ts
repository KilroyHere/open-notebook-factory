import { test as base, expect } from '@playwright/test'
import type { MockApi } from './mock-api'
import { createMockApi } from './notebook'

interface Fixtures {
  /**
   * The mocked API, installed before the test opens a page. Seed it and
   * queue replies before `page.goto`; read `api.calls` to check what the app
   * sent.
   */
  api: MockApi
}

export const test = base.extend<Fixtures>({
  api: [
    async ({ context, baseURL }, use) => {
      if (!baseURL) throw new Error('playwright.config.ts must set use.baseURL')
      const api = createMockApi()
      await api.install(context, new URL(baseURL).origin)

      const pageErrors: string[] = []
      context.on('weberror', (error) => pageErrors.push(error.error().message))

      await use(api)

      api.releaseAll()
      expect(api.unhandled, 'API requests the mock does not handle').toEqual([])
      expect(api.escaped, 'requests that left the app server').toEqual([])
      expect(pageErrors, 'uncaught errors in the page').toEqual([])
    },
    // Every test gets the mock, so no test can reach a real backend.
    { auto: true },
  ],
})

export { expect }
