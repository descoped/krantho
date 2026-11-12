import Link from 'next/link'
import { CMSTextServer } from '@krantho/ui-react/server'

interface ServiceCardProps {
  slug: string
  href: string
  headingLevel?: 'h2' | 'h3'
}

export default function MuiServiceCard({ slug, href, headingLevel = 'h2' }: ServiceCardProps): React.ReactElement {
  return (
    <Link href={href} className="service-card">
      <CMSTextServer collection="services" slug={slug} field="title" variant={headingLevel} component={headingLevel} />
      <CMSTextServer collection="services" slug={slug} field="ingress" variant="body1" component="p" className="text-muted-fg" />
    </Link>
  )
}
