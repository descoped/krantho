# Package Documentation Template

Output: `docs/<package-name>.md`

Before writing, read: `packages/<name>/package.json`, `packages/<name>/src/index.ts`, all source files, and tests.

## Structure

```markdown
# @krantho/<name>

<One paragraph: what it does, who it's for.>

## Context

Why this package exists. What problem it solves. Where it fits in krantho.

## Rationale

Key design decisions and trade-offs:
- Why it's a separate package
- Why specific dependencies were chosen
- What was intentionally left out

## Architecture

Internal structure and mental model:
- Directory layout
- Key modules and responsibilities
- Data flow diagram (if non-obvious)
- Extension points

## API Reference

Every public export, grouped by category:
- Signature with types
- One-sentence description
- Parameters, return value
- Example

Lead with the most-used APIs.

## Usage

Practical examples:
- Installation command
- Minimal working example
- Common patterns
- Integration with other @krantho packages
- Framework-specific usage (Next.js, SvelteKit)

## Dependencies

### Runtime Dependencies
For each: what it's used for, version constraints.

### Workspace Dependencies
Other @krantho packages: what's imported, hard vs optional.

### Peer Dependencies
What consumers must provide. What happens if missing.
```

## Do

- Read source code before writing — every type signature must match
- Use `@krantho/<name>` imports in examples
- Link to other package docs: `See [core.md](core.md)`
- Include error handling in examples where relevant

## Don't

- Don't guess APIs — read `src/index.ts`
- Don't duplicate content from other package docs
- Don't include internal implementation details consumers can't use
- Don't write marketing copy — this is a technical reference
