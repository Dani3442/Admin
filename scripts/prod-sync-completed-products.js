const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const apply = process.argv.includes('--apply')

function isStageCompleted(stage) {
  return Boolean(stage.isCompleted || stage.status === 'COMPLETED')
}

function formatProductLine(product) {
  return [
    product.id,
    product.country || 'country:null',
    product.status,
    product.isArchived ? 'archived' : 'active',
    product.name,
  ].join(' | ')
}

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      country: true,
      status: true,
      progressPercent: true,
      isArchived: true,
      closedAt: true,
      closureComment: true,
      archivedAt: true,
      archiveReason: true,
      stages: {
        select: {
          id: true,
          status: true,
          isCompleted: true,
        },
      },
    },
    orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
  })

  const completedProducts = products.filter((product) => {
    if (product.status === 'CANCELLED') return false
    if (product.stages.length === 0) return false
    return product.stages.every(isStageCompleted)
  })

  const needsUpdate = completedProducts.filter(
    (product) =>
      product.status !== 'COMPLETED' ||
      product.progressPercent !== 100 ||
      product.isArchived !== true
  )

  console.log(`Scanned products: ${products.length}`)
  console.log(`Products with all stages completed: ${completedProducts.length}`)
  console.log(`Products to update: ${needsUpdate.length}`)
  console.log(`Mode: ${apply ? 'APPLY' : 'DRY RUN'}`)

  if (needsUpdate.length > 0) {
    console.log('')
    console.log('Products:')
    for (const product of needsUpdate) {
      console.log(`- ${formatProductLine(product)}`)
    }
  }

  if (!apply) {
    console.log('')
    console.log('Dry run only. Run with --apply to update product statuses and archive completed products.')
    return
  }

  const now = new Date()
  let updated = 0

  for (const product of needsUpdate) {
    await prisma.product.update({
      where: { id: product.id },
      data: {
        status: 'COMPLETED',
        progressPercent: 100,
        riskScore: 0,
        isArchived: true,
        closedAt: product.closedAt ?? now,
        closureComment:
          product.closureComment ??
          'Автоматически завершено после закрытия всех этапов',
        archivedAt: product.archivedAt ?? now,
        archiveReason:
          product.archiveReason ??
          'Автоматически отправлено в архив после завершения всех этапов',
      },
      select: { id: true },
    })
    updated += 1
  }

  console.log('')
  console.log(`Updated products: ${updated}`)
}

main()
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
