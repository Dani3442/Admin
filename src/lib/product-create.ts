import { prisma } from '@/lib/prisma'
import { createProductStageCompat } from '@/lib/product-stage-compat'
import { getFinalDateFromStages } from '@/lib/product-derived-fields'
import { supportsProductTemplateReferenceColumn } from '@/lib/schema-compat'

export interface CreateProductStageOverrideInput {
  id?: string
  stageTemplateId: string
  stageOrder: number
  stageName: string
  plannedDate?: string | Date | null
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

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

export async function createProduct(input: CreateProductInput) {
  const name = input.name?.trim()

  if (!name) {
    throw new Error('Name is required')
  }

  return prisma.$transaction(async (tx) => {
    const [stageTemplates, sortOrderAggregate, selectedTemplate, hasProductTemplateReferenceColumn] = await Promise.all([
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
      input.productTemplateId
        ? tx.productTemplate.findUnique({
            where: { id: String(input.productTemplateId) },
            include: {
              stages: {
                orderBy: { stageOrder: 'asc' },
                include: {
                  stageTemplate: {
                    select: {
                      id: true,
                      isCritical: true,
                    },
                  },
                },
              },
            },
          })
        : Promise.resolve(null),
      supportsProductTemplateReferenceColumn(),
    ])

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
            stageName: String(stage?.stageName || '').trim(),
            dateValue: stage?.plannedDate ? new Date(stage.plannedDate) : null,
            participatesInAutoshift: stage?.participatesInAutoshift !== false,
          }))
          .filter((stage) => stage.stageTemplateId && stage.stageName)
      : []

    const templateStages = selectedTemplate
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
            dateValue: override?.dateValue ?? stage.plannedDate,
            isCritical: stage.stageTemplate.isCritical,
            affectsFinalDate: true,
            participatesInAutoshift: override?.participatesInAutoshift ?? true,
          }
        })
      : normalizedStageTemplates.map((template) => ({
          stageTemplateId: template.id,
          stageOrder: template.normalizedOrder,
          stageName: template.name,
          dateValue: null,
          isCritical: template.isCritical,
          affectsFinalDate: true,
          participatesInAutoshift: true,
        }))

    const productCreateData: any = {
      name,
      country: normalizeNullableString(input.country),
      category: normalizeNullableString(input.category),
      sku: normalizeNullableString(input.sku),
      priority: input.priority || 'MEDIUM',
      responsibleId: normalizeNullableString(input.responsibleId),
      notes: normalizeNullableString(input.notes),
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
