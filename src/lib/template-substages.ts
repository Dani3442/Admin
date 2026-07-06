import { sanitizeTextValue } from '@/lib/input-security'

export type TemplateSubStagePayload = {
  name: string
  description: string | null
  responsibleId: string | null
  notifyOnStart: boolean
  notifyOnComplete: boolean
  telegramRecipientType: 'user' | 'chat' | 'responsible'
  telegramRecipientId: string | null
  telegramMessageTemplate: string | null
  telegramCustomMessage: string | null
  sortOrder: number
}

export const templateSubStageSelect = {
  id: true,
  productTemplateStageId: true,
  name: true,
  description: true,
  responsibleId: true,
  notifyOnStart: true,
  notifyOnComplete: true,
  telegramRecipientType: true,
  telegramRecipientId: true,
  telegramMessageTemplate: true,
  telegramCustomMessage: true,
  sortOrder: true,
} as const

export function normalizeTemplateSubStages(rawSubStages: unknown): TemplateSubStagePayload[] {
  const items = Array.isArray(rawSubStages) ? rawSubStages : []

  return items
    .map((item: any, index) => ({
      name: sanitizeTextValue(item?.name, { maxLength: 160 }),
      description: sanitizeTextValue(item?.description, { preserveNewlines: true, maxLength: 1000 }) || null,
      responsibleId: sanitizeTextValue(item?.responsibleId, { maxLength: 128 }) || null,
      notifyOnStart: false,
      notifyOnComplete: item?.notifyOnComplete !== false,
      telegramRecipientType: (
        item?.telegramRecipientType === 'chat'
          ? 'chat'
          : item?.telegramRecipientType === 'responsible'
            ? 'responsible'
            : 'user'
      ) as 'user' | 'chat' | 'responsible',
      telegramRecipientId: sanitizeTextValue(item?.telegramRecipientId, { maxLength: 128 }) || null,
      telegramMessageTemplate:
        sanitizeTextValue(item?.telegramMessageTemplate, { maxLength: 120 }) || 'substage_completed_simple',
      telegramCustomMessage:
        sanitizeTextValue(item?.telegramCustomMessage, { preserveNewlines: true, maxLength: 2000 }) || null,
      sortOrder: Number.isInteger(Number(item?.sortOrder)) ? Math.max(0, Number(item.sortOrder)) : index,
    }))
    .filter((item) => item.name)
    .map((item, index) => ({
      ...item,
      sortOrder: index,
    }))
}

export async function createProductTemplateSubStages(
  tx: {
    productTemplateSubStage: {
      create: (args: any) => Promise<any>
    }
  },
  productTemplateStageId: string,
  subStages: TemplateSubStagePayload[]
) {
  const created = []

  for (const subStage of subStages) {
    created.push(
      await tx.productTemplateSubStage.create({
        data: {
          productTemplateStageId,
          name: subStage.name,
          description: subStage.description,
          responsibleId: subStage.responsibleId,
          notifyOnStart: false,
          notifyOnComplete: subStage.notifyOnComplete,
          telegramRecipientType: subStage.telegramRecipientType,
          telegramRecipientId: subStage.telegramRecipientId,
          telegramMessageTemplate: subStage.telegramMessageTemplate,
          telegramCustomMessage: subStage.telegramCustomMessage,
          sortOrder: subStage.sortOrder,
        },
        select: templateSubStageSelect,
      })
    )
  }

  return created
}
