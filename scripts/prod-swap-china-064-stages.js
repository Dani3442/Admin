const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

const CHINA_COUNTRY = 'Китай'
const CHINA_TEMPLATE_NAME = 'Китай — основной шаблон запуска'
const DOC_STAGE = '5.1. Документация 064'
const SAMPLE_STAGE = '5.2. Образец 064'
const PREP_STAGE = '7.1. Подготовка к запуску'
const DOC_ORDER = 6
const SAMPLE_ORDER = 7
const TEMP_DOC_ORDER = -51064

async function getTemplateReport(db = prisma) {
  const template = await db.productTemplate.findFirst({
    where: { name: CHINA_TEMPLATE_NAME },
    select: {
      id: true,
      name: true,
      stages: {
        where: { stageName: { in: [DOC_STAGE, SAMPLE_STAGE, PREP_STAGE] } },
        select: {
          id: true,
          stageName: true,
          stageOrder: true,
          startTrigger: true,
          startReferenceStageOrder: true,
        },
        orderBy: { stageOrder: 'asc' },
      },
    },
  })

  if (!template) return null

  const doc = template.stages.find((stage) => stage.stageName === DOC_STAGE)
  const sample = template.stages.find((stage) => stage.stageName === SAMPLE_STAGE)
  const prep = template.stages.find((stage) => stage.stageName === PREP_STAGE)

  return {
    template,
    doc,
    sample,
    prep,
    needsSwap: Boolean(doc && sample && (doc.stageOrder !== DOC_ORDER || sample.stageOrder !== SAMPLE_ORDER)),
    needsPrepReference: Boolean(prep && prep.startReferenceStageOrder !== DOC_ORDER),
  }
}

