import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { differenceInDays, addDays } from 'date-fns'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  const in7 = addDays(now, 7)
  const in14 = addDays(now, 14)
  const in30 = addDays(now, 30)

  const [
    total,
    inProgress,
    completed,
    atRisk,
    delayed,
    planned,
    dueSoon7,
    dueSoon14,
    dueSoon30,
    stageTemplates,
    products,
  ] = await Promise.all([
    prisma.product.count({ where: { isArchived: false } }),
    prisma.product.count({ where: { isArchived: false, status: 'IN_PROGRESS' } }),
    prisma.product.count({ where: { isArchived: false, status: 'COMPLETED' } }),
    prisma.product.count({ where: { isArchived: false, status: 'AT_RISK' } }),
    prisma.product.count({ where: { isArchived: false, status: 'DELAYED' } }),
    prisma.product.count({ where: { isArchived: false, status: 'PLANNED' } }),
    prisma.product.count({ where: { isArchived: false, finalDate: { gte: now, lte: in7 } } }),
    prisma.product.count({ where: { isArchived: false, finalDate: { gte: now, lte: in14 } } }),
    prisma.product.count({ where: { isArchived: false, finalDate: { gte: now, lte: in30 } } }),
    prisma.stageTemplate.findMany({
      select: {
        id: true,
        name: true,
        order: true,
      },
      orderBy: { order: 'asc' },
    }),
    prisma.product.findMany({
      where: { isArchived: false },
      include: {
        stages: { orderBy: { stageOrder: 'asc' } },
        responsible: { select: { id: true, name: true } },
      },
    }),
  ])

  // Stage bottleneck analysis
  const stageDelayCounts: Record<string, number> = {}
  stageTemplates.forEach((t) => { stageDelayCounts[t.name] = 0 })

  let totalDeviation = 0
  let deviationCount = 0

  const atRiskProducts: Array<{ id: string; name: string; riskScore: number; finalDate: Date | null }> = []

  for (const product of products) {
    let riskScore = 0

    if (product.finalDate) {
      const daysLeft = differenceInDays(product.finalDate, now)
      if (daysLeft < 0) riskScore += 50
      else if (daysLeft < 7) riskScore += 30
      else if (daysLeft < 14) riskScore += 15
    }

    for (const stage of product.stages) {
      if (stage.dateValue && !stage.isCompleted) {
        const daysLate = differenceInDays(now, stage.dateValue)
        if (daysLate > 0) {
          stageDelayCounts[stage.stageName] = (stageDelayCounts[stage.stageName] || 0) + 1
          riskScore += stage.isCritical ? 15 : 10
          totalDeviation += daysLate
          deviationCount++
        }
      }
    }

    if (riskScore > 40) {
      atRiskProducts.push({
        id: product.id,
        name: product.name,
        riskScore: Math.min(riskScore, 100),
        finalDate: product.finalDate,
      })
    }
  }

  const avgDeviation = deviationCount > 0 ? Math.round(totalDeviation / deviationCount) : 0

  // Top bottleneck stages
  const topBottlenecks = Object.entries(stageDelayCounts)
    .filter(([, count]) => count > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5)
    .map(([name, count]) => ({ name, count }))

  // Completion by country
  const countryStats: Record<string, { total: number; completed: number }> = {}
  for (const product of products) {
    const c = product.country || 'Не указано'
    if (!countryStats[c]) countryStats[c] = { total: 0, completed: 0 }
    countryStats[c].total++
    if (product.status === 'COMPLETED') countryStats[c].completed++
  }

  // Progress distribution
  const progressBuckets = [0, 0, 0, 0, 0]
  for (const p of products) {
    const bucket = Math.min(Math.floor(p.progressPercent / 20), 4)
    progressBuckets[bucket]++
  }

  // Responsible stats
  const responsibleStats: Record<string, { total: number; atRisk: number; completed: number }> = {}
  for (const p of products) {
    const name = p.responsible?.name || 'Не назначен'
    if (!responsibleStats[name]) responsibleStats[name] = { total: 0, atRisk: 0, completed: 0 }
    responsibleStats[name].total++
    if (p.status === 'AT_RISK' || p.status === 'DELAYED') responsibleStats[name].atRisk++
    if (p.status === 'COMPLETED') responsibleStats[name].completed++
  }

  const recommendations = generateRecommendations({
    atRiskProducts,
    topBottlenecks,
    avgDeviation,
    dueSoon7,
    delayed,
  })

  return NextResponse.json({
    metrics: {
      total,
      inProgress,
      completed,
      atRisk,
      delayed,
      planned,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      avgDaysDeviation: avgDeviation,
      overdueCount: atRiskProducts.length,
      dueSoon7,
      dueSoon14,
      dueSoon30,
    },
    topBottlenecks,
    atRiskProducts: atRiskProducts.sort((a, b) => b.riskScore - a.riskScore).slice(0, 10),
    countryStats: Object.entries(countryStats).map(([country, stats]) => ({ country, ...stats })),
    progressBuckets: progressBuckets.map((count, i) => ({
      range: `${i * 20}-${(i + 1) * 20}%`,
      count,
    })),
    responsibleStats: Object.entries(responsibleStats).map(([name, stats]) => ({ name, ...stats })),
    recommendations,
  })
}

function generateRecommendations(data: {
  atRiskProducts: Array<{ id: string; name: string; riskScore: number }>
  topBottlenecks: Array<{ name: string; count: number }>
  avgDeviation: number
  dueSoon7: number
  delayed: number
}): string[] {
  const recs: string[] = []

  if (data.atRiskProducts.length > 0) {
    recs.push(`⚠️ ${data.atRiskProducts.length} продукт(ов) под риском срыва сроков — уделите им внимание в первую очередь`)
  }
  if (data.topBottlenecks[0]) {
    recs.push(`🔴 Этап «${data.topBottlenecks[0].name}» — самое частое узкое место (${data.topBottlenecks[0].count} задержек)`)
  }
  if (data.avgDeviation > 3) {
    recs.push(`📅 Среднее отклонение от плановых дат составляет ${data.avgDeviation} дней — рассмотрите корректировку нормативов`)
  }
  if (data.dueSoon7 > 0) {
    recs.push(`🚀 ${data.dueSoon7} продукт(ов) должны завершиться в течение 7 дней — проверьте их готовность`)
  }
  if (data.delayed > 0) {
    recs.push(`❌ ${data.delayed} продукт(ов) уже просрочены — требуется срочное вмешательство`)
  }
  if (recs.length === 0) {
    recs.push('✅ Все продукты идут по плану')
  }

  return recs
}
