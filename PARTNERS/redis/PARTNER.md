# Redis

Redis provides a fast state and memory layer for agents. In ClawMax it can be used to improve short-term and long-term memory flows beyond filesystem-backed coordination.

## Validation

Redis declares a partner-level `Check keys` action. Today ClawMax checks that the Redis URL and token are present and well-formed; live Redis auth validation is not yet implemented from the integrations wizard.
