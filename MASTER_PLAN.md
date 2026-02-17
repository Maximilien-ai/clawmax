# The Maximilien.ai Master Plan

_A working draft. Last revised: 2026-02-17._

---

> "The best way to predict the future is to build it."
> — Alan Kay

---

## Why This Document Exists

Every ambitious undertaking deserves a North Star — a document that says plainly what we believe, what we are building, and why. This is that document for Maximilien.ai.

It is not a press release. It is not a pitch deck. It is an honest account of our convictions, our strategy, and the sequence of bets we are placing on the future of human-AI collaboration.

We invite you to hold us accountable to it.

---

## The Core Belief

We believe the defining challenge of the next decade is not whether AI can be powerful — it clearly can — but whether it will be **trustworthy, transparent, and genuinely beneficial** to the people and organizations that use it.

Most AI today is delivered as an opaque, cloud-hosted service controlled by a small number of companies. Your data leaves your premises. Your workflows depend on someone else's infrastructure. Your intellectual property trains someone else's model. The power imbalance is enormous and largely invisible.

We believe a better path exists: **AI that runs where your data lives, built on open foundations, governed by the people it serves.**

---

## The Mission

**Build the tools and prove the model for 100% AI-agent companies that produce ethical services to humans.**

Two things in that sentence matter equally:

1. **100% AI-agent companies** — organizations where the primary workforce is AI agents: researching, writing, coding, reasoning, and communicating on behalf of humans. Not replacing humans, but dramatically multiplying what a small human team can accomplish ethically and at scale.

2. **Ethical services to humans** — AI that is private-by-default, transparent in its reasoning, honest about its limitations, and designed to benefit users rather than extract from them.

Maximilien.ai is simultaneously a product company and a living demonstration that this model works.

---

## The Values

**Open by default.**
The core of everything we build is released under the MIT license. Not as a marketing gesture, but because we believe the only durable foundation for trust is code you can read, fork, audit, and run yourself.

**Privacy through architecture.**
The strongest privacy guarantee is not a policy — it is a system designed so your data never leaves your control in the first place. We build on-premise first.

**Honest about AI.**
We do not pretend AI agents are infallible. We build systems with appropriate human oversight, clear audit trails, and honest failure modes. AI works for humans; humans remain responsible.

**Small team, large impact.**
We believe a team of a few humans, well-supported by AI agents, can produce the output of an organization many times larger — without the bureaucracy, the waste, or the loss of craft.

**Sustainable and independent.**
We are not optimizing for a venture exit. We are building something meant to last and to remain in service of its users.

---

## The Strategy: A Deliberate Sequence

Like any audacious plan, this one requires building in stages. Each stage funds and informs the next.

### Stage 1 — Establish the foundation with `weave-cli`

The first product is **weave-cli**: a command-line tool that makes local, on-premise Retrieval-Augmented Generation (RAG) easy for any company, regardless of size or AI expertise.

**The problem it solves:**
RAG — the technique of grounding AI answers in your own documents and data — is the most practical near-term AI upgrade for most organizations. But deploying it today requires expertise in vector databases, embedding models, chunking strategies, and infrastructure orchestration that most teams do not have and should not need to acquire.

**What weave-cli does:**
- Ingests your documents (PDFs, wikis, code, email archives, databases) with a single command
- Runs entirely on your infrastructure — nothing leaves your network
- Connects to any LLM (local via Ollama, or cloud via API key you control)
- Produces a queryable knowledge base your teams and AI agents can use
- Ships as MIT-licensed OSS: you own it, you fork it, you extend it

**Why OSS:**
We believe local RAG infrastructure is too important to be locked behind proprietary APIs. By open-sourcing `weave-cli`, we seed an ecosystem, build trust, and ensure the technology is available to organizations that cannot afford or trust a cloud vendor.

Revenue comes from support, managed deployment, and enterprise tooling built on top of the open core.

### Stage 2 — Prove the 100% AI-agent company model with `maxclaw`

Once `weave-cli` gives organizations the RAG infrastructure they need, the next question becomes: _how do you operate an AI-agent workforce at scale?_

**maxclaw** is the answer: an open-source toolkit for standing up, managing, and coordinating networks of AI agents — each with its own identity, channel access (WhatsApp, Telegram, voice), workspace, and tool access — all orchestrated from a single configuration.

