import type { LearningAsideStatus } from '@/lib/types/api'

/** Translation key of each status's badge label. */
export const ASIDE_STATUS_KEYS: Record<LearningAsideStatus, string> = {
  active: 'learningAsides.status.active',
  parked: 'learningAsides.status.parked',
  resolved: 'learningAsides.status.resolved',
  discarded: 'learningAsides.status.discarded',
}

export function asideStatusVariant(
  status: LearningAsideStatus
): 'default' | 'secondary' | 'outline' | 'destructive' {
  if (status === 'active') return 'default'
  if (status === 'discarded') return 'destructive'
  return 'outline'
}

/** A dive still taking questions: neither wrapped up nor thrown away. */
export function isOpenDive(status: LearningAsideStatus): boolean {
  return status === 'active' || status === 'parked'
}
