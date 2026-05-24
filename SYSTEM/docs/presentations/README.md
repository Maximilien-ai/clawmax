# ClawMax Presentations

This directory contains presentation materials for ClawMax demos and launches.

Related backup media:
- [Demo Videos](../DEMO_VIDEOS.md)
- local video files in [`../videos/`](../videos/)

## Presentation History

### 2026-04-26: Build-a-Company Hackathon
**File**: `build-a-company-hackathon-apr-2026/index.html`
- **Event**: Build-a-Company: Revenue Hackathon
- **Location**: AGI House SF / San Francisco, CA
- **Format**: Single-page HTML demo one-pager
- **Focus**: company templates, team hierarchies, markdown workflow handoffs, company-scoped workflow pipelines
- **Goal**: show the weekend hack progress clearly for judges and builders

### 2026-03-31: Spring 2026 AI Forum
**File**: `spring-2026-ai-forum/index.html`
- **Event**: Spring 2026 AI Forum: Talks + AI Agent Workshops, Ft Stanford & OpenClaw
- **Location**: Menlo Park, CA
- **Format**: Single-page HTML demo/booth presentation
- **Result**: ✅ Demo went well, strong interest in workspace dashboards and visibility features
- **Key Outcomes**: Follow-up demand for compact stakeholder dashboards, richer workflow/result summaries, and smoother compact drag-and-drop layout editing

