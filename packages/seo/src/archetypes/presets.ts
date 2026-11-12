import { defineArchetype } from './define-archetype.js'

/** Home page: business identity + website + person */
export const homePageArchetype = defineArchetype({
  schemas: ['LocalBusiness', 'Person', 'WebSite'],
})

/** About page: organization + person + breadcrumbs */
export const aboutPageArchetype = defineArchetype({
  schemas: ['Organization', 'Person', 'BreadcrumbList'],
})

/** Service page: business + breadcrumbs + FAQ + service */
export const servicePageArchetype = defineArchetype({
  schemas: ['LocalBusiness', 'BreadcrumbList', 'FAQPage', 'Service'],
})

/** Blog post: article + breadcrumbs + person (author) */
export const blogPostArchetype = defineArchetype({
  schemas: ['Article', 'BreadcrumbList', 'Person'],
})

/** Event page: event + breadcrumbs + organization (organizer) */
export const eventPageArchetype = defineArchetype({
  schemas: ['Event', 'BreadcrumbList', 'Organization'],
})

/** Recipe page: recipe + breadcrumbs + person (author) */
export const recipePageArchetype = defineArchetype({
  schemas: ['Recipe', 'BreadcrumbList', 'Person'],
})

/** Course page: course + breadcrumbs + organization (provider) */
export const coursePageArchetype = defineArchetype({
  schemas: ['Course', 'BreadcrumbList', 'Organization'],
})

/** Job posting page: job posting + breadcrumbs + organization (hiring company) */
export const jobPostingPageArchetype = defineArchetype({
  schemas: ['JobPosting', 'BreadcrumbList', 'Organization'],
})

/** How-to guide: how-to + breadcrumbs + person (author) */
export const howToPageArchetype = defineArchetype({
  schemas: ['HowTo', 'BreadcrumbList', 'Person'],
})

/** Video page: video object + breadcrumbs + organization (publisher) */
export const videoPageArchetype = defineArchetype({
  schemas: ['VideoObject', 'BreadcrumbList', 'Organization'],
})
