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
- When the user gives an explicit recipient and clear email intent, run `clawmax-resend-send` immediately instead of describing what you plan to do.
- Only say the tool is unavailable or failed if you actually ran `clawmax-resend-send` and it returned an error.
- If `clawmax-resend-send` returns an error, stop and report that exact error. Do **not** retry with another method in the same turn.
- Do **not** claim an email was sent unless `clawmax-resend-send` returned a success message.
- After a successful send, confirm briefly. If the command did not confirm success, report the failure instead of implying delivery.
- Do **not** use `sessions_send`, `sessions_spawn`, or agent-to-agent messaging for this skill.
- Do **not** delegate email sending to subagents.
- Do **not** use generic message/email channel tools when this skill is assigned.
- Do **not** use `web_fetch`, Slack webhooks, Discord webhooks, or any external delivery service for this skill.
- Do **not** create local files or tell the user to send the email manually unless the user explicitly asked for that fallback.

## Content Sends
- For requests like `send that status` or `send both responses`, combine the relevant prior assistant content into one email body and send it with `clawmax-resend-send`.
- For inline content sends, do **not** create temporary files such as `current_status.txt` or `summary.md`. Pass the content directly with `--body`.
- Do **not** spawn subagents or wait on other sessions for normal resend content sends.
- For summaries, status updates, and other generated writeups, put the content directly in the email body by default.
- Do **not** create `summary.md` or attach a generated file unless the user explicitly asks for a file or attachment.
- Reuse the most recent recipient if the user says `same email`.

## File Sends
- For requests like `send your identity.md`, use `clawmax-resend-send --attach <path>`.
- For requests like `send your soul.md file to mmaximilien@gmail.com`, run:
  `clawmax-resend-send --to "mmaximilien@gmail.com" --subject "SOUL.md from <agent>" --body "Attached is SOUL.md from <agent>." --attach "<path to SOUL.md>"`
- Attach the original file as-is.
- Do **not** paste file contents into a generic message tool.
- Do **not** edit, patch, rewrite, or create copied workspace files such as `identity_identity.md` or `soul_copy.md` while preparing an attachment.

## Example
```bash
clawmax-resend-send --to "recipient@example.com" --subject "Subject Here" --body "Email body"
```
