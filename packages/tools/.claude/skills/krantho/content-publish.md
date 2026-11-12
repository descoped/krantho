# /kt-publish <slug>

Change content status from draft to published.

## Steps

1. Find the content file by slug (search across all collection directories)
2. Read current frontmatter
3. If status is already `published`, inform user — no action needed
4. Run validation on the file first
5. If validation fails, report errors and do NOT publish
6. Change `status: draft` to `status: published` in frontmatter
7. Save the file
8. Ask the user if they want to commit the change

## Output Format

```
Publishing content/blog/2026-03-28-launch.md...

Validation: passed
Status: draft → published

Commit this change?
```

## On Validation Failure

```
Publishing content/blog/2026-04-01-schemas.md...

Validation: FAILED
  - missing required field 'author'

Cannot publish invalid content. Fix the errors first.
```
