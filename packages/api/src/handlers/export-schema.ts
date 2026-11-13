import { exportContractAsZod } from '@krantho/schema'
import { getActiveContract } from '../merged-schema.js'
import type { ApiHandler } from '../types.js'
import { validateCollectionParam } from '../validators.js'

/** Export the complete code and runtime contract for reviewed code adoption. */
export const exportSchema: ApiHandler = async (req, ctx) => {
  const checked = validateCollectionParam(req.params.collection, ctx)
  if (!checked.isValid) return checked.response
  const contract = await getActiveContract(checked.collectionDef, ctx.adapter)
  const code = exportContractAsZod(checked.collectionDef, contract)
  return { status: 200, body: { collection: checked.collection, contract, code } }
}
