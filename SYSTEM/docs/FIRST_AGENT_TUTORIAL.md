# Build Your First ClawMax Agent

Use this guide to turn one clear task into a working, tested agent. The path is
designed for first-time and low-code builders and usually takes 15–25 minutes.

## What you will finish

By the end, you will have:

- one agent with a specific job and clear boundaries;
- a usable AI execution path;
- one representative test and a way to judge the result; and
- a human checkpoint for any action that should not happen automatically.

Creating an agent is not the finish line. A first agent is working only after it
produces a useful result on a realistic test.

## 1. Confirm access before you build

1. Sign in to the ClawMax URL supplied by your operator or event organizer.
2. Select the workspace where your agent should live.
3. Confirm that an AI execution path is available:
   - A hosted deployment may provide server-managed model access.
   - A workshop may issue a scoped provider key to your team.
   - For local or bring-your-own-key use, open **BYOK**, add the provider key,
     choose a preferred model, and test the connection.
4. Never paste a provider key into chat, agent instructions, or an agent file.

If **Create with AI** is unavailable, use **Open BYOK** or ask the deployment
operator to confirm the shared execution path. Exact sign-in and workspace
provisioning steps depend on the deployment.

## 2. Define the task before the agent

Write short answers to these questions:

| Question | What to decide |
|---|---|
| Who is it for? | The person or team using the result |
| What job should it do? | One repeatable outcome, not a broad role |
| What starts the job? | A message, file, schedule, or other trigger |
| What information may it use? | The minimum relevant inputs and tools |
| What must a human approve? | Sending, purchasing, deleting, publishing, or another consequential action |
| What proves success? | A result you can observe and repeat |

Example: instead of “make a personal assistant,” define “turn my meeting notes
into a five-item follow-up brief, show missing owners, and wait for approval
before drafting any message.” Treat the example as a pattern, not a prompt to
copy unchanged.

## 3. Create with AI Builder (recommended)

1. Open **Builder**.
2. Describe the outcome, relevant context, constraints, and success test. Describe
   what you need—not a finished agent prompt.
3. Review Builder's recommendation. It may suggest creating one agent,
   coordinating a team, or improving something that already exists. Nothing is
   created until you choose an action.
4. Choose **AI Create Agent** when it is the right action.
5. In the creation flow, review the generated `IDENTITY.md`, `SOUL.md`, and
   `TOOLS.md` previews. Check that the role, boundaries, tone, and tools match
   your intended task.
6. Continue through the review step and select **Provision**.

Do not accept generated instructions only because they sound polished. Remove
capabilities the agent does not need and add any missing approval boundary.

## 4. Create with the manual wizard (alternative)

Use this path when you want more direct control or AI generation is unavailable:

1. Open **Agents**.
2. Select **Create**, then **Create with Wizard**.
3. Name the agent and choose only the tags, model, runtime, and channels required
   for its first test.
4. Write or review its identity and behavior files.
5. Continue to **Provision**.

Start small. Skills, channels, schedules, and multi-agent workflows can be added
after the basic task works reliably.

## 5. Run a representative test

1. Find the new agent on **Agents** and open **Chat**.
2. Give it a realistic input, including one detail that could expose a weak
   assumption or missing boundary.
3. Compare the result with the success test you defined in step 2.
4. Record what passed, what failed, and one change to try next.

For the meeting-follow-up example, a useful test includes incomplete notes and
one missing task owner. A good result flags the gap instead of inventing an
owner, produces the requested brief, and waits before drafting a message.

## 6. Improve one variable at a time

Change one of the following, then rerun the same test:

- the task or output format;
- the context the agent receives;
- an instruction or boundary;
- a tool or skill; or
- the model or runtime.

Keeping the test fixed makes it easier to tell whether the change actually
improved the result. After the manual path is reliable, add a schedule, workflow,
channel, or additional agent only when the use case requires it.

## Troubleshooting

### Create with AI is disabled

Open **BYOK**, add the provider key issued or approved for your workspace, select
a preferred model, and test the connection. On a hosted deployment, ask the
operator to confirm server-managed model access instead of entering an unknown
key.

### The agent exists but chat does not produce a result

Confirm that the agent is active and has a usable model and runtime. Check
**System → Doctor** for runtime warnings. Hosted runtime problems must be fixed
by the deployment operator; changing the prompt will not repair a missing
runtime.

### The result is generic or unreliable

Narrow the job. State the allowed sources, required output format, missing-data
behavior, human approval boundary, and success test. Then rerun the same input.

### The agent can act but should not act automatically

Add an explicit approval step before sending, purchasing, deleting, publishing,
or making another consequential change. Test both approval and rejection paths.

## Completion checklist

- [ ] The agent has one clear, repeatable job.
- [ ] A model and runtime are available without exposing credentials.
- [ ] The generated or written instructions were reviewed.
- [ ] A representative input produced an observable result.
- [ ] Missing information is surfaced rather than invented.
- [ ] Consequential actions require human approval.
- [ ] The same test can be rerun after the next change.

