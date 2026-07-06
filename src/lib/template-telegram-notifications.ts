import { TELEGRAM_EVENT_TYPES, type TelegramEventType } from '@/lib/telegram'
import { sanitizeTextValue } from '@/lib/input-security'

export type TemplateTelegramNotificationPayload = {
  stageOrder: number
  eventType: TelegramEventType
  recipientType: 'user' | 'chat' | 'responsible'
  recipientId: string | null
  messageTemplate: string | null
  customMessage: string | null
  isEnabled: boolean
}

type TemplateStageRow = {
  id: string
  stageOrder: number
  stageName?: string | null
}

type ProductStageRow = {
  id: string
  stageOrder: number
  stageName?: string | null
}

type DbTransaction = {
  telegramRecipient: {
    findMany: (args: any) => Promise<Array<{ id: string }>>
  }
  telegramTemplateNotificationSetting: {
    create: (args: any) => Promise<any>
    deleteMany: (args: any) => Promise<any>
    findMany: (args: any) => Promise<any[]>
  }
  telegramNotificationSetting: {
    create: (args: any) => Promise<any>
    deleteMany: (args: any) => Promise<any>
    findFirst: (args: any) => Promise<any>
    findMany: (args: any) => Promise<any[]>
    update: (args: any) => Promise<any>
  }
  product: {
    findMany: (args: any) => Promise<Array<{ id: string }>>
  }
  productStage: {
    findMany: (args: any) => Promise<ProductStageRow[]>
  }
}

export const templateTelegramNotificationInclude = {
  recipient: true,
}

