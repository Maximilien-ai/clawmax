# Resend

Use Resend when workspaces need transactional email delivery, outbound notifications, or React Email workflows.

## First cut in ClawMax

- persists a server-stored `RESEND_API_KEY`
- surfaces the official Resend skill catalog in partner-aware UI
- supports agent and workflow use cases that rely on imported Resend skills such as:
  - `resend`
  - `resend-cli`
  - `react-email`
  - `agent-email-inbox`
  - `email-best-practices`

## Notes

- This first cut does not auto-import the GitHub skill repo just by enabling the partner.
- Use the Skills surface to import the official Resend skills, then assign them to agents as needed.
