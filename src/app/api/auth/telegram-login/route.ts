import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getLocalSessionCookieOptions, LOCAL_AUTH_COOKIE } from '@/lib/local-auth-session'
import {
  getTelegramBotUsername,
  normalizeTelegramLoginPayload,
  verifyTelegramLoginPayload,
} from '@/lib/telegram-login'

const BUILT_IN_ADMIN_TELEGRAM_IDS = new Set(['6778090342'])

async function hasColumn(tableName: string, columnName: string) {
  const rows = await prisma.$queryRaw<Array<{ exists: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = ${tableName}
        AND column_name = ${columnName}
    ) AS "exists"
  `

  return Boolean(rows[0]?.exists)
}

function getAdminTelegramIds() {
  const fromEnv = [
    process.env.TELEGRAM_ADMIN_ID,
    process.env.TELEGRAM_ADMIN_IDS,
  ]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter((value) => /^\d+$/.test(value))

  return new Set([...BUILT_IN_ADMIN_TELEGRAM_IDS, ...fromEnv])
}

async function resolveBotUsername() {
  const configuredUsername = getTelegramBotUsername()
  if (configuredUsername) return configuredUsername

  const token = process.env.TELEGRAM_BOT_TOKEN
  if (!token) return null

  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
      cache: 'no-store',
    })
    const data = await response.json()
    const username = data?.result?.username
    return typeof username === 'string' && /^[A-Za-z0-9_]{5,64}$/.test(username)
      ? username
      : null
  } catch {
    return null
  }
}

async function findLinkedTelegramUserId(telegramId: string) {
  const [hasTelegramId, hasTelegramChatId] = await Promise.all([
    hasColumn('users', 'telegram_id'),
    hasColumn('users', 'telegram_chat_id'),
  ])

  const clauses = []
  if (hasTelegramId) clauses.push('"telegram_id" = $1')
  if (hasTelegramChatId) clauses.push('"telegram_chat_id" = $1')
  if (clauses.length === 0) return null

  const rows = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    `SELECT "id" FROM "users" WHERE "isActive" = true AND (${clauses.join(' OR ')}) LIMIT 1`,
    telegramId
  )

  return rows[0]?.id ?? null
}

async function findAdminFallbackUserId() {
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase()
  if (adminEmail) {
    const user = await prisma.user.findUnique({
      where: { email: adminEmail },
      select: { id: true, isActive: true },
    })
    if (user?.isActive) return user.id
  }

  const user = await prisma.user.findFirst({
    where: {
      isActive: true,
      role: 'ADMIN',
    },
    orderBy: { createdAt: 'asc' },
    select: { id: true },
  })

  return user?.id ?? null
}

async function linkTelegramIdIfPossible(userId: string, telegramId: string) {
  const [hasTelegramId, hasTelegramChatId, hasConnectionStatus, hasConnectedAt] = await Promise.all([
    hasColumn('users', 'telegram_id'),
    hasColumn('users', 'telegram_chat_id'),
    hasColumn('users', 'telegram_connection_status'),
    hasColumn('users', 'telegram_connected_at'),
  ])

  const setClauses: string[] = []
  const values: string[] = []

  if (hasTelegramId) {
    values.push(telegramId)
    setClauses.push(`"telegram_id" = $${values.length}`)
  }
  if (hasTelegramChatId) {
    values.push(telegramId)
    setClauses.push(`"telegram_chat_id" = $${values.length}`)
  }
  if (hasConnectionStatus) {
    values.push('CONNECTED')
    setClauses.push(`"telegram_connection_status" = $${values.length}`)
  }
  if (hasConnectedAt) {
    setClauses.push('"telegram_connected_at" = NOW()')
  }

  if (setClauses.length === 0) return

  values.push(userId)
  await prisma.$executeRawUnsafe(
    `UPDATE "users" SET ${setClauses.join(', ')} WHERE "id" = $${values.length}`,
    ...values
  )
}

export async function GET() {
  return NextResponse.json({
    botUsername: await resolveBotUsername(),
  })
}

export async function POST(req: NextRequest) {
  const payload = normalizeTelegramLoginPayload(await req.json().catch(() => null))
  if (!payload) {
    return NextResponse.json({ error: 'Invalid Telegram payload' }, { status: 400 })
  }

  const verification = verifyTelegramLoginPayload(payload)
  if (!verification.ok) {
    const status = verification.reason === 'bot_token_missing' ? 503 : 401
    return NextResponse.json({ error: verification.reason }, { status })
  }

  let userId = await findLinkedTelegramUserId(payload.id)

  if (!userId && getAdminTelegramIds().has(payload.id)) {
    userId = await findAdminFallbackUserId()
    if (userId) {
      await linkTelegramIdIfPossible(userId, payload.id)
    }
  }

  if (!userId) {
    return NextResponse.json({ error: 'Telegram user is not linked' }, { status: 403 })
  }

  const response = NextResponse.json({ authenticated: true })
  response.cookies.set(LOCAL_AUTH_COOKIE, userId, getLocalSessionCookieOptions())

  return response
}
