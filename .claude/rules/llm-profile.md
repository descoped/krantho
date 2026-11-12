# LLM Profile (project harness and CI)

Everything that runs Claude around this repository as developer tooling — Claude Code sessions,
subagents, `claude -p` runs, evals and experiments, and the Claude PR-review workflow — is the
**project harness**. It is billed to the Max subscription and never to an API key.

- **Credential:** the Claude Code login; `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`)
  for CI and for direct Haiku calls in scripts.
- **Models:** Opus 5.5 with the 1M context (`claude-opus-5-5[1m]`) is the default for the
  session; Sonnet 5.5 with the 1M context (`claude-sonnet-5-5[1m]`) for every subagent, the
  spec-loop implementer at high effort (`.claude/agents/spec-loop-implementer.md`); Fable 5.1
  when a task needs deeper reasoning. Opus and Sonnet are reached only through the `claude`
  CLI. The session model and the subagent default are per-developer settings
  (`model` and `CLAUDE_CODE_SUBAGENT_MODEL` in `~/.claude/settings.json`); the implementer
  agent names its model itself. A verifier on the implementer's model is still independent:
  independence is a fresh, blind context (`spec-driven-loop.md`), not a different model.
- **CI:** the PR-review workflow authenticates with `claude_code_oauth_token` from the
  `CLAUDE_CODE_OAUTH_TOKEN` repository secret, not an API key.

## The boundary

The krantho **app stack** — `@krantho/ai`, runtime enrichment, the tools pipeline and the example
apps — is the product. It authenticates with a Console API key the deployer brings and is billed
per token to whoever deploys. Its providers, models and settings are product configuration and are
documented with the product (`docs/ai.md`, `docs/configuration.md`), not here.

- Harness code never reads an app-stack key. An eval, sweep or script that needs a model goes
  through the `claude` CLI or `CLAUDE_CODE_OAUTH_TOKEN`, names the credential it needs
  explicitly, and aborts if it is absent. `ANTHROPIC_API_KEY` stays unset on developer machines
  so nothing can pick up a paid key by accident.
- App-stack code never reads a harness token: the harness keeps `CLAUDE_CODE_OAUTH_TOKEN`, and
  krantho does not read it. The app stack has credentials of its own, one per provider, each
  with its own variable (`KRANTHO_LLM_ANTHROPIC_API_KEY`, `KRANTHO_LLM_OPENAI_API_KEY`, …). The
  `claude-code` provider of `@krantho/ai` runs on a subscription token the developer puts in
  `KRANTHO_LLM_CLAUDE_CODE_OAUTH_TOKEN`, so local enrichment and the assistant can run on the
  subscription. It is development only (the server refuses the provider in production), pinned
  to Haiku, never stored, and a choice of provider: no other provider reads it. Production
  deployments use a provider with an API key, the `anthropic` provider with a Console key by
  default — subscription tokens stay on the developer's machine.
- Keys live only in the gitignored root `.env` and in GitHub secrets — never in shell files,
  Claude Code settings, or launchd.
