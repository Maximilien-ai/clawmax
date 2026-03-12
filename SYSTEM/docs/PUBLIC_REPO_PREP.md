# Public Repo Push Prep - Friday Noon (March 13, 2026)

**Target**: Push from `Maximilien-ai/maxclaw` (private) → `Maximilien-ai/clawmax` (public)
**Timeline**: Friday 12 PM (noon) - ready to make public at 5 PM demo
**GitHub URL**: https://github.com/Maximilien-ai/clawmax

---

## ✅ Pre-Push Checklist (Complete by Noon Friday)

### 1. **Verify No Private Data** (15 min)
Run these commands to ensure sensitive files are NOT included:

```bash
# Check that sensitive files are ignored
git check-ignore SYSTEM/dashboard/server/.dashboard-token
git check-ignore .openclaw/workspace-state.json
git check-ignore SYSTEM/messages/

# Verify .gitignore is working
git status --ignored | grep -E "token|secret|\.env"
```

**Expected Result**: All sensitive files should show as ignored ✅

### 2. **Remove Work-in-Progress Docs** (10 min)
These files contain personal notes and should NOT be in public repo:

```bash
cd /Users/maximilien/.openclaw/workspace/SYSTEM/docs

# Files to EXCLUDE from public repo:
# - TONIGHT_SUMMARY_MAR12.md (personal work summary)
# - THURSDAY_FRIDAY_FINAL_PREP.md (personal prep notes)
# - WORK_PLAN_MAR12-13.md (personal work plan)
# - DEMO_PREP_MAR12-13.md (personal demo prep)
# - DEMO_PRACTICE_CHECKLIST.md (personal practice notes)
# - TEMPLATE_TESTING_CHECKLIST.md (personal testing notes)
# - PRESENTATION_OUTLINE.md (personal outline with NOTEs)

# Move to private docs directory
mkdir -p PRIVATE_DOCS
git mv TONIGHT_SUMMARY_MAR12.md PRIVATE_DOCS/
git mv THURSDAY_FRIDAY_FINAL_PREP.md PRIVATE_DOCS/
git mv WORK_PLAN_MAR12-13.md PRIVATE_DOCS/
git mv DEMO_PREP_MAR12-13.md PRIVATE_DOCS/
git mv DEMO_PRACTICE_CHECKLIST.md PRIVATE_DOCS/
git mv TEMPLATE_TESTING_CHECKLIST.md PRIVATE_DOCS/
git mv PRESENTATION_OUTLINE.md PRIVATE_DOCS/

# Add PRIVATE_DOCS to .gitignore
echo "" >> .gitignore
echo "# Private work documents (not for public repo)" >> .gitignore
echo "SYSTEM/docs/PRIVATE_DOCS/" >> .gitignore
```

### 3. **Update .gitignore for Public Repo** (5 min)
Add additional exclusions to ensure no private data leaks:

```bash
# Append to .gitignore
cat >> .gitignore << 'EOF'

# Personal work documents
SYSTEM/docs/PRIVATE_DOCS/
SYSTEM/docs/*SUMMARY*.md
SYSTEM/docs/*PREP*.md
SYSTEM/docs/*PLAN*.md

# Presentation drafts (keep final only)
SYSTEM/docs/presentations/*DRAFT*.html
SYSTEM/docs/presentations/*OUTLINE*.md

# Blog drafts (keep final only)
SYSTEM/docs/BLOG_POST_DRAFT*.md

# Known issues tracking (internal)
SYSTEM/docs/KNOWN_ISSUES.md
SYSTEM/dashboard/docs/KNOWN_ISSUES.md
EOF
```

### 4. **Verify GitHub Links** (5 min)
All references should point to public repo:

```bash
# Search for any maxclaw references (should be none or minimal)
grep -r "maxclaw" SYSTEM/docs/presentations/clawmax-v1-launch.html
grep -r "maxclaw" SYSTEM/docs/BLOG_POST_FINAL.md
grep -r "maxclaw" README.md

# Verify correct clawmax links exist
grep -r "github.com/Maximilien-ai/clawmax" SYSTEM/docs/presentations/clawmax-v1-launch.html
grep -r "github.com/Maximilien-ai/clawmax" SYSTEM/docs/BLOG_POST_FINAL.md
```

**Expected Result**: All GitHub links should point to `Maximilien-ai/clawmax` ✅

### 5. **Clean Up Agent Data** (10 min)
Remove test agent instances (keep templates only):

```bash
# Check what agents exist
ls -la AGENTS/

# Remove test/personal agents (keep examples only)
# These should already be in .gitignore, but verify
git status AGENTS/

# Verify only template agents are tracked:
# - AGENTS/max0/ (example)
# - AGENTS/engineer/ (example)
# - AGENTS/qa-engineer/ (example)
# - AGENTS/ceo/ (example)
```

