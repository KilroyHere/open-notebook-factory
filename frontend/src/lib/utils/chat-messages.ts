import type { NotebookChatMessage } from '@/lib/types/api'

/** The ID prefix of a question shown before the API has stored it. */
export const PENDING_MESSAGE_PREFIX = 'temp-'

/**
 * A question on its way: shown at once, before the API has stored it and
 * given it its real ID.
 */
export function isPendingMessage(message: Pick<NotebookChatMessage, 'id'>): boolean {
  return message.id.startsWith(PENDING_MESSAGE_PREFIX)
}
