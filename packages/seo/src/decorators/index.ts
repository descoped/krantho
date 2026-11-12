import { breadcrumbDecorator } from './breadcrumb.js'
import { pageDecorator } from './page.js'
import { registerDecorator } from './registry.js'
import { sequenceDecorator } from './sequence.js'

export { breadcrumbDecorator, breadcrumbItems } from './breadcrumb.js'
export { pageDecorator, pageTypeFor } from './page.js'
export { registerDecorator, registeredDecorators } from './registry.js'
export { sequenceDecorator } from './sequence.js'
export type { Decorator, PageContext, ResolvedStructure } from './types.js'

/** krantho's decorators, in the order they run: the page node, then its trail, then its sequence */
export const BUILT_IN_DECORATORS = [pageDecorator, breadcrumbDecorator, sequenceDecorator] as const

for (const decorator of BUILT_IN_DECORATORS) registerDecorator(decorator)
