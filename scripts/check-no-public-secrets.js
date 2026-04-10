#!/usr/bin/env node

const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const SEARCH_DIRECTORIES = ['src', '.env.example']
const SECRET_PATTERN = /\bNEXT_PUBLIC_[A-Z0-9_]*(KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*\b/g
const ALLOWED_PUBLIC_ENV_NAMES = new Set([
  'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'NEXT_PUBLIC_SUPABASE_URL',
])

function walk(targetPath, results = []) {
  if (!fs.existsSync(targetPath)) return results

  const stats = fs.statSync(targetPath)
  if (stats.isFile()) {
    results.push(targetPath)
    return results
  }

  for (const entry of fs.readdirSync(targetPath)) {
    if (entry === 'node_modules' || entry === '.next' || entry === '.git') continue
    walk(path.join(targetPath, entry), results)
  }

  return results
}

const files = SEARCH_DIRECTORIES.flatMap((relativePath) => walk(path.join(ROOT, relativePath)))
const violations = []

for (const filePath of files) {
  const content = fs.readFileSync(filePath, 'utf8')
  const matches = content.match(SECRET_PATTERN)
  if (matches?.length) {
    const forbiddenMatches = [...new Set(matches)].filter((match) => !ALLOWED_PUBLIC_ENV_NAMES.has(match))
    if (forbiddenMatches.length === 0) {
      continue
    }

    violations.push({
      filePath,
      matches: forbiddenMatches,
    })
  }
}

if (violations.length > 0) {
  console.error('Found forbidden public secret-like environment variables:')
  for (const violation of violations) {
    console.error(`- ${path.relative(ROOT, violation.filePath)}: ${violation.matches.join(', ')}`)
  }
  process.exit(1)
}

console.log('No public secret-like environment variables found.')