### 2026-03-14: Launch Talk - "AI Agents 1:1"
**File**: `2026-03-14-launch-talk.md`
- **Event**: AI Assistants with OpenClaw and ClawMax
- **Platform**: LinkedIn Live
- **Result**: ✅ Successful launch, multiple sign-ups
- **Recording**: [Google Drive](https://drive.google.com/file/d/1OZAC0d-qMAHsLP-GLp48QQyde_ECJxVy/view)
- **Key Outcomes**: Feature requests for v1.1.0, setup automation needs identified

### 2026-03-13: Launch Presentation Deck
**File**: `clawmax-v1-launch.html`
- **Format**: HTML with reveal.js
- **Duration**: 10-15 minutes
- **Slides**: 11 slides (10 main + 1 Q&A)
- **Used For**: March 14 launch talk

## Files
- `spring-2026-ai-forum/index.html` — event one-pager with ClawMax.ai hero, QR code, and live-demo framing
- `spring-2026-ai-forum/clawmax-front-back-offices.jpg` — local hero background asset
- `spring-2026-ai-forum/clawmax-hero-bg.jpg` — local hero backup asset
- `spring-2026-ai-forum/clawmax-logo.jpg` — local logo asset

## How to Use

### View the Presentation

**Option 1: Open directly in browser**
```bash
# From the presentations directory
open clawmax-v1-launch.html

# Or from anywhere
open /Users/maximilien/.openclaw/workspace/SYSTEM/docs/presentations/clawmax-v1-launch.html
```

**Option 2: Serve with local server** (recommended for best experience)
```bash
cd /Users/maximilien/.openclaw/workspace/SYSTEM/docs/presentations
python3 -m http.server 8080
# Then open http://localhost:8080/clawmax-v1-launch.html
```

### Navigation

- **Next slide**: Arrow right, spacebar, or click
- **Previous slide**: Arrow left
- **Overview**: Press `ESC` to see all slides
- **Speaker notes**: Press `S` to open speaker view
- **Fullscreen**: Press `F`

### Export to PDF

**Method 1: Print to PDF from browser**
1. Open the presentation in Chrome or Firefox
2. Add `?print-pdf` to the URL: `clawmax-v1-launch.html?print-pdf`
3. Print (Cmd+P) and select "Save as PDF"
4. Use these settings:
   - Layout: Landscape
   - Margins: None
   - Background graphics: Enabled

**Method 2: Using decktape (best quality)**
```bash
# Install decktape
npm install -g decktape

# Generate PDF
cd /Users/maximilien/.openclaw/workspace/SYSTEM/docs/presentations
decktape reveal clawmax-v1-launch.html clawmax-v1-launch.pdf
```

### Export to PowerPoint

**Option 1: Import PDF into PowerPoint**
1. Export to PDF first (see above)
2. Open PowerPoint
3. Insert → Pictures from PDF (or convert PDF to images and import)

**Option 2: Manual recreation**
- Use the HTML as a reference
- Recreate slides in PowerPoint/Keynote
- Copy/paste content from HTML

## Presentation Structure

### Slides Overview

1. **Title Slide** - ClawMax logo and launch announcement
2. **Problem** - The challenge of scaling to 100s of agents
3. **Solution** - ClawMax's 5-layer architecture
4. **Live Demo: Dashboard** - Show agent management
5. **Live Demo: Workflow** - Execute multiagent task
6. **Templates** - Pre-built setups for fast onboarding
7. **System AI Agents** - Meta-agents (Beta, backup slide)
8. **Technical Highlights** - Built ON OpenClaw
9. **Roadmap** - v1.0.0 → v1.0.1 → v1.1.0 → Future
10. **Get Involved** - OSS vs Cloud vs On-Premise pricing
11. **Q&A** - Questions and resources

### Timing Breakdown

- Intro: 30 sec
- Problem: 1 min
- Solution: 2 min
- Demo (Dashboard): 1 min
- Demo (Workflow): 3 min
- Templates: 1 min
- System Agents: 1 min (skip if short on time)
- Technical: 1.5 min
- Roadmap: 2 min
- Get Involved: 1 min
- **Total**: ~13-14 minutes + Q&A

## Demo Preparation

### Before Presenting

1. **Test the presentation**
   - Open HTML in browser
   - Navigate through all slides
   - Check that speaker notes work (press `S`)
   - Verify images load correctly

2. **Prepare demo environment**
   - Dashboard running at http://localhost:5173
   - At least 3 agents online (CEO, Engineer, PM recommended)
   - "Daily Standup" workflow ready to execute
   - Clean browser window (no distracting tabs)

3. **Have backups ready**
   - Screenshots of key features in `../images/`
   - Videos in `../videos/` if live demo fails
   - Pre-recorded workflow execution

### During Presentation

- **Slide 4**: Switch to live dashboard, create agent with AI
- **Slide 5**: Execute "Daily Standup" workflow, show real-time tracking
- **Slide 7**: Skip if running short on time (it's a backup slide)

### After Presentation

- Share PDF version with attendees
- Share link to GitHub repo
- Share link to ClawMax.ai website
- Collect feedback
- If the live product path was unstable, note whether the backup videos were sufficient or need a refreshed recording

## Customization

### Changing Theme

The presentation uses reveal.js's "black" theme. To change:

```html
<!-- In clawmax-v1-launch.html, line 7: -->
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/reveal.js@4.5.0/dist/theme/black.css">

<!-- Available themes: black, white, league, beige, sky, night, serif, simple, solarized -->
```

### Adding Slides

Add new `<section>` elements within `<div class="slides">`:

```html
<section>
    <h2>Your Slide Title</h2>
    <p>Your content here</p>
    <aside class="notes">
        Speaker notes go here (press S to view during presentation)
    </aside>
</section>
```

### Updating Content

All content is in the HTML file. Edit directly and refresh browser to see changes.

## Troubleshooting

### Images not loading
- Check that image paths are correct (should be `../images/filename.png`)
- Verify images exist in `/Users/maximilien/.openclaw/workspace/SYSTEM/docs/images/`
- Use browser dev tools (F12) to check for 404 errors

### Speaker notes not showing
- Press `S` to open speaker view
- Make sure popup blockers are disabled
- Try in Chrome or Firefox (best support)

### PDF export looks wrong
- Use `?print-pdf` URL parameter
- Set margins to "None" in print dialog
- Enable "Background graphics"
- Try using decktape for best results

## Resources

- **reveal.js Documentation**: https://revealjs.com/
- **Decktape (PDF export)**: https://github.com/astefanutti/decktape
- **ClawMax Docs**: ../
- **Blog Post**: ../BLOG_POST_FINAL.md

## Upcoming Presentations

### 2026-03-27: ClawMax Self-Management Demo
- **Audience**: TBD
- **Focus**: Agents managing ClawMax development
- **Demo**: Live GitHub triage, PR reviews, autonomous workflows

### 2026-03-28: Hackathon Demo
- **Event**: TBD
- **Focus**: Latest improvements, live coding
- **Interactive**: Help others deploy ClawMax

### 2026-03-31: Spring 2026 AI Forum
- **Event**: Spring 2026 AI Forum: Talks + AI Agent Workshops, Ft Stanford & OpenClaw
- **Focus**: ClawMax.ai positioning, shared workspace dashboards, multi-agent visibility
- **Format**: One-page landing-style presentation for live demos and booth conversations

---

**Created**: March 12, 2026
**Last Updated**: March 17, 2026
**Next**: March 27-28 demos
