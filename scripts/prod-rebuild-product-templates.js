const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

const RF_TEMPLATE_NAME = 'РФ — основной шаблон запуска'
const CHINA_TEMPLATE_NAME = 'Китай — основной шаблон запуска'

function hasChatTarget(recipient) {
  if (!recipient) return false
  return Boolean(recipient.telegramId || recipient.chatId)
}

function classifyCountry(country) {
  const normalized = String(country || '').trim().toLowerCase()
  if (!normalized) return 'unknown'
  if (['рф', 'россия', 'russia', 'ru', 'российская федерация'].includes(normalized)) return 'rf'
  if (normalized.includes('рос') || normalized.includes('russia')) return 'rf'
  if (normalized.includes('кит') || normalized.includes('china')) return 'china'
  return 'unknown'
}

function templateKeyForCountry(country) {
  return classifyCountry(country) === 'rf' ? 'rf' : 'china'
}

async function getCounts(tx = prisma) {
  const [
    products,
    productStages,
    productSubStages,
    comments,
    changeHistory,
    telegramNotificationSettings,
  ] = await Promise.all([
    tx.product.count(),
    tx.productStage.count(),
    tx.productSubStage.count(),
    tx.comment.count(),
    tx.changeHistory.count(),
    tx.telegramNotificationSetting.count(),
  ])

  return {
    products,
    productStages,
    productSubStages,
    comments,
    changeHistory,
    telegramNotificationSettings,
  }
}

