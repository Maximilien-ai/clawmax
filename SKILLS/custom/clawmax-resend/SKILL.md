---
name: clawmax-resend
description: |
  Sends outbound email through the ClawMax Resend bridge. Use this when an agent
  needs to email the workspace owner or another approved recipient without
  manually handling API keys, sender policy, or HTML formatting.
emoji: "✉️"
tags:
  - email
  - resend
  - communications
  - clawmax
---

# ClawMax Resend Bridge

This skill is the default ClawMax-owned path for sending email with Resend.

## What It Does

- uses the ClawMax dashboard Resend bridge instead of asking you to manage API keys,
- applies the configured ClawMax sender policy,
- sends a formatted HTML email plus plain-text fallback,
- works best for direct "send this in an email" tasks.

## When To Use

Use this skill when:

- the user asks you to send a status update by email,
- you need to deliver a concise summary to the workspace owner,
- you want the safe/default ClawMax Resend path.

## Prefer Other Resend Skills When

- you need low-level Resend CLI or platform operations: use `resend-cli`
- you need to design or preview email templates: use `react-email`

## Guidance

- Keep outbound emails concise and actionable.
- Reuse the latest assistant answer when the user says "send that status" or similar.
- Assume the ClawMax bridge controls sender identity and formatting.
