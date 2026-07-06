import { prisma } from '@/lib/prisma'
import { createProductStageCompat } from '@/lib/product-stage-compat'
import { parseDateOnly } from '@/lib/date-only'
import { getFinalDateFromStages } from '@/lib/product-derived-fields'
import {
  supportsProductTemplateStageAutoshiftColumn,
  supportsProductTemplateReferenceColumn,
  supportsProductTemplateStageDurationDaysColumn,
  supportsProductTemplateStageStartRulesColumns,
  supportsProductTemplateSubStagesTable,
  supportsProductSubStageResponsibleColumn,
} from '@/lib/schema-compat'
import { applyTemplateTelegramNotificationsToProduct } from '@/lib/template-telegram-notifications'
import { processDueStageStartsForProduct } from '@/lib/stage-workflow'
import { fillMissingSequentialStageDates } from '@/lib/stage-schedule'
import {
  getInitialStageAutoStartAt,
  normalizeStageStartDelayDays,
  normalizeStageStartReferenceOrder,
  normalizeStageStartTrigger,
} from '@/lib/stage-start-rules'
import { templateSubStageSelect } from '@/lib/template-substages'
import { sanitizeNullableText, sanitizeTextValue, sanitizeUrlValue } from '@/lib/input-security'

export interface CreateProductStageOverrideInput {
  id?: string
  stageTemplateId: string
  stageOrder: number
  stageName: string
  plannedDate?: string | Date | null
  durationDays?: number | null
  participatesInAutoshift?: boolean
  startTrigger?: string | null
  startDelayDays?: number | null
  startReferenceStageOrder?: number | null
}

export interface CreateProductInput {
  name: string
  country?: string | null
  category?: string | null
  sku?: string | null
  priority?: string | null
  responsibleId?: string | null
  notes?: string | null
  productTemplateId?: string | null
  templateStagesOverride?: CreateProductStageOverrideInput[]
}

type RawProductStageForCreate = {
  productTemplateStageId: string | null
  stageTemplateId: string
  stageOrder: number
  stageName: string
  plannedDate: Date | null
  durationDays: number | null
  stageTemplateDurationDays: number | null
  isCritical: boolean
  affectsFinalDate: boolean
  participatesInAutoshift: boolean
  startTrigger: string
  startDelayDays: number
  startReferenceStageOrder: number | null
  subStages: Array<{
    id: string
    name: string
    description: string | null
    responsibleId: string | null
    notifyOnStart: boolean
    notifyOnComplete: boolean
    telegramRecipientType: 'user' | 'chat' | 'responsible' | null
    telegramRecipientId: string | null
    telegramMessageTemplate: string | null
    telegramCustomMessage: string | null
    sortOrder: number
  }>
}

function normalizeNullableString(value: unknown) {
  if (typeof value !== 'string') return value ?? null

  return sanitizeNullableText(value)
}

