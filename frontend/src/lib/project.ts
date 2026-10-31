/**
 * Where this project lives on GitHub. The app's links to the repository and
 * the docs (the update notice, help links) are built from these.
 */
export const PROJECT_REPO_URL = 'https://github.com/KilroyHere/open-notebook-factory'

/** A page of the docs on GitHub, e.g. `5-CONFIGURATION/ai-providers.md`. */
export function projectDocsUrl(path: string): string {
  return `${PROJECT_REPO_URL}/blob/main/docs/${path}`
}
