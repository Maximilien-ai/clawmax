# RC102 workflow and agent acceptance

Development revision `9431bf2d`. Keep issues open until the complete issue has engineering evidence and user acceptance.

| Check | Expected result |
| --- | --- |
| Managed workflow (#338) | Run a managed workflow with a research owner and a writer. Ask the owner for a unique phrase and the writer to quote it. The writer starts after the researcher finishes and includes that phrase. A failed researcher prevents writer dispatch. |
| Stop (#249) | Stop an active Claude Code or Droid workflow. Reopen its history and verify cancellation. Automated tests also cover stopping each runtime while queued. |
| Run results (#437, #438) | A workflow participant returning no text or pinned to a known unsupported OpenClaw text model shows a failed step in history. A missing explicitly required output blocks the workflow and its dependents. |
| Creation (#331, #441) | Open Create with AI with a saved default, verify the model, create an agent, and confirm the agent list and workspace count update without reloading. |
| Model change (#440) | Change a test agent's model, reload, and check the selection and chat history. Record any 502 with the time and endpoint only. |
| Provisioning cleanup (#315) | Engineering checks an empty directory created by a failed attempt is released and a pre-existing directory or one containing data is preserved. |

## Outstanding engineering verification

- Verify model-change failures with a gateway disconnect and retained history (#440).
- Verify child-model and harness availability and authorization (#437, #439).
- Provide confirmed, owner-assisted recovery for pre-receipt conversations after identity or model changes (#420).
- Verify the saved-model wizard and creation refresh at desktop and mobile widths (#331, #441).
- Run full integration, validation and coverage against the final revision. These checks are pending and the two batches are not yet accepted.
