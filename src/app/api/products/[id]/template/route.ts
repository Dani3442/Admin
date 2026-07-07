import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { parseDateOnly } from '@/lib/date-only'
import { createProductStageCompat } from '@/lib/product-stage-compat'
import { recalculateProductDerivedFields } from '@/lib/product-derived-fields'
import { recalculateProductRisk } from '@/lib/risk'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'
import { sanitizeDeepStrings, sanitizeTextValue } from '@/lib/input-security'
import { canManageProducts } from '@/lib/product-access'
import { applyTemplateTelegramNotificationsToProduct } from '@/lib/template-telegram-notifications'
import { processDueStageStartsForProduct } from '@/lib/stage-workflow'
import {
  supportsProductSubStageResponsibleColumn,
  supportsProductTemplateSubStagesTable,
} from '@/lib/schema-compat'
import {
  getInitialStageAutoStartAt,
  normalizeStageStartDelayDays,
  normalizeStageStartReferenceOrder,
  normalizeStageStartTrigger,
} from '@/lib/stage-start-rules'
import { templateSubStageSelect } from '@/lib/template-substages'

const stageSelect = {
  id: true,
  productId: true,
  stageTemplateId: true,
  stageOrder: true,
  stageName: true,
  description: true,
  dateValue: true,
  dateRaw: true,
  dateEnd: true,
  durationDays: true,
  status: true,
  isCompleted: true,
  isCritical: true,
  participatesInAutoshift: true,
  affectsFinalDate: true,
  responsibleId: true,
  comment: true,
  priority: true,
  startDate: true,
  endDate: true,
  plannedDate: true,
  autoStartAt: true,
  startTrigger: true,
  startDelayDays: true,
  startReferenceStageOrder: true,
  actualDate: true,
  daysDeviation: true,
  createdAt: true,
  updatedAt: true,
  stageTemplate: {
    select: {
      id: true,
      name: true,
      order: true,
      durationText: true,
      durationDays: true,
      isCritical: true,
      affectsFinalDate: true,
    },
  },
  responsible: { select: { id: true, name: true } },
  subStages: {
    orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
    select: {
      id: true,
      stageId: true,
      name: true,
      description: true,
      responsibleId: true,
      status: true,
      startDate: true,
      endDate: true,
      sortOrder: true,
      createdAt: true,
      updatedAt: true,
      telegramNotificationSettings: {
        orderBy: { createdAt: 'desc' as const },
        include: { recipient: true },
      },
    },
  },
  telegramNotificationSettings: {
    orderBy: { createdAt: 'desc' as const },
    include: { recipient: true },
  },
}

