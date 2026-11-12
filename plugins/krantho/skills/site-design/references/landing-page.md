# Landing and product pages

A landing page helps a visitor decide. Structure it as a short argument, each section earning
its place, every claim followed by proof.

## Section order

1. **Hero.** A headline that states the visitor's outcome, a subline that says how in plain
   words, one primary action and at most one quieter secondary action. Optional: a small proof
   element beside it (a code sample, a product screenshot with real content, a short diagram).
   No carousel, no autoplay video.
2. **The problem, briefly.** Two or three sentences in the visitor's words.
3. **The approach.** Three to six capability cards: a title, one sentence of benefit, a link to
   the page that proves it. Cards come from a list collection (for example `features` with an
   `order` field), not from code.
4. **Proof.** Show, don't claim: a real code sample, a real screen, a small working demo, a
   fact the visitor can verify. Every claim on the page links to its proof.
5. **Fit.** When the product fits and when it does not. It builds more trust than it costs.
6. **Questions.** A handful of FAQ entries from an FAQ collection, as `<details>` elements, with
   FAQPage structured data (see the `seo` skill).
7. **Next step.** Repeat the primary action, phrased as what happens ("Read the installation
   guide", not "Learn more").

Cut any section that repeats another. Keep the page scannable: a heading and a sentence per
section should tell the story on their own.

## Content template for a landing page

A singleton — one document, rendered by one route:

| Field | Purpose |
|---|---|
| `title`, `description` | the `<title>` and meta description |
| `eyebrow` (optional) | a short label above the headline |
| `headline`, `subline` | the hero text |
| `primary-label`, `primary-href` | the primary action |
| `secondary-label`, `secondary-href` (optional) | the quieter action |
| `##` sections in the body | longer passages ("## Problem", "## Fit") the template places by name |

The page template reads the singleton plus the lists it shows (features, FAQ). The
`content-model` skill ships this template.

## Detail pages

A feature, service or product page: what it does for the visitor → how it works → proof →
limits → where to read more. End with related pages and one action.

## Microcopy

- Buttons say what happens. Links say where they go.
- Empty states say what to do next.
- Errors say what went wrong and how to fix it.
- Headings are sentences in sentence case, not title case, unless the brand says otherwise.

## Visual rhythm

- One column for reading (about 65–75 characters per line, `--width-prose`), a wider grid for
  cards (`--width-content`).
- Alternate section backgrounds sparingly; whitespace separates better than borders.
- Keep one visual motif and use it consistently rather than several decorative ideas.
- The hero is the page's Largest Contentful Paint candidate: render its text as HTML, not in an
  image, and keep any hero image sized, compressed and not lazy-loaded.
