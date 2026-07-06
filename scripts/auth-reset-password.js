const bcrypt = require('bcryptjs')
const { PrismaClient } = require('@prisma/client')
const { createClient } = require('@supabase/supabase-js')

const prisma = new PrismaClient()

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase()
}

function getRequiredEnv(name) {
  const value = process.env[name]
  if (!value || !value.trim()) {
    throw new Error(`${name} is required`)
  }
  return value.trim()
}

function createSupabaseAdminClientIfConfigured() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) return null

  return createClient(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
  })
}

async function hasColumn(tableName, columnName) {
  const rows = await prisma.$queryRaw`
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

async function findSupabaseUserByEmail(supabase, email) {
  let page = 1

  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })

    if (error) throw error

    const found = data.users.find((user) => user.email?.trim().toLowerCase() === email)
    if (found) return found
    if (data.users.length < 200) return null

    page += 1
  }

  return null
}

async function syncSupabasePassword(input) {
  const supabase = createSupabaseAdminClientIfConfigured()
  if (!supabase) {
    return 'skipped'
  }

  const existing = await findSupabaseUserByEmail(supabase, input.email)
  if (existing) {
    const { error } = await supabase.auth.admin.updateUserById(existing.id, {
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: {
        name: input.name || undefined,
        lastName: input.lastName || undefined,
      },
    })
    if (error) throw error
    return 'updated'
  }

  const { error } = await supabase.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      name: input.name || undefined,
      lastName: input.lastName || undefined,
    },
  })
  if (error) throw error
  return 'created'
}

async function main() {
  const email = normalizeEmail(process.env.RESET_EMAIL || process.env.ADMIN_EMAIL)
  const password = getRequiredEnv('RESET_PASSWORD')
  const telegramId = process.env.RESET_TELEGRAM_ID?.trim() || null

  if (!email) {
    throw new Error('RESET_EMAIL or ADMIN_EMAIL is required')
  }

  if (password.length < 8) {
    throw new Error('RESET_PASSWORD must be at least 8 characters')
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      lastName: true,
      isActive: true,
    },
  })

  if (!user) {
    throw new Error(`Local user not found: ${email}`)
  }

  const passwordHash = await bcrypt.hash(password, 12)
  await prisma.user.update({
    where: { id: user.id },
    data: {
      password: passwordHash,
      isActive: true,
    },
    select: { id: true },
  })

  let telegramStatus = 'skipped'
  if (telegramId) {
    const [hasTelegramId, hasTelegramChatId, hasConnectionStatus, hasConnectedAt] = await Promise.all([
      hasColumn('users', 'telegram_id'),
      hasColumn('users', 'telegram_chat_id'),
      hasColumn('users', 'telegram_connection_status'),
      hasColumn('users', 'telegram_connected_at'),
    ])

    if (hasTelegramId || hasTelegramChatId) {
      const setClauses = []
      const values = []

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

      values.push(user.id)
      await prisma.$executeRawUnsafe(
        `UPDATE "users" SET ${setClauses.join(', ')} WHERE "id" = $${values.length}`,
        ...values
      )
      telegramStatus = 'linked'
    } else {
      telegramStatus = 'skipped: schema has no telegram columns'
    }
  }

  let supabaseStatus = 'skipped'
  try {
    supabaseStatus = await syncSupabasePassword({
      email: user.email,
      password,
      name: user.name,
      lastName: user.lastName,
    })
  } catch (error) {
    supabaseStatus = `failed: ${error.message || 'unknown error'}`
  }

  console.log(`Password reset complete for ${user.email}`)
  console.log(`Local user: updated`)
  if (telegramId) console.log(`Telegram ID: ${telegramStatus}`)
  console.log(`Supabase user: ${supabaseStatus}`)
}

main()
  .catch((error) => {
    console.error(error.message || error)
    process.exitCode = 1
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
