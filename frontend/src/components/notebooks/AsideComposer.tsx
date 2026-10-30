'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { useTranslation } from '@/lib/hooks/use-translation'
import { isSendShortcut, sendShortcutHint } from '@/lib/utils/composer-shortcut'
import { cn } from '@/lib/utils'

// Unsent text per dive, so a draft survives folding the dive, opening it
// full height, or switching to another dive and back.
const drafts = new Map<string, string>()

/** Forget every unsent dive draft (tests start from a clean slate). */
export function clearAsideDrafts(): void {
  drafts.clear()
}

/**
 * The question box of a dive. It sends on Ctrl+Enter (⌘+Enter on macOS),
 * like the main chat, and says so in its placeholder. A sent question
 * leaves the box at once (the transcript shows it until the answer comes)
 * and comes back if sending fails.
 */
export function AsideComposer({
  asideId,
  isSending,
  disabled = false,
  onSendMessage,
  focusRequest = 0,
  className,
}: {
  asideId: string
  /** A question to this dive is being answered; another waits for it. */
  isSending: boolean
  /** Blocks typing and sending, e.g. while the transcript first loads. */
  disabled?: boolean
  onSendMessage: (asideId: string, message: string) => Promise<unknown>
  /** Bump to move the cursor here; it waits until the box is enabled. */
  focusRequest?: number
  className?: string
}) {
  const { t } = useTranslation()
  const [input, setInputState] = useState(() => drafts.get(asideId) ?? '')
  const inputRef = useRef(input)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  // Only requests made while the box is on screen count: a dive folded and
  // unfolded again does not grab the cursor (or a phone's keyboard).
  const handledFocusRequest = useRef(focusRequest)

  const setInput = (value: string) => {
    inputRef.current = value
    setInputState(value)
    if (value) drafts.set(asideId, value)
    else drafts.delete(asideId)
  }

  useEffect(() => {
    if (focusRequest === handledFocusRequest.current || disabled) return
    handledFocusRequest.current = focusRequest
    textareaRef.current?.focus({ preventScroll: true })
  }, [focusRequest, disabled])

  const send = async () => {
    const message = input.trim()
    if (!message || isSending || disabled) return
    setInput('')
    try {
      await onSendMessage(asideId, message)
    } catch {
      // The mutation owns the translated error toast. Give the question
      // back unless the learner already started another one.
      if (!inputRef.current.trim()) setInput(message)
    }
  }

  return (
    <div className={cn('flex gap-2', className)}>
      <Textarea
        ref={textareaRef}
        value={input}
        onChange={(event) => setInput(event.target.value)}
        placeholder={`${t('learningAsides.askPlaceholder')} (${t('chat.pressToSend', { key: sendShortcutHint() })})`}
        aria-label={t('learningAsides.askPlaceholder')}
        className="min-h-[42px] flex-1 resize-none"
        rows={1}
        disabled={disabled}
        onKeyDown={(event) => {
          if (isSendShortcut(event)) {
            event.preventDefault()
            void send()
          }
        }}
      />
      <Button
        size="icon"
        className="h-[42px] w-[42px]"
        onClick={() => void send()}
        disabled={!input.trim() || isSending || disabled}
        aria-label={t('learningAsides.send')}
      >
        {isSending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Send className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}
