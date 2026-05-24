# Mobile / Narrow-Width Audit

Last updated: May 24, 2026

## Summary

Focused mobile and narrow-width audit pass for issue `#143`.

This was not a full redesign. The goal was to improve reliability on the highest-traffic surfaces used in demos and first-run workflows.

## Audited Surfaces

- top-right notification dropdown
- BYOK / Partner Integrations modal
- Apply Agent Template modal

## Fixes Landed

### Notification dropdown

- mobile dropdown now uses inset positioning instead of a fixed desktop-sized width
- max height now respects the viewport on narrow screens
- content remains scrollable without falling off-screen

### BYOK modal

- modal padding tightened for small screens
- close button stays reachable
- header and descriptive copy no longer assume wide horizontal space
- overall max height now uses dynamic viewport height for better phone/tablet behavior

### Apply Agent Template modal

- modal body is scrollable at narrow heights
- action buttons stack vertically on small widths
- button row becomes full-width instead of forcing cramped horizontal layout

## What This Audit Did Not Claim

- full phone-first parity across every dashboard surface
- exhaustive responsiveness coverage for every modal and panel
- visual QA across all pages

Those remain follow-up work if mobile usage becomes a stronger product priority.

## Recommendation

For the next pass, focus on:

- agent chat panels
- add/create wizards
- template apply flows
- top bar density
- communications side panels