async function loadTemplates() {
  const [rfTemplate, chinaTemplate] = await Promise.all([
    prisma.productTemplate.findFirst({
      where: { name: RF_TEMPLATE_NAME },
      include: {
        stages: {
          orderBy: [{ stageOrder: 'asc' }],
          include: {
            stageTemplate: true,
            telegramNotificationSettings: {
              orderBy: [{ createdAt: 'asc' }],
              include: { recipient: true },
            },
            subStages: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
    }),
    prisma.productTemplate.findFirst({
      where: { name: CHINA_TEMPLATE_NAME },
      include: {
        stages: {
          orderBy: [{ stageOrder: 'asc' }],
          include: {
            stageTemplate: true,
            telegramNotificationSettings: {
              orderBy: [{ createdAt: 'asc' }],
              include: { recipient: true },
            },
            subStages: {
              orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
            },
          },
        },
      },
    }),
  ])

  if (!rfTemplate || rfTemplate.stages.length === 0) {
    throw new Error(`Template not ready: ${RF_TEMPLATE_NAME}`)
  }

  if (!chinaTemplate || chinaTemplate.stages.length === 0) {
    throw new Error(`Template not ready: ${CHINA_TEMPLATE_NAME}`)
  }

  return { rfTemplate, chinaTemplate }
}

async function buildReport(products, templates) {
  const report = {
    totalProducts: products.length,
    countryCounts: { rf: 0, china: 0, unknown: 0 },
    templateCounts: { rf: 0, china: 0 },
    targetStages: 0,
    targetSubStages: 0,
    targetStageNotifications: 0,
    targetSubStageNotifications: 0,
  }

  for (const product of products) {
    const countryClass = classifyCountry(product.country)
    report.countryCounts[countryClass] += 1

    const templateKey = templateKeyForCountry(product.country)
    report.templateCounts[templateKey] += 1
    const template = templateKey === 'rf' ? templates.rfTemplate : templates.chinaTemplate
    report.targetStages += template.stages.length
    report.targetSubStages += template.stages.reduce((sum, stage) => sum + stage.subStages.length, 0)
    report.targetStageNotifications += template.stages.reduce(
      (sum, stage) => sum + stage.telegramNotificationSettings.length,
      0
    )
    report.targetSubStageNotifications += template.stages.reduce(
      (sum, stage) =>
        sum +
        stage.subStages.filter(
          (subStage) =>
            subStage.notifyOnComplete !== false &&
            (subStage.telegramRecipientType === 'responsible' || subStage.telegramRecipientId)
        ).length,
      0
    )
  }

  return report
}

async function createProductNotificationFromTemplate(tx, input) {
  const {
    productId,
    productStageId,
    productSubStageId,
    templateSettingId,
    eventType,
    recipientType,
    recipientId,
    messageTemplate,
    customMessage,
    isEnabled,
    recipient,
  } = input

  if (recipientType !== 'responsible' && !recipientId) return null

  const resolvedEnabled = Boolean(
    isEnabled &&
      (recipientType === 'responsible' || hasChatTarget(recipient))
  )

  return tx.telegramNotificationSetting.create({
    data: {
      productId,
      stageId: productStageId ?? null,
      subStageId: productSubStageId ?? null,
      templateSettingId: templateSettingId ?? null,
      isOverride: false,
      eventType,
      recipientType,
      recipientId: recipientType === 'responsible' ? null : recipientId,
      messageTemplate: messageTemplate ?? null,
      customMessage: customMessage ?? null,
      isEnabled: resolvedEnabled,
      sentAt: null,
      lastError: null,
    },
  })
}

async function rebuildProduct(tx, product, template) {
  const recipientIds = template.stages.flatMap((stage) =>
    stage.subStages
      .map((subStage) => subStage.telegramRecipientId)
      .filter(Boolean)
  )
  const recipients = recipientIds.length
    ? await tx.telegramRecipient.findMany({
        where: { id: { in: [...new Set(recipientIds)] } },
      })
    : []
  const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]))

  await tx.comment.updateMany({
    where: {
      productId: product.id,
      productStageId: { not: null },
    },
    data: { productStageId: null },
  })

  await tx.changeHistory.updateMany({
    where: {
      productId: product.id,
      productStageId: { not: null },
    },
    data: { productStageId: null },
  })

  await tx.telegramNotificationSetting.deleteMany({
    where: { productId: product.id },
  })

  await tx.productStage.deleteMany({
    where: { productId: product.id },
  })

  await tx.product.update({
    where: { id: product.id },
    data: {
      productTemplateId: template.id,
      finalDate: null,
      progressPercent: 0,
      riskScore: 0,
    },
    select: { id: true },
  })

  for (const templateStage of template.stages) {
    const stageTemplate = templateStage.stageTemplate
    const productStage = await tx.productStage.create({
      data: {
        productId: product.id,
        stageTemplateId: templateStage.stageTemplateId,
        stageOrder: templateStage.stageOrder,
        stageName: templateStage.stageName,
        description: null,
        dateValue: null,
        dateRaw: null,
        dateEnd: null,
        durationDays: templateStage.durationDays ?? stageTemplate.durationDays ?? null,
        status: 'NOT_STARTED',
        isCompleted: false,
        isCritical: stageTemplate.isCritical ?? false,
        participatesInAutoshift: templateStage.participatesInAutoshift ?? stageTemplate.participatesInAutoshift ?? true,
        affectsFinalDate: stageTemplate.affectsFinalDate ?? true,
        responsibleId: product.responsibleId ?? null,
        comment: null,
        priority: product.priority ?? 'MEDIUM',
        startDate: null,
        endDate: null,
        plannedDate: null,
        autoStartAt: null,
        startTrigger: templateStage.startTrigger ?? (templateStage.stageOrder === 0 ? 'PRODUCT_CREATED' : 'PREVIOUS_STAGE_COMPLETED'),
        startDelayDays: templateStage.startDelayDays ?? 0,
        startReferenceStageOrder: templateStage.startReferenceStageOrder ?? null,
        actualDate: null,
        daysDeviation: null,
      },
    })

    for (const setting of templateStage.telegramNotificationSettings) {
      await createProductNotificationFromTemplate(tx, {
        productId: product.id,
        productStageId: productStage.id,
        templateSettingId: setting.id,
        eventType: setting.eventType,
        recipientType: setting.recipientType,
        recipientId: setting.recipientId,
        messageTemplate: setting.messageTemplate,
        customMessage: setting.customMessage,
        isEnabled: setting.isEnabled,
        recipient: setting.recipient,
      })
    }

    for (const templateSubStage of templateStage.subStages) {
      const productSubStage = await tx.productSubStage.create({
        data: {
          stageId: productStage.id,
          name: templateSubStage.name,
          description: templateSubStage.description ?? null,
          responsibleId: templateSubStage.responsibleId ?? null,
          status: 'NOT_STARTED',
          startDate: null,
          endDate: null,
          sortOrder: templateSubStage.sortOrder,
        },
      })

      if (templateSubStage.notifyOnComplete === false) continue
      const recipientType = templateSubStage.telegramRecipientType || 'user'
      const recipientId = recipientType === 'responsible' ? null : templateSubStage.telegramRecipientId
      if (recipientType !== 'responsible' && !recipientId) continue

      await createProductNotificationFromTemplate(tx, {
        productId: product.id,
        productStageId: productStage.id,
        productSubStageId: productSubStage.id,
        templateSettingId: null,
        eventType: 'substage_completed',
        recipientType,
        recipientId,
        messageTemplate: templateSubStage.telegramMessageTemplate || 'substage_completed_simple',
        customMessage: templateSubStage.telegramCustomMessage ?? null,
        isEnabled: true,
        recipient: recipientId ? recipientById.get(recipientId) : null,
      })
    }
  }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required')
    process.exit(1)
  }

  const apply = process.argv.includes('--apply')
  const templates = await loadTemplates()
  const products = await prisma.product.findMany({
    orderBy: [{ createdAt: 'asc' }],
    select: {
      id: true,
      name: true,
      country: true,
      priority: true,
      responsibleId: true,
      productTemplateId: true,
      isArchived: true,
    },
  })

  const beforeCounts = await getCounts()
  const report = await buildReport(products, templates)

  console.log(apply ? 'Mode: APPLY' : 'Mode: DRY RUN')
  console.log(`Products: ${report.totalProducts}`)
  console.log(`Countries: РФ ${report.countryCounts.rf}, Китай ${report.countryCounts.china}, unknown-as-China ${report.countryCounts.unknown}`)
  console.log(`Templates to apply: РФ ${report.templateCounts.rf}, Китай ${report.templateCounts.china}`)
  console.log(`Target stages: ${report.targetStages}`)
  console.log(`Target substages: ${report.targetSubStages}`)
  console.log(`Target stage notification settings: ${report.targetStageNotifications}`)
  console.log(`Target substage notification settings: ${report.targetSubStageNotifications}`)
  console.log(`Before counts: ${JSON.stringify(beforeCounts)}`)

  if (!apply) {
    console.log('Dry run complete. No data changed.')
    return
  }

  await prisma.$transaction(
    async (tx) => {
      for (const product of products) {
        const templateKey = templateKeyForCountry(product.country)
        const template = templateKey === 'rf' ? templates.rfTemplate : templates.chinaTemplate
        await rebuildProduct(tx, product, template)
      }
    },
    { maxWait: 30000, timeout: 1800000 }
  )

  const afterCounts = await getCounts()
  if (afterCounts.products !== beforeCounts.products) {
    throw new Error(`Product count changed: before ${beforeCounts.products}, after ${afterCounts.products}`)
  }

  console.log(`After counts: ${JSON.stringify(afterCounts)}`)
  console.log('Rebuild complete. Product rows were preserved; stage structure was recreated from templates.')
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
