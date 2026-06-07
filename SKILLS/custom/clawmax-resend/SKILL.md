---
name: clawmax-resend
description: Send outbound email through the ClawMax Resend bridge.
emoji: "✉️"
tags:
  - email
  - resend
  - communications
  - clawmax
---

# SKILL.md - ClawMax Resend Skill

## Overview
Use this skill to send outbound email through the ClawMax Resend bridge.

## Rules
- This skill is a local capability, not an agent, channel, or session target.
- Use `clawmax-resend-send` in the current agent session.
- Do **not** use `sessions_send`, `sessions_spawn`, or agent-to-agent messaging for this skill.
- Do **not** delegate email sending to subagents.
- Do **not** use generic message/email channel tools when this skill is assigned.
- Do **not** create local files or tell the user to send the email manually unless the user explicitly asked for that fallback.

## Content Sends
- For requests like `send that status` or `send both responses`, combine the relevant prior assistant content into one email body and send it with `clawmax-resend-send`.
- Reuse the most recent recipient if the user says `same email`.

## File Sends
- For requests like `send your identity.md`, use `clawmax-resend-send --attach <path>`.
- Attach the original file as-is.
- Do **not** paste file contents into a generic message tool.
- Do **not** edit, patch, rewrite, or create copied workspace files such as `identity_identity.md` or `soul_copy.md` while preparing an attachment.

## Example
```bash
clawmax-resend-send --to "recipient@example.com" --subject "Subject Here" --body "Email body"
```
