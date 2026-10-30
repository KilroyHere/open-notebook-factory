'use client'

import { useLayoutEffect, useRef, type RefObject } from 'react'
import {
  CHAT_SCROLLER_SELECTOR,
  revealInChat,
} from '@/lib/utils/chat-navigation'

/** Marks each message of a dive transcript, in transcript order. */
export const TRANSCRIPT_MESSAGE_ATTRIBUTE = 'data-transcript-message'

// The question just sent may sit this far below the visible area and still
// count as seen: it took the place of the box the learner typed it in, or
// was added just after the end they were reading.
const BELOW_VIEW_PX = 48
// After an inline dive's transcript come its question box and actions;
// still seeing those counts as being at the dive's end.
const AFTER_TRANSCRIPT_PX = 120
// The "Processing…" row a reply takes the place of.
const PROCESSING_ROW_PX = 24

/**
 * Whether the dive's end shows in `scroller`: the band from the top of its
 * last question to the end of its transcript, plus the question box after
 * it.
 */
function endInView(scroller: HTMLElement, questionTop: number, end: number) {
  const view = scroller.getBoundingClientRect()
  return (
    questionTop < view.bottom + BELOW_VIEW_PX &&
    end + AFTER_TRANSCRIPT_PX > view.top
  )
}

function messageElements(transcript: HTMLElement) {
  return transcript.querySelectorAll<HTMLElement>(
    `[${TRANSCRIPT_MESSAGE_ATTRIBUTE}]`
  )
}

/**
 * Keeps a learner who is following a dive with its conversation: when they
 * send a question, the question and "Processing…" are brought into view,
 * and when the reply arrives, its start is. Both only while the dive's end
 * is on screen (the question they sent, or the box they sent it from); a
 * learner who scrolled away to read, or whose view something else moved,
 * is left where they are. Scrolls only the scroller around the transcript
 * (the chat, or the full-height view), through revealInChat.
 */
export function useRevealNewReply({
  transcriptRef,
  asideId,
  messages,
  waiting,
  ready,
}: {
  transcriptRef: RefObject<HTMLElement | null>
  asideId: string
  messages: ReadonlyArray<{ type: string }>
  /** A question to this dive is on its way. */
  waiting: boolean
  /** The transcript has loaded, so a new answer in it is a reply, not history. */
  ready: boolean
}) {
  // The dive a question went out to, and how many messages it had then.
  const watch = useRef<{ asideId: string; from: number } | null>(null)
  // A dive that opens while a question is already out is not followed.
  const wasWaiting = useRef(waiting)

  useLayoutEffect(() => {
    const sent = waiting && !wasWaiting.current
    wasWaiting.current = waiting
    if (!sent) return
    const transcript = transcriptRef.current
    if (!ready || !transcript) {
      watch.current = null
      return
    }
    watch.current = { asideId, from: messages.length }
    const scroller = transcript.closest<HTMLElement>(CHAT_SCROLLER_SELECTOR)
    const shown = messageElements(transcript)
    const question = shown[shown.length - 1]
    // The "Processing…" row after the question.
    const end = transcript.lastElementChild
    if (!scroller || !question || !(end instanceof HTMLElement)) return
    const box = transcript.getBoundingClientRect()
    if (endInView(scroller, question.getBoundingClientRect().top, box.bottom)) {
      revealInChat(end, 'nearest')
    }
  }, [asideId, messages.length, ready, transcriptRef, waiting])

  useLayoutEffect(() => {
    const current = watch.current
    if (!current) return
    if (current.asideId !== asideId) {
      watch.current = null
      return
    }
    const index = messages.findIndex(
      (message, position) => position >= current.from && message.type === 'ai'
    )
    if (index < 0) return
    watch.current = null
    const transcript = transcriptRef.current
    const scroller = transcript?.closest<HTMLElement>(CHAT_SCROLLER_SELECTOR)
    if (!transcript || !scroller) return
    // Messages render in order, any question still on its way after them.
    const shown = messageElements(transcript)
    const reply = shown[index]
    if (!reply) return
    // Nothing above the reply moved when it came in: where the question is
    // and where the reply starts say whether the learner was at the end.
    const replyTop = reply.getBoundingClientRect().top
    const questionTop = shown[index - 1]?.getBoundingClientRect().top ?? replyTop
    if (endInView(scroller, questionTop, replyTop + PROCESSING_ROW_PX)) {
      revealInChat(reply, 'nearest')
    }
  }, [asideId, messages, transcriptRef])
}
