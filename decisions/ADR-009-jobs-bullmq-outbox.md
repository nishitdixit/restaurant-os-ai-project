# ADR-009: Background Jobs — Redis/BullMQ with a Transactional Outbox

Status: Accepted
Date: 2026-10-06

## Context

Notifications must not block or roll back order operations, must retry transient failures, and must
never send duplicates (specs/notifications). `docs/ARCHITECTURE.md` recommends Redis + BullMQ and an
outbox "once asynchronous side effects become meaningful".

## Decision

- Business transactions write `domain_events` rows in the same transaction as the state change.
- A worker process (`apps/api/src/worker.ts`) relays unpublished events to BullMQ (`jobId` = event id,
  `FOR UPDATE SKIP LOCKED`, so several workers are safe and re-publishing is a no-op).
- Event jobs create `notifications` rows, unique per (tenant, event, channel, recipient); send jobs
  retry with exponential backoff up to `NOTIFICATION_MAX_ATTEMPTS`, recording every attempt.
- A BullMQ job scheduler runs `expire-unpaid-orders` every minute.
- The API never talks to Redis for correctness. Admin "retry" writes an outbox event the worker picks up.

## Consequences

If Redis or the worker is down, orders still succeed; events accumulate and are delivered when the
worker returns. Redis is required to run the worker (local: Docker or a Redis binary; hosted: any
TCP Redis such as Upstash `rediss://`).
