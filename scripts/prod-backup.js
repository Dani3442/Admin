const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

function ensureDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required for production backup')
    process.exit(1)
  }

  return process.env.DATABASE_URL
}

function run(command, args) {
  const result = spawnSync(command, args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
    encoding: 'utf8',
  })

  if (result.status !== 0) {
    const stderr = result.stderr ? `\n${result.stderr}` : ''
    throw new Error(`${command} failed with code ${result.status}${stderr}`)
  }

  return result.stdout
}

function main() {
  const databaseUrl = ensureDatabaseUrl()
  const backupDir = process.env.PROD_BACKUP_DIR || '/app/data/backups'
  fs.mkdirSync(backupDir, { recursive: true })

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = path.join(backupDir, `product-admin-${timestamp}.dump`)

  run('pg_dump', [
    '--format=custom',
    '--no-owner',
    '--no-acl',
    '--file',
    filePath,
    databaseUrl,
  ])

  const stat = fs.statSync(filePath)
  if (!stat.isFile() || stat.size <= 0) {
    throw new Error(`Backup file is empty: ${filePath}`)
  }

  run('pg_restore', ['--list', filePath])

  console.log(`Backup created: ${filePath}`)
  console.log(`Backup size: ${stat.size} bytes`)
  console.log('Backup verification: pg_restore --list OK')
}

try {
  main()
} catch (error) {
  console.error(error)
  process.exit(1)
}
