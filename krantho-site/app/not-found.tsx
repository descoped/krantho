import type { Metadata } from 'next'
import { Mark } from './components/brand'
import './styles/brand.css'

// The root 404: addresses outside the site shell. It stands alone on the root
// layout's fonts and tokens and reads no content, because the build prerenders
// it and the build cannot reach the database.

export const metadata: Metadata = {
  title: 'Page not found',
  robots: { index: false },
}

// Contour lines behind the message, drawn once on the server: closed curves
// whose radius wanders a little with the angle, like a height map
function contours(): string[] {
  const paths: string[] = []
  for (let ring = 0; ring < 8; ring++) {
    const base = 60 + ring * 52
    const points: string[] = []
    for (let step = 0; step < 72; step++) {
      const angle = (step / 72) * Math.PI * 2
      const wobble =
        1 + 0.07 * Math.sin(3 * angle + ring * 0.6) + 0.045 * Math.sin(5 * angle - ring * 0.9)
      const x = 500 + base * 1.3 * wobble * Math.cos(angle)
      const y = 400 + base * wobble * Math.sin(angle)
      points.push(`${x.toFixed(1)} ${y.toFixed(1)}`)
    }
    paths.push(`M${points.join('L')}Z`)
  }
  return paths
}

export default function NotFound(): React.ReactElement {
  return (
    <main className="lost">
      <svg className="lost__contours" viewBox="0 0 1000 800" aria-hidden="true" focusable="false">
        {contours().map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
      <div className="lost__inner">
        <a href="/" className="lost__mark" aria-label="Krantho home">
          <Mark size={56} />
        </a>
        <p className="eyebrow">404 — page not found</p>
        <h1 className="lost__title">There is no page at this address</h1>
        <p className="lede lost__lede">
          The link may be out of date, or the address mistyped. These pages are good places to
          continue.
        </p>
        <nav className="lost__links" aria-label="Where to go next">
          <a href="/" className="button button--primary">
            Go to the home page
          </a>
          <a href="/docs" className="button button--secondary">
            Read the documentation
          </a>
          <a href="/features" className="button button--ghost">
            See the features
          </a>
        </nav>
      </div>
    </main>
  )
}
