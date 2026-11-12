---
title: Render a page (Next.js)
sample: render-page
stack: next
filename: app/(site)/features/[[...slug]]/page.tsx
language: tsx
order: 1
status: published
---

```tsx
import { notFound } from 'next/navigation'
import { SeoJsonLd } from '@krantho/ui-react/server'
import { requirePublished } from '../../../../lib/krantho'
import { FeatureList } from './list'

// /features and /features/<slug>. Rendered on its first request, then cached
// until a change in /studio invalidates it (cache.pages: 'next-isr').
// The build reads no content.
export const revalidate = false

export function generateStaticParams(): { slug?: string[] }[] {
  return []
}

interface Props {
  params: Promise<{ slug?: string[] }>
}

export default async function FeaturesPage({ params }: Props) {
  const { slug } = await params
  if (!slug) return <FeatureList />
  const [name] = slug
  if (slug.length !== 1 || !name) notFound()
  const feature = await requirePublished('features', name)
  return (
    <article>
      <SeoJsonLd collection="features" slug={name} />
      <h1>{String(feature.fields['title'] ?? '')}</h1>
      <p>{String(feature.fields['benefit'] ?? '')}</p>
      <div dangerouslySetInnerHTML={{ __html: feature.html }} />
    </article>
  )
}
```
