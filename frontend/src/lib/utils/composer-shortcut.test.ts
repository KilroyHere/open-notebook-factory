import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSendShortcut, sendShortcutHint } from './composer-shortcut'

const key = (overrides: Partial<Parameters<typeof isSendShortcut>[0]> = {}) => ({
  key: 'Enter',
  metaKey: false,
  ctrlKey: false,
  ...overrides,
})

describe('composer send shortcut', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses Ctrl+Enter outside macOS', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' })
    expect(sendShortcutHint()).toBe('Ctrl+Enter')
    expect(isSendShortcut(key({ ctrlKey: true }))).toBe(true)
    expect(isSendShortcut(key({ metaKey: true }))).toBe(false)
    expect(isSendShortcut(key())).toBe(false)
  })

  it('uses Cmd+Enter on macOS and ignores IME composition', () => {
    vi.stubGlobal('navigator', { userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)' })
    expect(sendShortcutHint()).toBe('⌘+Enter')
    expect(isSendShortcut(key({ metaKey: true }))).toBe(true)
    expect(
      isSendShortcut(key({ metaKey: true, nativeEvent: { isComposing: true } }))
    ).toBe(false)
  })
})
