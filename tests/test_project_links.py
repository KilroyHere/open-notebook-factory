"""The app links to this project, not to the one it was forked from.

Merging upstream can bring links to lfnovo/open-notebook back into the app
(help links, the update check). App code should build them from
``open_notebook.project`` (backend) or ``frontend/src/lib/project.ts``
(frontend) instead.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UPSTREAM = "github.com/lfnovo/open-notebook"
CODE_DIRS = ["api", "open_notebook", "commands", "frontend/src"]
SUFFIXES = {".py", ".ts", ".tsx"}


def test_app_code_links_to_this_project_not_upstream():
    hits = [
        f"{path.relative_to(ROOT)}:{number}"
        for directory in CODE_DIRS
        for path in sorted((ROOT / directory).rglob("*"))
        if path.suffix in SUFFIXES and "node_modules" not in path.parts
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1)
        if UPSTREAM in line
    ]

    assert hits == [], (
        "Link to this project via open_notebook.project or "
        f"frontend/src/lib/project.ts instead: {', '.join(hits)}"
    )
