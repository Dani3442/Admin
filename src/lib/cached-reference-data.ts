import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'

const REFERENCE_REVALIDATE_SECONDS = 60

const getCachedAssignableUsersInternal = unstable_cache(
  async () =>
    prisma.user.findMany({
      where: { isActive: true },
      select: { id: true, name: true, lastName: true, avatar: true },
      orderBy: { name: 'asc' },
    }),
  ['assignable-users-v1'],
  { revalidate: REFERENCE_REVALIDATE_SECONDS }
)

const getCachedStageTemplatesInternal = unstable_cache(
  async () =>
    prisma.stageTemplate.findMany({
      select: {
        id: true,
        name: true,
        order: true,
        durationText: true,
        isCritical: true,
        participatesInAutoshift: true,
      },
      orderBy: { order: 'asc' },
    }),
  ['stage-templates-v1'],
  { revalidate: REFERENCE_REVALIDATE_SECONDS }
)

const getCachedStageSuggestionsInternal = unstable_cache(
  async () =>
    prisma.stageTemplate.findMany({
      select: { id: true, name: true },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    }),
  ['stage-suggestions-v1'],
  { revalidate: REFERENCE_REVALIDATE_SECONDS }
)

const getCachedProductTemplatesInternal = unstable_cache(
  async (hasDurationDaysColumn: boolean) =>
    prisma.productTemplate.findMany({
      select: {
        id: true,
        name: true,
        description: true,
        createdAt: true,
        updatedAt: true,
        stages: {
          orderBy: { stageOrder: 'asc' },
          select: {
            id: true,
            stageTemplateId: true,
            stageOrder: true,
            stageName: true,
            plannedDate: true,
            ...(hasDurationDaysColumn ? { durationDays: true } : {}),
            stageTemplate: {
              select: {
                durationDays: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }],
    }),
  ['product-templates-v1'],
  { revalidate: REFERENCE_REVALIDATE_SECONDS }
)

export async function getCachedAssignableUsers() {
  return getCachedAssignableUsersInternal()
}

export async function getCachedStageTemplates() {
  return getCachedStageTemplatesInternal()
}

export async function getCachedStageSuggestions() {
  return getCachedStageSuggestionsInternal()
}

export async function getCachedProductTemplates(hasDurationDaysColumn: boolean) {
  return getCachedProductTemplatesInternal(hasDurationDaysColumn)
}