export async function createProduct(input: CreateProductInput) {
  const name = sanitizeTextValue(input.name, { maxLength: 160 })

  if (!name) {
    throw new Error('Name is required')
  }

  const createdProduct = await prisma.$transaction(async (tx) => {
    const [
      stageTemplates,
      sortOrderAggregate,
      hasProductTemplateReferenceColumn,
      hasProductTemplateStageDurationDaysColumn,
      hasProductTemplateStageAutoshiftColumn,
      hasProductTemplateStageStartRulesColumns,
      hasProductTemplateSubStagesTable,
      hasProductSubStageResponsibleColumn,
    ] = await Promise.all([
      tx.stageTemplate.findMany({
        select: {
          id: true,
          name: true,
          order: true,
          durationText: true,
          durationDays: true,
          isCritical: true,
          createdAt: true,
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      }),
      tx.product.aggregate({
        where: { isArchived: false },
        _max: { sortOrder: true },
      }),
      supportsProductTemplateReferenceColumn(),
      supportsProductTemplateStageDurationDaysColumn(),
      supportsProductTemplateStageAutoshiftColumn(),
      supportsProductTemplateStageStartRulesColumns(),
      supportsProductTemplateSubStagesTable(),
      supportsProductSubStageResponsibleColumn(),
    ])

    const selectedTemplate = input.productTemplateId
      ? await tx.productTemplate.findUnique({
          where: { id: String(input.productTemplateId) },
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
                ...(hasProductTemplateStageStartRulesColumns
                  ? {
                      startTrigger: true,
                      startDelayDays: true,
                      startReferenceStageOrder: true,
                    }
                  : {}),
                ...(hasProductTemplateStageDurationDaysColumn ? { durationDays: true } : {}),
                ...(hasProductTemplateStageAutoshiftColumn ? { participatesInAutoshift: true } : {}),
                stageTemplate: {
                  select: {
                    id: true,
                    isCritical: true,
                    durationDays: true,
                  },
                },
                ...(hasProductTemplateSubStagesTable
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
      : null

    if (input.productTemplateId && !selectedTemplate) {
      throw new Error('Выбранный шаблон этапов не найден')
    }

    const normalizedStageTemplates = stageTemplates.map((template, index) => ({
      ...template,
      normalizedOrder: index,
    }))

    const safeTemplateOverrides = Array.isArray(input.templateStagesOverride)
      ? input.templateStagesOverride
          .map((stage, index) => ({
            stageTemplateId: String(stage?.stageTemplateId || ''),
            stageOrder: typeof stage?.stageOrder === 'number' ? stage.stageOrder : index,
            stageName: sanitizeTextValue(stage?.stageName, { maxLength: 160 }),
            dateValue: parseDateOnly(stage?.plannedDate),
            durationDays:
              typeof stage?.durationDays === 'number' && Number.isFinite(stage.durationDays)
                ? Math.max(1, Math.floor(stage.durationDays))
                : null,
            participatesInAutoshift: stage?.participatesInAutoshift !== false,
            startTrigger: normalizeStageStartTrigger(stage?.startTrigger, index),
            startDelayDays: normalizeStageStartDelayDays(stage?.startDelayDays),
            startReferenceStageOrder: normalizeStageStartReferenceOrder(stage?.startReferenceStageOrder),
          }))
          .filter((stage) => stage.stageTemplateId && stage.stageName)
      : []

    const rawTemplateStages: RawProductStageForCreate[] = selectedTemplate
      ? selectedTemplate.stages.map((stage, index) => {
          const override = safeTemplateOverrides.find(
            (candidate) =>
              candidate.stageTemplateId === stage.stageTemplateId &&
              candidate.stageOrder === index
          )

          return {
            productTemplateStageId: stage.id,
            stageTemplateId: stage.stageTemplateId,
            stageOrder: index,
            stageName: override?.stageName || stage.stageName,
            plannedDate: override?.dateValue ?? stage.plannedDate,
            durationDays: override?.durationDays ?? stage.durationDays ?? stage.stageTemplate.durationDays ?? null,
            stageTemplateDurationDays: stage.stageTemplate.durationDays ?? null,
            isCritical: stage.stageTemplate.isCritical,
            affectsFinalDate: true,
            participatesInAutoshift:
              override?.participatesInAutoshift ??
              (hasProductTemplateStageAutoshiftColumn ? (stage as any).participatesInAutoshift ?? true : true),
            startTrigger: normalizeStageStartTrigger(override?.startTrigger ?? (stage as any).startTrigger, index),
            startDelayDays: normalizeStageStartDelayDays(override?.startDelayDays ?? (stage as any).startDelayDays),
            startReferenceStageOrder: normalizeStageStartReferenceOrder(
              override?.startReferenceStageOrder ?? (stage as any).startReferenceStageOrder
            ),
            subStages: hasProductTemplateSubStagesTable ? (stage as any).subStages ?? [] : [],
          }
        })
      : normalizedStageTemplates.map((template) => ({
          productTemplateStageId: null,
          stageTemplateId: template.id,
          stageOrder: template.normalizedOrder,
          stageName: template.name,
          plannedDate: null,
          durationDays: template.durationDays ?? null,
          stageTemplateDurationDays: template.durationDays ?? null,
          isCritical: template.isCritical,
          affectsFinalDate: true,
          participatesInAutoshift: true,
          startTrigger: normalizeStageStartTrigger(null, template.normalizedOrder),
          startDelayDays: 0,
          startReferenceStageOrder: null,
          subStages: [],
        }))

    const templateStages = fillMissingSequentialStageDates(rawTemplateStages).map((stage) => ({
      ...stage,
      dateValue: stage.plannedDate,
    }))

    const productCreateData: any = {
      name,
      country: normalizeNullableString(input.country),
      category: normalizeNullableString(input.category),
      sku: normalizeNullableString(input.sku),
      priority: input.priority || 'MEDIUM',
      responsibleId: normalizeNullableString(input.responsibleId),
      competitorUrl: sanitizeUrlValue((input as any).competitorUrl),
      notes: sanitizeNullableText(input.notes, { preserveNewlines: true, maxLength: 4000 }),
      sortOrder: (sortOrderAggregate._max.sortOrder ?? -1) + 1,
      finalDate: null,
    }

    if (hasProductTemplateReferenceColumn) {
      productCreateData.productTemplateId = normalizeNullableString(selectedTemplate?.id ?? null)
    }

    const createdProduct = await tx.product.create({
      data: productCreateData,
      select: { id: true, createdAt: true },
    })

    const stageIdByTemplateStageId = new Map<string, string>()

    for (const stage of templateStages) {
      const createdStage = await createProductStageCompat(tx as any, {
        productId: createdProduct.id,
        stageTemplateId: stage.stageTemplateId,
        stageOrder: stage.stageOrder,
        stageName: stage.stageName,
        dateValue: stage.dateValue,
        plannedDate: stage.dateValue,
        durationDays: stage.durationDays ?? null,
        isCritical: stage.isCritical,
        affectsFinalDate: stage.affectsFinalDate,
        participatesInAutoshift: stage.participatesInAutoshift,
        autoStartAt: getInitialStageAutoStartAt({
          productCreatedAt: createdProduct.createdAt,
          stageOrder: stage.stageOrder,
          startTrigger: stage.startTrigger,
          startDelayDays: stage.startDelayDays,
          plannedDate: stage.dateValue,
        }),
        startTrigger: stage.startTrigger,
        startDelayDays: stage.startDelayDays,
        startReferenceStageOrder: stage.startReferenceStageOrder,
        status: 'NOT_STARTED',
      })

      if (stage.productTemplateStageId) {
        stageIdByTemplateStageId.set(stage.productTemplateStageId, createdStage.id)
      }

      if (hasProductTemplateSubStagesTable && stage.subStages.length > 0) {
        const userIds = Array.from(
          new Set(stage.subStages.map((subStage) => subStage.responsibleId).filter(Boolean) as string[])
        )
        const configuredRecipientIds = Array.from(
          new Set(stage.subStages.map((subStage) => subStage.telegramRecipientId).filter(Boolean) as string[])
        )
        const recipientWhere: any[] = []
        if (userIds.length) {
          recipientWhere.push({ type: 'user', userId: { in: userIds } })
        }
        if (configuredRecipientIds.length) {
          recipientWhere.push({ id: { in: configuredRecipientIds } })
        }
        const recipients = recipientWhere.length
          ? await tx.telegramRecipient.findMany({
              where: { OR: recipientWhere },
              select: { id: true, type: true, userId: true },
            })
          : []
        const recipientByUserId = new Map(recipients.map((recipient) => [recipient.userId, recipient.id]))
        const recipientById = new Map(recipients.map((recipient) => [recipient.id, recipient]))

        for (const templateSubStage of stage.subStages) {
          const productSubStage = await tx.productSubStage.create({
            data: {
              stageId: createdStage.id,
              name: templateSubStage.name,
              description: templateSubStage.description,
              ...(hasProductSubStageResponsibleColumn ? { responsibleId: templateSubStage.responsibleId } : {}),
              status: 'NOT_STARTED',
              sortOrder: templateSubStage.sortOrder,
            },
            select: { id: true },
          })

          const configuredRecipient = templateSubStage.telegramRecipientId
            ? recipientById.get(templateSubStage.telegramRecipientId) ?? null
            : null
          const isResponsibleRecipient = templateSubStage.telegramRecipientType === 'responsible'
          const fallbackRecipientId = !templateSubStage.telegramRecipientId && templateSubStage.responsibleId
            ? recipientByUserId.get(templateSubStage.responsibleId) ?? null
            : null
          const recipientId = configuredRecipient?.id ?? fallbackRecipientId
          const recipientType = isResponsibleRecipient
            ? 'responsible'
            : configuredRecipient?.type === 'chat'
              ? 'chat'
              : 'user'

          if (recipientId || isResponsibleRecipient) {
            await tx.telegramNotificationSetting.create({
              data: {
                productId: createdProduct.id,
                stageId: createdStage.id,
                subStageId: productSubStage.id,
                eventType: 'substage_completed',
                recipientType,
                recipientId: isResponsibleRecipient ? null : recipientId,
                messageTemplate: templateSubStage.telegramMessageTemplate || 'substage_completed_simple',
                customMessage: templateSubStage.telegramCustomMessage || null,
                isEnabled: templateSubStage.notifyOnComplete !== false,
              },
            })
          }
        }
      }
    }

    if (selectedTemplate) {
      await applyTemplateTelegramNotificationsToProduct(tx as any, {
        productTemplateId: selectedTemplate.id,
        productId: createdProduct.id,
        stageIdByTemplateStageId,
        clearPreviousInherited: false,
        resetOverrides: false,
      })
    }

    const finalDate = getFinalDateFromStages(
      templateStages.map((stage) => ({
        stageOrder: stage.stageOrder,
        isCompleted: false,
        dateValue: stage.dateValue,
        plannedDate: stage.dateValue,
      }))
    )

    await tx.product.update({
      where: { id: createdProduct.id },
      data: {
        finalDate,
        progressPercent: 0,
      },
    })

    return createdProduct
  })

  await processDueStageStartsForProduct(createdProduct.id)

  return createdProduct
}
