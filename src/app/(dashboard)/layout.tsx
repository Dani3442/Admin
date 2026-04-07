import { redirect } from 'next/navigation'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { DashboardShell } from '@/components/layout/DashboardShell'
import { prisma } from '@/lib/prisma'

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await auth()
  if (!session?.user) redirect('/login')

  const canCreateProduct = hasPermission((session.user as any).role, Permission.EDIT_STAGES)

  const createProductData = canCreateProduct
    ? await Promise.all([
        prisma.user.findMany({
          where: { isActive: true },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        }),
        prisma.productTemplate.findMany({
          include: {
            stages: {
              orderBy: { stageOrder: 'asc' },
              select: {
                id: true,
                stageTemplateId: true,
                stageOrder: true,
                stageName: true,
                plannedDate: true,
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }],
        }),
        prisma.stageTemplate.findMany({
          select: { id: true, name: true },
          orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        }),
      ]).then(([users, productTemplates, stageSuggestions]) => ({
        users,
        productTemplates: productTemplates.map((template) => ({
          ...template,
          stages: template.stages.map((stage) => ({
            id: stage.id,
            stageTemplateId: stage.stageTemplateId,
            stageOrder: stage.stageOrder,
            stageName: stage.stageName,
            plannedDate: stage.plannedDate,
            participatesInAutoshift: true,
          })),
        })),
        stageSuggestions,
      }))
    : null

  return (
    <DashboardShell
      user={session.user as any}
      canCreateProduct={canCreateProduct}
      createProductData={createProductData as any}
    >
      {children}
    </DashboardShell>
  )
}
