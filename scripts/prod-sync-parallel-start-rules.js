const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

const RF_TEMPLATE_NAME = 'РФ — основной шаблон запуска'
const CHINA_TEMPLATE_NAME = 'Китай — основной шаблон запуска'
const RF_COUNTRIES = ['рф', 'россия', 'russia', 'ru', 'российская федерация']

function normalizeDurationDays(value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const normalized = Math.max(1, Math.floor(value))
  return normalized > 0 ? normalized : null
}

function weekBeforeEndDelay(durationDays) {
  return Math.max((normalizeDurationDays(durationDays) ?? 30) - 7, 0)
}

function addDays(date, days) {
  if (!date) return null
  const next = new Date(date)
  next.setDate(next.getDate() + Math.max(0, Math.floor(Number(days) || 0)))
  return next
}

function sameTime(left, right) {
  if (!left && !right) return true
  if (!left || !right) return false
  return left.getTime() === right.getTime()
}

function classifyCountry(country) {
  const normalized = String(country || '').trim().toLowerCase()
  if (!normalized) return 'unknown'
  if (RF_COUNTRIES.includes(normalized) || normalized.includes('рос')) return 'rf'
  if (normalized.includes('кит') || normalized.includes('china')) return 'china'
  return 'unknown'
}

function buildRuleUpdates(stages) {
  const byName = new Map(stages.map((stage) => [stage.stageName, stage]))
  const updates = new Map()

  function set(stageName, update) {
    const stage = byName.get(stageName)
    if (!stage) return
    updates.set(stage.id, update)
  }

  const rfSample = byName.get('4.1. Образец')
  const rfPreparation = byName.get('5. Подготовка')
  const rfProduction = byName.get('6.2. Производство')

  set('4.2. Документы', {
    startTrigger: 'STAGE_STARTED',
    startReferenceStageOrder: rfSample?.stageOrder ?? null,
    startDelayDays: 0,
  })
  set('5. Подготовка', {
    startTrigger: 'STAGE_COMPLETED',
    startReferenceStageOrder: rfSample?.stageOrder ?? null,
    startDelayDays: 0,
  })
  for (const stageName of ['6.1. ДС', '6.2. Производство', '6.3. Информирование']) {
    set(stageName, {
      startTrigger: 'STAGE_COMPLETED',
      startReferenceStageOrder: rfPreparation?.stageOrder ?? null,
      startDelayDays: 0,
    })
  }
  set('6.4. Чек пр-ва', {
    startTrigger: 'STAGE_STARTED',
    startReferenceStageOrder: rfProduction?.stageOrder ?? null,
    startDelayDays: weekBeforeEndDelay(rfProduction?.durationDays),
  })

  const chinaCargoSamples = byName.get('4.1. Подготовка карго образцов')
  const chinaDocs064 = byName.get('5.1. Документация 064')

  set('5.1. Документация 064', {
    startTrigger: 'STAGE_STARTED',
    startReferenceStageOrder: chinaCargoSamples?.stageOrder ?? null,
    startDelayDays: 30,
  })
  set('7.1. Подготовка к запуску', {
    startTrigger: 'STAGE_STARTED',
    startReferenceStageOrder: chinaDocs064?.stageOrder ?? null,
    startDelayDays: 0,
  })
  set('6.1. Декларация', {
    startTrigger: 'PRODUCT_CREATED',
    startReferenceStageOrder: null,
    startDelayDays: 30,
  })

  return updates
}

function expectedAutoStartAt(product, stage, byOrder) {
  if (stage.stageOrder === 0 || stage.startTrigger === 'PRODUCT_CREATED') {
    return addDays(product.createdAt, stage.startDelayDays)
  }

  if (stage.startTrigger === 'PREVIOUS_STAGE_COMPLETED') {
    return addDays(byOrder.get(stage.stageOrder - 1)?.endDate, stage.startDelayDays)
  }

  if (stage.startTrigger === 'STAGE_STARTED') {
    return addDays(byOrder.get(stage.startReferenceStageOrder)?.startDate, stage.startDelayDays)
  }

  if (stage.startTrigger === 'STAGE_COMPLETED') {
    return addDays(byOrder.get(stage.startReferenceStageOrder)?.endDate, stage.startDelayDays)
  }

  return null
}

function needsRuleUpdate(stage, update) {
  return (
    stage.startTrigger !== update.startTrigger ||
    stage.startReferenceStageOrder !== update.startReferenceStageOrder ||
    stage.startDelayDays !== update.startDelayDays
  )
}

async function loadTemplate(name) {
  return prisma.productTemplate.findFirst({
    where: { name },
    select: {
      id: true,
      name: true,
      stages: {
        orderBy: { stageOrder: 'asc' },
        select: {
          id: true,
          stageName: true,
          stageOrder: true,
          durationDays: true,
          startTrigger: true,
          startReferenceStageOrder: true,
          startDelayDays: true,
        },
      },
    },
  })
}

async function loadProducts() {
  return prisma.product.findMany({
    where: {
      OR: [
        { country: { equals: 'Китай' } },
        { country: { equals: 'РФ' } },
        { country: { equals: 'Россия' } },
        { country: { equals: 'Рф' } },
      ],
    },
    select: {
      id: true,
      name: true,
      country: true,
      createdAt: true,
      stages: {
        orderBy: { stageOrder: 'asc' },
        select: {
          id: true,
          stageName: true,
          stageOrder: true,
          durationDays: true,
          status: true,
          isCompleted: true,
          startDate: true,
          endDate: true,
          autoStartAt: true,
          startTrigger: true,
          startReferenceStageOrder: true,
          startDelayDays: true,
        },
      },
    },
    orderBy: [{ country: 'asc' }, { name: 'asc' }],
  })
}