### 6. **Review Workflow Executions** (5 min)
Ensure no private execution data is included:

```bash
# Verify workflow executions are ignored
git check-ignore WORKFLOWS/executions/
ls -la WORKFLOWS/executions/

# These should NOT be in git (runtime data only)
```

### 7. **Update README for Public** (10 min)
Ensure README.md is welcoming for new users:

```bash
# Check README exists and is comprehensive
cat README.md

# Should include:
# - Clear project description
# - Installation instructions
# - Quick start guide
# - Link to ClawMax.ai
# - Link to documentation
# - License information (MIT)
# - Contributing guidelines
```

---

## 🚀 Push to Public Repo (Noon - Friday)

### Step 1: Commit Private Doc Cleanup (5 min)
```bash
cd /Users/maximilien/.openclaw/workspace

# Stage all changes
git add .gitignore SYSTEM/docs/PRIVATE_DOCS/

# Commit cleanup
git commit -m "docs: Move private work documents to PRIVATE_DOCS

- Moved personal prep/planning docs to PRIVATE_DOCS/
- Updated .gitignore to exclude private documents
- Ready for public repo push

🤖 Generated with [Claude Code](https://claude.com/claude-code)

Co-Authored-By: Claude <noreply@anthropic.com>"

# Push to private repo
git push origin main
```

### Step 2: Add Public Repo Remote (2 min)
```bash
# Add clawmax remote (if not already added)
git remote add clawmax https://github.com/Maximilien-ai/clawmax.git

# Verify remotes
git remote -v
# Should show:
# origin    https://github.com/Maximilien-ai/maxclaw.git (private)
# clawmax   https://github.com/Maximilien-ai/clawmax.git (public)
```

### Step 3: Final Verification (5 min)
```bash
# Check what will be pushed
git log --oneline origin/main ^clawmax/main

# Verify no sensitive files in tracked files
git ls-files | grep -E "token|secret|\.env|password"
# Should return NOTHING ✅

# Check file count
git ls-files | wc -l
# Should be reasonable (no huge node_modules, etc.)
```

### Step 4: Push to Public Repo (2 min)
```bash
# Push to clawmax (public repo)
git push clawmax main

# Verify push succeeded
git log clawmax/main --oneline -5
```

### Step 5: Verify on GitHub Web (3 min)
1. Visit https://github.com/Maximilien-ai/clawmax
2. Check recent commits
3. Verify README displays correctly
4. Click through to SYSTEM/docs/presentations/
5. Verify no PRIVATE_DOCS directory
6. Check .gitignore includes all exclusions

---

## 🔒 Security Checklist

Before making repo public at 5 PM, verify:

- [ ] No `.env` files committed
- [ ] No `.dashboard-token` files
- [ ] No API keys or secrets in code
- [ ] No workspace state files
- [ ] No personal email addresses (use max@clawmax.ai)
- [ ] No execution history with sensitive data
- [ ] No PRIVATE_DOCS directory
- [ ] No work summaries or personal notes
- [ ] GitHub links point to clawmax repo
- [ ] README is welcoming and clear

---

## 📋 Files to KEEP in Public Repo

### Documentation (SYSTEM/docs/)
- ✅ `BLOG_POST_FINAL.md` - Ready for public
- ✅ `presentations/clawmax-v1-launch.html` - Presentation slides
- ✅ `presentations/README.md` - Usage instructions
- ✅ `presentations/export-to-pdf.sh` - Export script
- ✅ `presentations/images/` - All presentation media
- ✅ `videos/` - Demo videos (public)
- ✅ `images/` - Screenshots and diagrams (public)

### Code (SYSTEM/)
- ✅ `dashboard/` - Full dashboard code
- ✅ `gateway/` - Gateway server code
- ✅ All source files

### Templates (TEMPLATES/)
- ✅ `organizations/small-startup-team/` - Template
- ✅ `organizations/engineering-team/` - Template
- ✅ `workflows/` - Workflow templates
- ✅ `agents/` - Agent templates

### Config Files
- ✅ `package.json` - Dependencies
- ✅ `.gitignore` - Updated with exclusions
- ✅ `README.md` - Public-facing README
- ✅ `LICENSE` - MIT License

---

## 🚫 Files to EXCLUDE from Public Repo

### Private Docs (SYSTEM/docs/PRIVATE_DOCS/)
- ❌ `TONIGHT_SUMMARY_MAR12.md`
- ❌ `THURSDAY_FRIDAY_FINAL_PREP.md`
- ❌ `WORK_PLAN_MAR12-13.md`
- ❌ `DEMO_PREP_MAR12-13.md`
- ❌ `DEMO_PRACTICE_CHECKLIST.md`
- ❌ `TEMPLATE_TESTING_CHECKLIST.md`
- ❌ `PRESENTATION_OUTLINE.md` (has personal NOTEs)

