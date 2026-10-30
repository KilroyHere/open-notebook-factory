'use client'

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { GitBranch, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCreateNote } from '@/lib/hooks/use-notes'
import { useTranslation } from '@/lib/hooks/use-translation'
import { CHAT_SCROLLER_SELECTOR } from '@/lib/utils/chat-navigation'
import { selectedPassage } from '@/lib/utils/text-selection'

// Touch selections only report through `selectionchange`; let a drag settle.
const SETTLE_MS = 150
// Keep the toolbar's center this far from the window's edges.
const EDGE_PX = 96
const GAP_PX = 8
const TOOLBAR_HEIGHT_PX = 40

// One `selectionchange` listener for every answer on the page.
const listeners = new Set<() => void>()
let settleTimer: number | undefined

function notifySettled() {
  window.clearTimeout(settleTimer)
  settleTimer = window.setTimeout(() => {
    for (const listener of listeners) listener()
  }, SETTLE_MS)
}

function onSelectionSettled(listener: () => void): () => void {
  if (listeners.size === 0) {
    document.addEventListener('selectionchange', notifySettled)
  }
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      document.removeEventListener('selectionchange', notifySettled)
      window.clearTimeout(settleTimer)
    }
  }
}

interface PassageSelection {
  text: string
  top: number
  left: number
}

function readSelection(root: HTMLElement): PassageSelection | null {
  if (root.closest('[inert]')) return null
  const selection = window.getSelection?.()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }
  const range = selection.getRangeAt(0)
  if (!root.contains(range.commonAncestorContainer)) return null
  const text = selectedPassage(range)
  if (!text) return null

  const rect =
    typeof range.getBoundingClientRect === 'function'
      ? range.getBoundingClientRect()
      : root.getBoundingClientRect()
  // A passage scrolled out of the chat takes its toolbar with it.
  const chat = root.closest(CHAT_SCROLLER_SELECTOR)?.getBoundingClientRect()
  if (chat && chat.height > 0 && (rect.bottom < chat.top || rect.top > chat.bottom)) {
    return null
  }
  const width = window.innerWidth
  const center = rect.left + rect.width / 2
  const left =
    width > EDGE_PX * 2
      ? Math.min(Math.max(center, EDGE_PX), width - EDGE_PX)
      : width / 2
  // Below the passage, where phones leave room (their own menu sits above
  // it), unless the passage ends near the bottom of the window.
  const below = rect.bottom + GAP_PX
  const top =
    below + TOOLBAR_HEIGHT_PX > window.innerHeight
      ? Math.max(rect.top - GAP_PX - TOOLBAR_HEIGHT_PX, GAP_PX)
      : below
  return { text, top, left }
}

function samePlace(a: PassageSelection | null, b: PassageSelection | null) {
  return a === b || (!!a && !!b && a.text === b.text && a.top === b.top && a.left === b.left)
}

/**
 * Wraps an assistant answer. Selecting part of it shows a small toolbar:
 * Go deeper starts a dive about that passage, Save to note keeps it as a
 * note. The toolbar follows the answer in the tab order, so Tab reaches it
 * after selecting, a screen reader hears that it is there, and Escape
 * dismisses it. Selecting and copying work as usual.
 */
export function SelectionActions({
  children,
  onGoDeeper,
  notebookId,
}: {
  children: ReactNode
  onGoDeeper?: (passage: string) => void
  notebookId?: string
}) {
  const { t } = useTranslation()
  const rootRef = useRef<HTMLDivElement>(null)
  const [selection, setSelection] = useState<PassageSelection | null>(null)
  // A passage the learner dismissed stays quiet until the selection changes.
  const dismissed = useRef<string | null>(null)
  const enabled = Boolean(onGoDeeper || notebookId)

  const refresh = useCallback(() => {
    const root = rootRef.current
    const next = root ? readSelection(root) : null
    if (!next) dismissed.current = null
    const shown = next && next.text === dismissed.current ? null : next
    setSelection((current) => (samePlace(current, shown) ? current : shown))
  }, [])

  useEffect(() => (enabled ? onSelectionSettled(refresh) : undefined), [enabled, refresh])

  // The toolbar is fixed to the window: keep it on the passage.
  useEffect(() => {
    if (!selection) return
    let frame = 0
    const follow = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(refresh)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      dismissed.current = selection.text
      setSelection(null)
    }
    window.addEventListener('scroll', follow, true)
    window.addEventListener('resize', follow)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', follow, true)
      window.removeEventListener('resize', follow)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [selection, refresh])

  if (!enabled) return <>{children}</>

  const finish = () => {
    window.getSelection?.()?.removeAllRanges()
    dismissed.current = null
    setSelection(null)
  }

  return (
    <>
      <div ref={rootRef} onMouseUp={refresh} onKeyUp={refresh} className="min-w-0">
        {children}
      </div>
      {selection && (
        <div
          role="toolbar"
          aria-label={t('learningAsides.selectionActions')}
          // Pressing a button must not clear the selection it acts on.
          onMouseDown={(event) => event.preventDefault()}
          style={{ top: selection.top, left: selection.left }}
          className="fixed z-40 flex -translate-x-1/2 items-center gap-1 rounded-full border bg-popover p-1 text-popover-foreground shadow-pop"
        >
          {onGoDeeper && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 gap-1 rounded-full px-2.5 text-xs"
              onClick={() => {
                onGoDeeper(selection.text)
                finish()
              }}
            >
              <GitBranch className="h-3.5 w-3.5 text-teal" />
              {t('learningAsides.goDeeper')}
            </Button>
          )}
          {notebookId && (
            <SavePassageButton
              notebookId={notebookId}
              passage={selection.text}
              onSaved={finish}
            />
          )}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {selection ? t('learningAsides.selectionActionsHint') : ''}
      </span>
    </>
  )
}

function SavePassageButton({
  notebookId,
  passage,
  onSaved,
}: {
  notebookId: string
  passage: string
  onSaved: () => void
}) {
  const { t } = useTranslation()
  const createNote = useCreateNote()
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1 rounded-full px-2.5 text-xs"
      onClick={() => {
        // Titled by the API, like an answer saved with Save to note.
        createNote.mutate({ content: passage, note_type: 'ai', notebook_id: notebookId })
        onSaved()
      }}
    >
      <Save className="h-3.5 w-3.5" />
      {t('common.saveToNote')}
    </Button>
  )
}
