import { NextRequest, NextResponse } from 'next/server'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseDateOnly } from '@/lib/date-only'
import { buildSequentialStageSchedule } from '@/lib/stage-schedule'
import { supportsProductTemplateStageDurationDaysColumn } from '@/lib/schema-compat'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'
import { sanitizeDeepStrings, sanitizeTextValue } from '@/lib/input-security'

function normalizeStageName(name: string) {
  return sanitizeTextValue(name, { maxLength: 160 })
}

type TemplateStagePayload = {
  stageOrder: number
  stageName: string
  plannedDate: Date | null
  durationDays: number | null
  participatesInAutoshift: boolean
  stageTemplateDurationDays: number | null
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const hasDurationDaysColumn = await supportsProductTemplateStageDurationDaysColumn()

  const templates = await prisma.productTemplate.findMany({
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      updatedAt: true,
      stages: {
        orderBy: { stageOrder: 'asc' },
        select: {
          id: true,
          stageTemplateId: true,
          stageOrder: true,
          stageName: true,
          plannedDate: true,
          ...(hasDurationDaysColumn ? { durationDays: true } : {}),
          stageTemplate: {
            select: {
              durationDays: true,
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
  })

  return NextResponse.json(
    templates.map((template) => ({
      ...template,
      stages: template.stages.map((stage) => ({
        id: stage.id,
        stageTemplateId: stage.stageTemplateId,
        stageOrder: stage.stageOrder,
        stageName: stage.stageName,
        plannedDate: stage.plannedDate,
        durationDays: hasDurationDaysColumn ? stage.durationDays ?? null : null,
        stageTemplateDurationDays: stage.stageTemplate.durationDays ?? null,
        participatesInAutoshift: true,
      })),
    }))
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = (session.user as any).id
  const rateLimit = consumeRateLimit({
    key: `api:product-templates:create:${userId}:${getClientIpFromHeaders(req.headers)}`,
    limit: 20,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  try {
    const body = sanitizeDeepStrings(await req.json(), { preserveNewlines: true }) as any
    const hasDurationDaysColumn = await supportsProductTemplateStageDurationDaysColumn()
    const templateName = sanitizeTextValue(body?.name, { maxLength: 160 })
    const description = sanitizeTextValue(body?.description, { preserveNewlines: true, maxLength: 1000 })
    const rawStages = Array.isArray(body?.stages) ? body.stages : []

    const stages: TemplateStagePayload[] = rawStages
      .map((stage: any, index: number) => ({
        stageOrder: index,
        stageName: normalizeStageName(String(stage?.stageName || '')),
        plannedDate: parseDateOnly(stage?.plannedDate),
        durationDays:
          typeof stage?.durationDays === 'number' && Number.isFinite(stage.durationDays)
            ? Math.max(1, Math.floor(stage.durationDays))
            : null,
        participatesInAutoshift: stage?.participatesInAutoshift !== false,
        stageTemplateDurationDays: null,
      }))
      .filter((stage: { stageName: string }) => stage.stageName)

    if (!templateName) {
      return NextResponse.json({ error: 'Укажите название шаблона' }, { status: 400 })
    }

    if (stages.length === 0) {
      return NextResponse.json({ error: 'Добавьте хотя бы один этап в шаблон' }, { status: 400 })
    }

    const duplicateNames = new Set<string>()
    const usedNames = new Set<string>()
    for (const stage of stages) {
      const key = stage.stageName.toLowerCase()
      if (usedNames.has(key)) duplicateNames.add(stage.stageName)
      usedNames.add(key)
    }

    if (duplicateNames.size > 0) {
      return NextResponse.json(
        { error: `Повторяются этапы: ${Array.from(duplicateNames).join(', ')}` },
        { status: 400 }
      )
    }

    const template = await prisma.$transaction(async (tx) => {
      const existingStageTemplates = await tx.stageTemplate.findMany({
        select: {
          id: true,
          name: true,
          order: true,
          durationText: true,
          durationDays: true,
          isCritical: true,
          affectsFinalDate: true,
          createdAt: true,
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      })

      let nextOrder = (existingStageTemplates.at(-1)?.order ?? -1) + 1

      const scheduledStages = buildSequentialStageSchedule(stages)

      const resolvedStages: Array<{
        stageTemplateId: string
        stageOrder: number
        stageName: string
        plannedDate: Date | null
        durationDays: number | null
      }> = scheduledStages.map((stage) => ({
        stageTemplateId: '',
        stageOrder: stage.stageOrder,
        stageName: stage.stageName,
        plannedDate: stage.plannedDate,
        durationDays: stage.durationDays ?? null,
      }))

      for (const stage of resolvedStages) {
        let stageTemplate = existingStageTemplates.find(
          (existing) => existing.name.trim().toLowerCase() === stage.stageName.toLowerCase()
        )

        if (!stageTemplate) {
          stageTemplate = await tx.stageTemplate.create({
            data: {
              name: stage.stageName,
              order: nextOrder,
              durationText: null,
              durationDays: null,
              isCritical: false,
              affectsFinalDate: true,
            },
            select: {
              id: true,
              name: true,
              order: true,
              durationText: true,
              durationDays: true,
              isCritical: true,
              affectsFinalDate: true,
              createdAt: true,
            },
          })
          existingStageTemplates.push(stageTemplate)
          nextOrder += 1
        }

        ;(stage as any).stageTemplateId = stageTemplate.id
      }

      const createdTemplate = await tx.productTemplate.create({
        data: {
          name: templateName,
          description: description || null,
          stages: {
            create: resolvedStages.map((stage: any) => ({
              stageTemplateId: stage.stageTemplateId,
              stageOrder: stage.stageOrder,
              stageName: stage.stageName,
              plannedDate: stage.plannedDate,
              ...(hasDurationDaysColumn ? { durationDays: stage.durationDays ?? null } : {}),
            })),
          },
        },
      })

      return tx.productTemplate.findUniqueOrThrow({
        where: { id: createdTemplate.id },
        include: {
          stages: {
            orderBy: { stageOrder: 'asc' },
            select: {
              id: true,
              stageTemplateId: true,
              stageOrder: true,
              stageName: true,
              plannedDate: true,
              ...(hasDurationDaysColumn ? { durationDays: true } : {}),
              stageTemplate: {
                select: {
                  durationDays: true,
                },
              },
            },
          },
        },
      })
    })

    return NextResponse.json({
      ...template,
      stages: template.stages.map((stage) => ({
        id: stage.id,
        stageTemplateId: stage.stageTemplateId,
        stageOrder: stage.stageOrder,
        stageName: stage.stageName,
        plannedDate: stage.plannedDate,
        durationDays: hasDurationDaysColumn ? stage.durationDays ?? null : null,
        stageTemplateDurationDays: stage.stageTemplate.durationDays ?? null,
        participatesInAutoshift: true,
      })),
    }, { status: 201 })
  } catch (error) {
    console.error('[product-templates:create] Failed to create template', error)
    return NextResponse.json({ error: 'Не удалось создать шаблон этапов' }, { status: 500 })
  }
}
