import '../styles/landing.css'

// The content graph — krantho's idea in one picture. A document and its fields
// on the left; edges drawing out to what krantho makes of it: the rendered page,
// its JSON-LD @graph, and its entry in search and llms.txt. The same title and
// description appear in every outcome, because they are the same fields.
//
// Pure SVG, styled and animated by landing.css (cg-* classes): each branch draws
// its edge, sends one pulse along it and lights its outcome, in a calm 10 s loop.
// The static state is the complete graph, which is all a visitor sees under
// prefers-reduced-motion. Colors come from tokens, so both themes stay sharp.

const LABEL =
  'A krantho document with the fields title, description and status. Edges lead from it to three results: ' +
  'the rendered page, its JSON-LD graph of Organization, WebPage and Article, and its entry in search and llms.txt.'

/** Outcome cards share one geometry: 168 × 112 at x 296 */
const OUT_X = 296
const OUT_W = 168
const OUT_H = 112
const PORT = { x: 192, y: 192 }

interface Branch {
  n: 1 | 2 | 3
  /** Top edge of the outcome card */
  y: number
  label: string
  children: React.ReactNode
}

function edgePath(toY: number): string {
  const mid = (PORT.x + OUT_X) / 2
  return `M${PORT.x} ${PORT.y}C${mid} ${PORT.y} ${mid} ${toY} ${OUT_X} ${toY}`
}

