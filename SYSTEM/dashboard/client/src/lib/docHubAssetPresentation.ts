export interface DocHubAssetPresentationEntry {
  path: string
  assetSource?: 'uploaded' | 'generated'
}

export function getDocHubAssetLabel(entry?: DocHubAssetPresentationEntry | null): 'asset' | 'memory' {
  return entry?.assetSource === 'generated' && entry.path.toLowerCase().endsWith('.md') ? 'memory' : 'asset'
}
