# MAX_N_OPENCLAW_SETUP.md
# Setting Up Additional OpenClaw Instances (max1, max2, …)

_Written from the experience of setting up max0. Covers everything a human or agent needs to
stand up a new named instance from scratch, with or without a second phone._

---

## Overview: What Makes Each Instance Unique

Each OpenClaw instance needs:

| Requirement | max0 (this machine) | max1 (new machine) |
|---|---|---|
| Machine / OS account | MacBook (maximilien) | New Mac/Linux |
| OpenClaw install | `/Users/maximilien/github/maximilien/openclaw` | Separate clone |
| State directory | `~/.openclaw/` | `~/.openclaw/` (or `--profile maxN`) |
| Gateway port | 18789 | Different port (e.g. 18889) |
| WhatsApp number | +14158276319 (415) | **New number required** for clean separation |
| AI API key | OpenAI key (yours) | Same key works, or a different one |
| Browser extension | Chrome relay on this machine | Chrome relay on new machine |

**Key rule:** WhatsApp requires a unique phone number per independently-operating instance.
Two instances on the same number = both receive every message = chaos.
(WhatsApp does allow up to ~4 "linked devices" per number, but OpenClaw uses the full session,
so message routing becomes ambiguous.)

---

## Automation Scripts (Recommended)

The repo ships a one-command setup script that automates all steps below:

```bash
# From the openclaw repo root:
./scripts/instances/setup.sh <name> [options]

# Examples:
./scripts/instances/setup.sh max1 --whatsapp +14085551234
./scripts/instances/setup.sh max1 --whatsapp +14085551234 --allow-from +14089604761
./scripts/instances/setup.sh max1 --telegram BOT_TOKEN_HERE
./scripts/instances/setup.sh max1 --profile              # same machine, isolated state
./scripts/instances/setup.sh max1 --port 18889 --model openai/gpt-4o --whatsapp +14085551234
./scripts/instances/setup.sh max1 --dry-run              # preview without making changes
```

### What the script does (7 steps)

1. **Prerequisites** — verifies Node 22+, locates openclaw CLI
2. **State dir & port** — resolves `~/.openclaw` (or `~/.openclaw-<name>` with `--profile`), auto-finds a free port
3. **Config** — renders `templates/openclaw.json.tmpl` with a fresh random gateway token
4. **WhatsApp pairing** — runs `lib/whatsapp-pair.mjs` to print a pairing code (if `--whatsapp` given)
5. **Gateway service** — installs as a LaunchAgent (macOS) or systemd unit (Linux)
6. **Desktop shortcut** — `~/Desktop/<name>` → `~/.openclaw[-<name>]/workspace`
7. **Shell aliases** — adds `<name>logs`, `<name>status`, `<name>stop`, `<name>start` to `~/.zshrc`

### Key options

| Option | Description |
|---|---|
| `--whatsapp <+E.164>` | WhatsApp number for this instance |
| `--allow-from <+E.164>` | Your personal number allowed to message it (default: +14089604761) |
| `--telegram <token>` | Telegram bot token (from @BotFather) — no phone number needed |
| `--port <port>` | Gateway port (auto-detected if omitted) |
| `--model <model>` | AI model (default: `openai/gpt-4o`) |
| `--profile` | Same-machine mode: isolates state under `~/.openclaw-<name>` |
| `--no-gateway` | Skip gateway install (manual start later) |
| `--no-desktop` | Skip Desktop shortcut |
| `--no-aliases` | Skip shell alias setup |
| `--dry-run` | Show what would happen, make no changes |

> The script is idempotent-safe: running it again won't duplicate aliases (it checks first),
> and it will prompt before overwriting existing WhatsApp credentials.

---

## Option A: New Machine (Recommended for max1)

This is the cleanest setup. max1 lives on a different Mac/Linux box.

### Prerequisites

- macOS 13+ or Ubuntu 22+ (macOS preferred for LaunchAgent auto-start)
- Node.js 22+ (`node --version` must show v22+)
  - Install via Homebrew: `brew install node` or use `fnm`/`volta`
