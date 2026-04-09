import { detectStageOverlaps } from './utils'
import { prisma } from './prisma'
import { supportsProductStageOverlapAcceptedColumn } from './schema-compat'
import { getOverlapAcceptedMapForProducts } from './overlap-acceptance'

/**
 * Recalculates risk scores and statuses for all active products.
 * Called on page loads and after stage updates to keep risk data fresh.
 *
 * Risk factors:
 * - Overdue stages (dateValue in the past, not completed)
 * - Critical overdue stages score higher
 * - Overlapping dates (stage N ends after stage N+1 starts)
 * - Final date approaching or passed
 */
export async function recalculateAllRisks() {
  const now = new Date()
  const hasOverlapAcceptedColumn = await supportsProductStageOverlapAcceptedColumn()

  const products = hasOverlapAcceptedColumn
    ? await prisma.product.findMany({
        where: { isArchived: false },
        select: {
          id: true,
          status: true,
          finalDate: true,
          riskScore: true,
          stages: {
            orderBy: { stageOrder: 'asc' },
            select: {
              id: true,
              stageOrder: true,
              stageName: true,
              dateValue: true,
              isCompleted: true,
              isCritical: true,
              overlapAccepted: true,
            },
          },
        },
      })
    : await prisma.product.findMany({
        where: { isArchived: false },
        select: {
          id: true,
          status: true,
          finalDate: true,
          riskScore: true,
          stages: {
            orderBy: { stageOrder: 'asc' },
            select: {
              id: true,
              stageOrder: true,
              stageName: true,
              dateValue: true,
              isCompleted: true,
              isCritical: true,
            },
          },
        },
      })

  const overlapAcceptedMap = hasOverlapAcceptedColumn
    ? new Map<string, boolean>()
    : await getOverlapAcceptedMapForProducts(products.map((product) => product.id))

  for (const product of products) {
    if (product.status === 'COMPLETED' || product.status === 'CANCELLED') continue

    let riskScore = 0
    const issues: string[] = []

    // 1. Check final date
    if (product.finalDate) {
      const daysLeft = Math.round((product.finalDate.getTime() - now.getTime()) / 86400000)
      if (daysLeft < 0) {
        riskScore += 40
        issues.push('final_overdue')
      } else if (daysLeft <= 7) {
        riskScore += 25
        issues.push('final_soon')
      } else if (daysLeft <= 14) {
        riskScore += 10
      }
    }

    // 2. Check overdue stages
    for (const stage of product.stages) {
      if (stage.isCompleted) continue
      if (!stage.dateValue) continue

      const d = new Date(stage.dateValue)
      if (d < now) {
        const daysLate = Math.round((now.getTime() - d.getTime()) / 86400000)
        if (stage.isCritical) {
          riskScore += Math.min(20, 10 + daysLate)
          issues.push(`critical_overdue:${stage.stageName}`)
        } else {
          riskScore += Math.min(15, 5 + daysLate)
          issues.push(`overdue:${stage.stageName}`)
        }
      }
    }

    const { overlaps } = detectStageOverlaps(
      product.stages.map((stage) => ({
        ...stage,
        overlapAccepted: hasOverlapAcceptedColumn
          ? (stage as any).overlapAccepted ?? false
          : overlapAcceptedMap.get(stage.id) ?? false,
      }))
    )
    for (const overlap of overlaps) {
      riskScore += 15
      issues.push(`overlap:${overlap.names.join('->')}`)
    }

    riskScore = Math.min(riskScore, 100)

    // Determine status based on risk
    let newStatus = product.status
    if (riskScore >= 60) {
      newStatus = 'DELAYED'
    } else if (riskScore >= 30) {
      newStatus = 'AT_RISK'
    } else if (product.status === 'AT_RISK' || product.status === 'DELAYED') {
      // Risk resolved — revert to IN_PROGRESS
      newStatus = 'IN_PROGRESS'
    }

    // Only update if changed
    if (product.riskScore !== riskScore || product.status !== newStatus) {
      await prisma.product.updateMany({
        where: { id: product.id },
        data: { riskScore, status: newStatus },
      })
    }
  }
}

/**
 * Recalculate risk for a single product.
 */
export async function recalculateProductRisk(productId: string) {
  const now = new Date()
  const hasOverlapAcceptedColumn = await supportsProductStageOverlapAcceptedColumn()

  const product = hasOverlapAcceptedColumn
    ? await prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          isArchived: true,
          status: true,
          finalDate: true,
          riskScore: true,
          stages: {
            orderBy: { stageOrder: 'asc' },
            select: {
              id: true,
              stageOrder: true,
              stageName: true,
              dateValue: true,
              isCompleted: true,
              isCritical: true,
              overlapAccepted: true,
            },
          },
        },
      })
    : await prisma.product.findUnique({
        where: { id: productId },
        select: {
          id: true,
          isArchived: true,
          status: true,
          finalDate: true,
          riskScore: true,
          stages: {
            orderBy: { stageOrder: 'asc' },
            select: {
              id: true,
              stageOrder: true,
              stageName: true,
              dateValue: true,
              isCompleted: true,
              isCritical: true,
            },
          },
        },
      })

  if (!product || product.isArchived || product.status === 'COMPLETED' || product.status === 'CANCELLED') return

  let riskScore = 0

  // Final date check
  if (product.finalDate) {
    const daysLeft = Math.round((product.finalDate.getTime() - now.getTime()) / 86400000)
    if (daysLeft < 0) riskScore += 40
    else if (daysLeft <= 7) riskScore += 25
    else if (daysLeft <= 14) riskScore += 10
  }

  // Overdue stages
  for (const stage of product.stages) {
    if (stage.isCompleted || !stage.dateValue) continue
    const d = new Date(stage.dateValue)
    if (d < now) {
      const daysLate = Math.round((now.getTime() - d.getTime()) / 86400000)
      riskScore += stage.isCritical ? Math.min(20, 10 + daysLate) : Math.min(15, 5 + daysLate)
    }
  }

  const overlapAcceptedMap = hasOverlapAcceptedColumn
    ? new Map<string, boolean>()
    : await getOverlapAcceptedMapForProducts([productId])

  const { overlaps } = detectStageOverlaps(
    product.stages.map((stage) => ({
      ...stage,
      overlapAccepted: hasOverlapAcceptedColumn
        ? (stage as any).overlapAccepted ?? false
        : overlapAcceptedMap.get(stage.id) ?? false,
    }))
  )
  for (const overlap of overlaps) {
    riskScore += 15
  }

  riskScore = Math.min(riskScore, 100)

  let newStatus = product.status
  if (riskScore >= 60) newStatus = 'DELAYED'
  else if (riskScore >= 30) newStatus = 'AT_RISK'
  else if (product.status === 'AT_RISK' || product.status === 'DELAYED') newStatus = 'IN_PROGRESS'

  if (product.riskScore !== riskScore || product.status !== newStatus) {
    await prisma.product.updateMany({
      where: { id: product.id },
      data: { riskScore, status: newStatus },
    })
  }
}
