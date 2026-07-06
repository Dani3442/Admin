import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseDateOnly } from '@/lib/date-only'
import { fillMissingSequentialStageDates } from '@/lib/stage-schedule'
import { createProductTemplateStageCompat } from '@/lib/product-template-stage-compat'
import {
  supportsProductTemplateStageAutoshiftColumn,
  supportsProductTemplateStageDurationDaysColumn,
  supportsProductTemplateStageStartRulesColumns,
  supportsProductTemplateSubStagesTable,
} from '@/lib/schema-compat'
import {
  normalizeStageStartDelayDays,
  normalizeStageStartReferenceOrder,
  normalizeStageStartTrigger,
} from '@/lib/stage-start-rules'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'
import { sanitizeDeepStrings, sanitizeTextValue } from '@/lib/input-security'
import { canManageProducts } from '@/lib/product-access'
import {
  deleteInheritedProductNotificationsForTemplate,
  normalizeTemplateTelegramNotifications,
  saveTemplateTelegramNotifications,
  syncTemplateTelegramNotificationsToProducts,
  templateTelegramNotificationInclude,
} from '@/lib/template-telegram-notifications'
import {
  createProductTemplateSubStages,
  normalizeTemplateSubStages,
  templateSubStageSelect,
  type TemplateSubStagePayload,
} from '@/lib/template-substages'

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
  startTrigger: string
  startDelayDays: number
  startReferenceStageOrder: number | null
  subStages: TemplateSubStagePayload[]
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!canManageProducts(session.user as any)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = (session.user as any).id
  const rateLimit = consumeRateLimit({
    key: `api:product-templates:update:${userId}:${getClientIpFromHeaders(req.headers)}`,
    limit: 20,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  try {
    const { id } = await params
    const body = sanitizeDeepStrings(await req.json(), { preserveNewlines: true }) as any
    const [hasDurationDaysColumn, hasAutoshiftColumn, hasStartRulesColumns, hasTemplateSubStagesTable] = await Promise.all([
      supportsProductTemplateStageDurationDaysColumn(),
      supportsProductTemplateStageAutoshiftColumn(),
      supportsProductTemplateStageStartRulesColumns(),
      supportsProductTemplateSubStagesTable(),
    ])
    const templateName = sanitizeTextValue(body?.name, { maxLength: 160 })
    const description = sanitizeTextValue(body?.description, { preserveNewlines: true, maxLength: 1000 })
    const rawStages = Array.isArray(body?.stages) ? body.stages : []

    if (!templateName) {
      return NextResponse.json({ error: 'Укажите название шаблона' }, { status: 400 })
    }

    const preparedStages: TemplateStagePayload[] =
      rawStages
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
          startTrigger: normalizeStageStartTrigger(stage?.startTrigger, index),
          startDelayDays: normalizeStageStartDelayDays(stage?.startDelayDays),
          startReferenceStageOrder: normalizeStageStartReferenceOrder(stage?.startReferenceStageOrder),
          subStages: normalizeTemplateSubStages(stage?.subStages),
          }))
        .filter((stage: { stageName: string }) => stage.stageName)
    const stages = fillMissingSequentialStageDates(preparedStages)

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

    const notificationSettings = normalizeTemplateTelegramNotifications(
      body?.telegramNotificationSettings,
      stages.length
    )

    const template = await prisma.$transaction(async (tx) => {
      const existing = await tx.productTemplate.findUnique({
        where: { id },
        select: { id: true },
      })

      if (!existing) {
        throw new Error('Шаблон этапов не найден')
      }

      const existingStageTemplates = await tx.stageTemplate.findMany({
        select: {
          id: true,
          name: true,
          order: true,
          createdAt: true,
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      })

      let nextOrder = (existingStageTemplates.at(-1)?.order ?? -1) + 1

      const resolvedStages: Array<{
        stageTemplateId: string
        stageOrder: number
        stageName: string
        plannedDate: Date | null
        durationDays: number | null
        participatesInAutoshift: boolean
        startTrigger: string
        startDelayDays: number
        startReferenceStageOrder: number | null
        subStages: TemplateSubStagePayload[]
      }> = []

      for (const stage of stages) {
        let stageTemplate = existingStageTemplates.find(
          (existingTemplate) =>
            existingTemplate.name.trim().toLowerCase() === stage.stageName.toLowerCase()
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
              createdAt: true,
            },
          })
          existingStageTemplates.push(stageTemplate)
          nextOrder += 1
        }

        resolvedStages.push({
          stageTemplateId: stageTemplate.id,
          stageOrder: stage.stageOrder,
          stageName: stage.stageName,
          plannedDate: stage.plannedDate,
          durationDays: stage.durationDays ?? null,
          participatesInAutoshift: stage.participatesInAutoshift,
          startTrigger: normalizeStageStartTrigger(stage.startTrigger, stage.stageOrder),
          startDelayDays: normalizeStageStartDelayDays(stage.startDelayDays),
          startReferenceStageOrder: normalizeStageStartReferenceOrder(stage.startReferenceStageOrder),
          subStages: stage.subStages,
        })
      }

      await tx.productTemplate.update({
        where: { id },
        data: {
          name: templateName,
          description: description || null,
        },
      })

      await deleteInheritedProductNotificationsForTemplate(tx as any, id)

      await tx.productTemplateStage.deleteMany({
        where: { productTemplateId: id },
      })

      const createdTemplateStages = []

      for (const stage of resolvedStages) {
        const createdStage = await createProductTemplateStageCompat(tx as any, {
          productTemplateId: id,
          stageTemplateId: stage.stageTemplateId,
          stageOrder: stage.stageOrder,
          stageName: stage.stageName,
          plannedDate: stage.plannedDate,
          durationDays: stage.durationDays,
          participatesInAutoshift: stage.participatesInAutoshift,
          startTrigger: stage.startTrigger,
          startDelayDays: stage.startDelayDays,
          startReferenceStageOrder: stage.startReferenceStageOrder,
        })
        createdTemplateStages.push(createdStage)
        if (hasTemplateSubStagesTable && stage.subStages.length > 0) {
          await createProductTemplateSubStages(tx as any, createdStage.id, stage.subStages)
        }
      }

      await saveTemplateTelegramNotifications(
        tx as any,
        id,
        createdTemplateStages,
        notificationSettings
      )

      await syncTemplateTelegramNotificationsToProducts(tx as any, id)

      return tx.productTemplate.findUniqueOrThrow({
        where: { id },
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
              ...(hasAutoshiftColumn ? { participatesInAutoshift: true } : {}),
              ...(hasStartRulesColumns
                ? {
                    startTrigger: true,
                    startDelayDays: true,
                    startReferenceStageOrder: true,
                  }
                : {}),
              stageTemplate: {
                select: {
                  durationDays: true,
                },
              },
              telegramNotificationSettings: {
                orderBy: { createdAt: 'desc' },
                include: templateTelegramNotificationInclude,
              },
              ...(hasTemplateSubStagesTable
                ? {
                    subStages: {
                      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
                      select: templateSubStageSelect,
                    },
                  }
                : {}),
            },
          },
        },
      })
    })

    revalidatePath('/products')
    revalidatePath('/products/new')
    revalidatePath('/table')

    return NextResponse.json({
      ...template,
      stages: template.stages.map((stage) => ({
        id: stage.id,
        stageTemplateId: stage.stageTemplateId,
        stageOrder: stage.stageOrder,
        stageName: stage.stageName,
        plannedDate: stage.plannedDate,
        durationDays: hasDurationDaysColumn ? (stage as any).durationDays ?? null : null,
        stageTemplateDurationDays: stage.stageTemplate.durationDays ?? null,
        participatesInAutoshift: hasAutoshiftColumn ? (stage as any).participatesInAutoshift ?? true : true,
        startTrigger: normalizeStageStartTrigger((stage as any).startTrigger, stage.stageOrder),
        startDelayDays: normalizeStageStartDelayDays((stage as any).startDelayDays),
        startReferenceStageOrder: normalizeStageStartReferenceOrder((stage as any).startReferenceStageOrder),
        subStages: hasTemplateSubStagesTable ? (stage as any).subStages ?? [] : [],
        telegramNotificationSettings: stage.telegramNotificationSettings,
      })),
    })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Не удалось обновить шаблон этапов'

    return NextResponse.json(
      { error: message },
      { status: message === 'Шаблон этапов не найден' ? 404 : 500 }
    )
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const userId = (session.user as any).id
  const rateLimit = consumeRateLimit({
    key: `api:product-templates:delete:${userId}:${getClientIpFromHeaders(req.headers)}`,
    limit: 20,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } }
    )
  }

  try {
    const { id } = await params

    const existingTemplate = await prisma.productTemplate.findUnique({
      where: { id },
      select: { id: true },
    })

    if (!existingTemplate) {
      return NextResponse.json({ error: 'Шаблон этапов не найден' }, { status: 404 })
    }

    await prisma.productTemplate.delete({
      where: { id },
      select: { id: true },
    })

    revalidatePath('/products')
    revalidatePath('/products/new')
    revalidatePath('/table')

    return NextResponse.json({ success: true, id })
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Не удалось удалить шаблон этапов'

    return NextResponse.json({ error: message }, { status: 500 })
  }
}
