import prompts from 'prompts'

export type Framework = 'nextjs' | 'sveltekit'
export type UI = 'tailwind' | 'mui' | 'plain'
export type PackageManager = 'pnpm' | 'npm' | 'yarn'

export interface ProjectOptions {
  name: string
  framework: Framework
  ui: UI
  auth: boolean
  seo: boolean
  sampleContent: boolean
  packageManager: PackageManager
  port: number
}

function detectPackageManager(): PackageManager {
  const agent = process.env.npm_config_user_agent ?? ''
  if (agent.startsWith('pnpm')) return 'pnpm'
  if (agent.startsWith('yarn')) return 'yarn'
  return 'npm'
}

export async function runPrompts(targetArg?: string): Promise<ProjectOptions> {
  const response = await prompts(
    [
      {
        type: targetArg ? null : 'text',
        name: 'name',
        message: 'Project name:',
        initial: 'my-krantho-site',
        validate: (val: string) =>
          /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/.test(val) || 'Invalid project name',
      },
      {
        type: 'select',
        name: 'framework',
        message: 'Framework:',
        choices: [
          { title: 'Next.js', description: 'App Router, React Server Components', value: 'nextjs' },
          {
            title: 'SvelteKit',
            description: 'Svelte 5, server-side rendering',
            value: 'sveltekit',
          },
        ],
      },
      {
        type: (_, values) => (values.framework === 'nextjs' ? 'select' : null),
        name: 'ui',
        message: 'UI library:',
        choices: [
          { title: 'Tailwind CSS', description: 'Utility-first CSS framework', value: 'tailwind' },
          { title: 'MUI', description: 'Material UI components', value: 'mui' },
          { title: 'Plain CSS', description: 'Semantic CSS, no framework', value: 'plain' },
        ],
      },
      {
        type: (_, values) => (values.framework === 'sveltekit' ? 'select' : null),
        name: 'ui',
        message: 'UI library:',
        choices: [
          { title: 'Tailwind CSS', description: 'Utility-first CSS framework', value: 'tailwind' },
          { title: 'Plain CSS', description: 'Semantic CSS, no framework', value: 'plain' },
        ],
      },
      {
        type: 'toggle',
        name: 'auth',
        message: 'Enable authentication (token mode)?',
        initial: false,
        active: 'yes',
        inactive: 'no',
      },
      {
        type: 'toggle',
        name: 'seo',
        message: 'Include SEO components?',
        initial: true,
        active: 'yes',
        inactive: 'no',
      },
      {
        type: 'toggle',
        name: 'sampleContent',
        message: 'Include sample content?',
        initial: true,
        active: 'yes',
        inactive: 'no',
      },
    ],
    {
      onCancel: () => {
        console.log('\nCancelled.')
        process.exit(0)
      },
    },
  )

  return {
    name: targetArg ?? response.name,
    framework: response.framework,
    ui: response.ui ?? 'tailwind',
    auth: response.auth ?? false,
    seo: response.seo ?? true,
    sampleContent: response.sampleContent ?? true,
    packageManager: detectPackageManager(),
    port: 3000,
  }
}
