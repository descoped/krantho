# /kt-validate

Validate all content against collection Zod schemas.

## Steps

1. Run the validation script: `bash scripts/validate.sh`
2. Report results grouped by collection
3. For each error, show the file, field, and expected type

## Output Format

```
Validating content against schemas...

pages/ (4 files)
  OK  home.md
  OK  about.md
  OK  features.md
  OK  pricing.md

blog/ (3 files)
  OK  2026-03-28-launch.md
  FAIL  2026-04-01-schemas.md
     - missing required field 'author'
     - 'date' must be a valid datetime string
  OK  2026-04-05-seo.md

Result: 6 passed, 1 failed
```

## On Failure

If validation fails, suggest fixes for each error. Offer to fix them automatically if the fixes are straightforward (missing defaults, format issues).
