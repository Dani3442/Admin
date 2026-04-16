import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import {
  adminProfileSchema,
  canDeleteUser,
  canEditOperationalProfileFields,
  canEditSensitiveProfileFields,
  canViewUserProfile,
  managerProfileSchema,
  normalizeAvatarValue,
  selfProfileSchema,
  userProfileSelect,
} from '@/lib/user-profile'
import { consumeRateLimit, getClientIpFromHeaders } from '@/lib/rate-limit'
import { deleteSupabaseUserByEmail, syncExistingUserPassword } from '@/lib/supabase/admin-users'

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const viewer = session?.user as any
  const { id } = await params

  if (!viewer?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  if (!canViewUserProfile(viewer.role, viewer.id, id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const profile = await prisma.user.findUnique({
    where: { id },
    select: userProfileSelect,
  })

  if (!profile) {
    return NextResponse.json({ error: 'Профиль не найден' }, { status: 404 })
  }

  return NextResponse.json(profile)
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const viewer = session?.user as any
  const { id } = await params

  if (!viewer?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true, email: true, name: true, lastName: true },
  })

  if (!target) {
    return NextResponse.json({ error: 'Профиль не найден' }, { status: 404 })
  }

  if (!canViewUserProfile(viewer.role, viewer.id, target.id)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rateLimit = consumeRateLimit({
    key: `api:users:update:${viewer.id}:${getClientIpFromHeaders(req.headers)}`,
    limit: 20,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  try {
    const body = await req.json()
    const isSelf = viewer.id === target.id
    const canEditOperational = canEditOperationalProfileFields(viewer.role, viewer.id, target.id, target.role)
    const canEditSensitive = canEditSensitiveProfileFields(viewer.role, viewer.id, target.id)

    if (!canEditOperational) {
      return NextResponse.json({ error: 'Недостаточно прав для редактирования профиля' }, { status: 403 })
    }

    const parser = isSelf ? selfProfileSchema : canEditSensitive ? adminProfileSchema : managerProfileSchema
    const parsed = parser.safeParse(body)

    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Некорректные данные профиля' }, { status: 400 })
    }

    const updateData: Record<string, unknown> = {
      name: parsed.data.name,
      lastName: parsed.data.lastName,
      jobTitle: parsed.data.jobTitle,
      avatar: normalizeAvatarValue((parsed.data as any).avatar),
    }

    if (!isSelf) {
      updateData.department = (parsed.data as any).department
      updateData.employeeType = (parsed.data as any).employeeType
      updateData.verificationStatus = (parsed.data as any).verificationStatus
    }

    if (canEditSensitive) {
      updateData.role = (parsed.data as any).role
      updateData.isActive = (parsed.data as any).isActive
    }

    if (canEditSensitive && (parsed.data as any).password) {
      await syncExistingUserPassword({
        userId: target.id,
        email: target.email,
        password: (parsed.data as any).password,
        name: parsed.data.name,
        lastName: parsed.data.lastName,
      })
      updateData.password = undefined
    }

    const profile = await prisma.user.update({
      where: { id: target.id },
      data: updateData,
      select: userProfileSelect,
    })

    return NextResponse.json(profile)
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось обновить профиль пользователя' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  const viewer = session?.user as any
  const { id } = await params

  if (!viewer?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const target = await prisma.user.findUnique({
    where: { id },
    select: { id: true, role: true },
  })

  if (!target) {
    return NextResponse.json({ error: 'Пользователь не найден' }, { status: 404 })
  }

  if (!canDeleteUser(viewer.role, viewer.id, target.id, target.role)) {
    return NextResponse.json({ error: 'Недостаточно прав для удаления сотрудника' }, { status: 403 })
  }

  const rateLimit = consumeRateLimit({
    key: `api:users:delete:${viewer.id}:${getClientIpFromHeaders(req.headers)}`,
    limit: 10,
    windowMs: 60 * 1000,
  })
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: 'Too many requests' }, { status: 429, headers: { 'Retry-After': String(rateLimit.retryAfterSeconds) } })
  }

  try {
    const targetUser = await prisma.user.findUnique({
      where: { id: target.id },
      select: { email: true },
    })

    await prisma.user.delete({
      where: { id: target.id },
    })

    if (targetUser?.email) {
      await deleteSupabaseUserByEmail(targetUser.email)
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Не удалось удалить сотрудника' }, { status: 500 })
  }
}
