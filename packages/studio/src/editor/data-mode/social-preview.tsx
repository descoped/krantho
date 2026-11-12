import { ImageOff } from 'lucide-react'
import { type ReactElement, useState } from 'react'
import { imageSource, type PagePreview } from './preview-model.js'

/** The image a card shows, or a calm placeholder when there is none or it cannot load */
function CardImage({ image }: { image: string | null }): ReactElement {
  const [failed, setFailed] = useState<string | null>(null)
  if (!image || failed === image) {
    return (
      <div className="social-card-image social-card-image--empty">
        <ImageOff aria-hidden="true" />
        <span>{image ? 'The image could not load' : 'No social image'}</span>
      </div>
    )
  }
  return (
    <div className="social-card-image">
      <img src={imageSource(image)} alt="" onError={() => setFailed(image)} />
    </div>
  )
}

function hostOf(url: string | null): string {
  if (!url) return ''
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

/**
 * A shared link as social networks and chat apps draw it from the page's
 * Open Graph tags, and as X draws its card (large with an image, else a
 * summary) — from the draft's current values
 */
export function SocialPreview({ preview }: { preview: PagePreview }): ReactElement {
  const { social, twitterCard } = preview
  const host = hostOf(preview.url)
  const large = twitterCard === 'summary_large_image'
  return (
    <div className="social-previews">
      <figure className="social-preview">
        <figcaption className="social-preview-label">Open Graph · og:type {social.type}</figcaption>
        <div className="social-card">
          <CardImage image={social.image} />
          <div className="social-card-text">
            <span className="social-card-site">{social.siteName || host}</span>
            <span className="social-card-title">{social.title}</span>
            <span className="social-card-description">{social.description}</span>
          </div>
        </div>
      </figure>
      <figure className="social-preview">
        <figcaption className="social-preview-label">X · {twitterCard}</figcaption>
        <div className={large ? 'social-card' : 'social-card social-card--summary'}>
          {large ? <CardImage image={social.image} /> : null}
          <div className="social-card-text">
            <span className="social-card-title">{social.title}</span>
            <span className="social-card-site">{host}</span>
          </div>
        </div>
      </figure>
    </div>
  )
}
