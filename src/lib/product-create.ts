import { prisma } from '@/lib/prisma'
import { createProductStageCompat } from '@/lib/product-stage-compat'
import { parseDateOnly } from '@/lib/date-only'
import { getFinalDateFromStages } from '@/lib/product-derived-fields'
import {
  supportsProductTemplateStageAutoshiftColumn,
  supportsProductTemplateReferenceColumn,
  supportsProductTemplateStageDurationDaysColumn,
} from '@/lib/schema-compat'
import { recalculateSequentialStageDates } from '@/lib/stage-schedule'
import { sanitizeNullableText, sanitizeTextValue, sanitizeUrlValue } from '@/lib/input-security'

export interface CreateProductStageOverrideInput {
  id?: string
  stageTemplateId: string
  stageOrder: number
  stageName: string
  plannedDate?: string | Date | null
  durationDays?: number | null
  participatesInAutoshift?: boolean
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

function normalizeNullableString(value: unknown) {
  if (typeof value !== 'string') return value ?? null

  return sanitizeNullableText(value)
}

export async function createProduct(input: CreateProductInput) {
  const name = sanitizeTextValue(input.name, { maxLength: 160 })

  if (!name) {
    throw new Error('Name is required')
  }

  return prisma.$transaction(async (tx) => {
    const [
      stageTemplates,
      sortOrderAggregate,
      hasProductTemplateReferenceColumn,
      hasProductTemplateStageDurationDaysColumn,
      hasProductTemplateStageAutoshiftColumn,
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
                ...(hasProductTemplateStageDurationDaysColumn ? { durationDays: true } : {}),
                ...(hasProductTemplateStageAutoshiftColumn ? { participatesInAutoshift: true } : {}),
                stageTemplate: {
                  select: {
                    id: true,
                    isCritical: true,
                    durationDays: true,
                  },
                },
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
          }))
          .filter((stage) => stage.stageTemplateId && stage.stageName)
      : []

    const rawTemplateStages = selectedTemplate
      ? selectedTemplate.stages.map((stage, index) => {
          const override = safeTemplateOverrides.find(
            (candidate) =>
              candidate.stageTemplateId === stage.stageTemplateId &&
              candidate.stageOrder === index
          )

          return {
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
          }
        })
      : normalizedStageTemplates.map((template) => ({
          stageTemplateId: template.id,
          stageOrder: template.normalizedOrder,
          stageName: template.name,
          plannedDate: null,
          durationDays: template.durationDays ?? null,
          stageTemplateDurationDays: template.durationDays ?? null,
          isCritical: template.isCritical,
          affectsFinalDate: true,
          participatesInAutoshift: true,
        }))

    const templateStages = recalculateSequentialStageDates(rawTemplateStages).map((stage) => ({
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
      select: { id: true },
    })

    for (const stage of templateStages) {
      await createProductStageCompat(tx as any, {
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
        status: 'NOT_STARTED',
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
}
