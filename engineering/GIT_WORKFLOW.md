# Git Workflow

## Branches

Keep main deployable.

Use short-lived feature branches or worktrees.

## Commit style

Prefer focused commits:

- `feat:`
- `fix:`
- `refactor:`
- `test:`
- `docs:`
- `chore:`

## Pull request checklist

- requirement/spec linked;
- tests added/updated;
- migrations reviewed;
- tenant isolation considered;
- API contract updated;
- docs/ADR updated if architecture changed;
- observability considered;
- screenshots/UX notes for UI changes.

## No giant AI commits

An AI agent should not combine unrelated modules in one change merely because they were generated in the same session.
