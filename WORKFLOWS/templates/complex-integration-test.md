---
id: complex-integration-test
name: Complex Integration Test
description: Test file access, tool usage, web browsing, and GitHub operations
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

# Complex Integration Test Workflow

This workflow tests advanced agent capabilities including file operations, tool usage, web browsing, and GitHub integration.

## Part 1: File System Operations

**Task 1.1**: Create a test file in your workspace:
- Create a file called `integration-test-result.md` in your TODO directory
- Write the following content:
  ```
  # Integration Test Results
  - Agent: [Your agent ID]
  - Timestamp: [Current timestamp]
  - Status: In Progress
  ```

**Task 1.2**: Verify file creation:
- Read back the file you just created
- Confirm the content matches what you wrote

## Part 2: Tool Usage (Bash/Shell Commands)

**Task 2.1**: System information:
- Use bash/shell commands to get:
  - Current date and time
  - Your current working directory
  - List files in your workspace directory

**Task 2.2**: File operations:
- Use bash to count the number of lines in your `integration-test-result.md` file
- Append a new line: "- Bash test: Completed"

## Part 3: Web Browsing & Research

**Task 3.1**: Web research (if you have web browsing skills):
- Search for "OpenClaw AI agent framework GitHub"
- Find the official repository URL
- Report the number of stars or recent activity

**Task 3.2**: Documentation lookup (if you have web access):
- Look up the latest Claude AI model capabilities
- Summarize one interesting feature

## Part 4: GitHub Operations

**Task 4.1**: GitHub CLI usage (if you have gh CLI available):
- Clone or check status of a small public repo (e.g., `https://github.com/anthropics/anthropic-sdk-python`)
- List the most recent 3 issues in the repository using `gh issue list --limit 3`
- Report issue titles and numbers

**Task 4.2**: Repository analysis:
- If you cloned the repo, count how many files are in the root directory
- Look for a README.md and report its first heading

## Part 5: Integration & Reporting

**Task 5.1**: Update your test results file:
- Append a summary section to `integration-test-result.md` with:
  - Which tasks you completed successfully
  - Which tasks you couldn't complete (and why)
  - Total execution time (approximate)

**Task 5.2**: Final report:
- Provide a brief summary (3-5 sentences) of:
  - Your overall test results
  - Any limitations you encountered
  - Your agent's strongest capabilities demonstrated

## Success Criteria

A successful test demonstrates:
- ✅ File read/write operations
- ✅ Bash command execution
- ✅ Web research or browsing (if available)
- ✅ GitHub CLI operations (if available)
- ✅ Clear reporting and error handling

## Notes

- Skip any task if you lack the required skills or tools
- Clearly report what you can and cannot do
- Error messages are useful feedback
- Be concise but thorough
