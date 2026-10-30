'use client'

import { LearningAside } from '@/lib/types/api'
import { type ReferenceTitles, withAside } from '@/lib/utils/learning-asides'
import { DiveOpening, InlineDiveThread } from './InlineDiveThread'
import { useInlineDives } from './InlineDivesContext'

interface LearningThreadLinksProps {
  messageId: string
  asides: LearningAside[]
  onOpenAside: (asideId: string) => void
  onNavigateToMessage: (messageId: string) => void
  onReferenceClick?: (type: string, id: string) => void
  onDiveIntoQuestion?: (parent: LearningAside, question: string) => void
  onParkQuestion?: (parent: LearningAside, question: string) => void
  referenceTitles?: ReferenceTitles
}

/**
 * The dives branched from one assistant answer, as threads under it, each
 * with the dives started from its open questions nested inside. In the
 * notebook chat (`InlineDivesProvider`) a thread expands in place;
 * elsewhere its row opens the dive through `onOpenAside`.
 */
export function LearningThreadLinks({
  messageId,
  asides,
  onOpenAside,
  onNavigateToMessage,
  onReferenceClick,
  onDiveIntoQuestion,
  onParkQuestion,
  referenceTitles,
}: LearningThreadLinksProps) {
  const controller = useInlineDives()
  // A dive just created shows before the journey refetch lists it.
  const known = withAside(asides, controller?.activeAside)
  const roots = known.filter(
    (aside) =>
      aside.status !== 'discarded' &&
      !aside.parent_aside_id &&
      aside.anchor.message_id === messageId
  )
  const creating =
    controller?.creating?.messageId === messageId &&
    !controller.creating.parentAsideId
  if (roots.length === 0 && !creating) return null

  return (
    <div className="min-w-0 space-y-1.5">
      {roots.map((aside) => (
        <InlineDiveThread
          key={aside.id}
          aside={aside}
          asides={known}
          onOpenAside={onOpenAside}
          onNavigateToMessage={onNavigateToMessage}
          onReferenceClick={onReferenceClick}
          onDiveIntoQuestion={onDiveIntoQuestion}
          onParkQuestion={onParkQuestion}
          referenceTitles={referenceTitles}
        />
      ))}
      {creating && <DiveOpening />}
    </div>
  )
}
