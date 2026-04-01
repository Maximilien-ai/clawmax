---
name: Mathematics Proof Studio
type: organization
version: 1.0.0
category: science
author: ClawMax Team
tags:
  - science
  - mathematics
  - proofs
  - research
  - proposal
  - experimental
  - early-idea
---

Proposal template for theorem exploration, proof attempts, verification, and exposition. Early idea only and intended as a customizable starting point for mathematical workflows.

## Agents

| id | name | role | tags | skills |
|----|------|------|------|--------|
| proof-lead | Proof Lead | Research lead — selects the conjecture, frames the proof agenda, and decides which branches to pursue or abandon. | lead, math, proofs | github, gh-issues |
| conjecture-scout | Conjecture Scout | Prior-work specialist — collects related lemmas, counterexamples, known results, and notation conventions. | math, literature, prior-work |  |
| proof-builder | Proof Builder | Primary derivation specialist — drafts proof sketches, explores strategies, and decomposes the argument into lemmas. | math, proofs, derivation |  |
| proof-verifier | Proof Verifier | Verification specialist — checks logical steps, searches for edge cases, and improves the final exposition. | math, verification, review | github, gh-issues |

## Communities

- **Proof Studio** — Shared coordination space for conjecture selection, proof work, and verification.

## Groups

- **Conjectures** — Problem statements, prior results, examples, and notation alignment. (Proof Studio)
- **Proofs** — Proof sketches, branch exploration, lemma decomposition, and argument structure. (Proof Studio)
- **Verification** — Step checking, counterexample search, edge-case review, and exposition cleanup. (Proof Studio)
- **Status** — Current strategy, blockers, abandoned paths, and proof-readiness updates. (Proof Studio)

## Workflows

### Conjecture Kickoff
- **Schedule:** manual
- **Mode:** managed (owner: proof-lead)
- **Targets:** agents: proof-lead, conjecture-scout, proof-builder, proof-verifier; tags: lead

# Conjecture Kickoff

You are the Proof Lead. The studio just came online.

## Project Configuration
> **Customize these before applying:**

- **Target statement:** [e.g., prove or disprove a conjecture]
- **Domain:** [number theory, combinatorics, geometry, probability, custom]
- **Known tools:** [e.g., generating functions, compactness, probabilistic method]
- **Success artifact:** [proof sketch, counterexample, lemma map, exposition note]
- **References:** [papers, books, notes, links]
- **GitHub repo:** [e.g., owner/repo — optional]

## Your Tasks
1. Restate the target clearly in the Proof Studio community
2. Define acceptable outcomes: proof, counterexample, or narrowed claim
3. Ask Conjecture Scout for prior results and related lemmas
4. Ask Proof Builder for the first candidate strategies
5. Ask Proof Verifier to define the initial verification checklist
6. Post the first milestone and risk notes to Status

### Prior Results Sweep
- **Schedule:** 0 9 * * *
- **Mode:** managed (owner: proof-lead)
- **Targets:** agents: conjecture-scout; groups: Conjectures

# Prior Results Sweep

1. Gather the strongest known related theorems, lemmas, and counterexamples
2. Clarify notation, assumptions, and hidden regularity requirements
3. Summarize how close prior work gets to the target statement
4. Post the most reusable ingredients to Conjectures
5. Flag any evidence the claim should be weakened or split

### Proof Attempt Cycle
- **Schedule:** manual
- **Mode:** managed (owner: proof-lead)
- **Targets:** agents: proof-builder; groups: Proofs

# Proof Attempt Cycle

1. Pick the most promising current proof strategy
2. Break it into lemmas and note required assumptions for each step
3. Record the exact point of failure if the branch breaks
4. Suggest one refinement or alternate strategy
5. Post the current proof state to Proofs and Status

### Verification And Exposition Review
- **Schedule:** manual
- **Mode:** managed (owner: proof-lead)
- **Targets:** agents: proof-verifier, proof-lead; groups: Verification, Status

# Verification And Exposition Review

1. Review the latest proof attempt line by line for logical correctness
2. Search for edge cases, hidden assumptions, or missing justifications
3. Rewrite the strongest current version into concise mathematical prose
4. Label the outcome: viable proof, partial proof, or failed branch
5. Post the result with confidence and recommended next step
