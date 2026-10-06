# Notifications Spec

## Goal

Send reliable transactional updates without blocking core operations.

## Requirements

- event-driven;
- provider adapter;
- idempotency;
- retries;
- delivery status;
- admin visibility for failures.

## Acceptance

A transient provider failure retries, but duplicate domain events do not cause duplicate customer sends.