export function normalizeTemplateTelegramNotifications(
  rawSettings: unknown,
  stageCount: number
) {
  const rawItems = Array.isArray(rawSettings) ? rawSettings : []
  const normalized: TemplateTelegramNotificationPayload[] = []
  const seenKeys = new Set<string>()

  for (const raw of rawItems) {
    const item = raw as any
    const stageOrder = Number(item?.stageOrder)
    if (!Number.isInteger(stageOrder) || stageOrder < 0 || stageOrder >= stageCount) continue

    const eventType = sanitizeTextValue(item?.eventType, { maxLength: 80 }) as TelegramEventType
    if (!TELEGRAM_EVENT_TYPES.includes(eventType)) continue
    if (eventType !== 'stage_completed' && eventType !== 'stage_started') continue

    const recipientType =
      item?.recipientType === 'responsible'
        ? 'responsible'
        : item?.recipientType === 'chat'
          ? 'chat'
          : 'user'
    const recipientId = sanitizeTextValue(item?.recipientId, { maxLength: 128 }) || null
    const messageTemplate =
      sanitizeTextValue(item?.messageTemplate, { maxLength: 120 }) ||
      (eventType === 'stage_started' ? 'stage_started_simple' : 'stage_completed_simple')
    const customMessage = sanitizeTextValue(item?.customMessage, { preserveNewlines: true, maxLength: 2000 }) || null
    const isEnabled = Boolean(item?.isEnabled)

    if (!isEnabled && !recipientId && !customMessage && recipientType !== 'responsible') continue
    if (isEnabled && recipientType !== 'responsible' && !recipientId) {
      throw new Error('Выберите Telegram-получателя для включённого уведомления в шаблоне')
    }

    const key = `${stageOrder}:${eventType}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)

    normalized.push({
      stageOrder,
      eventType,
      recipientType,
      recipientId: recipientType === 'responsible' ? null : recipientId,
      messageTemplate,
      customMessage,
      isEnabled,
    })
  }

  return normalized
}

async function assertRecipientsExist(
  tx: DbTransaction,
  settings: TemplateTelegramNotificationPayload[]
) {
  const recipientIds = Array.from(
    new Set(settings.map((setting) => setting.recipientId).filter(Boolean) as string[])
  )

  if (recipientIds.length === 0) return

  const recipients = await tx.telegramRecipient.findMany({
    where: { id: { in: recipientIds } },
    select: { id: true },
  })
  const foundIds = new Set(recipients.map((recipient) => recipient.id))
  const missingId = recipientIds.find((id) => !foundIds.has(id))

  if (missingId) {
    throw new Error('Telegram-получатель из шаблона не найден')
  }
}

export async function deleteInheritedProductNotificationsForTemplate(
  tx: DbTransaction,
  productTemplateId: string
) {
  const inheritedSettings = await tx.telegramNotificationSetting.findMany({
    where: {
      isOverride: false,
      templateSetting: { productTemplateId },
    },
    select: { id: true },
  })

  if (inheritedSettings.length === 0) return

  await tx.telegramNotificationSetting.deleteMany({
    where: { id: { in: inheritedSettings.map((setting) => setting.id) } },
  })
}

export async function saveTemplateTelegramNotifications(
  tx: DbTransaction,
  productTemplateId: string,
  templateStages: TemplateStageRow[],
  settings: TemplateTelegramNotificationPayload[]
) {
  await assertRecipientsExist(tx, settings)

  await tx.telegramTemplateNotificationSetting.deleteMany({
    where: { productTemplateId },
  })

  if (settings.length === 0) return

  const stageByOrder = new Map(templateStages.map((stage) => [stage.stageOrder, stage]))

  for (const setting of settings) {
    const templateStage = stageByOrder.get(setting.stageOrder)
    if (!templateStage) continue

    await tx.telegramTemplateNotificationSetting.create({
      data: {
        productTemplateId,
        productTemplateStageId: templateStage.id,
        eventType: setting.eventType,
        recipientType: setting.recipientType,
        recipientId: setting.recipientId,
        messageTemplate: setting.messageTemplate,
        customMessage: setting.customMessage,
        isEnabled: setting.isEnabled,
      },
    })
  }
}

export async function applyTemplateTelegramNotificationsToProduct(
  tx: DbTransaction,
  input: {
    productTemplateId: string
    productId: string
    stageIdByTemplateStageId?: Map<string, string>
    resetOverrides?: boolean
    clearPreviousInherited?: boolean
  }
) {
  if (input.clearPreviousInherited !== false) {
    await tx.telegramNotificationSetting.deleteMany({
      where: {
        productId: input.productId,
        isOverride: false,
        templateSettingId: { not: null },
      },
    })
  }

  const templateSettings = await tx.telegramTemplateNotificationSetting.findMany({
    where: { productTemplateId: input.productTemplateId },
    include: {
      productTemplateStage: {
        select: {
          id: true,
          stageOrder: true,
          stageName: true,
        },
      },
    },
    orderBy: [{ createdAt: 'asc' }],
  })

  if (templateSettings.length === 0) return
  templateSettings.sort((a, b) => {
    const aOrder = a.productTemplateStage?.stageOrder ?? 0
    const bOrder = b.productTemplateStage?.stageOrder ?? 0
    return aOrder - bOrder
  })

  const productStages = await tx.productStage.findMany({
    where: { productId: input.productId },
    select: {
      id: true,
      stageOrder: true,
      stageName: true,
    },
  })
  const productStageByOrder = new Map(productStages.map((stage) => [stage.stageOrder, stage]))

  for (const templateSetting of templateSettings) {
    const templateStage = templateSetting.productTemplateStage as TemplateStageRow | null
    if (!templateStage) continue

    const productStageId =
      input.stageIdByTemplateStageId?.get(templateStage.id) ||
      productStageByOrder.get(templateStage.stageOrder)?.id

    if (!productStageId) continue

    if (input.resetOverrides) {
      await tx.telegramNotificationSetting.deleteMany({
        where: {
          productId: input.productId,
          stageId: productStageId,
          subStageId: null,
          eventType: templateSetting.eventType,
        },
      })
    } else {
      const existingProductSpecific = await tx.telegramNotificationSetting.findFirst({
        where: {
          productId: input.productId,
          stageId: productStageId,
          subStageId: null,
          eventType: templateSetting.eventType,
          OR: [
            { isOverride: true },
            { templateSettingId: null },
          ],
        },
      })

      if (existingProductSpecific) {
        if (!existingProductSpecific.isOverride) {
          await tx.telegramNotificationSetting.update({
            where: { id: existingProductSpecific.id },
            data: { isOverride: true },
          })
        }
        continue
      }
    }

    const existingInherited = await tx.telegramNotificationSetting.findFirst({
      where: {
        productId: input.productId,
        stageId: productStageId,
        subStageId: null,
        eventType: templateSetting.eventType,
        templateSettingId: templateSetting.id,
      },
    })

    const data = {
      productId: input.productId,
      stageId: productStageId,
      subStageId: null,
      templateSettingId: templateSetting.id,
      isOverride: false,
      eventType: templateSetting.eventType,
      recipientType: templateSetting.recipientType,
      recipientId: templateSetting.recipientId,
      messageTemplate: templateSetting.messageTemplate,
      customMessage: templateSetting.customMessage,
      isEnabled: templateSetting.isEnabled,
      sentAt: null,
      lastError: null,
    }

    if (existingInherited) {
      await tx.telegramNotificationSetting.update({
        where: { id: existingInherited.id },
        data,
      })
    } else {
      await tx.telegramNotificationSetting.create({ data })
    }
  }
}

export async function syncTemplateTelegramNotificationsToProducts(
  tx: DbTransaction,
  productTemplateId: string
) {
  const products = await tx.product.findMany({
    where: { productTemplateId },
    select: { id: true },
  })

  for (const product of products) {
    await applyTemplateTelegramNotificationsToProduct(tx, {
      productTemplateId,
      productId: product.id,
      clearPreviousInherited: false,
      resetOverrides: false,
    })
  }
}
