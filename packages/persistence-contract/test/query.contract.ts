import { describe } from 'vitest'
import { useSeed } from './contract/fixture.js'
import { historyCases } from './contract/history.js'
import { matchCases } from './contract/match.js'
import { orderCases } from './contract/order.js'
import { projectionCases } from './contract/projections.js'
import { scopeCases } from './contract/scope.js'
import type { ContractFactory, ContractTraits } from './contract/seed.js'
import { CONTRACT_SEED } from './contract/seed.js'
import { snippetCases } from './contract/snippet.js'

export type {
  ContractDocument,
  ContractFactory,
  ContractFixture,
  ContractSeed,
  ContractTraits,
} from './contract/seed.js'
export { CONTRACT_SEED, seedAdapter } from './contract/seed.js'

/**
 * The query contract every persistence adapter meets, run against one adapter by its own
 * test file. The cases live in `contract/`, one file per concern; `traits` names what the
 * adapter can hold, so the cases it cannot meet by nature are not asked of it.
 */
export function queryContract(
  name: string,
  factory: ContractFactory,
  traits: ContractTraits,
): void {
  describe(`${name} query contract`, () => {
    const main = useSeed(factory, CONTRACT_SEED)
    projectionCases(main)
    scopeCases(main)
    orderCases(main, factory)
    matchCases(main, factory)
    snippetCases(main, factory)
    if (traits.history) historyCases(factory)
  })
}
