# Recommended Repository Structure

```text
/apps
  /storefront
  /admin
  /api
/packages
  /domain
  /types
  /ui
  /config
  /eslint-config
  /tsconfig
/docs
/specs
/decisions
/roadmap
/tasks
/engineering
/ui
/prompts
/tests
```

## Ownership

`apps/*` compose product surfaces.

`packages/domain` contains reusable domain types/value objects that truly belong in shared code.

Do not move everything into shared packages preemptively. A shared package is justified when at least two consumers genuinely need the same abstraction.

## Dependency direction

Prefer:

`UI -> application/API client -> domain/application -> persistence/integrations`

Never:

`database -> UI`

or

`provider SDK -> domain model`.
