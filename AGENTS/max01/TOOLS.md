# TOOLS.md - Local Notes

Skills define _how_ tools work. This file is for _your_ specifics — the stuff that's unique to your setup.

## Browser Access

You have a browser tool. Use it. The Chrome extension relay is set up and attached.

**Default profile: `chrome`** — this gives you access to the user's actual Chrome tabs (the real browser, not a sandboxed one).

To access Google Calendar:
```
browser action="snapshot" profile="chrome"
```
This will show you the currently open tabs. Google Calendar is typically open. Use the targetId from the snapshot to interact with a specific tab.

To check what tabs are available:
```
browser action="tabs" profile="chrome"
```

To take a snapshot of a specific tab (e.g. Google Calendar):
```
browser action="snapshot" profile="chrome" targetId="<id from tabs>"
```

**When to use `profile="chrome"` vs `profile="openclaw"`:**
- `chrome` = user's actual browser tabs (Google Calendar, Gmail, etc.) — use this for reading real data
- `openclaw` = isolated openclaw-managed browser — use this for browsing the web without touching the user's session

## What Goes Here

Other things to add as you learn this setup:

- Camera names and locations
- SSH hosts and aliases
- Preferred voices for TTS
- Speaker/room names
- Device nicknames
- Anything environment-specific

---

Add whatever helps you do your job. This is your cheat sheet.
