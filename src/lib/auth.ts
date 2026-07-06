import { prisma } from './prisma'
import { createClient as createServerSupabaseClient } from './supabase/server'
import { cookies } from 'next/headers'
import { LOCAL_AUTH_COOKIE, normalizeLocalSessionUserId } from './local-auth-session'

function normalizeSessionAvatar(avatar: string | null | undefined) {
  if (!avatar) return null

  const trimmed = avatar.trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:image/')) return null
  if (trimmed.length > 1024) return null

  return trimmed
}

const PRODUCT_MANAGER_ACCESS_EMAILS = new Set([
  'shaykhutdinovaar@11i.pro',
])

function getEffectiveRole(email: string, storedRole: string) {
  return PRODUCT_MANAGER_ACCESS_EMAILS.has(email.trim().toLowerCase())
    ? 'PRODUCT_MANAGER'
    : storedRole
}

export type AppSession = {
  user: {
    id: string
    email: string
    name: string
    lastName: string | null
    role: string
    avatar: string | null
  }
} | null

export async function auth(): Promise<AppSession> {
  let email: string | null = null

  try {
    const supabase = await createServerSupabaseClient()
    const {
      data: { user: supabaseUser },
    } = await supabase.auth.getUser()

    email = supabaseUser?.email?.trim().toLowerCase() || null
  } catch {
    email = null
  }

  const userSelect = {
    id: true,
    email: true,
    name: true,
    lastName: true,
    role: true,
    avatar: true,
    isActive: true,
  }

  const user = email
    ? await prisma.user.findUnique({
        where: { email },
        select: userSelect,
      })
    : await (async () => {
        const cookieStore = await cookies()
        const localUserId = normalizeLocalSessionUserId(cookieStore.get(LOCAL_AUTH_COOKIE)?.value)
        if (!localUserId) return null

        return prisma.user.findUnique({
          where: { id: localUserId },
          select: userSelect,
        })
      })()

  if (!user || !user.isActive) {
    return null
  }

  return {
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      lastName: user.lastName,
      role: getEffectiveRole(user.email, user.role),
      avatar: normalizeSessionAvatar(user.avatar),
    },
  }
}

// Permission system (string-based roles for SQLite)
export enum Permission {
  VIEW_ALL_PRODUCTS = 'VIEW_ALL_PRODUCTS',
  VIEW_OWN_PRODUCTS = 'VIEW_OWN_PRODUCTS',
  CREATE_PRODUCTS = 'CREATE_PRODUCTS',
  ARCHIVE_PRODUCTS = 'ARCHIVE_PRODUCTS',
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
      Permission.VIEW_ALL_PRODUCTS, Permission.CREATE_PRODUCTS, Permission.ARCHIVE_PRODUCTS, Permission.EDIT_STAGES, Permission.EDIT_DATES,
      Permission.VIEW_ANALYTICS, Permission.ADD_COMMENTS, Permission.MANAGE_AUTOMATIONS,
      Permission.VIEW_USER_PROFILES, Permission.EDIT_USER_PROFILES, Permission.VERIFY_USERS,
    ],
    PRODUCT_MANAGER: [
      Permission.VIEW_ALL_PRODUCTS,
      Permission.CREATE_PRODUCTS,
      Permission.ARCHIVE_PRODUCTS,
      Permission.EDIT_STAGES,
      Permission.EDIT_DATES,
      Permission.MANAGE_AUTOMATIONS,
      Permission.ADD_COMMENTS,
      Permission.VIEW_ANALYTICS,
      Permission.ACCESS_SETTINGS,
      Permission.DELETE_PRODUCTS,
      Permission.IMPORT_DATA,
      Permission.VIEW_USER_PROFILES,
      Permission.EDIT_USER_PROFILES,
      Permission.VERIFY_USERS,
    ],
    EMPLOYEE: [
      Permission.VIEW_ALL_PRODUCTS,
      Permission.CREATE_PRODUCTS,
      Permission.ARCHIVE_PRODUCTS,
      Permission.ADD_COMMENTS,
      Permission.VIEW_ANALYTICS,
    ],
    VIEWER: [Permission.VIEW_ALL_PRODUCTS, Permission.VIEW_ANALYTICS],
  }
  return permissions[role]?.includes(permission) ?? false
}
