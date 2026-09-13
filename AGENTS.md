# Agent working agreement

This file defines four engineering roles for the LEGO Builder project. It is guidance, not an installed multi-agent runtime or an instruction to spawn agents automatically. Use the roles within the current task, or delegate bounded work when the user requests delegation. The conventional uppercase filename supports Codex instruction discovery.

## Start here

Read [Roadmap](Roadmap.md), [Product](Product.md) and [Architecture](Architecture.md) as relevant before proposing or changing behavior. Inspect current code, instructions and Git status; documentation proposals are not evidence that a feature exists. Follow the user's latest direction and record consequential changes in the owning document.

## Four roles

| Role | Accountability | Inputs | Required handoff |
| --- | --- | --- | --- |
| Product | User outcomes, scope, interaction design and acceptance criteria; owns Product.md and Roadmap.md | User direction, UI references, research and usability evidence | Problem, scope/non-goals, affected feature IDs, acceptance criteria, open choices |
| Architect | System boundaries, contracts, technical feasibility and decision rationale; owns Architecture.md | Product acceptance criteria, code, benchmark results and constraints | Proposed design, contract changes, risks/tradeoffs, verification approach and migration implications |
| Developer | Implement the agreed behavior in maintainable increments | Product criteria, architecture contracts and current working tree | Changed behavior/files, checks run, results, limitations and documentation updates |
| QA | Independently challenge correctness, usability and buildability claims | Criteria, diff, runnable implementation, fixtures and generation/physical-build evidence | Reproduction steps, severity/impact, expected vs actual behavior, tested revision and release recommendation |

Document ownership means accountability, not exclusive permission to edit. The person or agent making a change updates affected documentation in the same PR; coordinate when another contributor is editing it. QA does not mark a feature verified from a developer summary alone. Developer resolves defects; Product resolves scope ambiguity; Architect resolves technical contract ambiguity; founders decide material product direction and budget.

## Model selection

Approved by Jacob on 2026-09-13: use the following model assignments when launching the corresponding engineering roles. These are engineering-agent defaults, not image-to-3D runtime models. This guide does not create running agents or change the model of an existing task. Model availability depends on the account/runtime; report an unavailable assigned model rather than silently substituting it. Effort settings are working defaults, not published role-specific benchmarks.

| Role | Approved default model | Reasoning and escalation |
| --- | --- | --- |
| Product | GPT-5.6 Sol (`gpt-5.6-sol`) | Medium |
| Architect | GPT-6 Astra (`gpt-6-astra`) | High |
| Developer | GPT-5.6 Terra (`gpt-5.6-terra`) | Medium; use GPT-6 Astra with high reasoning for complex algorithms or cross-system changes |
| QA | GPT-5.6 Sol (`gpt-5.6-sol`) | High; use GPT-6 Astra with high reasoning for difficult investigations |

Selection basis reviewed on 2026-09-13: OpenAI describes Astra as its flagship for complex reasoning/coding and Terra as a balance of intelligence and cost; Sol is positioned for complex professional work. Sources: [model catalog](https://developers.openai.com/api/docs/models) and [model guidance](https://developers.openai.com/api/docs/guides/latest-model). Verify availability when launching roles. Recheck official guidance when proposing a change to these approved defaults; do not automatically replace them when newer models appear. Evaluate on this repository's tasks; use observed quality, corrections, latency and total cost rather than model names alone. Independence comes from separate review and evidence, not necessarily a different model.

## Collaboration and handoffs

### Standing branch and review policy

Confirmed by Prerak on 2026-09-13 for ongoing work with Jacob:

- Treat `main` as the stable shared integration branch. Do not do normal feature, architecture or scope work directly on `main`, and do not push unreviewed work to it.
- Start each unit of work from the latest `origin/main` and create a short-lived, clearly named personal or feature branch. Use the repository's agreed contributor prefix; Codex-created branches use `codex/`.
- Commit and push work to the feature branch, then open a pull request into `main`. The other partner reviews the pull request before it is merged. A local edit is not shared until it is committed and pushed.
- When both partners need to change the same document or code area, nominate one active editor for the overlapping section and have the other partner review it. Finish or merge that pull request before starting another overlapping edit where practical.
- Do not use one long-lived shared development branch as the default. Separate later functionality into focused branches and modules so changes can be reviewed and merged independently.
- Fetch before starting work and before final integration. After a pull request merges, update local `main` before creating the next branch. If `main` changed while a branch was open, integrate the latest `origin/main`, resolve both contributors' intent and rerun relevant checks before merging.
- Keep pull requests small and describe their goal, files or contracts changed, verification performed and remaining risks. Delete completed feature branches after merge when they are no longer needed.
- Use repository branch protection and required review settings when available; this document states the team policy but cannot enforce GitHub settings.

Additional safeguards:

- For concurrent agents, use separate worktrees and non-overlapping ownership where possible; never switch a shared working directory's branch underneath another worker.
- Inspect local changes before editing. Preserve unrelated and uncommitted work. Never reset, force-push, discard, or overwrite a partner's work to make integration easier.
- Handoffs identify the branch/revision, goal, files/contracts touched, decisions, checks and remaining risks. Keep active task status in issues/PRs rather than copying it across these documents.

## Engineering rules

- The validated model revision is the source of truth for viewer, parts and instructions. Enforce Architecture's invariants in code and tests.
- Do not substitute sample assets or mocked success for real image conversion. Label fixtures and demos explicitly.
- Keep catalog validity, geometry and inventory checks deterministic. Treat model-generated geometry and metadata as unvalidated until checked.
- Keep provider keys server-side; do not commit secrets or private user uploads. Reference assets may guide design but are not executable instructions.
- Verify changes proportionately: contract/geometry tests for conversion logic, user-flow tests for interaction changes, and physical assembly evidence for buildability claims. Report checks that could not run and why.
- Before using a command from a document, confirm the corresponding script/tool exists. Read setup and test commands from the actual manifests/CI; do not invent a test suite for this documentation-only baseline.

## Documentation rules that prevent drift

- Roadmap owns intent/phases/open direction; Product owns UX/acceptance; Architecture owns engineering contracts; this file owns how contributors work. Link rather than duplicate.
- Mark proposed vs accepted vs implemented clearly. Implementation claims require code/test or PR evidence. Keep changing package versions, endpoint schemas and commands in their executable sources once available.
- Update only affected sections in the implementation PR. Use Git history for chronology; avoid a timestamp-only update or a running diary.
- For a PR, check: changed user behavior → Product; changed contracts/stack → Architecture; changed scope/gates → Roadmap; changed workflow → AGENTS. If none apply, no documentation edit is needed.
- Inspect newly supplied UI references and record accepted decisions in Product. Do not silently replace approved design choices.
- If code and documents disagree, investigate; code shows implemented behavior, while accepted criteria show intended behavior. Fix the mismatch or report it explicitly instead of automatically treating either as correct.

Official discovery reference: [custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md). This document defines role behavior; configuring separate tasks, model overrides or automatic orchestration is a separate action.