async function writeBackup(templates, products) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = path.join('/tmp', `prod-parallel-start-rules-backup-${timestamp}.json`)
  fs.writeFileSync(
    filePath,
    JSON.stringify({ createdAt: new Date().toISOString(), templates, products }, null, 2)
  )
  return filePath
}

async function applyTemplateUpdates(template, updates) {
  for (const stage of template.stages) {
    const update = updates.get(stage.id)
    if (!update || !needsRuleUpdate(stage, update)) continue
    await prisma.productTemplateStage.update({
      where: { id: stage.id },
      data: update,
      select: { id: true },
    })
  }
}

async function applyProductUpdates(product, updates) {
  const stageUpdates = []
  const stages = product.stages.map((stage) => {
    const update = updates.get(stage.id)
    return update ? { ...stage, ...update } : stage
  })
  const byOrder = new Map(stages.map((stage) => [stage.stageOrder, stage]))

  for (const originalStage of product.stages) {
    const update = updates.get(originalStage.id)
    const nextStage = update ? { ...originalStage, ...update } : originalStage
    const data = {}

    if (update && needsRuleUpdate(originalStage, update)) {
      Object.assign(data, update)
    }

    if (
      !nextStage.isCompleted &&
      nextStage.status !== 'COMPLETED' &&
      nextStage.status !== 'IN_PROGRESS'
    ) {
      const nextAutoStartAt = expectedAutoStartAt(product, nextStage, byOrder)
      if (!sameTime(originalStage.autoStartAt, nextAutoStartAt)) {
        data.autoStartAt = nextAutoStartAt
      }
    }

    if (Object.keys(data).length === 0) continue
    stageUpdates.push({ id: originalStage.id, data })
  }

  for (const update of stageUpdates) {
    await prisma.productStage.update({
      where: { id: update.id },
      data: update.data,
      select: { id: true },
    })
  }

  return stageUpdates.length
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  const templates = (await Promise.all([loadTemplate(RF_TEMPLATE_NAME), loadTemplate(CHINA_TEMPLATE_NAME)])).filter(Boolean)
  const products = await loadProducts()

  const templateUpdates = []
  for (const template of templates) {
    const updates = buildRuleUpdates(template.stages)
    for (const stage of template.stages) {
      const update = updates.get(stage.id)
      if (update && needsRuleUpdate(stage, update)) templateUpdates.push({ template: template.name, stage: stage.stageName, update })
    }
  }

  const productPlans = []
  let autoStartUpdates = 0
  for (const product of products) {
    const countryType = classifyCountry(product.country)
    if (countryType !== 'rf' && countryType !== 'china') continue
    const updates = buildRuleUpdates(product.stages)
    const stages = product.stages.map((stage) => {
      const update = updates.get(stage.id)
      return update ? { ...stage, ...update } : stage
    })
    const byOrder = new Map(stages.map((stage) => [stage.stageOrder, stage]))
    for (const originalStage of product.stages) {
      const update = updates.get(originalStage.id)
      const nextStage = update ? { ...originalStage, ...update } : originalStage
      const needsRule = Boolean(update && needsRuleUpdate(originalStage, update))
      let needsAutoStart = false
      if (
        !nextStage.isCompleted &&
        nextStage.status !== 'COMPLETED' &&
        nextStage.status !== 'IN_PROGRESS'
      ) {
        const nextAutoStartAt = expectedAutoStartAt(product, nextStage, byOrder)
        needsAutoStart = !sameTime(originalStage.autoStartAt, nextAutoStartAt)
      }
      if (!needsRule && !needsAutoStart) continue
      if (needsAutoStart) autoStartUpdates += 1
      productPlans.push({
        productId: product.id,
        product: product.name,
        country: product.country,
        stage: originalStage.stageName,
        needsRule,
        needsAutoStart,
      })
    }
  }

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)
  console.log(`Templates checked: ${templates.length}`)
  console.log(`Products checked: ${products.length}`)
  console.log(`Template rule updates: ${templateUpdates.length}`)
  console.log(`Product stage updates: ${productPlans.length}`)
  console.log(`Auto-start date updates: ${autoStartUpdates}`)
  for (const item of [...templateUpdates, ...productPlans].slice(0, 25)) {
    console.log(item)
  }
  if (templateUpdates.length + productPlans.length > 25) {
    console.log(`...and ${templateUpdates.length + productPlans.length - 25} more updates`)
  }

  if (!apply) {
    console.log('Dry run complete. No data changed.')
    return
  }

  const backupPath = await writeBackup(templates, products)
  console.log(`Backup written: ${backupPath}`)

  for (const template of templates) {
    await applyTemplateUpdates(template, buildRuleUpdates(template.stages))
  }

  let updatedProducts = 0
  for (const product of products) {
    const updatedStages = await applyProductUpdates(product, buildRuleUpdates(product.stages))
    if (updatedStages > 0) updatedProducts += 1
  }

  console.log(`Updated products: ${updatedProducts}`)
  console.log('Parallel start rules synced.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