- pnpm: `npm install -g pnpm`
- Git
- An OpenAI API key (or compatible provider key)
- A phone number for WhatsApp (see "Phone Number Options" below)

### Step 1: Install OpenClaw

**Option 1 — Official release (recommended):**
```bash
npm install -g openclaw
openclaw --version  # should show 2026.x.x
```

**Option 2 — From the fork (same as max0):**
```bash
git clone https://github.com/maximilien/openclaw.git ~/github/maximilien/openclaw
cd ~/github/maximilien/openclaw
pnpm install
pnpm build
# Add to PATH or use full path: node dist/entry.js
npm link   # makes `openclaw` available globally from this clone
```

### Step 2: Run the Setup Wizard

```bash
openclaw configure
```

This interactively sets:
- AI model (choose `openai/gpt-4o` for speed, or `openai/gpt-5.1-codex` for reasoning)
- OpenAI API key
- Workspace directory (default: `~/.openclaw/workspace`)
- Gateway port (change to avoid collision if running on same machine as max0)
- WhatsApp / other channels

### Step 3: Configure `~/.openclaw/openclaw.json`

Minimal working config (adapt from max0's config):

```json
{
  "agents": {
    "defaults": {
      "model": { "primary": "openai/gpt-4o" },
      "workspace": "/Users/YOURNAME/.openclaw/workspace",
      "compaction": { "mode": "safeguard" },
      "maxConcurrent": 4,
      "subagents": { "maxConcurrent": 8 }
    }
  },
  "channels": {
    "whatsapp": {
      "dmPolicy": "allowlist",
      "selfChatMode": false,
      "allowFrom": ["+1YOURPERSONALNUMBER"],
      "groupPolicy": "allowlist",
      "groupAllowFrom": ["+1YOURPERSONALNUMBER"],
      "debounceMs": 0,
      "mediaMaxMb": 50
    }
  },
  "browser": {
    "enabled": true,
    "defaultProfile": "chrome"
  },
  "gateway": {
    "port": 18889,
    "mode": "local",
    "bind": "loopback",
    "auth": { "mode": "token", "token": "GENERATE_A_RANDOM_TOKEN_HERE" }
  },
  "skills": { "install": { "nodeManager": "npm" } }
}
```

Generate a token: `openssl rand -hex 24`

### Step 4: Link WhatsApp

Since the QR code is too large to scan in a terminal, use phone-number pairing:

```bash
# Set these to the correct paths for the new machine
BAILEYS="$(find ~/.openclaw -name 'baileys' -type d 2>/dev/null | head -1)"
# OR if using npm global install, find baileys under npm root:
# BAILEYS="$(npm root -g)/@whiskeysockets/baileys"

# Actually, easier: use the CLI login which generates a pairing code
openclaw channels login --channel whatsapp
```

If the QR is too large (terminal cuts it off), use the Baileys phone-pairing script
(see "WhatsApp Pairing Script" section below). This is what was done for max0.

### Step 5: Start the Gateway

```bash
openclaw gateway install   # installs as LaunchAgent (macOS) or systemd unit (Linux)
openclaw gateway status    # verify it's running
```

### Step 6: Set Up the Chrome Browser Relay

```bash
openclaw browser extension install
# Output: ~/.openclaw/browser/chrome-extension
# Note the path, then in Chrome:
#   1. Go to chrome://extensions
#   2. Enable Developer mode
#   3. Load unpacked → select the path above
#   4. Pin the extension, click it on each tab to enable relay
```

### Step 7: Add Helpful Aliases

Add to `~/.zshrc` or `~/.bashrc`:

```bash
# OpenClaw (max1)
alias oclogs='tail -f /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | node -e "const rl=require(\"readline\").createInterface({input:process.stdin});rl.on(\"line\",l=>{try{const o=JSON.parse(l);const msg=o[1]||o[0];if(msg&&typeof msg===\"string\")console.log(new Date().toLocaleTimeString(),o._meta?.logLevelName,\"|\",msg.substring(0,120));}catch{}});"'
alias ocstatus='openclaw gateway status'
alias ocstop='openclaw gateway stop'
alias ocstart='openclaw gateway install'
```

### Step 8: Desktop Shortcut to Workspace

```bash
ln -sf ~/.openclaw/workspace ~/Desktop/max1
```

---

## Option B: Same Machine, Second Profile (Advanced / Not Recommended for WhatsApp)

If you want two instances on the **same machine** (e.g. for testing), use `--profile`:

```bash
openclaw --profile max1 configure          # creates ~/.openclaw-max1/
openclaw --profile max1 gateway install    # separate LaunchAgent
openclaw --profile max1 channels login --channel whatsapp
```

**Caveats:**
- Must use a different gateway port (set in config or `--port`)
- Still requires a different WhatsApp number
- LaunchAgent label will differ (`ai.openclaw-max1.gateway`)
- State fully isolated under `~/.openclaw-max1/`

---

## Phone Number Options (Getting a Number Without a New Physical Phone)

Since WhatsApp requires a unique number per independent instance, here are options
when you don't have a second physical phone yet:

### Option 1: VoIP / Virtual Number Services

These give you a real phone number that can receive WhatsApp registration SMS/calls:

| Service | Cost | Notes |
|---|---|---|
| **Google Voice** | Free (US) | Works well; get at voice.google.com |
| **TextNow** | Free (US/CA) | App-based; free tier available |
| **Twilio** | ~$1/mo | Programmable, great for automation |
| **MySudo** | ~$1/mo | Privacy-focused, multiple numbers |
| **Hushed** | ~$2/mo | Simple burner number app |

**WhatsApp registration with VoIP:**
1. Get the number from the service
2. On any phone/tablet, open WhatsApp → Settings → Linked Devices → Link new device
3. Enter the VoIP number when prompted for phone number pairing
4. Receive the verification code via SMS or voice call to the VoIP service
5. Complete WhatsApp registration on that number
6. Then use OpenClaw's pairing code flow to link it as a "linked device"

> Note: WhatsApp has historically blocked some VoIP numbers. Google Voice is most reliable.
> If SMS fails, try the voice call option for verification.

### Option 2: Use a Different Channel (No Phone Required)

Start max1 without WhatsApp and add it later:

**Telegram (no phone required for a BOT):**
```bash
# 1. Message @BotFather on Telegram to create a bot → get a token
# 2. Add to openclaw.json:
openclaw channels add --channel telegram --token BOT_TOKEN_HERE
```

Then message the bot from your personal Telegram to interact with max1.

**Discord:**
- Create a Discord bot at discord.com/developers
- Add to openclaw.json via `openclaw channels add --channel discord`

> You can run max1 with Telegram/Discord first, then add WhatsApp once you have a number.

---

## WhatsApp Pairing Script (Phone Number Method)

If `openclaw channels login --channel whatsapp` produces a QR code too large to scan,
use this Baileys-based script. Run from the new machine after `pnpm install`:

```bash
# Find paths (adjust for your install method)
OPENCLAW_DIR="$HOME/github/maximilien/openclaw"  # or wherever your clone/install is
BAILEYS="$OPENCLAW_DIR/node_modules/.pnpm/$(ls $OPENCLAW_DIR/node_modules/.pnpm | grep whiskeysockets+baileys | head -1)/node_modules/@whiskeysockets/baileys"
BOOM="$OPENCLAW_DIR/node_modules/.pnpm/$(ls $OPENCLAW_DIR/node_modules/.pnpm | grep '@hapi+boom' | head -1)/node_modules/@hapi/boom"
PHONE="1XXXXXXXXXX"   # e.g. 14155551234 — no + prefix, no spaces

node --input-type=module << EOF
import makeWASocket, { useMultiFileAuthState, DisconnectReason } from '${BAILEYS}/lib/index.js';
import { Boom } from '${BOOM}/lib/index.js';

const authDir = \`\${process.env.HOME}/.openclaw/credentials/whatsapp/default\`;

async function connect(requestCode) {
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  const sock = makeWASocket({ auth: state, printQRInTerminal: false, mobile: false, keepAliveIntervalMs: 10000 });
  sock.ev.on('creds.update', saveCreds);
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr && requestCode) {
      try {
        const code = await sock.requestPairingCode('${PHONE}');
        console.log('\nPAIRING CODE: ' + code);
        console.log('WhatsApp → Settings → Linked Devices → Link a Device → "Link with phone number instead"\n');
      } catch (e) {
        console.error('Failed to get pairing code:', e.message);
      }
    }
    if (connection === 'open') {
      console.log('Linked and connected!');
      setTimeout(() => process.exit(0), 1000);
    }
    if (connection === 'close') {
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      if (statusCode === 515) {
        sock.ev.removeAllListeners();
        setTimeout(() => connect(false), 1000);  // normal post-pairing restart
      } else if (statusCode === DisconnectReason.loggedOut) {
        process.exit(1);
      } else {
        process.exit(0);
      }
    }
  });
}

connect(true);
setTimeout(() => { console.log('Timed out.'); process.exit(1); }, 300000);
EOF
```

**Critical notes:**
- The script will print an 8-character code (e.g. `FQC7EJBE`)
- On your phone with the target WhatsApp number: Settings → Linked Devices → Link a Device → "Link with phone number instead" → enter the code
- After you enter the code, WhatsApp sends a 515 "restart required" signal — the script handles this automatically and reconnects
- Once you see "Linked and connected!" — exit the script and start the gateway
- If you get a 401 on retry, delete `~/.openclaw/credentials/whatsapp/default/creds.json` and start over

---

## Key Differences Between Instances

| Topic | max0 | max1+ |
|---|---|---|
| State dir | `~/.openclaw/` | `~/.openclaw/` on new machine (or `~/.openclaw-max1/` with `--profile`) |
| Gateway port | 18789 | 18889 (or any free port) |
| LaunchAgent | `ai.openclaw.gateway` | `ai.openclaw.gateway` (different machine) or `ai.openclaw-max1.gateway` (same machine) |
| Browser relay port | 18792 (chrome relay) | 18892 (auto-derived from gateway port + 3) |
| WhatsApp number | +14158276319 (415 business) | New number |
| Model | `openai/gpt-5.1-codex` (slow, reasoning) | Consider `openai/gpt-4o` for faster responses |
| Workspace | `~/.openclaw/workspace` | `~/.openclaw/workspace` on new machine |
| Desktop shortcut | `~/Desktop/max0` → workspace | `~/Desktop/max1` → workspace |

---

## Notes on Model Choice

max0 uses `openai/gpt-5.1-codex` which is a reasoning/thinking model.
It gives excellent results but responses take 60–90 seconds.

For max1, consider `openai/gpt-4o` for faster everyday responses (~5–10s),
and only use the codex model when deep reasoning is needed.

To change: edit `agents.defaults.model.primary` in `openclaw.json`.
The gateway hot-reloads this config without restart.

---

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| Gateway port conflict | Another process on same port | Change port in config or use `--force` flag |
| WhatsApp 401 on reconnect | Stale/partial credentials | Delete `~/.openclaw/credentials/whatsapp/default/creds.json`, re-pair |
| WhatsApp 499 connection close | Normal idle timeout | Self-healing; retries automatically |
| "tab not found" in browser | Extension disconnected from relay | Click extension icon on Chrome tab to re-enable |
| tmsearch.uspto.gov not controllable | Legacy TESS site blocks CDP | Use `uspto.gov/trademarks/search` instead |
| No messages received in 30m warning | Normal keepalive restart | Self-healing; not an error |
| Pairing code "could not link device" | Code expired (~60s) | Run script again to get fresh code |

---

_Last updated: 2026-02-17 — max0 machine setup by Maximilien_
_This file lives at `~/.openclaw/workspace/MAX_N_OPENCLAW_SETUP.md` (also visible at `~/Desktop/max0/MAX_N_OPENCLAW_SETUP.md`)_