async function ensureSubStageNotificationSetting(
  tx: any,
  input: {
    productId: string
    stageId: string
    subStageId: string
    responsibleId: string | null
    eventType: 'substage_completed'
    recipientType?: 'user' | 'chat' | string | null
    recipientId?: string | null
    messageTemplate: string
    customMessage?: string | null
    isEnabled: boolean
  }
) {
  if (input.recipientType === 'responsible') {
    const existing = await tx.telegramNotificationSetting.findFirst({
      where: {
        productId: input.productId,
        stageId: input.stageId,
        subStageId: input.subStageId,
        eventType: input.eventType,
      },
      select: { id: true },
    })
    const data = {
      recipientType: 'responsible',
      recipientId: null,
      messageTemplate: input.messageTemplate,
      customMessage: input.customMessage || null,
      isEnabled: input.isEnabled,
    }
    if (existing) {
      await tx.telegramNotificationSetting.update({
        where: { id: existing.id },
        data,
      })
      return
    }

    await tx.telegramNotificationSetting.create({
      data: {
        productId: input.productId,
        stageId: input.stageId,
        subStageId: input.subStageId,
        eventType: input.eventType,
        ...data,
      },
    })
    return
  }

  const recipient = input.recipientId
    ? await tx.telegramRecipient.findFirst({
        where: { id: input.recipientId },
        select: { id: true, type: true },
      })
    : input.responsibleId
      ? await tx.telegramRecipient.findFirst({
          where: { type: 'user', userId: input.responsibleId },
          select: { id: true, type: true },
        })
      : null
  if (!recipient) return
  const recipientType = recipient.type === 'chat' ? 'chat' : 'user'

  const existing = await tx.telegramNotificationSetting.findFirst({
    where: {
      productId: input.productId,
      stageId: input.stageId,
      subStageId: input.subStageId,
      eventType: input.eventType,
    },
    select: { id: true },
  })
  if (existing) {
    await tx.telegramNotificationSetting.update({
      where: { id: existing.id },
      data: {
        recipientType,
        recipientId: recipient.id,
        messageTemplate: input.messageTemplate,
        customMessage: input.customMessage || null,
        isEnabled: input.isEnabled,
      },
    })
    return
  }

  await tx.telegramNotificationSetting.create({
    data: {
      productId: input.productId,
      stageId: input.stageId,
      subStageId: input.subStageId,
      eventType: input.eventType,
      recipientType,
      recipientId: recipient.id,
      messageTemplate: input.messageTemplate,
      customMessage: input.customMessage || null,
      isEnabled: input.isEnabled,
    },
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = session.user as any
  if (!canManageProducts(user)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rateLimit = consumeRateLimit({
    key: `api:products:apply-template:${user.id}:${getClientIpFromHeaders(req.headers)}`,
    limit: 30,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  try {
    const { id: productId } = await params
    const body = sanitizeDeepStrings(await req.json(), { preserveNewlines: true }) as any
    const productTemplateId = sanitizeTextValue(body?.productTemplateId, { maxLength: 128 })
    const country = Object.prototype.hasOwnProperty.call(body || {}, 'country')
      ? sanitizeTextValue(body?.country, { maxLength: 80 }) || null
      : undefined
    const resetNotificationOverrides = Boolean(body?.resetNotificationOverrides)
    const [hasTemplateSubStagesTable, hasProductSubStageResponsibleColumn] = await Promise.all([
      supportsProductTemplateSubStagesTable(),
      supportsProductSubStageResponsibleColumn(),
    ])

    if (!productTemplateId) {
      return NextResponse.json({ error: 'Выберите шаблон' }, { status: 400 })
    }

    await prisma.$transaction(async (tx) => {
      const [product, template] = await Promise.all([
        tx.product.findUnique({
          where: { id: productId },
          select: {
            id: true,
            createdAt: true,
            isArchived: true,
            stages: {
              select: {
                id: true,
                stageOrder: true,
                status: true,
                isCompleted: true,
                startDate: true,
                endDate: true,
                subStages: hasTemplateSubStagesTable
                  ? {
                      orderBy: [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }],
                      select: { id: true, name: true, sortOrder: true },
                    }
                  : false,
              },
            },
          },
        }),
        tx.productTemplate.findUnique({
          where: { id: productTemplateId },
          select: {
            id: true,
            stages: {
              orderBy: { stageOrder: 'asc' },
              select: {
                id: true,
                stageTemplateId: true,
                stageOrder: true,
                stageName: true,
                plannedDate: true,
                durationDays: true,
                participatesInAutoshift: true,
                startTrigger: true,
                startDelayDays: true,
                startReferenceStageOrder: true,
                stageTemplate: {
                  select: {
                    isCritical: true,
                    affectsFinalDate: true,
                    durationDays: true,
                  },
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
        }),
      ])

      if (!product || product.isArchived) {
        throw new Error('Продукт не найден')
      }

      if (!template) {
        throw new Error('Шаблон этапов не найден')
      }

      await tx.product.update({
        where: { id: productId },
        data: {
          productTemplateId: template.id,
          ...(country !== undefined ? { country } : {}),
        },
        select: { id: true },
      })

      const oldStageIds = product.stages.map((stage) => stage.id)
      if (oldStageIds.length > 0) {
        await tx.comment.updateMany({
          where: { productStageId: { in: oldStageIds } },
          data: { productStageId: null },
        })

        await tx.changeHistory.updateMany({
          where: { productStageId: { in: oldStageIds } },
          data: { productStageId: null },
        })

        await tx.productStage.deleteMany({
          where: { productId },
        })
      }

      const stageIdByTemplateStageId = new Map<string, string>()

      for (const templateStage of template.stages) {
        const plannedDate = parseDateOnly(templateStage.plannedDate)
        const durationDays = templateStage.durationDays ?? templateStage.stageTemplate.durationDays ?? null
        const startTrigger = normalizeStageStartTrigger(templateStage.startTrigger, templateStage.stageOrder)
        const startDelayDays = normalizeStageStartDelayDays(templateStage.startDelayDays)
        const startReferenceStageOrder = normalizeStageStartReferenceOrder(templateStage.startReferenceStageOrder)
        const createdStage = await createProductStageCompat(tx as any, {
          productId,
          stageTemplateId: templateStage.stageTemplateId,
          stageOrder: templateStage.stageOrder,
          stageName: templateStage.stageName,
          dateValue: plannedDate,
          plannedDate,
          durationDays,
          isCritical: templateStage.stageTemplate.isCritical,
          affectsFinalDate: templateStage.stageTemplate.affectsFinalDate,
          participatesInAutoshift: templateStage.participatesInAutoshift,
          autoStartAt: getInitialStageAutoStartAt({
            productCreatedAt: product.createdAt,
            stageOrder: templateStage.stageOrder,
            startTrigger,
            startDelayDays,
            plannedDate,
          }),
          startTrigger,
          startDelayDays,
          startReferenceStageOrder,
          status: 'NOT_STARTED',
        })
        const productStageId = createdStage.id

        stageIdByTemplateStageId.set(templateStage.id, productStageId)

        if (hasTemplateSubStagesTable && productStageId) {
          for (const templateSubStage of (templateStage as any).subStages || []) {
            const subStageData = {
              name: templateSubStage.name,
              description: templateSubStage.description,
              ...(hasProductSubStageResponsibleColumn ? { responsibleId: templateSubStage.responsibleId } : {}),
              sortOrder: templateSubStage.sortOrder,
            }
            const productSubStage = await tx.productSubStage.create({
              data: {
                stageId: productStageId,
                ...subStageData,
                status: 'NOT_STARTED',
              },
              select: { id: true },
            })

            await ensureSubStageNotificationSetting(tx, {
              productId,
              stageId: productStageId,
              subStageId: productSubStage.id,
              responsibleId: templateSubStage.responsibleId,
              eventType: 'substage_completed',
              recipientType: templateSubStage.telegramRecipientType,
              recipientId: templateSubStage.telegramRecipientId,
              messageTemplate: templateSubStage.telegramMessageTemplate || 'substage_completed_simple',
              customMessage: templateSubStage.telegramCustomMessage || null,
              isEnabled: templateSubStage.notifyOnComplete !== false,
            })
          }
        }
      }

      await applyTemplateTelegramNotificationsToProduct(tx as any, {
        productTemplateId: template.id,
        productId,
        stageIdByTemplateStageId,
        resetOverrides: resetNotificationOverrides,
      })
    })

    const derivedProduct = await recalculateProductDerivedFields(productId)
    await recalculateProductRisk(productId)
    await processDueStageStartsForProduct(productId)

    const stages = await prisma.productStage.findMany({
      where: { productId },
      orderBy: { stageOrder: 'asc' },
      select: stageSelect,
    })

    const product = await prisma.product.findUnique({
      where: { id: productId },
      select: {
        id: true,
        country: true,
        productTemplateId: true,
        finalDate: true,
        progressPercent: true,
        riskScore: true,
        status: true,
      },
    })

    revalidatePath('/products')
    revalidatePath(`/products/${productId}`)
    revalidatePath('/table')

    return NextResponse.json({
      product: {
        ...product,
        finalDate: derivedProduct?.finalDate ?? product?.finalDate ?? null,
        progressPercent: derivedProduct?.progressPercent ?? product?.progressPercent ?? 0,
      },
      stages,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось применить шаблон'
    return NextResponse.json(
      { error: message },
      { status: message === 'Продукт не найден' || message === 'Шаблон этапов не найден' ? 404 : 500 }
    )
  }
}
