/** Legacy generated identities use N/A to mean no tags, not a literal tag. */
export function parseIdentityTags(value: string): string[] {
  return value.split(',').map(tag => tag.trim()).filter(tag => tag.length > 0 && !/^n\/a$/i.test(tag))
}
