interface AuthLoadingState {
  isLoading: boolean
  hasHydrated: boolean
  authRequired: boolean | null
  isCheckingAuth: boolean
}

export function isAuthStatePending({
  isLoading,
  hasHydrated,
  authRequired,
  isCheckingAuth,
}: AuthLoadingState): boolean {
  return (
    isLoading ||
    !hasHydrated ||
    authRequired === null ||
    isCheckingAuth
  )
}
