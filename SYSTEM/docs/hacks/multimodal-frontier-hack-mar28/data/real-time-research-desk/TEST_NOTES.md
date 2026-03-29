# Test Notes

- [x] Copy screenshots into `screenshots/`
- [ ] Apply `Real-Time Research Desk`
- [ ] Enable `Senso Shared Context`
- [ ] Confirm Senso skills are assigned to created agents
- [ ] Set kickoff inputs from `KICKOFF_INPUT.md`
- [ ] Run kickoff
- [ ] Run `Evidence Intake`
- [ ] Run `Context Retrieval`
- [ ] Run `Brief & Action`
- [ ] Save the final brief output for submission

## Simplest E2E Test

1. Open Templates and apply `Real-Time Research Desk`
2. In Apply:
   - turn on `Senso Shared Context`
   - set Senso folder/context to `Hackathon / Real-Time Research Desk / workflow-v1`
   - leave GitHub off unless you want repo follow-up
3. After apply, confirm these agents exist and have Senso skills:
   - `research-lead`
   - `evidence-ingest`
   - `signal-analyst`
   - `action-editor`
4. Run `Research Desk Kickoff`
5. Paste the values from `KICKOFF_INPUT.md`
6. Tell the team to use evidence from:
   - `/Users/maximilien/github/Maximilien-ai/clawmax-codex/SYSTEM/docs/hacks/multimodal-frontier-hack-mar28/data/real-time-research-desk/screenshots`
7. Run the remaining workflow chain in order if it does not auto-advance:
   - `Evidence Intake`
   - `Context Retrieval`
   - `Brief & Action`
8. Use the final brief as the submission artifact
