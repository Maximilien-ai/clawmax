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

- uses the `clawmax-resend-send` command instead of asking you to manage API keys,
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

- This skill is a local capability, not an agent or session target.
- Do **not** use `sessions_send`, `sessions_spawn`, or agent-to-agent messaging with the name `clawmax-resend`.
- Keep outbound emails concise and actionable.
- Reuse the relevant recent assistant content when the user says "send that status", "send both responses", or similar.
- Assume the ClawMax bridge controls sender identity and formatting.
- Do **not** fall back to generic message/email channel tools, local desktop files, or “send it manually” instructions when this skill is assigned unless the user explicitly asks for that fallback.
- If the user asks to send a file such as `identity.md`, use `clawmax-resend-send --attach <path>` and send the file as an attachment instead of pasting the file contents into a generic message.
- Do **not** edit, patch, or rewrite the file when the user asked to send it. Attach the existing file as-is.
- Do **not** create copied workspace files such as `identity_identity.md` or `soul_copy.md` while preparing an attachment. Attach the original file directly.
- If the user says `same email`, reuse the most recent recipient email from the current conversation.
- If the user explicitly gives the recipient, what to send, and any attachment path, send it without asking again.
- If any of those are ambiguous, ask one short confirmation question before sending:
  - missing or unclear recipient,
  - unclear body/content to send,
  - unclear attachment choice,
  - potentially sensitive content the user did not clearly ask to email.
- If the user asks to send a file, prefer explicit workspace paths like `WORKFLOWS/outputs/report.md`. Bare filenames such as `identity.md` are allowed when the intended file is obvious.
- When a request says "do the work, then email it", complete the work first and treat the completed answer as the email body unless the user asked for a different body.
- When sending attachments, mention which files will be attached if there is any chance of ambiguity.

## Command To Use

Use this command to actually send the email:

```bash
clawmax-resend-send --to recipient@example.com --subject "Subject line"
```

Provide the body in one of these ways:

1. Pipe body text through stdin:

```bash
cat <<'EOF' | clawmax-resend-send --to recipient@example.com --subject "Status update"
First paragraph.

Second paragraph.
EOF
```

2. Use `--body` for short single-line content:

```bash
clawmax-resend-send --to recipient@example.com --subject "Quick update" --body "Done. The workflow completed successfully."
```

3. Use `--body-file` when you already wrote content to a file:

```bash
clawmax-resend-send --to recipient@example.com --subject "Release note" --body-file /tmp/release-note.txt
```

Attachments:

```bash
cat <<'EOF' | clawmax-resend-send \
  --to recipient@example.com \
  --subject "Report attached" \
  --attach WORKFLOWS/outputs/report.md
Please find the report attached.
EOF
```

Notes:

- `clawmax-resend-send` already knows the active agent id and workspace root in normal ClawMax runtime execution.
- You do not need to invent sender addresses or call the Resend API directly.
- If you need to send multiple previous responses, combine them into the body you pass to the command.
- Do **not** use generic message/email channel tools for this skill.
- Do **not** invent `channel: email` or similar tool payloads.
- When this skill is assigned, the correct send path is the `clawmax-resend-send` command.
