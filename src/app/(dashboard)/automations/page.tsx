import { prisma } from '@/lib/prisma'
import { AutomationsClient } from '@/components/AutomationsClient'

async function getData() {
  const [automations, stages] = await Promise.all([
    prisma.automation.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.stageTemplate.findMany({ orderBy: { order: 'asc' } }),
  ])
  return { automations, stages }
}

export default async function AutomationsPage() {
  const { automations, stages } = await getData()
  return <AutomationsClient automations={automations as any} stages={stages} />
}
