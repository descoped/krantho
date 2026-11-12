---
paths:
  - "packages/*/test/**/*.ts"
  - "packages/*/test/**/*.tsx"
---

# Testing Rules

- Every new module must have corresponding tests.
- Tests live in `packages/<name>/test/` — co-located with the package they test.
- Test behavior, not implementation — test what the function does, not how it does it internally.
- Use readable test names: `describe('ContentEngine')` → `it('should cache content with TTL')`.
- No `any` in tests. Use typed mocks.
- Test error paths, not just happy paths. Every function that can fail should have failure tests.
- Filesystem tests use temp directories or example content, not mocks of `fs`.
- Integration tests use real dependencies.
- Aim for high coverage on new code. Every public function should have at least one test.
- Tests run with `pnpm -w run test:run` (workspace-wide) or `pnpm --filter @krantho/<name> run test:run` (single package).
- Each package with tests needs its own `vitest.config.ts`.
- Root `vitest.config.ts` lists all package test configs in `projects`.