### Runtime Data
- ❌ `SYSTEM/messages/` - Runtime message archives
- ❌ `WORKFLOWS/executions/` - Execution history
- ❌ `.openclaw/workspace-state.json` - Workspace state
- ❌ `SYSTEM/dashboard/server/.dashboard-token` - Auth token

### Agent Instances (runtime)
- ❌ `AGENTS/*/` (all runtime instances)
- ✅ Except: max0, engineer, qa-engineer, ceo (examples)

### Sensitive Files
- ❌ `.env` files
- ❌ Any files with "secret", "token", "password"
- ❌ `SYSTEM/docs/KNOWN_ISSUES.md` (internal tracking)

---

## 🎯 Success Criteria

By noon Friday (12 PM), you should have:

1. ✅ All private docs moved to PRIVATE_DOCS/
2. ✅ .gitignore updated with exclusions
3. ✅ Changes committed to private repo (maxclaw)
4. ✅ Public repo remote added (clawmax)
5. ✅ Code pushed to public repo
6. ✅ Verified on GitHub web interface
7. ✅ No sensitive data in public repo
8. ✅ README is public-ready

**Repo Status**: Private (will make public at 5 PM before demo)

---

## ⏰ Timeline - Friday March 13

**11:45 AM** - Start public repo prep
**12:00 PM** - Move private docs, update .gitignore
**12:10 PM** - Commit changes, add remote
**12:15 PM** - Push to public repo
**12:20 PM** - Verify on GitHub
**12:30 PM** - DONE! Repo ready (still private)

**4:50 PM** - Make repo public (10 min before demo)
**5:00 PM** - DEMO TIME! 🚀

---

## 🔄 Push Command Summary

```bash
# Quick push commands (run at noon)
cd /Users/maximilien/.openclaw/workspace

# 1. Move private docs
mkdir -p SYSTEM/docs/PRIVATE_DOCS
git mv SYSTEM/docs/{TONIGHT_SUMMARY_MAR12.md,THURSDAY_FRIDAY_FINAL_PREP.md,WORK_PLAN_MAR12-13.md,DEMO_PREP_MAR12-13.md,DEMO_PRACTICE_CHECKLIST.md,TEMPLATE_TESTING_CHECKLIST.md,PRESENTATION_OUTLINE.md} SYSTEM/docs/PRIVATE_DOCS/

# 2. Update .gitignore
echo "SYSTEM/docs/PRIVATE_DOCS/" >> .gitignore

# 3. Commit
git add .
git commit -m "docs: Prepare for public repo - move private docs"

# 4. Push to private first
git push origin main

# 5. Add public remote (if needed)
git remote add clawmax https://github.com/Maximilien-ai/clawmax.git || true

# 6. Push to public repo
git push clawmax main

# 7. Verify
git log clawmax/main --oneline -3
```

---

## 🆘 Troubleshooting

### Issue: "remote clawmax already exists"
```bash
# Update existing remote
git remote set-url clawmax https://github.com/Maximilien-ai/clawmax.git
```

### Issue: "Permission denied"
```bash
# Verify GitHub authentication
gh auth status

# Re-authenticate if needed
gh auth login
```

### Issue: "refusing to push"
```bash
# Force push to public (only on initial push)
git push clawmax main --force

# WARNING: Only use --force on initial push to empty repo!
```

### Issue: "File too large"
```bash
# Check for large files
git ls-files | xargs ls -lh | sort -k5 -rh | head -10

# If found, add to .gitignore and remove from git
git rm --cached path/to/large/file
echo "path/to/large/file" >> .gitignore
```

---

## 📝 Making Repo Public (4:50 PM Friday)

**Steps**:
1. Visit https://github.com/Maximilien-ai/clawmax
2. Click "Settings"
3. Scroll to "Danger Zone"
4. Click "Change visibility" → "Make public"
5. Type repo name to confirm
6. Click "I understand, make this repository public"

**Done!** Repo is now public 🎉

---

## ✅ Final Checklist Before Going Public

At 4:50 PM Friday, verify one last time:

- [ ] No sensitive data in repo
- [ ] README is clear and welcoming
- [ ] GitHub links all point to clawmax
- [ ] LICENSE file exists (MIT)
- [ ] .gitignore properly excludes private data
- [ ] Latest code is pushed
- [ ] No PRIVATE_DOCS directory visible

**If all ✅ → Make public!**

---

**Created**: March 12, 2026 (Evening)
**Execute**: Friday 12 PM (Noon)
**Go Public**: Friday 4:50 PM
**Demo**: Friday 5 PM

**You got this!** 🚀
