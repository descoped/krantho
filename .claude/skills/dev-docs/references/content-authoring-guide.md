# Content Authoring Guide Template

Output: `docs/guides/content-authoring.md`

For content authors — people who write markdown, not code.

## Structure

```markdown
# Content Authoring

## File Format
Frontmatter (YAML between ---) + markdown body. Complete example file.

## Frontmatter Keys
Standard fields: title, description, status. Prefixes: nav-, footer-, logo-,
service-N-, meta-description-.
How keys map to what appears on the page.

## Sections
## headings create addressable sections.
How CMSMarkdown renders them. Naming conventions (kebab-case).

## SEO Fields
meta-description per page. business.yaml for structured data.
What gets auto-generated vs manually written.

## Content Organization
`globals` collection (`content/globals/`) for shared layout content. One file per page.
File naming = URL slug.
```

## Do

- Show a complete content file with annotations
- Explain what each frontmatter key controls visually

## Don't

- Don't explain TypeScript types or component internals
- Don't reference package.json or build tools
