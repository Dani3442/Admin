import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { DashboardMetricsCards } from '@/components/dashboard/MetricsCards'
import { DashboardCharts } from '@/components/dashboard/Charts'
import { RiskList } from '@/components/dashboard/RiskList'
import { Recommendations } from '@/components/dashboard/Recommendations'
import { AnalyticsClient } from '@/components/dashboard/AnalyticsClient'
import { recalculateAllRisks } from '@/lib/risk'
import { addDays } from 'date-fns'
import { detectStageOverlaps } from '@/lib/utils'
import { InfoPopover } from '@/components/ui/InfoPopover'

async function getDashboardData() {
  // Recalculate risks on every page load
  await recalculateAllRisks()

  const now = new Date()
  const in7 = addDays(now, 7)
  const in14 = addDays(now, 14)
  const in30 = addDays(now, 30)

  const [total, inProgress, completed, atRisk, delayed, planned, dueSoon7, dueSoon14, dueSoon30, products, stageTemplates] = await Promise.all([
    prisma.product.count({ where: { isArchived: false } }),
    prisma.product.count({ where: { isArchived: false, status: 'IN_PROGRESS' } }),
    prisma.product.count({ where: { isArchived: false, status: 'COMPLETED' } }),
    prisma.product.count({ where: { isArchived: false, status: 'AT_RISK' } }),
    prisma.product.count({ where: { isArchived: false, status: 'DELAYED' } }),
    prisma.product.count({ where: { isArchived: false, status: 'PLANNED' } }),
    prisma.product.count({ where: { isArchived: false, finalDate: { gte: now, lte: in7 } } }),
    prisma.product.count({ where: { isArchived: false, finalDate: { gte: now, lte: in14 } } }),
    prisma.product.count({ where: { isArchived: false, finalDate: { gte: now, lte: in30 } } }),
    prisma.product.findMany({
      where: { isArchived: false },
      include: {
        stages: { orderBy: { stageOrder: 'asc' } },
        responsible: { select: { id: true, name: true } },
      },
      orderBy: [{ riskScore: 'desc' }, { finalDate: 'asc' }],
    }),
    prisma.stageTemplate.findMany({ orderBy: { order: 'asc' } }),
  ])

  // Stage bottleneck analysis
  const stageDelayCounts: Record<string, number> = {}
  stageTemplates.forEach((t) => { stageDelayCounts[t.name] = 0 })

  let totalDeviation = 0
  let deviationCount = 0

  const atRiskProducts: Array<any> = []
  const responsibleMap: Record<string, { name: string; total: number; atRisk: number; completed: number }> = {}
  const countryMap: Record<string, { total: number; completed: number }> = {}

  for (const product of products) {
    // Country stats
    const country = product.country || 'Не указано'
    if (!countryMap[country]) countryMap[country] = { total: 0, completed: 0 }
    countryMap[country].total++
    if (product.status === 'COMPLETED') countryMap[country].completed++

    // Responsible stats
    const respName = product.responsible?.name || 'Не назначен'
    if (!responsibleMap[respName]) responsibleMap[respName] = { name: respName, total: 0, atRisk: 0, completed: 0 }
    responsibleMap[respName].total++
    if (['AT_RISK', 'DELAYED'].includes(product.status)) responsibleMap[respName].atRisk++
    if (product.status === 'COMPLETED') responsibleMap[respName].completed++

    let riskScore = 0
    if (product.finalDate) {
      const daysLeft = Math.round((product.finalDate.getTime() - now.getTime()) / 86400000)
      if (daysLeft < 0) riskScore += 50
      else if (daysLeft < 7) riskScore += 30
      else if (daysLeft < 14) riskScore += 15
    }

    for (const stage of product.stages) {
      if (stage.dateValue && !stage.isCompleted && stage.dateValue < now) {
        const daysLate = Math.round((now.getTime() - stage.dateValue.getTime()) / 86400000)
        stageDelayCounts[stage.stageName] = (stageDelayCounts[stage.stageName] || 0) + 1
        riskScore += stage.isCritical ? 15 : 10
        totalDeviation += daysLate
        deviationCount++
      }
    }

    // Detect date overlaps for this product
    const riskReasons: string[] = []
    if (product.finalDate) {
      const daysLeft = Math.round((product.finalDate.getTime() - now.getTime()) / 86400000)
      if (daysLeft < 0) riskReasons.push('Финальная дата просрочена')
      else if (daysLeft < 7) riskReasons.push('Финальная дата через ' + daysLeft + ' дн.')
    }
    const { overlaps } = detectStageOverlaps(product.stages)
    for (const overlap of overlaps) {
      riskReasons.push(`Пересечение: ${overlap.fromName?.slice(0, 20)} → ${overlap.toName?.slice(0, 20)}`)
    }
    const overdueStages = product.stages.filter((s) => s.dateValue && !s.isCompleted && s.dateValue < now)
    if (overdueStages.length > 0) {
      riskReasons.push(`${overdueStages.length} просроч. этап(ов)`)
    }

    if (riskScore > 25) {
      atRiskProducts.push({
        id: product.id,
        name: product.name,
        riskScore: Math.min(riskScore, 100),
        finalDate: product.finalDate,
        status: product.status,
        responsible: product.responsible?.name,
        progressPercent: product.progressPercent,
        riskReasons,
      })
    }
  }

  const avgDeviation = deviationCount > 0 ? Math.round(totalDeviation / deviationCount) : 0

  const topBottlenecks = Object.entries(stageDelayCounts)
    .filter(([, c]) => c > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, count]) => ({ name: name.length > 35 ? name.slice(0, 35) + '…' : name, count }))

  const statusData = [
    { name: 'В работе', value: inProgress, color: '#3b82f6' },
    { name: 'Планируется', value: planned, color: '#94a3b8' },
    { name: 'Под риском', value: atRisk, color: '#f59e0b' },
    { name: 'Завершён', value: completed, color: '#10b981' },
    { name: 'Задержка', value: delayed, color: '#ef4444' },
  ]

  // Progress distribution
  const bucketLabels = ['0-20%', '20-40%', '40-60%', '60-80%', '80-100%']
  const progressBuckets = bucketLabels.map((label, i) => ({
    range: label,
    count: products.filter((p) => p.progressPercent >= i * 20 && p.progressPercent < (i + 1) * 20).length,
  }))

  const recommendations: string[] = []
  if (atRiskProducts.length > 0) {
    recommendations.push(`⚠️ ${atRiskProducts.length} продукт(ов) под риском — уделите им внимание в первую очередь`)
  }
  if (topBottlenecks[0]) {
    recommendations.push(`🔴 «${topBottlenecks[0].name}» — самое частое узкое место (${topBottlenecks[0].count} задержек)`)
  }
  if (avgDeviation > 3) {
    recommendations.push(`📅 Среднее отклонение от дат: ${avgDeviation} дней — пересмотрите нормативы`)
  }
  if (dueSoon7 > 0) {
    recommendations.push(`🚀 ${dueSoon7} продукт(ов) завершаются в течение 7 дней — проверьте готовность`)
  }
  if (delayed > 0) {
    recommendations.push(`❌ ${delayed} продукт(ов) просрочены — требуется срочное решение`)
  }
  if (recommendations.length === 0) {
    recommendations.push('✅ Все продукты идут по плану — отличная работа!')
  }

  return {
    metrics: {
      total, inProgress, completed, atRisk, delayed, planned,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      avgDaysDeviation: avgDeviation,
      dueSoon7, dueSoon14, dueSoon30,
    },
    topBottlenecks,
    atRiskProducts: atRiskProducts.sort((a, b) => b.riskScore - a.riskScore).slice(0, 8),
    statusData,
    progressBuckets,
    countryStats: Object.entries(countryMap).map(([country, stats]) => ({ country, ...stats })).sort((a, b) => b.total - a.total),
    responsibleStats: Object.values(responsibleMap).sort((a, b) => b.total - a.total),
    recommendations,
  }
}

export default async function DashboardPage() {
  const data = await getDashboardData()

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold text-slate-900">Дашборд</h1>
        <InfoPopover title="Что на этом экране">
          <p>Сводка по всем продуктам: статусы, риски, сроки и узкие места.</p>
          <p>Карточки сверху показывают ключевые метрики, а ниже идут графики и список самых проблемных продуктов.</p>
          <p>Если продукт попал в блок риска, значит у него просрочены этапы, есть пересечения дат или горит финальный срок.</p>
        </InfoPopover>
      </div>

      <DashboardMetricsCards metrics={data.metrics} />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <DashboardCharts statusData={data.statusData} topBottlenecks={data.topBottlenecks} />
        </div>
        <div>
          <Recommendations items={data.recommendations} />
        </div>
      </div>

      <RiskList products={data.atRiskProducts} />

      <AnalyticsClient data={{
        metrics: data.metrics,
        statusData: data.statusData,
        topBottlenecks: data.topBottlenecks,
        progressBuckets: data.progressBuckets,
        countryStats: data.countryStats,
        responsibleStats: data.responsibleStats,
      }} showHeader={false} />
    </div>
  )
}
