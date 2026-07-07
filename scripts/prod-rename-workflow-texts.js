const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

const REPLACEMENTS = [
  ['Сделать руками макет', 'Сделать макет рушки'],
  ['Отдать в печать', 'Отдать рушки в печать'],
  ['Подключить ДС в карточку 43', 'Подкрепить ДС в карточку ЧЗ'],
  ['Докад партии - Н/О', 'Заказ партии - П/О'],
  ['Докад партии - н/о', 'Заказ партии - П/О'],
  ['Инвойс в общий чат', 'Анонс в общий чат'],
  ['Дедлайн сделать', 'Дизайн сделать'],
  ['Докад реф', 'Заказ реф'],
  ['Докад рев', 'Заказ реф'],
  ['Докад', 'Заказ'],
  ['докад', 'заказ'],
  ['Ручки', 'Рушки'],
  ['ручки', 'рушки'],
]

const TARGETS = [
  {
    modelName: 'stageTemplate',
    label: 'stage_templates',
    fields: ['name', 'durationText'],
  },
  {
    modelName: 'productTemplateStage',
    label: 'product_template_stages',
    fields: ['stageName'],
  },
  {
    modelName: 'productTemplateSubStage',
    label: 'product_template_substages',
    fields: ['name', 'description', 'telegramCustomMessage'],
  },
  {
    modelName: 'productStage',
    label: 'product_stages',
    fields: ['stageName', 'description', 'comment', 'dateRaw'],
  },
  {
    modelName: 'productSubStage',
    label: 'product_substages',
    fields: ['name', 'description'],
  },
  {
    modelName: 'telegramTemplateNotificationSetting',
    label: 'telegram_template_notification_settings',
    fields: ['messageTemplate', 'customMessage'],
  },
  {
    modelName: 'telegramNotificationSetting',
    label: 'telegram_notification_settings',
    fields: ['messageTemplate', 'customMessage', 'lastError'],
  },
]

function replaceAllLiteral(value, search, replacement) {
  return value.split(search).join(replacement)
}

function normalizeWorkflowText(value) {
  if (typeof value !== 'string') return value

  return REPLACEMENTS.reduce(
    (current, [search, replacement]) => replaceAllLiteral(current, search, replacement),
    value
  )
}

function compactValue(value) {
  if (typeof value !== 'string') return value
  return value.length > 110 ? `${value.slice(0, 107)}...` : value
}

async function collectChanges(target) {
  const rows = await prisma[target.modelName].findMany({
    select: {
      id: true,
      ...Object.fromEntries(target.fields.map((field) => [field, true])),
    },
    orderBy: { id: 'asc' },
  })

  const changes = []

  for (const row of rows) {
    const data = {}
    const fieldChanges = []

    for (const field of target.fields) {
      const before = row[field]
      const after = normalizeWorkflowText(before)

      if (before !== after) {
        data[field] = after
        fieldChanges.push({
          field,
          before: compactValue(before),
          after: compactValue(after),
        })
      }
    }

    if (fieldChanges.length > 0) {
      changes.push({
        id: row.id,
        data,
        fieldChanges,
      })
    }
  }

  return changes
}

async function main() {
  const summary = []
  let totalRows = 0
  let totalFields = 0

  for (const target of TARGETS) {
    const changes = await collectChanges(target)
    const fieldCount = changes.reduce((sum, change) => sum + change.fieldChanges.length, 0)
    summary.push({ target, changes, fieldCount })
    totalRows += changes.length
    totalFields += fieldCount
  }

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)
  console.log(`Rows to update: ${totalRows}`)
  console.log(`Fields to update: ${totalFields}`)

  for (const item of summary) {
    console.log(`\n${item.target.label}: ${item.changes.length} rows, ${item.fieldCount} fields`)
    for (const change of item.changes.slice(0, 20)) {
      console.log(`- ${change.id}`)
      for (const fieldChange of change.fieldChanges) {
        console.log(`  ${fieldChange.field}: "${fieldChange.before}" -> "${fieldChange.after}"`)
      }
    }
    if (item.changes.length > 20) {
      console.log(`  ...and ${item.changes.length - 20} more rows`)
    }
  }

  if (!apply) {
    console.log('\nDry run only. Run with --apply to update workflow text in templates and products.')
    return
  }

  for (const item of summary) {
    for (const change of item.changes) {
      await prisma[item.target.modelName].update({
        where: { id: change.id },
        data: change.data,
        select: { id: true },
      })
    }
  }

  console.log(`\nUpdated rows: ${totalRows}`)
  console.log(`Updated fields: ${totalFields}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
