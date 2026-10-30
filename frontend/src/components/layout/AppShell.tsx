'use client'

import { AppSidebar } from './AppSidebar'
import { SetupBanner } from './SetupBanner'

interface AppShellProps {
  children: React.ReactNode
  /** Keep the app navigation on its icon rail for this page only. */
  compactNav?: boolean
}

export function AppShell({ children, compactNav = false }: AppShellProps) {
  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar forceCollapsed={compactNav} />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <SetupBanner />
        {children}
      </main>
    </div>
  )
}