**The ambition:**
maxclaw should make it as easy to spin up a new AI agent as it is to add a new employee to a Slack workspace — with onboarding, permissions, audit trails, and coordination built in.

**The demonstration:**
Maximilien.ai itself runs on maxclaw. Every agent in our network (`max0`, `max1`, …) is a production instance of the same system we sell. We are the first customer, the most demanding tester, and the most visible proof of concept.

By open-sourcing maxclaw under MIT, we invite other organizations to replicate the model: small human teams, large AI workforces, ethical outcomes.

### Stage 3 — Enable the ecosystem

With `weave-cli` providing the knowledge layer and `maxclaw` providing the agent layer, the third stage is the marketplace and ecosystem:

- **Agent templates**: pre-built, auditable agent personas for common roles (legal research, customer support, engineering, finance)
- **Connector library**: integrations for the tools companies already use
- **Certification**: a lightweight standard for what it means to run an "ethical AI agent company"
- **Community**: an open community of organizations sharing agent configurations, prompts, and workflows under open licenses

---

## What "100% AI-Agent Company" Actually Means

This phrase deserves careful definition, because it is easy to misread.

It does **not** mean a company with no humans. It means a company where:

- The primary execution of knowledge work — research, drafting, coding, analysis, communication — is performed by AI agents
- A small human team sets direction, reviews outputs, makes ethical judgments, and is accountable for outcomes
- The ratio of work output to human headcount is radically higher than a traditional organization
- Every agent's actions are logged, reviewable, and correctable by the humans responsible for them

The human role shifts from _doing_ to _directing, reviewing, and being accountable_. This is not a diminishment of human work — it is an elevation of it.

---

## The Ethical Commitments

We make these commitments publicly and invite the community to hold us to them:

1. **No dark patterns.** We will not design our agents to manipulate, deceive, or extract from the humans they serve.

2. **Transparency about AI.** Users interacting with our agents will always be able to know they are interacting with an AI.

3. **Data minimization.** We will not collect data beyond what is needed for the task at hand. On-premise deployments collect nothing we can see.

4. **Human accountability.** Every agent deployment has a named human accountable for its behavior. AI does not absolve humans of responsibility.

5. **Open audit.** Our core systems are MIT-licensed. Anyone can read the code that governs our agents' behavior.

6. **No weapons, no manipulation, no surveillance.** We will not build or sell AI agents designed to harm, deceive populations, or surveil people without their knowledge.

---

## The Honest Risks

A master plan that omits the risks is a fantasy. Here are ours:

**Concentration risk.** We depend on AI models (OpenAI, Anthropic, and others) that we do not control. If those APIs change, fail, or become unaffordable, our products are affected. Mitigation: we design for model-agnosticism and actively support local model alternatives (Ollama, local Llama).

**Regulation.** AI regulation is evolving rapidly and unevenly across jurisdictions. Some of what we build may require adaptation. We welcome thoughtful regulation and intend to be a cooperative participant in that process.

**Trust.** The biggest risk is that AI agents behave in ways that erode trust — hallucinating, making errors, acting outside their intended scope. We mitigate this through explicit scope limits, human review workflows, and honest communication about limitations.

**Competition.** Large, well-funded companies are building in this space. Our advantage is not resources — it is conviction, speed, and the compounding trust that comes from being genuinely open and genuinely ethical.

---

## The Sequence, Simply Stated

If this reads like a lot, here is the plan in plain terms:

1. Build `weave-cli` — give any organization private, local RAG. Open-source it.
2. Run Maximilien.ai as a 100% AI-agent company using `maxclaw`. Prove it works.
3. Open-source `maxclaw` — let any organization replicate the model.
4. Build the ecosystem of tools, templates, and community that makes ethical AI-agent companies the default, not the exception.

Each step is useful on its own. Each step makes the next step easier.

---

## An Invitation

If you believe, as we do, that AI's most important property is not raw capability but trustworthiness — that the future should be built on open foundations, local infrastructure, and genuine human accountability — then you are the person this is for.

Contribute to `weave-cli`. Fork `maxclaw`. Tell us what we got wrong. Hold us to this document.

The future of human-AI collaboration is not yet written. We intend to write a good chapter of it.

---

_Maximilien Riehl_
_Founder, Maximilien.ai_
_San Francisco, 2026_

---

**Repositories:**
- `weave-cli` — _coming soon_ (MIT)
- `maxclaw` — https://github.com/Maximilien-ai/maxclaw (MIT)
