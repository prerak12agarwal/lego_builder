# Agent working agreement

This file defines four engineering roles and their orchestration for LEGO Builder. Runnable project configurations live in `.codex/agents/*.toml`; detailed role briefs live in `agents/*.md`. The conventional uppercase filename supports Codex instruction discovery.

## Start here

Read [Roadmap](Roadmap.md), [Product](Product.md) and [Architecture](Architecture.md) as relevant before proposing or changing behavior. Inspect current code, instructions and Git status; documentation proposals are not evidence that a feature exists. Follow the user's latest direction and record consequential changes in the owning document.

When acting as the primary agent, use the custom roles for substantial work under the gates below. Give each delegated agent a bounded task, file ownership, edit authority, and expected handoff. Wait for required handoffs before integration. Do not delegate merely to restate known context.

## Four roles

| Role | Accountability | Inputs | Required handoff |
| --- | --- | --- | --- |
| [Product](agents/product.md) | User outcomes, scope, interaction design and acceptance criteria; owns Product.md and Roadmap.md | User direction, UI references, research and usability evidence | Problem, scope/non-goals, affected feature IDs, acceptance criteria, open choices |
| [Architect](agents/architect.md) | System boundaries, contracts, technical feasibility and decision rationale; owns Architecture.md | Product acceptance criteria, code, benchmark results and constraints | Proposed design, contract changes, risks/tradeoffs, verification approach and migration implications |
| [Developer](agents/developer.md) | Implement the agreed behavior in maintainable increments | Product criteria, architecture contracts and current working tree | Changed behavior/files, checks run, results, limitations and documentation updates |
| [QA](agents/qa.md) | Independently challenge correctness, usability and buildability claims | Criteria, diff, runnable implementation, fixtures and generation/physical-build evidence | Reproduction steps, severity/impact, expected vs actual behavior, tested revision and release recommendation |

Document ownership means accountability, not exclusive permission to edit. The person or agent making a change updates affected documentation in the same PR; coordinate when another contributor is editing it. QA does not mark a feature verified from a developer summary alone. Developer resolves defects; Product resolves scope ambiguity; Architect resolves technical contract ambiguity; founders decide material product direction and budget.

## Model selection

Approved by Jacob on 2026-09-13: use the following model assignments when launching the corresponding engineering roles. These are engineering-agent defaults, not image-to-3D runtime models. Runnable TOML configurations set them for new custom-agent sessions; they do not change an existing task. Model availability depends on the account/runtime; report an unavailable assigned model rather than silently substituting it. Effort settings are working defaults, not published role-specific benchmarks.

| Role | Approved default model | Reasoning and escalation |
| --- | --- | --- |
| Product | GPT-5.6 Sol (`gpt-5.6-sol`) | Medium |
| Architect | GPT-6 Astra (`gpt-6-astra`) | High |
| Developer | GPT-5.6 Terra (`gpt-5.6-terra`) | Medium; use GPT-6 Astra with high reasoning for complex algorithms or cross-system changes |
| QA | GPT-5.6 Sol (`gpt-5.6-sol`) | High; use GPT-6 Astra with high reasoning for difficult investigations |

Selection basis reviewed on 2026-09-13: OpenAI describes Astra as its flagship for complex reasoning/coding and Terra as a balance of intelligence and cost; Sol is positioned for complex professional work. Sources: [model catalog](https://developers.openai.com/api/docs/models) and [model guidance](https://developers.openai.com/api/docs/guides/latest-model). Verify availability when launching roles. Recheck official guidance when proposing a change to these approved defaults; do not automatically replace them when newer models appear. Evaluate on this repository's tasks; use observed quality, corrections, latency and total cost rather than model names alone. Independence comes from separate review and evidence, not necessarily a different model.

## Orchestration and approval gates

Classify work before delegating:

- Major: changes product scope, a user journey, canonical model/inventory/instruction meaning, persistent schema, public API, generation approach, security/privacy, a paid provider, hosting boundary, release criteria, or carries material cost/data-loss risk.
- Substantial implementation: implements an approved multi-file feature or risky behavior without reopening a major decision.
- Small fix: localized and reversible, preserving accepted behavior, architecture, contracts, data, dependencies, security boundaries, and release claims.

Use this workflow:

1. For a major decision, delegate to Product and Architect for their respective analysis and document edits. They may work in parallel only with non-overlapping ownership. The primary agent reconciles their handoffs and obtains founder approval before Developer implementation. An explicit founder request that already settles the decision counts as approval; do not ask twice.
2. For substantial implementation with approved direction, delegate implementation to Developer, then independent validation to QA. Bring in Product or Architect only when a real ambiguity or source-of-truth change appears.
3. For a small fix, the human request is sufficient approval. The primary agent may implement and verify directly; use Developer or QA only when separate context materially improves quality.
4. The primary agent owns synthesis, conflict resolution, integration, commit, push, and user-facing status. Role agents may edit within authority but do not commit or push.

Do not run write-heavy agents concurrently in the same files. Assign separate files or isolated worktrees for parallel edits and name one primary integrator. QA reviews the combined implementation after Developer finishes.

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

- Use a separate branch per person and focused change. For concurrent writing agents, use separate worktrees or provably non-overlapping ownership; never switch a shared working directory's branch underneath another worker.
- Inspect local changes before editing. Preserve unrelated and uncommitted work. Never reset, force-push, discard, or overwrite a partner's work to make integration easier.
- Before integration, the primary agent runs `git status`, fetches the remote, and compares the branch with its upstream and `origin/main`. On a clean branch, use `git pull --ff-only` for its upstream. Bring `origin/main` into a published/shared feature branch with a normal merge when needed; do not rebase or rewrite shared history.
- A role agent may fetch and inspect remote updates. It may pull or merge only in its own assigned clean worktree, when no other writer uses that branch, and only within an explicit integration assignment. Check status first, use fast-forward-only pull, preserve untracked files, and stop for the primary integrator if the update is non-fast-forward or conflicts. In a shared checkout, only the primary integrator pulls or merges.
- Role agents never commit, push, force-push, rebase, reset, clean, delete branches, change remotes, or discard local changes. They hand uncommitted edits and evidence to the primary agent. The primary agent reviews the combined diff, tests it, checks the remote again, then commits and pushes.
- Submit small PRs into the shared main branch. Use partner review; branch protection is a repository setting, not something this file enforces or claims is configured.
- Avoid simultaneous edits to dependency manifests, lockfiles, schemas or the same documentation section. Agree a single integrator for overlapping changes; resolve conflicts using both contributors' intent and rerun relevant checks.
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

Official references: [custom instructions with AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md) and [custom subagents](https://learn.chatgpt.com/docs/agent-configuration/subagents).
