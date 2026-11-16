import matter from 'gray-matter'

// gray-matter evaluates `---js` / `---javascript` front matter with eval. Workflow, skill and template files
// arrive through imports, registries and other people's repositories, so only YAML and JSON front matter is
// parsed; JavaScript front matter is refused like malformed YAML.
function refuseJavaScriptFrontMatter(): never {
  throw new Error('JavaScript front matter is not supported')
}

const SAFE_ENGINES = { js: refuseJavaScriptFrontMatter, javascript: refuseJavaScriptFrontMatter }

export function parseFrontMatter(input: string): matter.GrayMatterFile<string> {
  return matter(input, { engines: SAFE_ENGINES })
}
