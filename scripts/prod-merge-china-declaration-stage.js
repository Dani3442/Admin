const fs = require('fs')
const path = require('path')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

const CHINA_COUNTRY = 'Китай'
const CHINA_TEMPLATE_NAME = 'Китай — основной шаблон запуска'
const KEEP_STAGE_NAME = '6.1. Декларация'
const DROP_STAGE_NAME = '6.2. Декларация'
const REQUIRED_SUBSTAGE_NAME = 'Подкрепить ДС в карточку ЧЗ'
const TARGET_DURATION_DAYS = 30
const TARGET_DURATION_TEXT = '30 календарных дней. Старт через 30 дней после запуска продукта.'

function sameName(left, right) {
  return String(left || '').trim().toLowerCase() === String(right || '').trim().toLowerCase()
}

function mergeStageState(keep, drop) {
  const data = {}

  if (!keep.responsibleId && drop.responsibleId) data.responsibleId = drop.responsibleId
  if (!keep.startDate && drop.startDate) data.startDate = drop.startDate
  if (!keep.endDate && drop.endDate) data.endDate = drop.endDate
  if (!keep.actualDate && drop.actualDate) data.actualDate = drop.actualDate
  if (!keep.dateValue && drop.dateValue) data.dateValue = drop.dateValue
  if (!keep.dateEnd && drop.dateEnd) data.dateEnd = drop.dateEnd
  if (!keep.dateRaw && drop.dateRaw) data.dateRaw = drop.dateRaw

  if (!keep.isCompleted && drop.isCompleted) {
    data.isCompleted = true
    data.status = drop.status || 'COMPLETED'
    if (drop.endDate) data.endDate = drop.endDate
    if (drop.actualDate) data.actualDate = drop.actualDate
  } else if (keep.status === 'NOT_STARTED' && drop.status && drop.status !== 'NOT_STARTED') {
    data.status = drop.status
  }

  return data
}

async function getChinaTemplate(db = prisma) {
  return db.productTemplate.findFirst({
    where: { name: CHINA_TEMPLATE_NAME },
    select: {
      id: true,
      name: true,
      stages: {
        where: { stageName: { in: [KEEP_STAGE_NAME, DROP_STAGE_NAME] } },
        select: {
          id: true,
          stageTemplateId: true,
          stageName: true,
          stageOrder: true,
          durationDays: true,
          startReferenceStageOrder: true,
          subStages: { select: { id: true, name: true, sortOrder: true } },
        },
        orderBy: { stageOrder: 'asc' },
      },
    },
  })
}

