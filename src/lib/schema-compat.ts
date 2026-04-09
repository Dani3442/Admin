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

export async function supportsProductStageOverlapAcceptedColumn() {
  return hasDbColumn('product_stages', 'overlapAccepted')
}

export async function supportsProductStageAffectsFinalDateColumn() {
  return hasDbColumn('product_stages', 'affectsFinalDate')
}

export async function supportsProductStageDurationDaysColumn() {
  return hasDbColumn('product_stages', 'durationDays')
}

export async function supportsStageTemplateAffectsFinalDateColumn() {
  return hasDbColumn('stage_templates', 'affectsFinalDate')
}

export async function supportsProductTemplateStageDurationDaysColumn() {
  return hasDbColumn('product_template_stages', 'durationDays')
}

export async function supportsProductTemplateReferenceColumn() {
  return hasDbColumn('products', 'productTemplateId')
}

export async function supportsCommentProductStageIdColumn() {
  return hasDbColumn('comments', 'productStageId')
}

export async function supportsChangeHistoryProductStageIdColumn() {
  return hasDbColumn('change_history', 'productStageId')
}