async function getProductReports(db = prisma) {
  const products = await db.product.findMany({
    where: {
      country: CHINA_COUNTRY,
      stages: {
        some: { stageName: { in: [DOC_STAGE, SAMPLE_STAGE] } },
      },
    },
    select: {
      id: true,
      name: true,
      country: true,
      stages: {
        where: { stageName: { in: [DOC_STAGE, SAMPLE_STAGE, PREP_STAGE] } },
        select: {
          id: true,
          stageName: true,
          stageOrder: true,
          startReferenceStageOrder: true,
        },
        orderBy: { stageOrder: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  })

  return products
    .map((product) => {
      const doc = product.stages.find((stage) => stage.stageName === DOC_STAGE)
      const sample = product.stages.find((stage) => stage.stageName === SAMPLE_STAGE)
      const prep = product.stages.find((stage) => stage.stageName === PREP_STAGE)

      return {
        product,
        doc,
        sample,
        prep,
        needsSwap: Boolean(doc && sample && (doc.stageOrder !== DOC_ORDER || sample.stageOrder !== SAMPLE_ORDER)),
        needsPrepReference: Boolean(prep && prep.startReferenceStageOrder !== DOC_ORDER),
      }
    })
    .filter((report) => report.doc && report.sample)
}

async function getProductReportById(db = prisma, productId) {
  const product = await db.product.findFirst({
    where: {
      id: productId,
      country: CHINA_COUNTRY,
    },
    select: {
      id: true,
      name: true,
      country: true,
      stages: {
        where: { stageName: { in: [DOC_STAGE, SAMPLE_STAGE, PREP_STAGE] } },
        select: {
          id: true,
          stageName: true,
          stageOrder: true,
          startReferenceStageOrder: true,
        },
        orderBy: { stageOrder: 'asc' },
      },
    },
  })

  if (!product) return null

  const doc = product.stages.find((stage) => stage.stageName === DOC_STAGE)
  const sample = product.stages.find((stage) => stage.stageName === SAMPLE_STAGE)
  const prep = product.stages.find((stage) => stage.stageName === PREP_STAGE)

  if (!doc || !sample) return null

  return {
    product,
    doc,
    sample,
    prep,
    needsSwap: doc.stageOrder !== DOC_ORDER || sample.stageOrder !== SAMPLE_ORDER,
    needsPrepReference: Boolean(prep && prep.startReferenceStageOrder !== DOC_ORDER),
  }
}

async function applyTemplateFix(db, report) {
  if (!report?.doc || !report?.sample) return

  if (report.needsSwap) {
    await db.productTemplateStage.update({
      where: { id: report.doc.id },
      data: { stageOrder: TEMP_DOC_ORDER },
      select: { id: true },
    })
    await db.productTemplateStage.update({
      where: { id: report.sample.id },
      data: { stageOrder: SAMPLE_ORDER },
      select: { id: true },
    })
    await db.productTemplateStage.update({
      where: { id: report.doc.id },
      data: { stageOrder: DOC_ORDER },
      select: { id: true },
    })
  }

  if (report.needsPrepReference && report.prep) {
    await db.productTemplateStage.update({
      where: { id: report.prep.id },
      data: { startReferenceStageOrder: DOC_ORDER },
      select: { id: true },
    })
  }
}

async function applyProductFix(db, report) {
  if (!report.doc || !report.sample) return

  if (report.needsSwap) {
    await db.productStage.update({
      where: { id: report.doc.id },
      data: { stageOrder: TEMP_DOC_ORDER },
      select: { id: true },
    })
    await db.productStage.update({
      where: { id: report.sample.id },
      data: { stageOrder: SAMPLE_ORDER },
      select: { id: true },
    })
    await db.productStage.update({
      where: { id: report.doc.id },
      data: { stageOrder: DOC_ORDER },
      select: { id: true },
    })
  }

  if (report.needsPrepReference && report.prep) {
    await db.productStage.update({
      where: { id: report.prep.id },
      data: { startReferenceStageOrder: DOC_ORDER },
      select: { id: true },
    })
  }
}

async function main() {
  const templateReport = await getTemplateReport()
  const productReports = await getProductReports()

  const productSwaps = productReports.filter((report) => report.needsSwap)
  const productPrepReferences = productReports.filter((report) => report.needsPrepReference)

  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)
  console.log(`Template: ${templateReport?.template.name ?? 'not found'}`)
  if (templateReport) {
    console.log(
      `Template order: ${templateReport.doc?.stageOrder ?? '-'}:${DOC_STAGE} | ${templateReport.sample?.stageOrder ?? '-'}:${SAMPLE_STAGE}`
    )
    console.log(`Template needs swap: ${templateReport.needsSwap}`)
    console.log(`Template 7.1 reference needs update: ${templateReport.needsPrepReference}`)
  }
  console.log(`China products with both stages: ${productReports.length}`)
  console.log(`Product stage pairs to swap: ${productSwaps.length}`)
  console.log(`Product 7.1 references to update: ${productPrepReferences.length}`)

  for (const report of productReports.slice(0, 20)) {
    const marker = report.needsSwap || report.needsPrepReference ? '*' : '-'
    console.log(
      `${marker} ${report.product.name}: ${report.doc.stageOrder}:${DOC_STAGE} | ${report.sample.stageOrder}:${SAMPLE_STAGE}` +
        (report.prep ? ` | 7.1 ref ${report.prep.startReferenceStageOrder ?? '-'}` : '')
    )
  }
  if (productReports.length > 20) {
    console.log(`...and ${productReports.length - 20} more China products`)
  }

  if (!apply) {
    console.log('\nDry run only. Run with --apply to update China template and China products.')
    return
  }

  await prisma.$transaction(
    async (tx) => {
      const txTemplateReport = await getTemplateReport(tx)
      if (txTemplateReport) await applyTemplateFix(tx, txTemplateReport)
    },
    { timeout: 10_000 }
  )

  for (const report of productReports) {
    await prisma.$transaction(
      async (tx) => {
        const freshReport = await getProductReportById(tx, report.product.id)
        if (freshReport) await applyProductFix(tx, freshReport)
      },
      { timeout: 10_000 }
    )
  }

  console.log(`\nUpdated template swap: ${Boolean(templateReport?.needsSwap)}`)
  console.log(`Updated template 7.1 reference: ${Boolean(templateReport?.needsPrepReference)}`)
  console.log(`Updated product pairs: ${productSwaps.length}`)
  console.log(`Updated product 7.1 references: ${productPrepReferences.length}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
