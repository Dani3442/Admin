import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { sanitizeEmailValue, sanitizeTextValue } from '@/lib/input-security'
import { createAdminClient } from './admin'

function isBcryptHash(value: string) {
  return /^\$2[aby]\$\d{2}\$/.test(value)
}

async function verifyLocalPassword(storedPassword: string, candidatePassword: string) {
  if (isBcryptHash(storedPassword)) {
    return {
      isValid: await bcrypt.compare(candidatePassword, storedPassword),
      needsRehash: false,
    }
  }

  return {
    isValid: storedPassword === candidatePassword,
    needsRehash: storedPassword === candidatePassword,
  }
}

async function findSupabaseUserByEmail(email: string) {
  const supabase = createAdminClient()
  const normalizedEmail = sanitizeEmailValue(email)
  let page = 1

  while (page <= 10) {
    const { data, error } = await supabase.auth.admin.listUsers({
      page,
      perPage: 200,
    })

    if (error) {
      throw error
    }

    const matchedUser = data.users.find((user) => user.email?.trim().toLowerCase() === normalizedEmail)
    if (matchedUser) {
      return matchedUser
    }

    if (data.users.length < 200) {
      return null
    }

    page += 1
  }

  return null
}

export async function ensureSupabaseUserForLocalUser(input: {
  email: string
  password: string
  name?: string | null
  lastName?: string | null
  emailConfirmed?: boolean
}) {
  const supabase = createAdminClient()
  const email = sanitizeEmailValue(input.email)
  const password = String(input.password)
  const name = sanitizeTextValue(input.name, { maxLength: 60 }) || undefined
  const lastName = sanitizeTextValue(input.lastName, { maxLength: 60 }) || undefined
  const emailConfirmed = input.emailConfirmed !== false

  const existing = await findSupabaseUserByEmail(email)
  if (existing) {
    const { data, error } = await supabase.auth.admin.updateUserById(existing.id, {
      email,
      password,
      email_confirm: emailConfirmed,
      user_metadata: {
        name,
        lastName,
      },
    })

    if (error) {
      throw error
    }

    return data.user
  }

  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: emailConfirmed,
    user_metadata: {
      name,
      lastName,
    },
  })

  if (error) {
    throw error
  }

  return data.user
}

export async function deleteSupabaseUserByEmail(email: string) {
  const supabaseUser = await findSupabaseUserByEmail(email)
  if (!supabaseUser) return

  const supabase = createAdminClient()
  const { error } = await supabase.auth.admin.deleteUser(supabaseUser.id)
  if (error) {
    throw error
  }
}

export async function syncExistingUserPassword(input: {
  userId: string
  email: string
  password: string
  name?: string | null
  lastName?: string | null
  emailConfirmed?: boolean
}) {
  await ensureSupabaseUserForLocalUser(input)

  const hashedPassword = await bcrypt.hash(String(input.password), 12)
  await prisma.user.update({
    where: { id: input.userId },
    data: { password: hashedPassword },
  })

  return hashedPassword
}

export async function migrateLegacyUserPassword(email: string, password: string) {
  const normalizedEmail = sanitizeEmailValue(email)
  const localUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      name: true,
      lastName: true,
      password: true,
      isActive: true,
    },
  })

  if (!localUser || !localUser.isActive) {
    return { migrated: false, reason: 'not_found' as const }
  }

  const candidatePassword = String(password)
  const { isValid, needsRehash } = await verifyLocalPassword(localUser.password, candidatePassword)
  if (!isValid) {
    return { migrated: false, reason: 'invalid_password' as const }
  }

  await ensureSupabaseUserForLocalUser({
    email: localUser.email,
    password: candidatePassword,
    name: localUser.name,
    lastName: localUser.lastName,
  })

  if (needsRehash) {
    await prisma.user.update({
      where: { id: localUser.id },
      data: {
        password: await bcrypt.hash(candidatePassword, 12),
      },
    })
  }

  return { migrated: true as const }
}
