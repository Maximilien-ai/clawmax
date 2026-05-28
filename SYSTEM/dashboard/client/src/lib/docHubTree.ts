export interface FileTree {
  [dir: string]: string[]
}

export function buildDocHubTree(paths: string[]): FileTree {
  const tree: FileTree = { '': [] }
  for (const filePath of paths) {
    const parts = filePath.split('/')
    if (parts.length === 1) {
      tree[''].push(filePath)
      continue
    }

    for (let depth = 1; depth < parts.length; depth += 1) {
      const dir = parts.slice(0, depth).join('/')
      if (!tree[dir]) tree[dir] = []
    }

    const dir = parts.slice(0, -1).join('/')
    tree[dir].push(filePath)
  }
  return tree
}

export function getDocHubChildDirectories(tree: FileTree, parentDir: string): string[] {
  return Object.keys(tree)
    .filter((dir) => {
      if (!dir || dir === parentDir) return false
      if (!parentDir) return !dir.includes('/')
      if (!dir.startsWith(`${parentDir}/`)) return false
      return !dir.slice(parentDir.length + 1).includes('/')
    })
    .sort((a, b) => a.localeCompare(b))
}
