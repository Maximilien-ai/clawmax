# Redis

Redis provides a fast state and memory layer for agents. In ClawMax it can be used to improve short-term and long-term memory flows beyond filesystem-backed coordination.

## Validation

Redis declares a partner-level `Check keys` action. Today ClawMax checks that the Redis URL and token are present and well-formed; live Redis auth validation is not yet implemented from the integrations wizard.

## Skills

Redis now exposes an installable partner skill path in ClawMax.

- Source: `redis/agent-skills`
- Surface: `Skills` → `Install from Partner`
- Install mode: curated installer

This keeps Redis visible in the normal skills workflow without pretending the skills are already installed locally.
