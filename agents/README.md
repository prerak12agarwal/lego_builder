# Agent briefs

These Markdown files are the human-readable source of truth for each LEGO Builder role. Runnable Codex configurations live in `.codex/agents/*.toml`; they select the approved model and direct the agent to the matching brief.

| Role | Brief | Configuration |
| --- | --- | --- |
| Product | [product.md](product.md) | [product.toml](../.codex/agents/product.toml) |
| Architect | [architect.md](architect.md) | [architect.toml](../.codex/agents/architect.toml) |
| Developer | [developer.md](developer.md) | [developer.toml](../.codex/agents/developer.toml) |
| QA | [qa.md](qa.md) | [qa.toml](../.codex/agents/qa.toml) |

Keep role behavior here and TOML instructions small to avoid competing descriptions. Repository-wide orchestration, approval, Git, and documentation rules live in [AGENTS.md](../AGENTS.md) and take precedence.
