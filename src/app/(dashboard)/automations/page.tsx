import { prisma } from '@/lib/prisma'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { AutomationsClient } from '@/components/AutomationsClient'

async function getData() {
  const [automations, stages] = await Promise.all([
    prisma.automation.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.stageTemplate.findMany({ orderBy: { order: 'asc' } }),
  ])
  return { automations, stages }
}

export default async function AutomationsPage() {
  const session = await auth()
  if (!session?.user || !hasPermission((session.user as any).role, Permission.MANAGE_AUTOMATIONS)) {
    redirect('/dashboard')
  }

  const { automations, stages } = await getData()
  return <AutomationsClient automations={automations as any} stages={stages} />
}
