import { z } from 'zod'

/** Common fields for any publishable page (status is a system field — not included here) */
export const pageFields = {
  title: z.string(),
  description: z.string().optional(),
}

/** Fields for articles and blog posts */
export const articleFields = {
  ...pageFields,
  author: z.string().optional(),
  'published-date': z.string().date().optional(),
  tags: z.array(z.string()).default([]),
  category: z.string().optional(),
}

/** SEO metadata fields */
export const seoFields = {
  'og-title': z.string().optional(),
  'og-description': z.string().optional(),
  'og-image': z.string().optional(),
  'og-type': z.string().optional(),
  'canonical-url': z.string().url().optional(),
}
