'use client'

import { Pause, RotateCcw, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { LearningAside, LearningAsideStatus } from '@/lib/types/api'
import { useTranslation } from '@/lib/hooks/use-translation'
import { isOpenDive } from './aside-status'

/**
 * Park an active dive, reopen a parked one, or discard either. Resolved and
 * discarded dives get none of these.
 */
export function AsideStatusActions({
  aside,
  disabled = false,
  onUpdateStatus,
}: {
  aside: Pick<LearningAside, 'id' | 'status'>
  disabled?: boolean
  onUpdateStatus: (
    asideId: string,
    status: Exclude<LearningAsideStatus, 'resolved'>
  ) => Promise<unknown>
}) {
  const { t } = useTranslation()
  if (!isOpenDive(aside.status)) return null
  const update = (status: Exclude<LearningAsideStatus, 'resolved'>) =>
    void onUpdateStatus(aside.id, status).catch(() => undefined)

  return (
    <>
      {aside.status === 'active' ? (
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => update('parked')}
        >
          <Pause className="mr-1.5 h-3.5 w-3.5" />
          {t('learningAsides.park')}
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          disabled={disabled}
          onClick={() => update('active')}
        >
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          {t('learningAsides.reopen')}
        </Button>
      )}
      <Button
        variant="ghost"
        size="sm"
        disabled={disabled}
        className="text-destructive hover:text-destructive"
        onClick={() => update('discarded')}
      >
        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
        {t('learningAsides.discard')}
      </Button>
    </>
  )
}
