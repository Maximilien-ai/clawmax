const fs = require('node:fs')
const dotenv = require('./dashboard/node_modules/dotenv')

function providerKeys(contents, env = {}) {
  const parsed = dotenv.parse(contents)
  const keys = {}
  for (const provider of ['openai', 'anthropic', 'gemini']) {
    const name = `SYSTEM_${provider.toUpperCase()}_API_KEY`
    const value = env[name] ?? parsed[name]
    if (value) keys[provider] = value
  }
  return keys
}

module.exports = { providerKeys }
if (require.main === module) {
  try {
    const file = process.argv[2]
    const contents = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : ''
    process.stdout.write(JSON.stringify(providerKeys(contents, process.env)))
  } catch {
    console.error('Could not load integration provider credentials')
    process.exitCode = 1
  }
}
