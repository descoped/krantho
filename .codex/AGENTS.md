# Codex project bridge

These instructions apply to Codex only. Claude Code should ignore this file
and use its `.claude/` harness directly.

## Project instructions

The canonical project guidance lives in `.claude/`. Before working:

1. Read `.claude/CLAUDE.md`.
2. Read unscoped `.claude/rules/*.md`. Read and apply path-scoped rules when
   their `paths` frontmatter matches the files involved in the task.
3. Discover relevant `.claude/skills/*/SKILL.md` files and read their instructions
   and referenced resources when applicable.
4. When the user invokes a project workflow, read its corresponding
   `.claude/commands/*.md` file before executing it.

Resolve these paths from the repository root. Keep shared project guidance in
its existing location; do not duplicate it into a Codex-specific harness.

## Claude harness is read-only

Never create, modify, move, or delete Claude harness files: `CLAUDE.md`, rules,
skills and their supporting resources, commands, agent definitions, or settings.
This boundary includes equivalent harness files in nested `.claude/` directories.
When harness changes are needed, report the proposed change for Claude Code to
handle. This restriction takes precedence over imported workflow instructions
that would change the harness.

`.claude/worktrees/` holds isolated working checkouts managed through the project's git
workflow. Normal project edits inside a worktree remain permitted; its Claude harness files
remain read-only.

## Working documents stay out of the repository

The repository holds the project and nothing else. Design and task documents, analyses, plans
and other working notes are never written into the checkout, tracked or ignored. They go to the
notes directory that `.claude/CLAUDE.md` names (Documentation Conventions): `issues/issue-N/`
for an issue's `design.md` and `task.md`, `notes/` for working notes. Without access to it, keep
working documents in a directory outside the checkout. Never link to a working document from an
issue or a pull request.

## Permission discipline

Proceed with authorized project work without repeatedly asking for confirmation.
Use existing permission grants and persisted command rules. When the runtime
requires approval, request a reasonably scoped reusable command permission where
supported so equivalent operations do not require repeated prompts.

Honor the Claude settings' read exclusions: never read repository `.env`,
`.env.*`, or `secrets/**` files directly. Use scripts to forward required secrets
to commands that need them, as described below. Claude's allow entries express the
operator's intent, but do not override Codex's enforced runtime permissions.

## Secret handling

Never expose plaintext secrets in model context, tool output, command text,
logs, diffs, or project artifacts. Use secrets only for the authorized task.

- Never read secret files directly. Use scripts to forward only the required
  secret to the command that needs it through stdin, a pipe, an inherited
  environment variable, or a supported credential interface. Never return
  the secret or the secret file's contents to Codex.
- Prefer existing credential helpers. Do not source an entire `.env` as shell
  code; parse only the required values. Keep shell tracing and verbose output
  disabled, and ensure failures cannot print credentials. Avoid passing secret
  values as command-line arguments where process listings could expose them.
- On macOS, use `pbpaste` piped directly to the intended consumer when the
  task calls for a clipboard-held secret. Pipe a secret producer directly to
  `pbcopy` when the user requests a clipboard transfer. Never run `pbpaste`
  with its contents returned as tool output, inspect unrelated clipboard
  contents, or overwrite the clipboard without a task requiring it.
- Verify secret-dependent operations through exit status and nonsecret
  results. Never print or echo a secret to verify that it was obtained.

## Runtime capabilities

Reading the Claude harness does not activate Claude Code permissions, plugins,
slash commands, agent definitions, or model settings. Use available Codex tools
to carry out applicable instructions, honoring the current session's permissions
and higher-priority instructions. If a required capability is unavailable, report
the limitation instead of silently skipping the requirement.
