export const LOCAL_SKILL_IMPORT_PATH_PLACEHOLDER =
  '/path/inside/the/dashboard/runtime/custom-skill'

export const LOCAL_SKILL_IMPORT_GUIDANCE = [
  '`Upload ZIP...` opens a file picker on your local machine, uploads the archive, expands it in a temporary workspace staging area, imports the skill, and then cleans up the staging files automatically.',
  'Recommended for cloud, container, and on-prem dashboard runtimes: use `Upload ZIP...` to send a skill bundle from your laptop into this workspace.',
  'The path field below is only for advanced/manual imports when the skill directory already exists inside the dashboard runtime or container.',
  'Manual paths must point to a directory that already exists inside the dashboard runtime. Managed custom skills normally live under `WORKSPACES/&lt;workspace&gt;/SKILLS/custom`.',
  'Example when the dashboard runs on your Mac: /Users/you/projects/mechdog-skill',
] as const

export function shouldShowLocalSkillRuntimeBrowseButton() {
  return false
}
