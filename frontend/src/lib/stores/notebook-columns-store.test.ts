import { describe, expect, it } from 'vitest'
import { migrateNotebookColumns } from './notebook-columns-store'

describe('migrateNotebookColumns', () => {
  it('carries the Knowledge and Journey rail states to Sources and Studio', () => {
    expect(
      migrateNotebookColumns(
        {
          sourcesCollapsed: false,
          notesCollapsed: true,
          knowledgeCollapsed: true,
          journeyCollapsed: true,
        },
        0
      )
    ).toEqual({
      sourcesCollapsed: true,
      notesCollapsed: true,
      studioCollapsed: true,
    })
  })

  it('falls back to expanded panels for missing or malformed state', () => {
    expect(migrateNotebookColumns(undefined, 0)).toEqual({
      sourcesCollapsed: false,
      notesCollapsed: false,
      studioCollapsed: false,
    })
    expect(
      migrateNotebookColumns({ sourcesCollapsed: 'yes', studioCollapsed: true }, 1)
    ).toEqual({
      sourcesCollapsed: false,
      notesCollapsed: false,
      studioCollapsed: true,
    })
  })
})
