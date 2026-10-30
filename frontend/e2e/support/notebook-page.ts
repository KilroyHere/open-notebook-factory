import { expect, type Page } from '@playwright/test'
import { NOTEBOOK } from './notebook'

// Locators for the notebook page. Labels another change may shorten are
// matched loosely.

/** Open the test notebook and wait for its chat. */
export async function openNotebook(page: Page): Promise<void> {
  await page.goto(`/notebooks/${encodeURIComponent(NOTEBOOK.id)}`)
  await expect(mainComposer(page)).toBeVisible()
}

/** The main chat's message box. */
export function mainComposer(page: Page) {
  return page.getByPlaceholder(/Ask anything about your sources/i)
}

/** The question box of the open deep dive. */
export function diveComposer(page: Page) {
  return page.getByRole('textbox', { name: /Ask a follow-up question/i })
}

/**
 * A main-chat message, found by part of its text, together with the deep
 * dives that hang under it.
 */
export function chatMessage(page: Page, text: string | RegExp) {
  return page.locator('[id^="chat-message-"]').filter({ hasText: text })
}

/** The Studio column on the right. */
export function studio(page: Page) {
  return page.getByRole('complementary', { name: /Studio/i })
}

/** Studio's "What you've learned" list, on the Journey tab. */
export async function whatYouLearned(page: Page) {
  const panel = studio(page)
  await panel.getByRole('tab', { name: /Journey/i }).click()
  return panel.getByRole('region', { name: /What you.ve learned/i })
}

/** Error toasts (sonner). */
export function errorToast(page: Page) {
  return page.locator('[data-sonner-toast][data-type="error"]')
}
