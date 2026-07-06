import { prisma } from '@/lib/prisma'

export const TELEGRAM_EVENT_TYPES = [
  'substage_completed',
  'stage_completed',
  'stage_started',
] as const
export type TelegramEventType = (typeof TELEGRAM_EVENT_TYPES)[number]

export const TELEGRAM_MESSAGE_TEMPLATES = [
  {
    id: 'substage_completed_simple',
    label: 'Закрытие подэтапа',
    eventType: 'substage_completed',
    body: 'Подэтап закрыт\n\nПроект: {product_name}\nЭтап: {stage_name}\nПодэтап: {substage_name}\nОтветственный: {responsible_user}\nДата закрытия: {end_date}',
  },
  {
    id: 'stage_completed_simple',
    label: 'Завершение этапа',
    eventType: 'stage_completed',
    body: 'Этап завершён\n\nПроект: {product_name}\nЭтап: {stage_name}\nВыполнено подэтапов: {completed_substages} / {total_substages}\nДата завершения: {end_date}',
  },
  {
    id: 'stage_started_simple',
    label: 'Начало этапа',
    eventType: 'stage_started',
    body: 'Этап начался\n\nПроект: {product_name}\nЭтап: {stage_name}\nОтветственный: {responsible_user}\nДата начала: {start_date}',
  },
  {
    id: 'custom',
    label: 'Кастомное сообщение',
    eventType: 'stage_completed',
    body: '{custom_message}',
  },
] as const

type TelegramTemplateContext = {
  product_name?: string | null
  stage_name?: string | null
  substage_name?: string | null
  responsible_user?: string | null
  start_date?: string | null
  end_date?: string | null
  status?: string | null
  description?: string | null
  completed_substages?: string | number | null
  total_substages?: string | number | null
  custom_message?: string | null
}

function formatTelegramDate(value: Date | string | null | undefined) {
  if (!value) return 'не указано'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return 'не указано'

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export function renderTelegramMessage(template: string, context: TelegramTemplateContext) {
  return template.replace(/\{([a-z_]+)\}/gi, (_, key: string) => {
    const value = context[key as keyof TelegramTemplateContext]
    return value === null || value === undefined || String(value).trim() === ''
      ? 'не указано'
      : String(value)
  })
}

function getTemplateBody(templateId: string | null | undefined, eventType: TelegramEventType) {
  const fallbackTemplateId =
    eventType === 'substage_completed'
      ? 'substage_completed_simple'
      : eventType === 'stage_started'
        ? 'stage_started_simple'
      : 'stage_completed_simple'

  return (
    TELEGRAM_MESSAGE_TEMPLATES.find((template) => template.id === templateId)?.body ||
    TELEGRAM_MESSAGE_TEMPLATES.find((template) => template.id === fallbackTemplateId)?.body ||
    TELEGRAM_MESSAGE_TEMPLATES[0].body
  )
}

export function getTelegramRecipientChatId(recipient: {
  type: string
  telegramId: string | null
  chatId: string | null
}) {
  if (recipient.type === 'chat') return recipient.chatId || recipient.telegramId
  return recipient.telegramId || recipient.chatId
}

function getUserTelegramChatId(user: {
  telegramChatId?: string | null
  telegramId?: string | null
} | null | undefined) {
  return user?.telegramChatId || user?.telegramId || null
}

export async function sendTelegramMessage(chatId: string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) {
    throw new Error('TELEGRAM_BOT_TOKEN не задан в .env')
  }

  const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true,
    }),
  })

  const payload = await response.json().catch(() => null)
  if (!response.ok || payload?.ok === false) {
    throw new Error(payload?.description || `Telegram API вернул ${response.status}`)
  }

  return payload
}

export async function dispatchTelegramNotifications(input: {
  productId: string
  stageId?: string | null
  subStageId?: string | null
  eventType: TelegramEventType
}) {
  const settings = await prisma.telegramNotificationSetting.findMany({
    where: {
      productId: input.productId,
      eventType: input.eventType,
      isEnabled: true,
      sentAt: null,
      ...(input.subStageId
        ? { subStageId: input.subStageId }
        : { stageId: input.stageId || undefined, subStageId: null }),
    },
    include: {
      recipient: true,
      product: {
        select: {
          name: true,
          responsible: {
            select: {
              id: true,
              name: true,
              lastName: true,
              telegramId: true,
              telegramChatId: true,
            },
          },
        },
      },
      stage: {
        select: {
          stageName: true,
          description: true,
          comment: true,
          status: true,
          startDate: true,
          dateValue: true,
          dateEnd: true,
          endDate: true,
          responsible: {
            select: {
              id: true,
              name: true,
              lastName: true,
              telegramId: true,
              telegramChatId: true,
            },
          },
        },
      },
      subStage: {
        select: {
          name: true,
          description: true,
          status: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  })

  const results: Array<{ id: string; ok: boolean; error?: string }> = []

  for (const setting of settings) {
    try {
      const responsible = setting.stage?.responsible || setting.product.responsible
      const chatId =
        setting.recipientType === 'responsible'
          ? getUserTelegramChatId(responsible)
          : setting.recipient
            ? getTelegramRecipientChatId(setting.recipient)
            : null

      if (!chatId) {
        throw new Error(
          setting.recipientType === 'responsible'
            ? 'У ответственного не указан Telegram ID или chat_id'
            : 'У получателя не указан Telegram ID или chat_id'
        )
      }

      const responsibleName = responsible
        ? [responsible.name, responsible.lastName].filter(Boolean).join(' ')
        : null
      const rawTemplate = setting.customMessage?.trim() || getTemplateBody(setting.messageTemplate, input.eventType)
      const subStageCounts = setting.stage
        ? await prisma.productSubStage.groupBy({
            by: ['status'],
            where: { stageId: setting.stageId || undefined },
            _count: { _all: true },
          })
        : []
      const totalSubStages = subStageCounts.reduce((sum, item) => sum + item._count._all, 0)
      const completedSubStages = subStageCounts
        .filter((item) => item.status === 'COMPLETED')
        .reduce((sum, item) => sum + item._count._all, 0)
      const message = renderTelegramMessage(rawTemplate, {
        product_name: setting.product.name,
        stage_name: setting.stage?.stageName,
        substage_name: setting.subStage?.name,
        responsible_user: responsibleName,
        start_date: formatTelegramDate(setting.subStage?.startDate || setting.stage?.startDate || setting.stage?.dateValue),
        end_date: formatTelegramDate(setting.subStage?.endDate || setting.stage?.endDate || setting.stage?.dateEnd),
        status: setting.subStage?.status || setting.stage?.status,
        description: setting.subStage?.description || setting.stage?.description || setting.stage?.comment,
        completed_substages: completedSubStages,
        total_substages: totalSubStages,
        custom_message: setting.customMessage,
      })

      await sendTelegramMessage(chatId, message)

      await prisma.telegramNotificationSetting.update({
        where: { id: setting.id },
        data: {
          sentAt: new Date(),
          lastError: null,
        },
      })
      results.push({ id: setting.id, ok: true })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось отправить Telegram-уведомление'
      await prisma.telegramNotificationSetting.update({
        where: { id: setting.id },
        data: { lastError: message },
      })
      console.error('[telegram:notify] Failed to send notification', { settingId: setting.id, error })
      results.push({ id: setting.id, ok: false, error: message })
    }
  }

  return results
}
