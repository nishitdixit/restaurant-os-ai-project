# Localization and Regionalization

## MVP

India-first.

- INR as default currency;
- IST display for merchant workflows where appropriate;
- English UI baseline.

## Design for later expansion

- ISO currency codes;
- timezone-aware timestamps;
- localized number/date formatting;
- configurable tax terminology;
- translated storefront content later.

## Never hard-code

Do not hard-code `₹`, `IST`, city/state names or tax assumptions inside domain logic when a configuration/value object is appropriate.
