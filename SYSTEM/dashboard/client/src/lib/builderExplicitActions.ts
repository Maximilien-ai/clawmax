// Browser-facing re-export of the pure shared contract. Keeping the detection
// implementation in one module prevents server recommendations and client
// fallback recommendations from disagreeing about explicit creation intent.
export {
  hasExplicitBuilderEntityAction,
  requiredBuilderCreateTargets,
  selectBuilderSecondaryActions,
  type BuilderCreateTarget,
} from '../../../server/lib/builder-explicit-actions'