function Defs({ id }: { id: string }): React.ReactElement {
  return (
    <defs>
      <linearGradient id={`${id}-card`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" className="cg-stop-surface" />
        <stop offset="1" className="cg-stop-subtle" />
      </linearGradient>
      <linearGradient id={`${id}-edge`} gradientUnits="userSpaceOnUse" x1={PORT.x} y1="0" x2={OUT_X} y2="0">
        <stop offset="0" className="cg-stop-accent" />
        <stop offset="1" className="cg-stop-violet" />
      </linearGradient>
      <radialGradient id={`${id}-glow`}>
        <stop offset="0" className="cg-stop-glow" />
        <stop offset="1" className="cg-stop-glow cg-stop-none" />
      </radialGradient>
      {/* A luminance mask, not a color: it fades the dotted canvas toward the edges */}
      <radialGradient id={`${id}-fade`}>
        <stop offset="0.35" stopColor="#fff" />
        <stop offset="1" stopColor="#000" />
      </radialGradient>
      <mask id={`${id}-mask`}>
        <rect width="480" height="384" fill={`url(#${id}-fade)`} />
      </mask>
      <pattern id={`${id}-dots`} width="16" height="16" patternUnits="userSpaceOnUse">
        <circle cx="8" cy="8" r="1" className="cg-dot" />
      </pattern>
    </defs>
  )
}

function DocumentCard({ id }: { id: string }): React.ReactElement {
  return (
    <g className="cg-document">
      <circle cx="104" cy="192" r="150" fill={`url(#${id}-glow)`} />
      <rect x="16" y="112" width="176" height="160" rx="14" fill={`url(#${id}-card)`} className="cg-card cg-card--strong" />
      <text x="32" y="137" className="cg-label">
        docs / getting-started
      </text>
      <path d="M16 150h176" className="cg-rule" />
      <text x="32" y="172" className="cg-label">
        title
      </text>
      <text x="32" y="189" className="cg-value">
        Getting started
      </text>
      <text x="32" y="211" className="cg-label">
        description
      </text>
      <text x="32" y="228" className="cg-text">
        Install, wire, render.
      </text>
      <text x="32" y="257" className="cg-label">
        status
      </text>
      <rect x="84" y="244" width="84" height="18" rx="9" className="cg-pill" />
      <circle cx="96" cy="253" r="3" className="cg-pill-dot" />
      <text x="105" y="257" className="cg-label cg-label--accent">
        published
      </text>
    </g>
  )
}

function PageOutcome(): React.ReactElement {
  const x = OUT_X + 14
  return (
    <>
      <text x={x} y="60" className="cg-heading">
        Getting started
      </text>
      <text x={x} y="76" className="cg-text cg-text--small">
        Install, wire, render.
      </text>
      <rect x={x} y="88" width="128" height="5" rx="2.5" className="cg-line" />
      <rect x={x} y="99" width="100" height="5" rx="2.5" className="cg-line" />
    </>
  )
}

function GraphPill({ x, y, width, label, tone }: { x: number; y: number; width: number; label: string; tone: string }): React.ReactElement {
  return (
    <>
      <rect x={x} y={y} width={width} height="18" rx="9" className={`cg-node cg-node--${tone}`} />
      <text x={x + 10} y={y + 12.5} className="cg-label cg-label--strong">
        {label}
      </text>
    </>
  )
}

function JsonLdOutcome(): React.ReactElement {
  const x = OUT_X
  const y = 136
  return (
    <>
      <path d={`M${x + 30} ${y + 54}V${y + 69}H${x + 44}M${x + 60} ${y + 78}V${y + 93}H${x + 74}`} className="cg-link" />
      <GraphPill x={x + 14} y={y + 36} width={92} label="Organization" tone="violet" />
      <GraphPill x={x + 44} y={y + 60} width={62} label="WebPage" tone="plain" />
      <GraphPill x={x + 74} y={y + 84} width={62} label="Article" tone="accent" />
    </>
  )
}

function SearchOutcome(): React.ReactElement {
  const x = OUT_X + 14
  return (
    <>
      <text x={x} y="310" className="cg-label">
        krantho.com › docs
      </text>
      <text x={x} y="326" className="cg-value cg-value--link">
        Getting started
      </text>
      <text x={x} y="340" className="cg-text cg-text--small">
        Install, wire, render.
      </text>
      <path d={`M${x} 350h140`} className="cg-rule cg-rule--dashed" />
      <text x={x} y="366" className="cg-label">
        - [Getting started](…)
      </text>
    </>
  )
}

function BranchGroup({ id, branch }: { id: string; branch: Branch }): React.ReactElement {
  const d = edgePath(branch.y + OUT_H / 2)
  return (
    <g className={`cg-branch cg-branch--${branch.n}`}>
      <path d={d} className="cg-track" />
      <path d={d} pathLength={100} stroke={`url(#${id}-edge)`} className="cg-edge" />
      <path d={d} pathLength={100} stroke={`url(#${id}-edge)`} className="cg-halo" />
      <path d={d} pathLength={100} stroke={`url(#${id}-edge)`} className="cg-pulse" />
      <rect x={OUT_X} y={branch.y} width={OUT_W} height={OUT_H} rx="12" fill={`url(#${id}-card)`} className="cg-card" />
      <rect x={OUT_X} y={branch.y} width={OUT_W} height={OUT_H} rx="12" className="cg-lit" />
      <text x={OUT_X + 14} y={branch.y + 18} className="cg-label cg-label--strong">
        {branch.label}
      </text>
      <path d={`M${OUT_X} ${branch.y + 28}h${OUT_W}`} className="cg-rule" />
      <g className="cg-content">{branch.children}</g>
      <circle cx={OUT_X} cy={branch.y + OUT_H / 2} r="3.5" className="cg-port cg-port--in" />
    </g>
  )
}

export function ContentGraph({ id = 'cg', className }: { id?: string; className?: string }): React.ReactElement {
  const branches: Branch[] = [
    { n: 1, y: 8, label: 'Page', children: <PageOutcome /> },
    { n: 2, y: 136, label: 'JSON-LD', children: <JsonLdOutcome /> },
    { n: 3, y: 264, label: 'Search & llms.txt', children: <SearchOutcome /> },
  ]
  return (
    <svg
      viewBox="10 0 460 384"
      width="460"
      height="384"
      fill="none"
      role="img"
      aria-label={LABEL}
      className={`content-graph${className ? ` ${className}` : ''}`}
    >
      <Defs id={id} />
      <rect width="480" height="384" fill={`url(#${id}-dots)`} mask={`url(#${id}-mask)`} />
      {branches.map((branch) => (
        <BranchGroup key={branch.n} id={id} branch={branch} />
      ))}
      <DocumentCard id={id} />
      <circle cx={PORT.x} cy={PORT.y} r="4.5" className="cg-port-halo" />
      <circle cx={PORT.x} cy={PORT.y} r="4.5" className="cg-port" />
    </svg>
  )
}
