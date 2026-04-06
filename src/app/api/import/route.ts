import { NextRequest, NextResponse } from 'next/server'
import { Prisma } from '@prisma/client'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

interface ImportStage {
  stageName: string
  stageOrder: number
  dateValue?: string | null
  durationDays?: number | null
  comment?: string | null
  isCritical?: boolean
  isCompleted?: boolean
}

interface ImportProduct {
  name: string
  country?: string
  category?: string
  sku?: string
  priority?: string
  notes?: string
  stages?: ImportStage[]
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as any).role
  if (!['ADMIN', 'PRODUCT_MANAGER'].includes(role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const { products }: { products: ImportProduct[] } = body

    if (!Array.isArray(products) || products.length === 0) {
      return NextResponse.json({ error: 'No products to import' }, { status: 400 })
    }

    const stageTemplates = await prisma.stageTemplate.findMany({ orderBy: { order: 'asc' } })
    const templateMap = new Map(stageTemplates.map((t) => [t.name.toLowerCase(), t]))

    const results = {
      created: 0,
      skipped: 0,
      errors: [] as string[],
    }

    for (const prod of products) {
      if (!prod.name?.trim()) {
        results.skipped++
        continue
      }

      try {
        // Check if product already exists
        const exists = await prisma.product.findFirst({
          where: { name: prod.name.trim() },
        })

        if (exists) {
          results.skipped++
          continue
        }

        // Create product with stages
        const stagesData: Prisma.ProductStageUncheckedCreateWithoutProductInput[] = (
          prod.stages || []
        ).map((s) => {
          const template = templateMap.get(s.stageName?.toLowerCase() || '')
          return {
            stageTemplateId: template?.id ?? '',
            stageOrder: s.stageOrder ?? template?.order ?? 999,
            stageName: s.stageName || template?.name || 'Этап',
            dateValue: s.dateValue ? new Date(s.dateValue) : null,
            durationDays: s.durationDays ?? template?.durationDays ?? null,
            comment: s.comment || null,
            isCritical: s.isCritical ?? template?.isCritical ?? false,
            isCompleted: s.isCompleted ?? false,
            affectsFinalDate: template?.affectsFinalDate ?? true,
            participatesInAutoshift: template?.participatesInAutoshift ?? true,
          }
        })

        // If no stages provided, create from templates
        const finalStages: Prisma.ProductStageUncheckedCreateWithoutProductInput[] =
          stagesData.length > 0
            ? stagesData
            : stageTemplates.map((t) => ({
                stageTemplateId: t.id,
                stageOrder: t.order,
                stageName: t.name,
                dateValue: null,
                durationDays: t.durationDays ?? null,
                comment: null,
                isCritical: t.isCritical,
                isCompleted: false,
                affectsFinalDate: t.affectsFinalDate,
                participatesInAutoshift: t.participatesInAutoshift,
              }))

        // Calculate final date from last stage with date
        const datesWithValue = finalStages
          .filter((s) => s.dateValue)
          .map((s) => s.dateValue as Date)
          .sort((a, b) => b.getTime() - a.getTime())
        const finalDate = datesWithValue[0] || null

        await prisma.product.create({
          data: {
            name: prod.name.trim(),
            country: prod.country?.trim() || null,
            category: prod.category?.trim() || null,
            sku: prod.sku?.trim() || null,
            priority: prod.priority || 'MEDIUM',
            notes: prod.notes?.trim() || null,
            status: 'PLANNED',
            finalDate,
            stages: { create: finalStages },
          },
        })

        results.created++
      } catch (err) {
        results.errors.push(`${prod.name}: ${err instanceof Error ? err.message : 'Unknown error'}`)
      }
    }

    return NextResponse.json({
      message: `Импорт завершён: создано ${results.created}, пропущено ${results.skipped}`,
      ...results,
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Import failed' },
      { status: 500 }
    )
  }
}
