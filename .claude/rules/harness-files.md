---
paths:
  - ".claude/skills/**/*.md"
  - ".claude/commands/**/*.md"
  - ".claude/rules/**/*.md"
  - "plugins/**/skills/**/*.md"
  - "packages/*/.claude/skills/**/*.md"
---

# Harness File Rules

Skills, commands and rules follow Anthropic's skill authoring best practices
(platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices). Claude may preview a
file with a partial read (`head -100`), so what a file does and where its instructions live must
be visible at the top.

- **Frontmatter on line 1.** A file that starts with anything else has its frontmatter read as
  content. Skills carry `name` and `description`; commands carry `description` and, when they
  take arguments, `argument-hint`; rules carry `paths` only when they are path-scoped.
- **Descriptions in the third person**, what it does first, then when to use it: "Verifies …
  Use when …" — never "I can …" or "You can …". At most 1,024 characters, no XML tags.
- **`## Contents` directly after the `# ` heading** in every skill, command, rule or reference
  file longer than 100 lines: one bullet per `##` section, its `###` subsections after a dash.
  Update it whenever a section is added, renamed or removed.
- **SKILL.md stays under 500 lines.** Move detail into reference files linked directly from
  SKILL.md — one level deep, never a reference that is only reachable from another reference.
