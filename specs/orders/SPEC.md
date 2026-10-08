# Orders Spec

## Goal

Maintain one reliable internal order lifecycle.

## Admin board

New, Accepted, Preparing, Ready, Packed, Dispatched, Delivered; exception states visible.

## Acceptance

Every transition is validated, timestamped, permission-checked and auditable where required.

## Staff-entered orders (ADR-014)

Orders from WhatsApp, phone, walk-ins and other direct sources are entered from the dashboard ("New order") by any
role with `order.create`. They use the website's pricing (same total for the same cart), block delivery outside the
delivery areas, start accepted, record who entered them and how they are paid (cash / UPI / card, or pay later until
"Mark as paid"), and appear on the same board with their source.

Acceptance: same cart → same total as the website; a double submit creates one order; pay-later orders never expire
and count in sales only once paid; another restaurant cannot read or change them.
