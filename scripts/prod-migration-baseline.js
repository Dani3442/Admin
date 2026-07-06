const { spawnSync } = require('child_process')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const MIGRATIONS = [
  {
    name: '20260629120000_telegram_substages_notifications',
    checks: [
      ['column', 'users', 'telegram_id'],
      ['column', 'users', 'telegram_chat_id'],
      ['column', 'product_stages', 'description'],
      ['table', 'product_substages'],
      ['table', 'telegram_recipients'],
      ['table', 'telegram_notification_settings'],
    ],
  },
  {
    name: '20260702120000_template_telegram_notifications',
    checks: [
      ['table', 'telegram_template_notification_settings'],
      ['column', 'telegram_notification_settings', 'templateSettingId'],
      ['column', 'telegram_notification_settings', 'isOverride'],
    ],
  },
  {
    name: '20260703130000_stage_workflow_start_rules',
    checks: [
      ['column', 'product_template_stages', 'startTrigger'],
      ['column', 'product_template_stages', 'startDelayDays'],
      ['column', 'product_stages', 'autoStartAt'],
      ['column', 'product_stages', 'startTrigger'],
    ],
  },
  {
    name: '20260703133000_template_substages',
    checks: [
      ['table', 'product_template_substages'],
      ['column', 'product_substages', 'responsibleId'],
      ['column', 'product_template_substages', 'productTemplateStageId'],
      ['column', 'product_template_substages', 'notifyOnComplete'],
    ],
  },
  {
    name: '20260704120000_template_substage_telegram_settings',
    checks: [
      ['column', 'product_template_substages', 'telegramRecipientType'],
      ['column', 'product_template_substages', 'telegramRecipientId'],
      ['column', 'product_template_substages', 'telegramMessageTemplate'],
      ['column', 'product_template_substages', 'telegramCustomMessage'],
    ],
  },
  {
    name: '20260706120000_prod_safe_schema_alignment',
    checks: [
      ['column', 'product_template_substages', 'productTemplateId'],
    ],
  },
]

function runPrismaResolve(migrationName) {
  const result = spawnSync(
    'npx',
    ['prisma', 'migrate', 'resolve', '--applied', migrationName],
    {
      stdio: 'inherit',
      env: process.env,
      shell: false,
    }
  )

  if (result.status !== 0) {
    throw new Error(`Failed to baseline migration ${migrationName}`)
  }
}

async function tableExists(tableName) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
    ) AS "exists"
  `
  return Boolean(rows[0]?.exists)
}

async function columnExists(tableName, columnName) {
  const rows = await prisma.$queryRaw`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS "exists"
  `
  return Boolean(rows[0]?.exists)
}

async function getAppliedMigrations() {
  const hasMigrationTable = await tableExists('_prisma_migrations')
  if (!hasMigrationTable) return new Set()

  const rows = await prisma.$queryRaw`
    SELECT migration_name
    FROM "_prisma_migrations"
    WHERE finished_at IS NOT NULL
  `

  return new Set(rows.map((row) => row.migration_name))
}

async function evaluateMigration(migration) {
  const results = []

  for (const check of migration.checks) {
    const [kind, tableName, columnName] = check
    const exists = kind === 'table'
      ? await tableExists(tableName)
      : await columnExists(tableName, columnName)
    results.push({ check, exists })
  }

  return results
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required for migration baseline check')
    process.exit(1)
  }

  const applied = await getAppliedMigrations()

  for (const migration of MIGRATIONS) {
    if (applied.has(migration.name)) {
      console.log(`Migration already applied: ${migration.name}`)
      continue
    }

    const results = await evaluateMigration(migration)
    const presentCount = results.filter((result) => result.exists).length

    if (presentCount === 0) {
      console.log(`Migration will be applied by migrate deploy: ${migration.name}`)
      continue
    }

    if (presentCount === results.length) {
      console.log(`Baselining already-present migration: ${migration.name}`)
      runPrismaResolve(migration.name)
      continue
    }

    const missing = results
      .filter((result) => !result.exists)
      .map((result) => result.check.join(':'))
      .join(', ')
    throw new Error(
      `Schema partially matches migration ${migration.name}. Missing checks: ${missing}. Stop and inspect before deploy.`
    )
  }
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
