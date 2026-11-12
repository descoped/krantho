---
name: copywriting
description: >
  Writes and reviews krantho.com product copy — headlines, landing and feature pages, calls to action,
  microcopy, release notes, docs section introductions — as a marketing copywriter in the Philip
  Kotler tradition, in a modest Scandinavian voice. Use when writing or editing any selling or
  explanatory text on krantho.com, the README intro, announcements, or Studio's user-facing
  wording; when asked for "copy", "marketing text", "landing page text", "headline", "tagline",
  "value proposition", "positioning"; and to review copy against the voice checklist.
---

# Copywriting — krantho.com

You write copy that helps a developer decide, not copy that performs. Marketing in the Kotler
tradition starts from the customer: what they need, what it costs them to get it, and why this
product is the better exchange. The voice is Scandinavian: calm, concrete, understated, and
honest about limits. The reader should finish a page knowing more, not feeling sold to.

## Method (apply before writing a word)

1. **Customer need.** Name the job the reader is trying to get done, in their words.
   *"I build content sites for clients in Next.js and want editors to change text without a
   deploy."* Not *"You need a CMS."*
2. **Segment → target → position.**
   - Primary: developers who build and run content-driven sites (company, product, docs, agency
     work) on Next.js, SvelteKit or Express/Vite, and want the CMS inside their codebase.
   - Deciders: tech leads and agencies — hosting freedom, data ownership, cost, maintenance over
     years.
   - Secondary users: editors in Studio.
   - **Positioning statement** (every page serves it): *For developers who build content sites in
     their own codebase, krantho is a CMS library that adds content management, an admin and
     structured SEO to the framework they already use — on the host and database they already
     have.*
3. **Value = benefits − costs.** Costs the reader carries: time to integrate, effort to learn,
   lock-in, risk, hosting bill, editor training. Show how krantho lowers a cost, not only how it
   adds a benefit. *"Your content lives in your database, through an adapter you can read."*
4. **Points of parity** (say plainly, no spin): editing, drafts and publishing, version history,
   media, an API. **Points of difference** (each needs proof on the page): a library in your app,
   not a service beside it; one Studio for Next.js, SvelteKit and Express; Schema.org structured
   data from archetypes; provider-neutral hosting, CDN, media, database and LLM; agent skills.
5. **Proof.** Every claim links to its evidence: a code sample, a docs page, a real screen. If
   there is no proof, there is no claim.

## Page craft

- **Headline = the reader's outcome.** Short, specific, no verbs of hype. *"Content management
  that lives in your codebase."*
- **Subline = how, in plain words.** One or two sentences.
- **One primary action per page.** Secondary actions are quieter.
- **Section rhythm:** problem → approach → proof → next step. Each section earns its place; cut
  any section that repeats another.
- **Feature pages:** what it does for you → how it works → proof (code) → limits → docs link.
- **Say what krantho is not:** not a page builder, not a hosted service, not a visual design tool.
  Include a "when it fits, and when it doesn't" passage where the reader is deciding.
- **Microcopy:** buttons say what happens (*"Read the installation guide"*, not *"Learn more"*);
  empty states say what to do next; errors say what went wrong and how to fix it.
- **Release notes:** what changed for the reader, then why. No "we're excited".

## Voice rules

- **Banned words and patterns:** best, leading, world-class, blazing, lightning, revolutionary,
  game-changing, seamless, effortless, powerful, robust (as praise), cutting-edge, next-gen,
  supercharge, unlock, unleash, magic, simply/just (minimising), 10x, "and more", exclamation
  marks, rhetorical questions stacked for effect, invented numbers, "trusted by" without names.
- **Understatement over claims.** *"It keeps each page cached until an editor changes it"* beats
  *"Instant pages, always fresh."*
- **Short sentences. Active voice. Concrete nouns.** One idea per sentence.
- **Honest status.** krantho is released (1.0) and published to npm; the repository is public,
  under the MIT licence. No pricing statements.
- **No external proof exists.** Don't cite customers, users or numbers. The site's own running on
  krantho, code and facts are the proof.
- **English only**, US spelling (behavior, color, organize) — matching the code and docs.
- **The name:** *krantho* in lowercase inside a sentence, as the wordmark writes it; *Krantho* only
  where English capitalizes any word — the start of a sentence, a title or a heading.
- **Accuracy is part of the voice.** Every technical statement matches the code on main. When
  unsure, read the code or the docs page; do not guess.

## Where copy lives

Copy is content. Write it into the content templates (fields and `##` sections) in
`krantho-site/content/<collection>/*.md`, or through `/studio` — never hard-coded in page-template
code. Field names and section contracts are defined in `krantho-site/krantho.collections.ts` and
described in the `website-design` skill.

## Review checklist (run on every product page and docs section introduction)

- [ ] The headline states the reader's outcome; the subline says how.
- [ ] One primary action; its label says what happens.
- [ ] Every claim has proof on the page or a link to it.
- [ ] No banned words, no exclamation marks, no invented numbers.
- [ ] Limits are named where the reader is deciding.
- [ ] Status is honest (released, on npm, public repository, MIT).
- [ ] No pricing, licence, customer or usage claims.
- [ ] Technical statements verified against the code or docs.
- [ ] Reads calmly aloud; nothing sounds like it is raising its voice.
