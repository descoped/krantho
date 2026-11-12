import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import '@/lib/krantho'
import Box from '@mui/material/Box'
import { getCMSContent, CMSTextServer, CMSMarkdownServer, SeoJsonLd } from '@krantho/ui-react/server'

async function loadService(slug: string): Promise<Record<string, string> | null> {
  try {
    const svc = (await getCMSContent('services', slug)) as { fields: Record<string, string> }
    return svc.fields?.['title'] ? svc.fields : null
  } catch {
    return null
  }
}

export async function serviceMetadata(slug: string): Promise<Metadata> {
  const fields = await loadService(slug)
  if (!fields) return { title: 'Not Found' }
  return { title: fields['title'], description: fields['meta-description'] }
}

export async function ServiceDetail({ slug }: { slug: string }): Promise<React.ReactElement> {
  const fields = await loadService(slug)
  if (!fields) notFound()

  return (
    <Box>
      <SeoJsonLd collection="services" slug={slug} />

      <Box component="section" className="section-white">
        <Box className="section-container">
          <Link href="/services" className="back-link">
            &larr; All Services
          </Link>
          <CMSTextServer collection="services" slug={slug} field="title" variant="h1" component="h1" className="page-title" />
          <CMSTextServer collection="services" slug={slug} field="ingress" variant="body1" component="p" className="page-subtitle" />
        </Box>
      </Box>

      <Box component="section" className="section-muted">
        <Box className="section-container">
          <CMSMarkdownServer collection="services" slug={slug} className="prose prose-lg max-w-none" />
        </Box>
      </Box>
    </Box>
  )
}
