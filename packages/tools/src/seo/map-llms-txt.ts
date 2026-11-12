import { writeFileSync } from 'fs'
import { join } from 'path'
import type { Frontmatter } from '../shared/cms-reader'
import { readCMSContent, readYAML } from '../shared/cms-reader'
import { toolPaths } from '../shared/tool-paths'
import type { BusinessMetadata, LlmsSection } from './types'

function renderSection(section: LlmsSection, baseUrl: string): string {
  const lines: string[] = [`## ${section.heading}`, '']
  for (const link of section.links) {
    const url = link.path.startsWith('http') ? link.path : `${baseUrl}${link.path}`
    lines.push(`- [${link.title}](${url}): ${link.description}`)
  }
  return lines.join('\n')
}

function getFrontmatterString(fm: Frontmatter, key: string): string {
  return String(fm[key] ?? '')
}

function renderContactBlock(contactFM: Frontmatter): string {
  const lines: string[] = ['## Contact Details', '']
  lines.push(`- Phone: ${getFrontmatterString(contactFM, 'phone-number')}`)
  lines.push(`- Email: ${getFrontmatterString(contactFM, 'email-address')}`)
  lines.push(
    `- Address: ${getFrontmatterString(contactFM, 'location-title')}, ${getFrontmatterString(contactFM, 'location-address')}`,
  )
  lines.push(
    `- Hours: ${getFrontmatterString(contactFM, 'hours-line1')} / ${getFrontmatterString(contactFM, 'hours-line2')}`,
  )
  return lines.join('\n')
}

function renderPricingBlock(feesFM: Frontmatter): string {
  const lines: string[] = ['## Pricing', '']

  const introText = getFrontmatterString(feesFM, 'description')
  if (introText) lines.push(introText, '')

  // Extract all services from the matrix fields
  for (let n = 1; n <= 20; n++) {
    const nameKey = `service-${String(n)}-name`
    if (!(nameKey in feesFM)) break

    const name = getFrontmatterString(feesFM, nameKey)
    const prices: string[] = []

    for (let j = 1; j <= 10; j++) {
      const durationKey = `service-${String(n)}-duration-${String(j)}`
      if (!(durationKey in feesFM)) break
      const duration = getFrontmatterString(feesFM, durationKey)
      const price = getFrontmatterString(feesFM, `service-${String(n)}-price-${String(j)}`)
      prices.push(`${duration}: ${price}`)
    }

    lines.push(`- ${name}: ${prices.join(', ')}`)
  }

  // Practical info
  const payment = getFrontmatterString(feesFM, 'payment-text')
  const insurance = getFrontmatterString(feesFM, 'insurance-text')
  const cancellation = getFrontmatterString(feesFM, 'cancellation-text')

  if (payment || insurance || cancellation) {
    lines.push('')
    if (payment) lines.push(`Payment: ${payment}`)
    if (insurance) lines.push(`Insurance: ${insurance}`)
    if (cancellation) lines.push(`Cancellation: ${cancellation}`)
  }

  return lines.join('\n')
}

function renderExpertiseBlock(knowsAbout: string[]): string {
  const lines: string[] = ['## Expertise and Methods', '']
  for (const item of knowsAbout) {
    lines.push(`- ${item}`)
  }
  return lines.join('\n')
}

function renderCredentialsBlock(business: BusinessMetadata, contactFM: Frontmatter): string {
  const lines: string[] = ['## Credentials', '']
  lines.push(`- Title: ${business['job-title']}`)
  lines.push(`- Education: ${business['alumni-of']}`)

  const license = getFrontmatterString(contactFM, 'footer-license')
  if (license) lines.push(`- ${license}`)

  // Credentials are loaded from business.yaml 'credentials' array
  if (business.credentials) {
    for (const cred of business.credentials) {
      lines.push(`- ${cred}`)
    }
  }

  return lines.join('\n')
}

export function mapLlmsTxt(): string {
  const business = readYAML<BusinessMetadata>('business.yaml')
  const baseUrl = business.url

  // Read CMS source files for structured data
  const { frontmatter: contactFM } = readCMSContent('contact')
  const { frontmatter: feesFM } = readCMSContent('fees')

  const lines: string[] = [
    `# ${business['legal-name']}`,
    '',
    `> ${business.prose.summary.trim()}`,
    '',
    business.prose.description.trim(),
  ]

  // Link sections from business.yaml
  for (const section of business['llms-sections'] ?? []) {
    lines.push('')
    lines.push(renderSection(section, baseUrl))
  }

  for (const section of business['llms-optional'] ?? []) {
    lines.push('')
    lines.push(renderSection(section, baseUrl))
  }

  // Structured blocks from CMS content + business.yaml
  lines.push('')
  lines.push(renderContactBlock(contactFM))

  lines.push('')
  lines.push(renderPricingBlock(feesFM))

  lines.push('')
  lines.push(renderExpertiseBlock(business['knows-about']))

  lines.push('')
  lines.push(renderCredentialsBlock(business, contactFM))

  return lines.join('\n') + '\n'
}

export function generateLlmsTxt(dryRun: boolean = false): void {
  const text = mapLlmsTxt()

  if (dryRun) {
    console.log('[dry-run] llms.txt:')
    console.log(text)
    return
  }

  const outputPath = join(toolPaths().generatedDir, 'llms.txt')
  writeFileSync(outputPath, text, 'utf-8')
  console.log(`wrote ${outputPath}`)
}