async function getProductPlans(db = prisma) {
  const products = await db.product.findMany({
    where: {
      country: CHINA_COUNTRY,
      stages: {
        some: { stageName: { in: [KEEP_STAGE_NAME, DROP_STAGE_NAME] } },
      },
    },
    select: {
      id: true,
      name: true,
      country: true,
      stages: {
        where: { stageName: { in: [KEEP_STAGE_NAME, DROP_STAGE_NAME] } },
        select: {
          id: true,
          stageName: true,
          stageOrder: true,
          durationDays: true,
          isCompleted: true,
          status: true,
          subStages: { select: { id: true, name: true, sortOrder: true } },
        },
        orderBy: { stageOrder: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  return products.map((product) => {
    const keep = product.stages.find((stage) => stage.stageName === KEEP_STAGE_NAME)
    const drop = product.stages.find((stage) => stage.stageName === DROP_STAGE_NAME)
    const keepHasRequiredSubStage = Boolean(
      keep?.subStages.some((subStage) => sameName(subStage.name, REQUIRED_SUBSTAGE_NAME))
    )
    const dropHasRequiredSubStage = Boolean(
      drop?.subStages.some((subStage) => sameName(subStage.name, REQUIRED_SUBSTAGE_NAME))
    )

    return {
      product,
      keep,
      drop,
      keepHasRequiredSubStage,
      dropHasRequiredSubStage,
      needsMerge: Boolean(keep && drop),
      needsDuration: Boolean(keep && keep.durationDays !== TARGET_DURATION_DAYS),
      alreadyMerged: Boolean(keep && !drop && keepHasRequiredSubStage),
    }
  })
}

async function writeBackup() {
  const now = new Date().toISOString().replace(/[:.]/g, '-')
  const filePath = path.join('/tmp', `prod-china-declaration-merge-backup-${now}.json`)

  const template = await prisma.productTemplate.findFirst({
    where: { name: CHINA_TEMPLATE_NAME },
    select: {
      id: true,
      name: true,
      stages: {
        where: {
          OR: [
            { stageName: { in: [KEEP_STAGE_NAME, DROP_STAGE_NAME] } },
            { stageOrder: { gte: 9 } },
          ],
        },
        select: {
          id: true,
          stageTemplateId: true,
          stageOrder: true,
          stageName: true,
          durationDays: true,
          startTrigger: true,
          startDelayDays: true,
          startReferenceStageOrder: true,
          subStages: true,
          telegramNotificationSettings: true,
        },
        orderBy: { stageOrder: 'asc' },
      },
    },
  })

  const products = await prisma.product.findMany({
    where: { country: CHINA_COUNTRY },
    select: {
      id: true,
      name: true,
      country: true,
      productTemplateId: true,
      progressPercent: true,
      stages: {
        where: {
          OR: [
            { stageName: { in: [KEEP_STAGE_NAME, DROP_STAGE_NAME] } },
            { stageOrder: { gte: 9 } },
          ],
        },
        select: {
          id: true,
          stageTemplateId: true,
          stageOrder: true,
          stageName: true,
          durationDays: true,
          status: true,
          isCompleted: true,
          startDate: true,
          endDate: true,
          actualDate: true,
          startTrigger: true,
          startDelayDays: true,
          startReferenceStageOrder: true,
          subStages: true,
          telegramNotificationSettings: true,
          comments: { select: { id: true } },
        },
        orderBy: { stageOrder: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  fs.writeFileSync(filePath, JSON.stringify({ createdAt: new Date().toISOString(), template, products }, null, 2))
  return filePath
}

async function moveTemplateSettings(db, templateId, keepStageId, dropStageId) {
  const sourceSettings = await db.telegramTemplateNotificationSetting.findMany({
    where: { productTemplateStageId: dropStageId },
    select: { id: true, eventType: true },
  })

  for (const setting of sourceSettings) {
    const duplicate = await db.telegramTemplateNotificationSetting.findFirst({
      where: {
        productTemplateId: templateId,
        productTemplateStageId: keepStageId,
        eventType: setting.eventType,
      },
      select: { id: true },
    })

    if (duplicate) {
      await db.telegramTemplateNotificationSetting.delete({ where: { id: setting.id } })
      continue
    }

    await db.telegramTemplateNotificationSetting.update({
      where: { id: setting.id },
      data: { productTemplateStageId: keepStageId },
    })
  }
}

async function mergeTemplateSubStages(db, templateId, keepStageId, dropStageId) {
  const keepSubStages = await db.productTemplateSubStage.findMany({
    where: { productTemplateStageId: keepStageId },
    select: { id: true, name: true },
  })
  const dropSubStages = await db.productTemplateSubStage.findMany({
    where: { productTemplateStageId: dropStageId },
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  })

  for (const sourceSubStage of dropSubStages) {
    const duplicate = keepSubStages.find((subStage) => sameName(subStage.name, sourceSubStage.name))
    if (duplicate) {
      await db.productTemplateSubStage.delete({ where: { id: sourceSubStage.id } })
      continue
    }

    await db.productTemplateSubStage.update({
      where: { id: sourceSubStage.id },
      data: {
        productTemplateStageId: keepStageId,
        productTemplateId: templateId,
      },
    })
  }
}

async function shiftTemplateAfterDrop(db, templateId, keepOrder, dropOrder) {
  await db.productTemplateStage.updateMany({
    where: { productTemplateId: templateId, startReferenceStageOrder: dropOrder },
    data: { startReferenceStageOrder: keepOrder },
  })

  const refStages = await db.productTemplateStage.findMany({
    where: { productTemplateId: templateId, startReferenceStageOrder: { gt: dropOrder } },
    select: { id: true, startReferenceStageOrder: true },
  })

  for (const stage of refStages) {
    await db.productTemplateStage.update({
      where: { id: stage.id },
      data: { startReferenceStageOrder: stage.startReferenceStageOrder - 1 },
    })
  }

  const stagesToShift = await db.productTemplateStage.findMany({
    where: { productTemplateId: templateId, stageOrder: { gt: dropOrder } },
    select: { id: true, stageOrder: true },
    orderBy: { stageOrder: 'asc' },
  })

  for (const stage of stagesToShift) {
    await db.productTemplateStage.update({
      where: { id: stage.id },
      data: { stageOrder: stage.stageOrder - 1 },
    })
  }
}

async function applyTemplateMerge(db) {
  const template = await getChinaTemplate(db)
  if (!template) return { templateUpdated: false, templateMerged: false }

  const keep = template.stages.find((stage) => stage.stageName === KEEP_STAGE_NAME)
  const drop = template.stages.find((stage) => stage.stageName === DROP_STAGE_NAME)

  if (!keep && !drop) return { templateUpdated: false, templateMerged: false }

  if (!keep && drop) {
    await db.productTemplateStage.update({
      where: { id: drop.id },
      data: {
        stageName: KEEP_STAGE_NAME,
        durationDays: TARGET_DURATION_DAYS,
        startTrigger: 'PRODUCT_CREATED',
        startDelayDays: 30,
        startReferenceStageOrder: null,
      },
    })
    return { templateUpdated: true, templateMerged: false }
  }

  await db.productTemplateStage.update({
    where: { id: keep.id },
    data: { durationDays: TARGET_DURATION_DAYS },
  })

  if (!drop) return { templateUpdated: keep.durationDays !== TARGET_DURATION_DAYS, templateMerged: false }

  await mergeTemplateSubStages(db, template.id, keep.id, drop.id)
  await moveTemplateSettings(db, template.id, keep.id, drop.id)
  await db.productTemplateStage.delete({ where: { id: drop.id } })
  await shiftTemplateAfterDrop(db, template.id, keep.stageOrder, drop.stageOrder)

  return { templateUpdated: true, templateMerged: true }
}

async function mergeProductSubStages(db, keepStageId, dropStageId) {
  const keepSubStages = await db.productSubStage.findMany({
    where: { stageId: keepStageId },
    select: { id: true, name: true },
  })
  const dropSubStages = await db.productSubStage.findMany({
    where: { stageId: dropStageId },
    select: { id: true, name: true },
    orderBy: { sortOrder: 'asc' },
  })

  for (const sourceSubStage of dropSubStages) {
    const duplicate = keepSubStages.find((subStage) => sameName(subStage.name, sourceSubStage.name))
    if (duplicate) {
      await db.telegramNotificationSetting.updateMany({
        where: { subStageId: sourceSubStage.id },
        data: { subStageId: duplicate.id, stageId: keepStageId },
      })
      await db.productSubStage.delete({ where: { id: sourceSubStage.id } })
      continue
    }

    await db.productSubStage.update({
      where: { id: sourceSubStage.id },
      data: { stageId: keepStageId },
    })
  }
}

async function shiftProductAfterDrop(db, productId, keepOrder, dropOrder) {
  await db.productStage.updateMany({
    where: { productId, startReferenceStageOrder: dropOrder },
    data: { startReferenceStageOrder: keepOrder },
  })

  const refStages = await db.productStage.findMany({
    where: { productId, startReferenceStageOrder: { gt: dropOrder } },
    select: { id: true, startReferenceStageOrder: true },
  })

  for (const stage of refStages) {
    await db.productStage.update({
      where: { id: stage.id },
      data: { startReferenceStageOrder: stage.startReferenceStageOrder - 1 },
    })
  }

  const stagesToShift = await db.productStage.findMany({
    where: { productId, stageOrder: { gt: dropOrder } },
    select: { id: true, stageOrder: true },
    orderBy: { stageOrder: 'asc' },
  })

  for (const stage of stagesToShift) {
    await db.productStage.update({
      where: { id: stage.id },
      data: { stageOrder: stage.stageOrder - 1 },
    })
  }
}

async function recalculateProductProgress(db, productId) {
  const [total, completed] = await Promise.all([
    db.productStage.count({ where: { productId } }),
    db.productStage.count({ where: { productId, isCompleted: true } }),
  ])

  const progressPercent = total > 0 ? Math.round((completed / total) * 100) : 0
  await db.product.update({
    where: { id: productId },
    data: { progressPercent },
    select: { id: true },
  })
}

async function getProductForMerge(db, productId) {
  return db.product.findFirst({
    where: { id: productId, country: CHINA_COUNTRY },
    select: {
      id: true,
      name: true,
      stages: {
        where: { stageName: { in: [KEEP_STAGE_NAME, DROP_STAGE_NAME] } },
        select: {
          id: true,
          stageName: true,
          stageOrder: true,
          durationDays: true,
          status: true,
          isCompleted: true,
          responsibleId: true,
          startDate: true,
          endDate: true,
          actualDate: true,
          dateValue: true,
          dateRaw: true,
          dateEnd: true,
        },
        orderBy: { stageOrder: 'asc' },
      },
    },
  })
}

async function applyProductMerge(db, productId) {
  const product = await getProductForMerge(db, productId)
  if (!product) return { updated: false, merged: false }

  const keep = product.stages.find((stage) => stage.stageName === KEEP_STAGE_NAME)
  const drop = product.stages.find((stage) => stage.stageName === DROP_STAGE_NAME)

  if (!keep && !drop) return { updated: false, merged: false }

  if (!keep && drop) {
    await db.productStage.update({
      where: { id: drop.id },
      data: {
        stageName: KEEP_STAGE_NAME,
        durationDays: TARGET_DURATION_DAYS,
        startTrigger: 'PRODUCT_CREATED',
        startDelayDays: 30,
        startReferenceStageOrder: null,
      },
      select: { id: true },
    })
    await recalculateProductProgress(db, productId)
    return { updated: true, merged: false }
  }

  const keepUpdate = {
    durationDays: TARGET_DURATION_DAYS,
    ...((drop && mergeStageState(keep, drop)) || {}),
  }

  await db.productStage.update({
    where: { id: keep.id },
    data: keepUpdate,
    select: { id: true },
  })

  if (!drop) {
    await recalculateProductProgress(db, productId)
    return { updated: keep.durationDays !== TARGET_DURATION_DAYS, merged: false }
  }

  await mergeProductSubStages(db, keep.id, drop.id)
  await db.telegramNotificationSetting.updateMany({
    where: { stageId: drop.id },
    data: { stageId: keep.id },
  })
  await db.comment.updateMany({
    where: { productStageId: drop.id },
    data: { productStageId: keep.id },
  })
  await db.changeHistory.updateMany({
    where: { productStageId: drop.id },
    data: { productStageId: keep.id },
  })
  await db.productStage.delete({ where: { id: drop.id } })
  await shiftProductAfterDrop(db, productId, keep.stageOrder, drop.stageOrder)
  await recalculateProductProgress(db, productId)

  return { updated: true, merged: true }
}

async function printReport() {
  const template = await getChinaTemplate()
  const productPlans = await getProductPlans()
  const productsWithBoth = productPlans.filter((plan) => plan.needsMerge)
  const productsAlreadyMerged = productPlans.filter((plan) => plan.alreadyMerged)
  const durationUpdates = productPlans.filter((plan) => plan.needsDuration)
  const nonChinaMatches = await prisma.productStage.count({
    where: {
      product: { country: { not: CHINA_COUNTRY } },
      stageName: { in: [KEEP_STAGE_NAME, DROP_STAGE_NAME] },
    },
  })

  const keep = template?.stages.find((stage) => stage.stageName === KEEP_STAGE_NAME)
  const drop = template?.stages.find((stage) => stage.stageName === DROP_STAGE_NAME)

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)
  console.log(`Template: ${template?.name ?? 'not found'}`)
  if (template) {
    console.log(
      `Template stages: ${keep?.stageOrder ?? '-'}:${KEEP_STAGE_NAME} duration=${keep?.durationDays ?? '-'} subStages=${
        keep?.subStages.length ?? 0
      } | ${drop?.stageOrder ?? '-'}:${DROP_STAGE_NAME} subStages=${drop?.subStages.length ?? 0}`
    )
  }
  console.log(`China products with declaration stages: ${productPlans.length}`)
  console.log(`China products to merge 6.2 into 6.1: ${productsWithBoth.length}`)
  console.log(`China products already merged: ${productsAlreadyMerged.length}`)
  console.log(`China products needing duration=30: ${durationUpdates.length}`)
  console.log(`Non-China matching stages left untouched: ${nonChinaMatches}`)

  for (const plan of productPlans.slice(0, 15)) {
    const marker = plan.needsMerge || plan.needsDuration ? '*' : '-'
    console.log(
      `${marker} ${plan.product.name}: keep=${plan.keep?.stageOrder ?? '-'} duration=${plan.keep?.durationDays ?? '-'} keepSub=${
        plan.keep?.subStages.length ?? 0
      } | drop=${plan.drop?.stageOrder ?? '-'} dropSub=${plan.drop?.subStages.length ?? 0}`
    )
  }
  if (productPlans.length > 15) console.log(`...and ${productPlans.length - 15} more China products`)

  return { productPlans }
}

async function main() {
  const { productPlans } = await printReport()

  if (!apply) {
    console.log('\nDry run only. Run with --apply to merge China declaration stages.')
    return
  }

  const backupPath = await writeBackup()
  console.log(`Backup written: ${backupPath}`)

  const templateResult = await prisma.$transaction((tx) => applyTemplateMerge(tx), { timeout: 15_000 })

  let updatedProducts = 0
  let mergedProducts = 0
  for (const plan of productPlans) {
    const result = await prisma.$transaction((tx) => applyProductMerge(tx, plan.product.id), { timeout: 15_000 })
    if (result.updated) updatedProducts += 1
    if (result.merged) mergedProducts += 1
  }

  console.log('\nApplied China declaration merge.')
  console.log(`Template updated: ${templateResult.templateUpdated}`)
  console.log(`Template merged: ${templateResult.templateMerged}`)
  console.log(`Products updated: ${updatedProducts}`)
  console.log(`Products merged: ${mergedProducts}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
