# Syncing with Upstream

Open Notebook Factory is a fork of [Open Notebook](https://github.com/lfnovo/open-notebook) (`lfnovo/open-notebook`). From time to time the maintainer merges upstream `main` into this repository, so the fork keeps upstream's fixes and features. This page is the procedure, and the rules for the places where the two differ.

---

## 1. Add the upstream remote

In a clone of this repository (`origin` is `KilroyHere/open-notebook-factory`), add Open Notebook once:

```bash
git remote add upstream https://github.com/lfnovo/open-notebook.git
git remote -v    # origin: this fork; upstream: lfnovo/open-notebook
```

In a clone of a personal fork, `upstream` usually names this repository (see [Development Setup](development-setup.md)). Give Open Notebook another name there, such as `lfnovo`, and use it in the commands below.

## 2. Fetch and merge into a branch

Never merge into `main` directly. Branch from an up-to-date `main`:

```bash
git fetch origin
git fetch upstream
git switch -c chore/sync-upstream-YYYY-MM-DD origin/main
git log --oneline origin/main..upstream/main    # what is new upstream
git merge upstream/main
```

Merge; don't rebase. A merge keeps the fork's history as it is and records what was taken in, so the next sync brings only what is new.

If the merge stops on conflicts, resolve them (see [Where conflicts are expected](#where-conflicts-are-expected)) and finish it with `git commit`. Check the migration numbers (next step) first: a number clash always shows up as a conflict in `open_notebook/database/migrations/` and `async_migrate.py`.

## 3. Check the migration numbers

Database migrations are numbered files in `open_notebook/database/migrations/` (`N.surrealql` and `N_down.surrealql`), listed by hand in `open_notebook/database/async_migrate.py`. Upstream's stop at 25 today. The fork's own are 26 to 29:

| Migration | What it adds |
|---|---|
| 26 | Learning journeys, deep dives (`learning_aside`) and their conclusions (`learning_update`) |
| 27 | The link from a conclusion to the main-chat reply that used it |
| 28 | Named outline sections of a journey |
| 29 | The `kind` field that marks a dive's own chat session |

**Rule: if upstream adds a migration with a number the fork already uses, renumber the fork's migrations to come after upstream's.** Upstream's migrations keep their numbers.

For example, if upstream adds 26 and 27, the fork's 26 to 29 become 28 to 31:

1. During the merge, `HEAD` is the fork's side. Write the fork's files under their new numbers, highest first so nothing is overwritten, then take upstream's files for its numbers:

   ```bash
   K=2   # how many migrations upstream added
   M=open_notebook/database/migrations
   for n in 29 28 27 26; do
     git show HEAD:$M/$n.surrealql      > $M/$((n + K)).surrealql
     git show HEAD:$M/${n}_down.surrealql > $M/$((n + K))_down.surrealql
   done
   git checkout upstream/main -- $M/26.surrealql $M/26_down.surrealql $M/27.surrealql $M/27_down.surrealql
   git add $M
   ```

2. In `async_migrate.py`, list upstream's migrations first and then the fork's, in both the up and the down list.
3. Update every place that names the old numbers: the `-- Migration N:` comment at the top of each renamed file, `tests/test_learning_asides.py` (it reads migration files by number and checks how many there are), and the docs and CHANGELOG entries that mention migration 29.

**Why this order.** The migration runner records only the highest number a database has reached (in `_sbl_migrations`) and runs the migrations listed after it. A database coming from Open Notebook has upstream's migrations applied up to upstream's number, so the fork's must come after them.

**Databases that already ran the fork's migrations.** A fork database, including one on a `v1-dev` image, is already at 29. After a renumbering it counts as having run the first 29 migrations of the new list: it skips upstream's new ones and runs the last of the fork's again. Before you merge, decide how those databases get upstream's change, and record the decision in [decisions/](decisions/README.md). The fork's own migrations only define things `IF NOT EXISTS` or set values that are already set, so running them twice is safe; check whether upstream's new ones are.

## 4. Run the checks

Run what CI runs ([Before you open a PR](contributing.md#before-you-open-a-pr)):

```bash
uv sync
uv run ruff check .
uv run ruff format --check .
uv run python -m mypy .
uv run pytest tests/

cd frontend
npm install
npm run lint
npm run test
npm run build
npm run test:e2e
cd ..

python3 scripts/check_md_links.py
```

Then start the stack (`make start-all`). Migrations run when the API starts; the log shows `Migrations completed successfully. Database is now at version N`, where N is the new highest number. Run a deep dive end to end: **Go deeper** on an answer, ask a question, **Wrap up**, and check that the next main-chat reply shows **Used what you learned**.

## 5. Open a pull request

```bash
git push -u origin chore/sync-upstream-YYYY-MM-DD
gh pr create --repo KilroyHere/open-notebook-factory --base main \
  --title "chore: merge upstream Open Notebook (YYYY-MM-DD)"
```

In the description, give the upstream range you merged (`git log --oneline origin/main..upstream/main` from step 2), the conflicts you resolved and how, and any migrations you renumbered. Add a CHANGELOG entry under `## [Unreleased]` for what changes for this fork's users.

---

## Where conflicts are expected

The fork differs from upstream on purpose in the places below. A merge that touches them conflicts, or silently brings back upstream's version. Keep the fork's side, and apply the same rule to new upstream text.

- **The name.** The docs, templates and app text say Open Notebook Factory. "Open Notebook" stays only where it means the original project: credit, "a fork of Open Notebook", history (the decision records, the inherited security advisories) and upstream version numbers. Code identifiers keep their names (`open_notebook`, `OPEN_NOTEBOOK_*`, the `open_notebook` compose service).
- **Image names.** `docker-compose.yml`, the docs, the examples, the `Makefile`, `scripts/release-test/` and the workflows in `.github/workflows/` use `ghcr.io/kilroyhere/open-notebook-factory`. Upstream uses `lfnovo/open_notebook` and `ghcr.io/lfnovo/open-notebook`.
- **Links.** Links to the repository, its issues, raw files and clone URLs point to `KilroyHere/open-notebook-factory`. Links to the libraries the app depends on (Esperanto, Content Core, Podcast Creator, surreal-commands, ai-prompter) and credit links to Open Notebook stay as upstream has them.
- **The update check and app links.** The app compares its version with this repository, not with upstream (`api/routers/config.py`), and its update notice and help links open this repository and its docs. App code builds those URLs from `open_notebook/project.py` and `frontend/src/lib/project.ts`. `tests/test_project_links.py` fails if a merge brings a link to `lfnovo/open-notebook` back into app code.
- **Community removal.** The fork has no Discord, X account, website or GitHub Discussions, and its README has no star history, Trendshift badge or translated-README links. Help goes to this repository's Issues, and vulnerability reports to its security advisories. Upstream text that adds those back, such as a "Need help?" footer, is changed to point here.

Other places that usually conflict:

- **`README.md`** is the fork's own: keep its structure and take upstream's factual updates, such as the provider matrix.
- **`CHANGELOG.md`**: both sides add entries. Keep the fork's entries under `## [Unreleased]` and upstream's sections as upstream wrote them.
- **The fork's features** touch upstream code: the chat router (`api/routers/chat.py`, `api/routers/_chat_shared.py`), the chat prompt (`prompts/chat/system.jinja`), the notebook page layout and the chat panel in `frontend/src`. Upstream changes there need care so that deep dives keep working; the learning code itself (`api/routers/learning.py`, `open_notebook/domain/learning.py`) only exists here.
- **Decision records.** Upstream numbers its records on its own. If it adds a record with a number the fork already uses (ADR-014 or ADR-015), give the fork's record the next free number, as with migrations, and update the links to it.
- **`pyproject.toml` and `uv.lock`**: take upstream's dependency changes, and run `uv lock` if both sides changed the lock file. The version number is a release decision ([Release Process](../../.github/RELEASE_PROCESS.md)).
