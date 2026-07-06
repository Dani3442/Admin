import { prisma } from './prisma'

const columnPresenceCache = new Map<string, Promise<boolean>>()

export async function hasDbColumn(tableName: string, columnName: string) {
  const cacheKey = `${tableName}:${columnName}`

  if (!columnPresenceCache.has(cacheKey)) {
    columnPresenceCache.set(
      cacheKey,
      prisma
        .$queryRawUnsafe<Array<{ exists: boolean }>>(
          `
            SELECT EXISTS (
              SELECT 1
              FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = $1
                AND column_name = $2
            ) AS "exists"
          `,
          tableName,
          columnName
        )
        .then((rows) => Boolean(rows[0]?.exists))
        .catch(() => false)
    )
  }

  return columnPresenceCache.get(cacheKey)!
}

export async function supportsProductStageAutoshiftColumn() {
  return hasDbColumn('product_stages', 'participatesInAutoshift')
}

export async function supportsProductStageAffectsFinalDateColumn() {
  return hasDbColumn('product_stages', 'affectsFinalDate')
}

export async function supportsProductStageDurationDaysColumn() {
  return hasDbColumn('product_stages', 'durationDays')
}

export async function supportsProductStageDescriptionColumn() {
  return hasDbColumn('product_stages', 'description')
}

export async function supportsStageTemplateAffectsFinalDateColumn() {
  return hasDbColumn('stage_templates', 'affectsFinalDate')
}

export async function supportsProductTemplateStageDurationDaysColumn() {
  return hasDbColumn('product_template_stages', 'durationDays')
}

export async function supportsProductTemplateStageAutoshiftColumn() {
  return hasDbColumn('product_template_stages', 'participatesInAutoshift')
}

export async function supportsProductTemplateStageStartRulesColumns() {
  return hasDbColumn('product_template_stages', 'startTrigger')
}

export async function supportsProductStageStartRulesColumns() {
  return hasDbColumn('product_stages', 'startTrigger')
}

export async function supportsProductTemplateSubStagesTable() {
  return hasDbColumn('product_template_substages', 'productTemplateStageId')
}

export async function supportsTemplateTelegramNotificationSettingsTable() {
  return hasDbColumn('telegram_template_notification_settings', 'id')
}

export async function supportsProductSubStageResponsibleColumn() {
  return hasDbColumn('product_substages', 'responsibleId')
}

export async function supportsProductSubStagesTable() {
  return hasDbColumn('product_substages', 'stageId')
}

export async function supportsTelegramNotificationSettingsTables() {
  const [settings, recipients] = await Promise.all([
    hasDbColumn('telegram_notification_settings', 'id'),
    hasDbColumn('telegram_recipients', 'id'),
  ])

  return settings && recipients
}

export async function supportsProductTemplateReferenceColumn() {
  return hasDbColumn('products', 'productTemplateId')
}

export async function supportsProductLifecycleColumns() {
  const [closedAt, closedById, closureComment, archivedAt, archivedById, archiveReason] = await Promise.all([
    hasDbColumn('products', 'closedAt'),
    hasDbColumn('products', 'closedById'),
    hasDbColumn('products', 'closureComment'),
    hasDbColumn('products', 'archivedAt'),
    hasDbColumn('products', 'archivedById'),
    hasDbColumn('products', 'archiveReason'),
  ])

  return closedAt && closedById && closureComment && archivedAt && archivedById && archiveReason
}

export async function supportsCommentProductStageIdColumn() {
  return hasDbColumn('comments', 'productStageId')
}

export async function supportsChangeHistoryProductStageIdColumn() {
  return hasDbColumn('change_history', 'productStageId')
}
