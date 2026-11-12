# /kt-enrich

Run SEO enrichment on content using the configured LLM provider.

## Steps

1. Read `krantho.config.ts` to get LLM configuration
2. If the configured provider has no API key, inform user they need to provide one:
   - Set that provider's variable in the environment, such as `KRANTHO_LLM_ANTHROPIC_API_KEY`
   - Or add `llm: { anthropic: { apiKey } }` (the provider's own block) to `krantho.config.ts`
   - The provider and model come from the same `llm` block, defaulting to Anthropic
3. Run the enrichment pipeline (FAQ, services, llms.txt, meta). The scripts have no
   single-document mode; they cover every document and skip what is already filled
4. Report what was generated

## Running

```bash
bash scripts/enrich.sh            # dry run: preview only
bash scripts/enrich.sh --apply    # write changes
```

Runs all enrichment scripts from the project root (or pass `--root <dir>`):
- FAQ Q&A generation
- Service catalog descriptions
- llms.txt link descriptions
- Meta descriptions

## Output Format

```
Enriching content/blog/2026-03-28-launch.md...

Using provider: anthropic (claude-haiku-4-5)
  Generated: meta-description
  Generated: FAQ Q&A (3 questions)

Updated files:
  content/seo/generated/...
```
