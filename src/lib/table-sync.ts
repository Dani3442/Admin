import { prisma } from '@/lib/prisma'

export async function syncProductsWithStageTemplates() {
  const [products, templates] = await Promise.all([
    prisma.product.findMany({
      where: { isArchived: false },
      select: { id: true },
    }),
    prisma.stageTemplate.findMany({
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    }),
  ])

  if (products.length === 0 || templates.length === 0) return

  await prisma.$transaction(async (tx) => {
    for (const product of products) {
      const stages = await tx.productStage.findMany({
        where: { productId: product.id },
        orderBy: [{ stageOrder: 'asc' }, { createdAt: 'asc' }],
      })

      for (const [index, stage] of stages.entries()) {
        await tx.productStage.update({
          where: { id: stage.id },
          data: { stageOrder: -1000 - index },
        })
      }

      const usedStageIds = new Set<string>()

      for (const template of templates) {
        const matchedStage = stages.find((stage) =>
          !usedStageIds.has(stage.id) &&
          stage.stageTemplateId === template.id &&
          stage.stageName === template.name
        )

        if (matchedStage) {
          usedStageIds.add(matchedStage.id)

          await tx.productStage.update({
            where: { id: matchedStage.id },
            data: {
              stageOrder: template.order,
              stageName: template.name,
              isCritical: template.isCritical,
              affectsFinalDate: template.affectsFinalDate,
              participatesInAutoshift: template.participatesInAutoshift,
            },
          })
        } else {
          await tx.productStage.create({
            data: {
              productId: product.id,
              stageTemplateId: template.id,
              stageOrder: template.order,
              stageName: template.name,
              isCritical: template.isCritical,
              affectsFinalDate: template.affectsFinalDate,
              participatesInAutoshift: template.participatesInAutoshift,
              status: 'NOT_STARTED',
            },
          })
        }
      }

      const customStages = stages
        .filter((stage) => !usedStageIds.has(stage.id))
        .sort((a, b) => a.stageOrder - b.stageOrder || a.createdAt.getTime() - b.createdAt.getTime())

      for (const [index, customStage] of customStages.entries()) {
        await tx.productStage.update({
          where: { id: customStage.id },
          data: { stageOrder: templates.length + index },
        })
      }
    }
  })
}
