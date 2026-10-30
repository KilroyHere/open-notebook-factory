import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface NotebookColumnsState {
  sourcesCollapsed: boolean
  notesCollapsed: boolean
  studioCollapsed: boolean
  toggleSources: () => void
  toggleNotes: () => void
  toggleStudio: () => void
  setSources: (collapsed: boolean) => void
  setNotes: (collapsed: boolean) => void
  setStudio: (collapsed: boolean) => void
}

type PersistedColumns = Pick<
  NotebookColumnsState,
  'sourcesCollapsed' | 'notesCollapsed' | 'studioCollapsed'
>

/**
 * Version 0 stored a Knowledge rail (sources + notes) and a Journey rail. The
 * Sources panel now stands where the Knowledge rail stood and Studio where the
 * Journey rail stood, so each keeps the state the user last chose for it.
 */
export function migrateNotebookColumns(
  persisted: unknown,
  version: number
): PersistedColumns {
  const state = (persisted ?? {}) as Record<string, unknown>
  const flag = (key: string) =>
    typeof state[key] === 'boolean' ? (state[key] as boolean) : undefined
  if (version < 1) {
    return {
      sourcesCollapsed:
        flag('knowledgeCollapsed') ?? flag('sourcesCollapsed') ?? false,
      notesCollapsed: flag('notesCollapsed') ?? false,
      studioCollapsed: flag('journeyCollapsed') ?? false,
    }
  }
  return {
    sourcesCollapsed: flag('sourcesCollapsed') ?? false,
    notesCollapsed: flag('notesCollapsed') ?? false,
    studioCollapsed: flag('studioCollapsed') ?? false,
  }
}

export const useNotebookColumnsStore = create<NotebookColumnsState>()(
  persist(
    (set) => ({
      sourcesCollapsed: false,
      notesCollapsed: false,
      studioCollapsed: false,
      toggleSources: () => set((state) => ({ sourcesCollapsed: !state.sourcesCollapsed })),
      toggleNotes: () => set((state) => ({ notesCollapsed: !state.notesCollapsed })),
      toggleStudio: () => set((state) => ({ studioCollapsed: !state.studioCollapsed })),
      setSources: (collapsed) => set({ sourcesCollapsed: collapsed }),
      setNotes: (collapsed) => set({ notesCollapsed: collapsed }),
      setStudio: (collapsed) => set({ studioCollapsed: collapsed }),
    }),
    {
      name: 'notebook-columns-storage',
      version: 1,
      migrate: (persisted, version) => migrateNotebookColumns(persisted, version),
      partialize: (state) => ({
        sourcesCollapsed: state.sourcesCollapsed,
        notesCollapsed: state.notesCollapsed,
        studioCollapsed: state.studioCollapsed,
      }),
    }
  )
)
