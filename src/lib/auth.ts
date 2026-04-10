import NextAuth from 'next-auth'
import bcrypt from 'bcryptjs'
import Credentials from 'next-auth/providers/credentials'
import { authConfig } from './auth.config'
import { prisma } from './prisma'
import { clearRateLimit, consumeRateLimit, getClientIpFromHeaders } from './rate-limit'

function normalizeSessionAvatar(avatar: string | null | undefined) {
  if (!avatar) return null

  const trimmed = avatar.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:image/')) return null
  if (trimmed.length > 1024) return null

  return trimmed
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      name: 'credentials',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials, request) {
        if (!credentials?.email || !credentials?.password) return null

        const email = String(credentials.email).trim().toLowerCase()
        const password = String(credentials.password)
        const loginRateLimitKey = `login:${getClientIpFromHeaders(request?.headers)}:${email}`
        const loginRateLimit = consumeRateLimit({
          key: loginRateLimitKey,
          limit: 10,
          windowMs: 15 * 60 * 1000,
        })

        if (!loginRateLimit.allowed) {
          console.warn('[auth] Login rate limit exceeded', { email })
          return null
        }

        let user = await prisma.user.findUnique({
          where: { email },
          select: {
            id: true,
            email: true,
            name: true,
            lastName: true,
            password: true,
            role: true,
            avatar: true,
            isActive: true,
          },
        })

        if (!user) {
          console.warn('[auth] Login rejected: user not found', { email })
          return null
        }

        if (!user.isActive) {
          console.warn('[auth] Login rejected: inactive user', { email })
          return null
        }

        const isValid = await bcrypt.compare(
          password,
          user.password
        )

        if (!isValid) {
          console.warn('[auth] Login rejected: invalid password', { email })
          return null
        }

        clearRateLimit(loginRateLimitKey)

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          lastName: user.lastName,
          role: user.role,
          avatar: normalizeSessionAvatar(user.avatar),
        }
      },
    }),
  ],
})

// Permission system (string-based roles for SQLite)
export enum Permission {
  VIEW_ALL_PRODUCTS = 'VIEW_ALL_PRODUCTS',
  VIEW_OWN_PRODUCTS = 'VIEW_OWN_PRODUCTS',
  EDIT_STAGES = 'EDIT_STAGES',
  EDIT_DATES = 'EDIT_DATES',
  MANAGE_AUTOMATIONS = 'MANAGE_AUTOMATIONS',
  ADD_COMMENTS = 'ADD_COMMENTS',
  MANAGE_USERS = 'MANAGE_USERS',
  VIEW_ANALYTICS = 'VIEW_ANALYTICS',
  ACCESS_SETTINGS = 'ACCESS_SETTINGS',
  DELETE_PRODUCTS = 'DELETE_PRODUCTS',
  IMPORT_DATA = 'IMPORT_DATA',
  VIEW_USER_PROFILES = 'VIEW_USER_PROFILES',
  EDIT_USER_PROFILES = 'EDIT_USER_PROFILES',
  VERIFY_USERS = 'VERIFY_USERS',
}

export function hasPermission(role: string, permission: Permission): boolean {
  const permissions: Record<string, Permission[]> = {
    ADMIN: Object.values(Permission),
    DIRECTOR: [
      Permission.VIEW_ALL_PRODUCTS, Permission.EDIT_STAGES, Permission.EDIT_DATES,
      Permission.VIEW_ANALYTICS, Permission.ADD_COMMENTS, Permission.MANAGE_AUTOMATIONS,
      Permission.VIEW_USER_PROFILES, Permission.EDIT_USER_PROFILES, Permission.VERIFY_USERS,
    ],
    PRODUCT_MANAGER: [
      Permission.VIEW_ALL_PRODUCTS, Permission.EDIT_STAGES, Permission.EDIT_DATES,
      Permission.ADD_COMMENTS, Permission.VIEW_ANALYTICS, Permission.MANAGE_AUTOMATIONS,
    ],
    EMPLOYEE: [Permission.VIEW_OWN_PRODUCTS, Permission.ADD_COMMENTS, Permission.VIEW_ANALYTICS],
    VIEWER: [Permission.VIEW_ALL_PRODUCTS, Permission.VIEW_ANALYTICS],
  }
  return permissions[role]?.includes(permission) ?? false
}
