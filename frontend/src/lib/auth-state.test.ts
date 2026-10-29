import { describe, expect, it } from 'vitest'
import { isAuthStatePending } from './auth-state'

describe('isAuthStatePending', () => {
  it('keeps protected routes mounted while persisted auth is hydrating', () => {
    expect(
      isAuthStatePending({
        isLoading: false,
        hasHydrated: false,
        authRequired: null,
        isCheckingAuth: false,
      })
    ).toBe(true)
  })

  it('waits for auth-required discovery and credential validation', () => {
    expect(
      isAuthStatePending({
        isLoading: false,
        hasHydrated: true,
        authRequired: null,
        isCheckingAuth: false,
      })
    ).toBe(true)
    expect(
      isAuthStatePending({
        isLoading: false,
        hasHydrated: true,
        authRequired: true,
        isCheckingAuth: true,
      })
    ).toBe(true)
  })

  it('unblocks after auth state is known and checked', () => {
    expect(
      isAuthStatePending({
        isLoading: false,
        hasHydrated: true,
        authRequired: false,
        isCheckingAuth: false,
      })
    ).toBe(false)
  })
})
