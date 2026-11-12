// Diagrams a page body embeds with a paragraph `{{diagram:name}}` (lib/markdown.ts).
// Inline SVG drawn with the site's tokens through classes (app/styles/diagram.css),
// so a diagram follows the reader's theme like the text around it.

const CONTENT_LIFECYCLE = `<svg class="diagram__svg" viewBox="0 0 600 300" role="img" aria-labelledby="content-lifecycle-title content-lifecycle-desc">
  <title id="content-lifecycle-title">Content moves both ways between your repository and your database</title>
  <desc id="content-lifecycle-desc">A deploy imports new and changed markdown files from the repository into the database, after a checkpoint. Editors edit and publish in Studio. krantho export writes their changes back to markdown files, which are committed to the repository.</desc>
  <defs>
    <marker id="content-lifecycle-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path class="diagram__arrowhead" d="M0,0 L10,5 L0,10 z"/>
    </marker>
  </defs>
  <path class="diagram__flow" d="M200 122 C 262 12, 338 12, 400 122" marker-end="url(#content-lifecycle-arrow)"/>
  <path class="diagram__flow" d="M400 178 C 338 288, 262 288, 200 178" marker-end="url(#content-lifecycle-arrow)"/>
  <path class="diagram__flow diagram__flow--quiet" d="M496 202 L496 248" marker-start="url(#content-lifecycle-arrow)" marker-end="url(#content-lifecycle-arrow)"/>

  <rect class="diagram__node" x="8" y="100" width="192" height="100" rx="14"/>
  <text class="diagram__title" x="26" y="132">Your repository</text>
  <text class="diagram__code" x="26" y="158">content/*.md</text>
  <text class="diagram__code" x="26" y="180">krantho.collections.ts</text>

  <rect class="diagram__node diagram__node--accent" x="400" y="100" width="192" height="100" rx="14"/>
  <text class="diagram__title" x="418" y="132">Your database</text>
  <text class="diagram__note" x="418" y="158">SQLite or Postgres</text>
  <text class="diagram__note" x="418" y="180">versions, checkpoints</text>

  <rect class="diagram__pill" x="434" y="250" width="124" height="40" rx="20"/>
  <text class="diagram__title diagram__title--small" x="496" y="275" text-anchor="middle">Studio</text>
  <text class="diagram__note" x="486" y="230" text-anchor="end">edit, publish</text>

  <rect class="diagram__label" x="250" y="26" width="100" height="28" rx="14"/>
  <text class="diagram__label-text" x="300" y="45" text-anchor="middle">deploy</text>
  <text class="diagram__note" x="300" y="98" text-anchor="middle">new and changed files,</text>
  <text class="diagram__note" x="300" y="116" text-anchor="middle">checkpoint first</text>

  <rect class="diagram__label" x="225" y="246" width="150" height="28" rx="14"/>
  <text class="diagram__label-text" x="300" y="265" text-anchor="middle">krantho export</text>
  <text class="diagram__note" x="300" y="190" text-anchor="middle">editors' changes as</text>
  <text class="diagram__note" x="300" y="208" text-anchor="middle">markdown, committed</text>
</svg>`

const CONTENT_ON_VERCEL = `<svg class="diagram__svg" viewBox="0 0 640 320" role="img" aria-labelledby="content-on-vercel-title content-on-vercel-desc">
  <title id="content-on-vercel-title">Content between deploys on Vercel</title>
  <desc id="content-on-vercel-desc">A git push starts a Vercel build, which writes a content manifest. The new deployment imports new and changed files into Postgres, after a checkpoint. Editors work in Studio on the live site. krantho export pulls their changes from the production API as markdown files, which are committed to the repository.</desc>
  <defs>
    <marker id="content-on-vercel-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path class="diagram__arrowhead" d="M0,0 L10,5 L0,10 z"/>
    </marker>
  </defs>
  <path class="diagram__flow" d="M210 86 L430 86" marker-end="url(#content-on-vercel-arrow)"/>
  <path class="diagram__flow" d="M530 134 L530 186" marker-end="url(#content-on-vercel-arrow)"/>
  <path class="diagram__flow" d="M430 246 L150 246 Q110 246 110 206 L110 134" marker-end="url(#content-on-vercel-arrow)"/>

  <rect class="diagram__node" x="10" y="38" width="200" height="96" rx="14"/>
  <text class="diagram__title" x="28" y="70">Git repository</text>
  <text class="diagram__code" x="28" y="96">content/*.md</text>
  <text class="diagram__code" x="28" y="118">krantho.collections.ts</text>

  <rect class="diagram__node" x="430" y="38" width="200" height="96" rx="14"/>
  <text class="diagram__title" x="448" y="70">Vercel build</text>
  <text class="diagram__code" x="448" y="96">next build</text>
  <text class="diagram__note" x="448" y="118">writes the content manifest</text>

  <rect class="diagram__node diagram__node--accent" x="430" y="188" width="200" height="116" rx="14"/>
  <text class="diagram__title" x="448" y="220">Production</text>
  <text class="diagram__note" x="448" y="246">Vercel Functions</text>
  <text class="diagram__note" x="448" y="266">Postgres holds the content</text>
  <text class="diagram__note" x="448" y="286">editors work in Studio</text>

  <rect class="diagram__label" x="270" y="72" width="100" height="28" rx="14"/>
  <text class="diagram__label-text" x="320" y="91" text-anchor="middle">git push</text>

  <text class="diagram__label-text" x="542" y="165">deploy</text>
  <text class="diagram__note" x="512" y="156" text-anchor="end">imports new and changed files,</text>
  <text class="diagram__note" x="512" y="174" text-anchor="end">checkpoint first</text>

  <rect class="diagram__label" x="170" y="232" width="200" height="28" rx="14"/>
  <text class="diagram__label-text" x="270" y="251" text-anchor="middle">krantho export</text>
  <text class="diagram__note" x="270" y="284" text-anchor="middle">editors' changes as markdown,</text>
  <text class="diagram__note" x="270" y="302" text-anchor="middle">committed and pushed</text>
</svg>`

const DIAGRAMS: Record<string, string> = {
  'content-lifecycle': CONTENT_LIFECYCLE,
  'content-on-vercel': CONTENT_ON_VERCEL,
}

/** A diagram as a figure, or nothing for a name with no diagram */
export function diagramHtml(name: string): string {
  const svg = DIAGRAMS[name]
  return svg ? `<figure class="diagram">${svg}</figure>\n` : ''
}
