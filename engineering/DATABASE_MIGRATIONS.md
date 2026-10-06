# Database Migration Rules

## Requirements

- migration is code-reviewed;
- migration is reversible where practical;
- large backfills are separated from schema deployment;
- indexes are considered for every new high-volume query;
- production migration duration is assessed.

## Safe rollout pattern

1. add compatible schema;
2. deploy code that understands both states;
3. backfill if required;
4. validate;
5. enforce constraints;
6. remove legacy fields only in a later release.

## Never

- drop a required production column without migration plan;
- rename a live field without compatibility strategy;
- run unbounded tenant-wide backfills during the request path.
