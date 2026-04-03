---
name: luma-event-insights
description: |
  Starter skill for analyzing Lu.ma events, attendees, invites, and engagement
  signals from organizer-provided API access, exports, or manual event inputs.
  Use this when a template or workflow needs a repeatable path to turn Lu.ma
  event data into an organizer-ready analysis brief.
emoji: "📅"
tags:
  - events
  - analytics
  - luma
  - research
---

# Lu.ma Event Insights

This skill is a starter protocol for collecting and analyzing Lu.ma event data.
It is designed to work with one of three input paths:

1. Organizer-provided Lu.ma API access
2. Organizer-exported CSV/JSON files
3. Manual event URLs, slugs, notes, and attendee lists

## Required Inputs

- Lu.ma event URL, slug, organizer page, or event list
- Organizer question:
  - attendance quality
  - invite conversion
  - repeat attendees
  - VIP / speaker mix
  - chat or social signals
  - trends across events
- Time window or event range
- Output artifact:
  - analysis memo
  - organizer recap
  - dashboard brief
  - trend summary

## Secure Setup

Prefer secure runtime configuration over hardcoding credentials.

- `LUMA_API_KEY`
- `LUMA_EVENT_IDS`
- `LUMA_EXPORT_DIR`

If direct Lu.ma API access is not available, use exported files and organizer notes
as the source of truth instead of inventing missing data.

## Working Method

1. Confirm the exact event scope and organizer question.
2. Confirm which input path is available:
   - API
   - exports
   - manual inputs
3. Build a source inventory:
   - events
   - attendees
   - invites / RSVPs
   - comments / chats / external signals
4. Separate facts from interpretation.
5. Produce:
   - key metrics
   - strongest patterns
   - anomalies
   - recommended next actions

## Suggested Analysis Sections

- Event overview:
  - date, format, topic, host, venue, capacity
- Attendance:
  - RSVPs, checked-in attendees, no-shows, repeat guests, VIPs
- Invite funnel:
  - invite volume, acceptance, declines, waitlist movement
- Signal review:
  - comments, organizer notes, social echoes, qualitative themes
- Cross-event trends:
  - timing, topic, location, audience mix, conversion quality
- Recommendations:
  - repeat
  - change
  - test next

## Output Standard

Always state:

- what data was available
- what was missing
- which findings are high-confidence
- which conclusions are directional only

## Example Commands

```bash
# Inspect exported organizer data
ls -la "$LUMA_EXPORT_DIR"

# Search for event-related exports
find "$LUMA_EXPORT_DIR" -maxdepth 2 -type f | rg "event|invite|attendee|guest|rsvp"

# Review CSV headers before analysis
head -5 "$LUMA_EXPORT_DIR"/events.csv
head -5 "$LUMA_EXPORT_DIR"/attendees.csv
head -5 "$LUMA_EXPORT_DIR"/invites.csv
```

If the workspace later adds a live Lu.ma API fetcher, keep the same analysis flow
and swap only the ingestion step.
