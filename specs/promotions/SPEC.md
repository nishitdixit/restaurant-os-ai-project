# Promotions Spec

## Goal

Support safe, understandable discounts.

## MVP rules

- code;
- date window;
- active/paused;
- minimum order;
- new-customer rule;
- fixed/percentage benefit;
- usage cap.

## Acceptance

Promotion redemption is atomic and cannot exceed configured use limits under concurrent checkout attempts.

## Who can use an offer (ADR-014)

- Shown on the website (PUBLIC), code only (CODE_ONLY) or staff only (STAFF_ONLY).
- Staff-only offers are never listed or accepted on the website (an unknown-code error) and can be applied by any
  staff member to an order they enter; only Owner/Manager create them.
- Each use records who applied it (customer at checkout or a staff member); the Offers page and analytics split uses
  by website vs staff.
