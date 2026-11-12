---
paths:
  - "packages/**/*.ts"
  - "packages/**/*.tsx"
---

# TypeScript Rules

- Never use `any`. Use `unknown` with type narrowing when the type is truly dynamic.
- Use `import type` for type-only imports (`verbatimModuleSyntax` is enforced).
- Prefer `interface` over `type` for object shapes — interfaces are extendable and produce better error messages.
- Use `readonly` for arrays and objects that should not be mutated after creation.
- Use the `satisfies` operator for type-safe object literals that need both type checking and type inference.
- No `@ts-ignore`. Use `@ts-expect-error` with a comment explaining why, if truly unavoidable.
- No `!` non-null assertion without a comment explaining why the value is guaranteed non-null.
- Exported functions must have explicit return types.
- Array/record index access returns `T | undefined` (`noUncheckedIndexedAccess`) — always add null checks.
- Optional properties use `prop?: Type | undefined` (`exactOptionalPropertyTypes`) — be explicit about undefined.
