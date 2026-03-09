---
id: github-repo-analysis
name: GitHub Repository Analysis
description: Clone a GitHub repo and analyze its issues, structure, and recent activity
schedule: ""
enabled: false
targeting:
  communities: []
  groups:
    - Status
  tags: []
  agents: []
executionMode: managed
author: system
---

# GitHub Repository Analysis Workflow

Analyze a GitHub repository using gh CLI and file system operations.

## Objective

Clone and analyze the `anthropic-sdk-python` repository to understand its structure, recent issues, and activity.

## Part 1: Repository Cloning

**Task 1.1**: Clone the repository:
```bash
# Navigate to a temporary directory
cd /tmp
rm -rf anthropic-sdk-python
gh repo clone anthropics/anthropic-sdk-python
cd anthropic-sdk-python
```

**Task 1.2**: Verify the clone:
- Confirm you're in the correct directory
- List the top-level files and directories
- Report the current git branch

## Part 2: Repository Structure Analysis

**Task 2.1**: File structure:
- Count total number of files: `find . -type f | wc -l`
- Count Python files: `find . -name "*.py" | wc -l`
- List top-level directories
- Find the largest file: `find . -type f -exec ls -lh {} \; | sort -k5 -hr | head -5`

**Task 2.2**: Documentation:
- Read the README.md file
- Extract and report:
  - The main purpose of the SDK
  - Installation instructions (first command)
  - Any badges (stars, version, etc.)

## Part 3: GitHub Issues Analysis

**Task 3.1**: Recent issues:
```bash
gh issue list --limit 10 --state open
```
Report:
- Total number of open issues
- Titles of the 3 most recent issues
- Any common themes or labels

**Task 3.2**: Issue statistics:
```bash
gh issue list --state all --limit 100
```
Analyze:
- Ratio of open vs closed issues
- Most common labels (if visible)
- Any high-priority or critical issues

## Part 4: Repository Activity

**Task 4.1**: Recent commits:
```bash
git log --oneline -10
```
Report:
- Most recent commit message
- Approximate commit frequency (daily/weekly/monthly)
- Number of contributors (if you can determine)

**Task 4.2**: Branch information:
```bash
git branch -r
```
Report:
- List of remote branches
- Any active feature branches

## Part 5: Code Analysis

**Task 5.1**: Dependencies:
- Find and read `pyproject.toml` or `setup.py`
- List main dependencies
- Note any interesting tools or frameworks used

**Task 5.2**: Code statistics:
```bash
# Count lines of Python code
find . -name "*.py" -exec wc -l {} + | tail -1
```
Report:
- Total lines of Python code
- Largest Python file (by lines)

## Part 6: Summary Report

Create a comprehensive summary with:

1. **Repository Overview**:
   - Name, purpose, and main language
   - Repository size and file count

2. **Issue Analysis**:
   - Open issues count and recent topics
   - Community engagement level

3. **Code Quality Indicators**:
   - Code organization
   - Documentation quality
   - Test coverage (if visible)

4. **Recommendations**:
   - Based on your analysis, suggest 2-3 potential improvements
   - Or note 2-3 strengths of the repository

## Output Format

Provide your analysis as a structured report with clear sections and bullet points. Include actual data from your investigation.

## Success Criteria

- ✅ Successfully clone repository
- ✅ Analyze file structure
- ✅ Review 5+ GitHub issues
- ✅ Examine recent commits
- ✅ Provide actionable insights

## Notes

- If `gh` CLI is not available, report this limitation
- If network access is restricted, note which tasks couldn't be completed
- Focus on extracting meaningful insights, not just raw data
