'use client'

import { useState } from 'react'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useTranslation } from '@/lib/hooks/use-translation'
import { cn } from '@/lib/utils'
import { AppSidebar } from './AppSidebar'

/**
 * The app menu for a page whose icon rail is hidden on small screens
 * (`AppShell compactNav`): a menu button that opens the full sidebar in a
 * drawer from the left. Choosing a page or a create action closes it.
 */
export function MobileNavMenu({ className }: { className?: string }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={cn('h-8 w-8 shrink-0 p-0', className)}
          aria-label={t('navigation.openMenu')}
          title={t('navigation.openMenu')}
        >
          <Menu className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="top-0 left-0 block h-full w-64 max-w-[85vw] translate-x-0 translate-y-0 gap-0 overflow-y-auto rounded-none border-0 border-r p-0 sm:max-w-[85vw] data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left">
        <DialogTitle className="sr-only">{t('navigation.nav')}</DialogTitle>
        <AppSidebar inDrawer onNavigate={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}
