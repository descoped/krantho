# Persistence Guide Template

Output: `docs/guides/persistence.md`

Before writing, read: `packages/persistence/src/`, `packages/persistence-fs/src/`, `packages/persistence-sqlite/src/`, `packages/persistence-postgres/src/`, `packages/server/src/persistence.ts` (how the `persistence` section of the configuration tree selects an adapter), `packages/core/src/types.ts` (IContentLoader).

## Structure

```markdown
# Persistence

## Interface
IPersistenceAdapter contract. What methods to implement.
How it extends IContentLoader.

## Backends
Filesystem, SQLite (default), Postgres. How `persistence.provider` in
`krantho.config.ts` selects one; FileSystemAdapter options
(`FileSystemAdapterOptions` extends `PersistenceConfig`).

## Writing a Custom Adapter
Step-by-step: implement IPersistenceAdapter for a new backend.
Minimal example (in-memory adapter).

## Rendering Modes
How persistence interacts with SSG, SSR, and ISR.
Which adapters work with which modes.
```

## Do

- Show the full IPersistenceAdapter interface
- Include a minimal custom adapter example
- Explain the IContentLoader relationship

## Don't

- Don't document adapter internals — link to the persistence-sqlite and persistence-postgres package docs
- Don't explain ContentEngine caching — link to core docs
