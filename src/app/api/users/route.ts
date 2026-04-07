import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { canCreateUser, EMPLOYEE_TYPE_OPTIONS, PROFILE_ROLE_OPTIONS } from '@/lib/user-profile'
import { z } from 'zod'

const createUserSchema = z.object({
  email: z.string().trim().email('Некорректный email'),
  name: z.string().trim().min(2, 'Укажите имя').max(60),
  lastName: z.string().trim().max(60).optional().nullable(),
  password: z.string().min(8, 'Пароль должен содержать минимум 8 символов'),
  userRole: z.enum([...PROFILE_ROLE_OPTIONS] as [string, ...string[]]).default('EMPLOYEE'),
  jobTitle: z.string().trim().max(80).optional().nullable(),
  department: z.string().trim().max(80).optional().nullable(),
  employeeType: z.enum([...EMPLOYEE_TYPE_OPTIONS] as [string, ...string[]]).default('INTERNAL'),
})

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!['ADMIN', 'DIRECTOR'].includes((session.user as any).role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const users = await prisma.user.findMany({
    select: {
      id: true, email: true, name: true, lastName: true, role: true,
      avatar: true, jobTitle: true, department: true, employeeType: true,
      verificationStatus: true, isActive: true, createdAt: true,
      _count: { select: { assignedProducts: true } },
    },
    orderBy: { name: 'asc' },
  })

  return NextResponse.json(users)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const viewerRole = (session.user as any).role
  if (!['ADMIN', 'DIRECTOR'].includes(viewerRole)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const body = await req.json()
  const parsed = createUserSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message || 'Некорректные данные пользователя' }, { status: 400 })
  }

  const { email, name, lastName, password, userRole, jobTitle, department, employeeType } = parsed.data

  if (!canCreateUser(viewerRole, userRole)) {
    return NextResponse.json({ error: 'Недостаточно прав для создания сотрудника с этой ролью' }, { status: 403 })
  }

  const existing = await prisma.user.findUnique({ where: { email } })
  if (existing) return NextResponse.json({ error: 'Пользователь уже существует' }, { status: 400 })

  const hashed = await bcrypt.hash(password, 12)
  const user = await prisma.user.create({
    data: {
      email,
      name,
      lastName: lastName?.trim() || null,
      password: hashed,
      role: userRole,
      jobTitle: jobTitle?.trim() || null,
      department: department?.trim() || null,
      employeeType,
      verificationStatus: 'PENDING',
    },
    select: {
      id: true,
      email: true,
      name: true,
      lastName: true,
      role: true,
      avatar: true,
      jobTitle: true,
      department: true,
      employeeType: true,
      verificationStatus: true,
      isActive: true,
      createdAt: true,
    },
  })

  return NextResponse.json(user, { status: 201 })
}
