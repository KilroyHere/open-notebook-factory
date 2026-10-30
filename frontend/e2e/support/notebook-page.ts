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

/**
 * Record, from now on, whether a main-chat message with `text` ever stops
 * being on screen, however briefly (a MutationObserver sees every change).
 * The returned function says whether it did.
 */
export async function watchChatMessage(
  page: Page,
  text: string
): Promise<() => Promise<boolean>> {
  await page.evaluate((watched) => {
    const record = { left: false }
    const shown = () =>
      Array.from(document.querySelectorAll('[id^="chat-message-"]')).some((row) =>
        row.textContent?.includes(watched)
      )
    new MutationObserver(() => {
      if (!shown()) record.left = true
    }).observe(document.body, { childList: true, subtree: true })
    ;(window as unknown as { e2eChatWatch: typeof record }).e2eChatWatch = record
  }, text)
  return () =>
    page.evaluate(
      () => (window as unknown as { e2eChatWatch: { left: boolean } }).e2eChatWatch.left
    )
}

/** Wait until the page has drawn `count` more frames. */
export async function nextFrames(page: Page, count = 2): Promise<void> {
  await page.evaluate(async (frames) => {
    for (let frame = 0; frame < frames; frame++) {
      await new Promise((resolve) => requestAnimationFrame(resolve))
    }
  }, count)
}
