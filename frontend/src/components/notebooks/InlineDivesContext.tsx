'use client'

import { createContext, useContext } from 'react'
import type {
  LearningAside,
  LearningAsideStatus,
  LearningResolutionDraft,
  ResolveLearningAsideRequest,
} from '@/lib/types/api'
import type { CreatingDive } from '@/lib/hooks/use-learning-asides'
import type { DiveAttention } from '@/lib/hooks/use-notebook-workspace'

/**
 * What the main chat needs to show dives as threads under their messages:
 * which dive is expanded (with its transcript), what is in flight, and the
 * dive actions. The notebook chat column provides it; the message rows read
 * it, so the generic chat panel does not pass dive state through every row.
 */
export interface InlineDivesController {
  /** The dive expanded inline, if any. */
  expandedAsideId: string | null
  /** The open dive with its transcript, once loaded. */
  activeAside?: LearningAside
  /** Where a new inline dive is being created. */
  creating: CreatingDive | null
  /** Where to take the learner once a thread is on screen. */
  attention: DiveAttention | null
  onAttended: (request: DiveAttention) => void
  /** The dive a question is on its way to, and that question. */
  sendingAsideId: string | null
  pendingMessage: string | null
  resolvingAsideId: string | null
  /** The expanded dive's transcript is loading for the first time. */
  isAsideLoading: boolean
  onExpand: (asideId: string) => void
  onCollapse: (asideId: string) => void
  onOpenFullHeight: (asideId: string) => void
  onSendMessage: (asideId: string, message: string) => Promise<unknown>
  /** Model-drafted resolution; on failure the form uses a local draft. */
  onDraftResolution?: (asideId: string) => Promise<LearningResolutionDraft>
  onResolve: (
    asideId: string,
    data: ResolveLearningAsideRequest
  ) => Promise<unknown>
  onUpdateStatus: (
    asideId: string,
    status: Exclude<LearningAsideStatus, 'resolved'>
  ) => Promise<unknown>
}

const InlineDivesContext = createContext<InlineDivesController | null>(null)

export const InlineDivesProvider = InlineDivesContext.Provider

/** The inline-dive controller, or `null` outside the notebook chat. */
export function useInlineDives(): InlineDivesController | null {
  return useContext(InlineDivesContext)
}
