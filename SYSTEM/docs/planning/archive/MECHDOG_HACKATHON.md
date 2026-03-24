# MechDog OpenClaw Hackathon — Nebius.Build SF

**Event:** [Nebius.Build SF](https://lu.ma/nebius-build-sf-mar15-2026)
**Date:** Sunday, March 15, 2026
**Time:** 11:00 AM – 8:00 PM PDT
**Location:** San Francisco
**Hackathon Start:** 1:00 PM
**Format:** Robotics workshop + hackathon + judged demos + prizes

**Available Prep Time:**
- **Train to SF:** 1 hour (finishing code from night before)
- **Hackathon:** 11am-8pm (7 hours total, workshop 11am-1pm, building 1pm-6pm, demo 6pm-8pm)

---

## 🎯 Project Goal

Natural language control of a **Hiwonder MechDog** quadruped robot via **OpenClaw**, with optional **Nebius GPU-accelerated vision inference**. Demo at the Nebius.Build SF hackathon robotics track.

**Demo Vision:** "MechDog, walk forward 3 seconds" → OpenClaw agent → Dog moves

---

## 🤖 Hardware

| Component | Details |
|-----------|---------|
| **Robot** | Hiwonder MechDog (Quadruped, ESP32, 8 coreless servos) |
| **Controller** | ESP32 with WiFi, IMU, ultrasonic sensor |
| **Vision** | ESP32-S3 AI camera module (onboard) |
| **Voice** | AI voice interaction module (onboard) |
| **Compute (optional)** | Nebius GPU cloud (NVIDIA H100) for VLM inference |
| **Dev machine** | Mac (OpenClaw gateway) |

**MechDog Status:** ✅ Arrived Friday March 13

---

## 🏗️ Architecture

```
User (natural language via Telegram/WhatsApp/Slack)
    ↓
OpenClaw Gateway (Mac)
    ↓
OpenClaw Skill: mechdog-control
    ↓
Python bridge (HTTP → ESP32 WiFi API)
    ↓
MechDog ESP32 (locomotion, vision, voice)
    ↓ [optional]
Nebius GPU (VLM vision inference — camera feed → scene understanding)
```

---

## 📦 Software Stack

- **OpenClaw** — AI agent framework (Node >=22, `npm install -g openclaw@latest`)
- **Python** — MechDog SDK bridge (Hiwonder Python SDK)
- **OpenClaw Skill** — TypeScript wrapper calling Python bridge
- **LLM** — Claude Sonnet (via Anthropic API) as the reasoning model
- **Vision (optional)** — Qwen VLM or Gemini Robotics-ER on Nebius GPU

---

## 📅 Realistic Timeline — ONE DAY SPRINT

### ✅ Friday March 13 — Dog Arrives (DONE)
- [x] Unbox and assemble MechDog (~90 min)
- [x] Connect to WiFi, verify Python SDK communication
- [x] Test basic locomotion commands (walk, turn, sit, stand)

### 🔥 Saturday Night (9pm-12am) — CRITICAL PREP (3 hours)
**Must have working demo before sleep**

- [ ] **Repo setup** (30min):
  - Create GitHub repo `openclaw-mechdog`
  - Basic structure: skills/, bridge/, docs/, demo/
- [ ] **Python bridge** (1h):
  - bridge.py: Translate commands to MechDog ESP32 HTTP
  - Test: Can control dog from command line
- [ ] **OpenClaw skill** (1h):
  - mechdog/index.ts: `move` and `action` tools
  - Test: Can control dog via OpenClaw agent
- [ ] **End-to-end test** (30min):
  - Natural language → OpenClaw → dog moves
  - Record backup demo video

**Must be done before sleep: Working natural language → dog control**

### 🚂 Sunday Morning Train (9am-10am) — POLISH (1 hour)
- [ ] Fix any bugs from Saturday night
- [ ] Polish demo script
- [ ] Prepare presentation notes
- [ ] Charge MechDog battery to 100%

### 🏆 Sunday Hackathon (11am-8pm)

#### Workshop (11:00 AM - 1:00 PM)
- [ ] Arrive, set up workspace
- [ ] Attend robotics workshop
- [ ] Network, scope out competition

#### Building (1:00 PM - 6:00 PM) — 5 HOURS
**Priority 1 (Must Do):**
- [ ] Polish existing demo (1h): Smooth, repeatable, impressive
- [ ] Add error handling (30min): Graceful failures
- [ ] Practice demo 10+ times (30min): Muscle memory

**Priority 2 (If Time):**
- [ ] Nebius GPU vision integration (2h): Camera → VLM → description
- [ ] Vision-guided navigation (1h): "Walk toward red object"

**Priority 3 (Stretch):**
- [ ] Voice wake word integration
- [ ] Multiagent coordination

#### Demo + Judging (6:00 PM - 8:00 PM)
- [ ] Execute demo script (2 min)
- [ ] Answer judge questions
- [ ] Network and celebrate!

---

## 🎬 Demo Script (for judging)

1. **"MechDog, walk forward for 3 seconds"**
2. **"Now turn left and sit"**
3. **"What do you see in front of you?"** ← VLM vision
4. **"Walk toward the red object"** ← vision-guided locomotion (stretch goal)
5. **Multiagent stretch:** second OpenClaw instance coordinating

---

## 🚀 Stretch Goals

| Goal | Complexity | Wow Factor | Priority |
|------|------------|------------|----------|
| Vision-guided navigation (VLM + locomotion) | Medium | High | 🔥 High |
| Voice wake word → OpenClaw → action | Low | Medium | Medium |
| Nebius GPU inference for real-time scene understanding | Medium | High | 🔥 High |
| Multiagent: two OpenClaw instances coordinating | High | Very High | Low |
| RosClaw bridge for ROS2 compatibility | High | Medium | Low |

---

## 💻 OpenClaw Skill Scaffold

```typescript
// skills/mechdog/skill.md describes capabilities to the agent
// skills/mechdog/index.ts — core skill implementation

import { execSync } from 'child_process';

const MECHDOG_IP = process.env.MECHDOG_IP || '192.168.x.x';

export const tools = {
  move: {
    description: 'Move MechDog in a direction',
    parameters: {
      direction: { type: 'string', enum: ['forward', 'backward', 'left', 'right', 'stop'] },
      duration_ms: { type: 'number', description: 'How long to move in milliseconds' }
    },
    execute: async ({ direction, duration_ms }) => {
      execSync(`python3 bridge.py --cmd move --dir ${direction} --ms ${duration_ms} --ip ${MECHDOG_IP}`);
      return `MechDog moving ${direction} for ${duration_ms}ms`;
    }
  },

  action: {
    description: 'Perform a preset MechDog action',
    parameters: {
      action: { type: 'string', enum: ['sit', 'stand', 'shake', 'wave', 'dance', 'balance'] }
    },
    execute: async ({ action }) => {
      execSync(`python3 bridge.py --cmd action --name ${action} --ip ${MECHDOG_IP}`);
      return `MechDog performing: ${action}`;
    }
  },

  look: {
    description: 'Get a description of what MechDog sees via its camera',
    parameters: {},
    execute: async () => {
      // Capture frame from ESP32-S3 camera, send to VLM
      const result = execSync(`python3 vision.py --ip ${MECHDOG_IP}`).toString();
      return result;
    }
  }
};
```

---

## 🐍 Python Bridge Scaffold

```python
# bridge.py — translates OpenClaw tool calls to MechDog ESP32 HTTP commands
import argparse
import requests

parser = argparse.ArgumentParser()
parser.add_argument('--cmd', required=True)
parser.add_argument('--ip', required=True)
parser.add_argument('--dir', default=None)
parser.add_argument('--ms', type=int, default=1000)
parser.add_argument('--name', default=None)
args = parser.parse_args()

BASE_URL = f"http://{args.ip}"

if args.cmd == 'move':
    requests.post(f"{BASE_URL}/move", json={
        "direction": args.dir,
        "duration": args.ms
    })
elif args.cmd == 'action':
    requests.post(f"{BASE_URL}/action", json={
        "name": args.name
    })
```

---

## 📚 Key Resources

- [OpenClaw GitHub](https://github.com/openclaw/openclaw)
- [OpenClaw Docs](https://openclaw.ai)
- [Hiwonder MechDog Product Page](https://www.hiwonder.com/products/mechdog)
- [ClawBody (Reachy Mini reference implementation)](https://github.com/tomrikert/clawbody)
- [RosClaw — OpenClaw to ROS2 bridge](https://github.com/PlaiPin/rosclaw)
- [OpenClaw Robotics Community](https://www.openclawrobotics.com)
- [Nebius GPU Cloud](https://nebius.com)
- [Nebius.Build SF Event](https://lu.ma/nebius-build-sf-mar15-2026)

---

## 🤔 Design Decisions

### Why MechDog over xArm1S?

- ✅ **WiFi-native** vs USB serial — OpenClaw connects over network, no tethered laptop
- ✅ **Mobile + multimodal** (vision + voice + locomotion) = richer agent story
- ✅ **Quadruped locomotion** is dramatically more compelling for hackathon demo
- ✅ **$500 vs $300** — $200 premium justified by capabilities

### Why OpenClaw over direct Python scripting?

- ✅ **Natural language interface** out of the box
- ✅ **Persistent memory** across sessions
- ✅ **Multi-channel** (Telegram, WhatsApp, Discord) — control dog from phone
- ✅ **Skill/plugin architecture** makes it extensible
- ✅ **Strong community momentum** in robotics right now (RosClaw, ClawBody, NERO integration)

---

## 🔮 Future Hardware (post-hackathon)

- **Reachy Mini** (ordered, ~3 month wait) — humanoid platform, ClawBody integration
- **AgileX NERO** 7-DoF arm — documented OpenClaw integration via pyAgxArm SDK

---

## ⚠️ Risk Mitigation

| Risk | Mitigation |
|------|------------|
| MechDog WiFi connectivity issues | Test thoroughly Saturday night, bring backup hotspot |
| OpenClaw skill bugs | Record demo video as backup |
| VLM inference too slow | Make vision optional, core demo works without it |
| Battery dies during demo | Charge fully Saturday night, bring USB-C cable |
| Judge questions about architecture | Prepare architecture diagram, practice explanation |

---

## 📊 Success Metrics

### Minimum Viable Demo (MVP)
- [ ] Natural language command → MechDog moves correctly
- [ ] At least 3 different actions demonstrated
- [ ] Smooth, repeatable demo under 2 minutes

### Stretch Success
- [ ] Vision integration working (camera → VLM → description)
- [ ] Vision-guided navigation (walk toward object)
- [ ] Nebius GPU inference in demo
- [ ] Judge feedback: "Wow, this is impressive"
- [ ] Top 3 placement in robotics track

---

## 📝 Notes

- **Saturday night priority:** Get core demo working end-to-end
- **Sunday morning (train):** Polish, add one stretch feature
- **Keep it simple:** Better to have a rock-solid simple demo than a buggy complex one
- **Demo practice:** Run through it 5+ times before judging
- **Energy management:** Bring snacks, stay hydrated, pace yourself

**LFG! 🤖🚀**
