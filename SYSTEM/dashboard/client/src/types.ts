// Skill Types from OpenClaw

export interface SkillInstallOption {
  id: string
  kind: 'brew' | 'apt' | 'npm' | 'go' | 'manual'
  formula?: string      // For brew
  package?: string      // For apt/npm
  module?: string       // For go
  bins?: string[]       // Binaries installed
  label: string         // Display label
}

export interface SkillRequirements {
  bins?: string[]       // Required binaries (e.g., ["gh", "jq"])
  env?: string[]        // Required env vars
}

export interface OpenClawSkill {
  name: string          // Unique ID (e.g., "github")
  description: string   // Short description
  emoji?: string        // Display emoji (e.g., "🐙")
  filePath: string      // Path to SKILL.md
  bundled: boolean      // Is this a bundled skill?
  source: 'bundled' | 'managed' | 'workspace'
  dirty?: boolean       // Edited locally from original/default behavior
  requires?: SkillRequirements
  install?: SkillInstallOption[]
  homepage?: string     // Optional homepage URL
  tags?: string[]       // Searchable tags
}

// API Response Types

export interface SkillsResponse {
  skills: OpenClawSkill[]
}

export interface AgentSkillsResponse {
  skills: OpenClawSkill[]  // Full skill objects
  skillIds: string[]       // Just the IDs
}

export interface SkillValidationResponse {
  valid: boolean
  missing: string[]
}
