import { Prisma } from '@prisma/client'
import { z } from 'zod'
import type { EmployeeType, UserRole, VerificationStatus } from '@/types'
import { sanitizeEmailValue, sanitizeTextValue } from '@/lib/input-security'

export const EMPLOYEE_TYPE_OPTIONS = ['INTERNAL', 'CONTRACTOR', 'PARTNER'] as const satisfies readonly EmployeeType[]
export const VERIFICATION_STATUS_OPTIONS = ['UNVERIFIED', 'PENDING', 'VERIFIED'] as const satisfies readonly VerificationStatus[]
export const PROFILE_ROLE_OPTIONS = ['ADMIN', 'DIRECTOR', 'PRODUCT_MANAGER', 'EMPLOYEE', 'VIEWER'] as const satisfies readonly UserRole[]

const IMAGE_DATA_URL_PATTERN = /^data:image\/(png|jpeg|jpg|webp|gif);base64,/i
const MAX_AVATAR_SIZE = 1024 * 1024

const optionalText = (max: number) =>
  z
    .string()
    .max(max, `Максимум ${max} символов`)
    .optional()
    .nullable()
    .transform((value) => {
      const nextValue = value == null ? null : sanitizeTextValue(value, { maxLength: max })
      return nextValue ? nextValue : null
    })

export const selfProfileSchema = z.object({
  name: z
    .string()
    .transform((value) => sanitizeTextValue(value, { maxLength: 60 }))
    .pipe(z.string().min(2, 'Имя должно содержать минимум 2 символа').max(60, 'Максимум 60 символов')),
  lastName: optionalText(60),
  jobTitle: optionalText(80),
  avatar: z.any().optional(),
})

export const managerProfileSchema = selfProfileSchema.extend({
  department: optionalText(80),
  employeeType: z.enum([...EMPLOYEE_TYPE_OPTIONS] as [string, ...string[]]),
  verificationStatus: z.enum([...VERIFICATION_STATUS_OPTIONS] as [string, ...string[]]),
})

export const adminProfileSchema = managerProfileSchema.extend({
  role: z.enum([...PROFILE_ROLE_OPTIONS] as [string, ...string[]]),
  isActive: z.boolean(),
  password: z.string().min(8, 'Пароль должен содержать минимум 8 символов').optional(),
})

export function normalizeAvatarValue(value: unknown) {
  if (value === undefined) return undefined
  if (value === null) return null
  if (typeof value !== 'string') {
    throw new Error('Некорректный формат аватарки')
  }

  const trimmed = value.trim()
  if (!trimmed) return null

  if (trimmed.startsWith('https://') || trimmed.startsWith('/')) {
    if (trimmed.length > MAX_AVATAR_SIZE) {
      throw new Error('Ссылка на аватар слишком длинная')
    }
    return trimmed
  }

  if (IMAGE_DATA_URL_PATTERN.test(trimmed)) {
    if (trimmed.length > MAX_AVATAR_SIZE * 1.5) {
      throw new Error('Аватар слишком большой. Используйте изображение до 1 МБ')
    }
    return trimmed
  }

  throw new Error('Разрешены только HTTPS-ссылки, локальные пути или загруженные изображения')
}

export const userProfileSelect = {
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
  updatedAt: true,
  _count: {
    select: {
      assignedProducts: true,
      comments: true,
      stageAssignments: true,
    },
  },
  assignedProducts: {
    orderBy: [{ isPinned: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'desc' }],
    take: 6,
    select: {
      id: true,
      name: true,
      status: true,
      finalDate: true,
    },
  },
} satisfies Prisma.UserSelect

export const sanitizedEmailSchema = z
  .string()
  .transform((value) => sanitizeEmailValue(value))
  .pipe(z.string().email('Некорректный email'))

export function canViewUserProfile(viewerRole: string, viewerId: string, targetId: string) {
  if (viewerId === targetId) return true
  return ['ADMIN', 'DIRECTOR'].includes(viewerRole)
}

export function canManageUserDirectory(viewerRole: string) {
  return ['ADMIN', 'DIRECTOR'].includes(viewerRole)
}

export function canCreateUser(viewerRole: string, nextRole: string) {
  if (viewerRole === 'ADMIN') return true
  if (viewerRole === 'DIRECTOR') {
    return !['ADMIN', 'DIRECTOR'].includes(nextRole)
  }
  return false
}

export function canDeleteUser(viewerRole: string, viewerId: string, targetId: string, targetRole: string) {
  if (viewerId === targetId) return false
  if (viewerRole === 'ADMIN') return true
  if (viewerRole === 'DIRECTOR') {
    return !['ADMIN', 'DIRECTOR'].includes(targetRole)
  }
  return false
}

export function canEditOperationalProfileFields(viewerRole: string, viewerId: string, targetId: string, targetRole: string) {
  if (viewerId === targetId) return true
  if (viewerRole === 'ADMIN') return true
  if (viewerRole === 'DIRECTOR') {
    return !['ADMIN', 'DIRECTOR'].includes(targetRole)
  }
  return false
}

export function canEditSensitiveProfileFields(viewerRole: string, viewerId: string, targetId: string) {
  if (viewerRole !== 'ADMIN') return false
  if (viewerId === targetId) return false
  return true
}
