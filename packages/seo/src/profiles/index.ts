import { bingProfile } from './bing.js'
import { googleProfile } from './google.js'
import { registerProfile } from './registry.js'

export { bingProfile } from './bing.js'
export { profileFindings } from './check.js'
export type { FeatureEligibility } from './eligibility.js'
export { featureEligibility } from './eligibility.js'
export { googleProfile } from './google.js'
export { getProfile, registeredProfiles, registerProfile, ruleFor } from './registry.js'
export type { FeatureStatus, ProfileRule, ReaderProfile } from './types.js'

/** The reader profiles krantho ships */
export const BUILT_IN_PROFILES = [googleProfile, bingProfile] as const

for (const profile of BUILT_IN_PROFILES) registerProfile(profile)
