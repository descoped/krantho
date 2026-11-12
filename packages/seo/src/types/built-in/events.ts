import type { SchemaEntity } from '../../graph/types.js'
import { ORGANIZATION_RULE, propertyValue, siteOrganization, textOf } from '../context.js'
import type { BuildContext, TypeDefinition } from '../definition.js'
import { asSubEntity, compact } from '../values.js'

/**
 * An event, organized by the site's organization. A location or offer given
 * as text becomes a Place or Offer.
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/event
 */
export const eventType: TypeDefinition = {
  type: 'Event',
  scope: 'document',
  idFragment: 'event',
  fields: {
    name: [],
    description: [],
    image: [],
    startDate: ['start-date', 'date'],
    endDate: ['end-date'],
    eventStatus: [],
    eventAttendanceMode: [],
    location: [],
    offers: [],
  },
  references: { organizer: ORGANIZATION_RULE },
  build: (context) =>
    compact({
      '@type': context.type,
      '@id': context.id,
      location: asSubEntity(propertyValue(context, 'location'), 'Place', 'name'),
      offers: asSubEntity(propertyValue(context, 'offers'), 'Offer', 'price'),
      organizer: siteOrganization(context),
    }),
}

function courseInstance(context: BuildContext): SchemaEntity {
  const configured = propertyValue(context, 'hasCourseInstance')
  if (configured && typeof configured === 'object') return configured as SchemaEntity
  return { '@type': 'CourseInstance', courseMode: textOf(context, 'courseMode') || 'Online' }
}

/**
 * A course the site's organization provides. Without a configured course
 * instance it gets an online one, which the Course list rich result needs.
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/course
 */
export const courseType: TypeDefinition = {
  type: 'Course',
  scope: 'document',
  idFragment: 'course',
  fields: {
    name: [],
    description: [],
    image: [],
    courseCode: ['course-code'],
    courseMode: ['course-mode'],
    hasCourseInstance: [],
  },
  references: { provider: ORGANIZATION_RULE },
  build: (context) => ({
    '@type': context.type,
    '@id': context.id,
    provider: siteOrganization(context),
    hasCourseInstance: courseInstance(context),
  }),
}

/**
 * A job posting by the site's organization. A salary or location given as
 * text becomes a MonetaryAmount or Place.
 *
 * @see https://developers.google.com/search/docs/appearance/structured-data/job-posting
 */
export const jobPostingType: TypeDefinition = {
  type: 'JobPosting',
  scope: 'document',
  idFragment: 'jobposting',
  fields: {
    title: [],
    description: [],
    datePosted: ['date-posted', 'date'],
    validThrough: ['valid-through'],
    employmentType: ['employment-type'],
    baseSalary: ['base-salary', 'salary'],
    jobLocation: ['job-location'],
  },
  references: { hiringOrganization: ORGANIZATION_RULE },
  build: (context) =>
    compact({
      '@type': context.type,
      '@id': context.id,
      baseSalary: asSubEntity(propertyValue(context, 'baseSalary'), 'MonetaryAmount', 'value'),
      jobLocation: asSubEntity(propertyValue(context, 'jobLocation'), 'Place', 'name'),
      hiringOrganization: siteOrganization(context),
    }),
}
