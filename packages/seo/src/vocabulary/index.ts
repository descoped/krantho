export { matchesDatatype } from './datatypes.js'
export { SCHEMAORG_RELEASE } from './schemaorg.generated.js'
export type {
  Lifecycle,
  VocabularyData,
  VocabularyMember,
  VocabularyProperty,
  VocabularyType,
} from './types.js'
export {
  ancestorsOf,
  enumerationsOf,
  getVocabularyProperty,
  getVocabularyType,
  isDatatype,
  isEnumeration,
  isPropertyOfType,
  isSubtypeOf,
  isVocabularyTerm,
  lifecycleOf,
  propertiesOf,
  rangeAcceptsType,
  termName,
} from './vocabulary.js'
