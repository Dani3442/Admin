import { NextRequest, NextResponse } from 'next/server'
import { auth, hasPermission, Permission } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function normalizeStageName(name: string) {
  return name.trim().replace(/\s+/g, ' ')
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const templates = await prisma.productTemplate.findMany({
    include: {
      stages: {
        orderBy: { stageOrder: 'asc' },
        include: {
          stageTemplate: {
            select: {
              participatesInAutoshift: true,
            },
          },
        },
      },
    },
    orderBy: [{ createdAt: 'desc' }],
  })

  return NextResponse.json(
    templates.map((template) => ({
      ...template,
      stages: template.stages.map((stage) => ({
        id: stage.id,
        stageTemplateId: stage.stageTemplateId,
        stageOrder: stage.stageOrder,
        stageName: stage.stageName,
        plannedDate: stage.plannedDate,
        participatesInAutoshift: stage.stageTemplate.participatesInAutoshift,
      })),
    }))
  )
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasPermission((session.user as any).role, Permission.EDIT_STAGES)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const templateName = String(body?.name || '').trim()
    const description = typeof body?.description === 'string' ? body.description.trim() : ''
    const rawStages = Array.isArray(body?.stages) ? body.stages : []

    const stages = rawStages
      .map((stage: any, index: number) => ({
        stageOrder: index,
        stageName: normalizeStageName(String(stage?.stageName || '')),
        plannedDate: stage?.plannedDate ? new Date(stage.plannedDate) : null,
        participatesInAutoshift: stage?.participatesInAutoshift !== false,
      }))
      .filter((stage: { stageName: string }) => stage.stageName)

    if (!templateName) {
      return NextResponse.json({ error: 'Укажите название шаблона' }, { status: 400 })
    }

    if (stages.length === 0) {
      return NextResponse.json({ error: 'Добавьте хотя бы один этап в шаблон' }, { status: 400 })
    }

    const duplicateNames = new Set<string>()
    const usedNames = new Set<string>()
    for (const stage of stages) {
      const key = stage.stageName.toLowerCase()
      if (usedNames.has(key)) duplicateNames.add(stage.stageName)
      usedNames.add(key)
    }

    if (duplicateNames.size > 0) {
      return NextResponse.json(
        { error: `Повторяются этапы: ${Array.from(duplicateNames).join(', ')}` },
        { status: 400 }
      )
    }

    const template = await prisma.$transaction(async (tx) => {
      const existingStageTemplates = await tx.stageTemplate.findMany({
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      })

      let nextOrder = (existingStageTemplates.at(-1)?.order ?? -1) + 1

      const resolvedStages: Array<{
        stageTemplateId: string
        stageOrder: number
        stageName: string
        plannedDate: Date | null
      }> = []

      for (const stage of stages) {
        let stageTemplate = existingStageTemplates.find(
          (existing) => existing.name.trim().toLowerCase() === stage.stageName.toLowerCase()
        )

        if (!stageTemplate) {
          stageTemplate = await tx.stageTemplate.create({
            data: {
              name: stage.stageName,
              order: nextOrder,
              durationText: null,
              durationDays: null,
              isCritical: false,
              affectsFinalDate: true,
              participatesInAutoshift: stage.participatesInAutoshift,
            },
          })
          existingStageTemplates.push(stageTemplate)
          nextOrder += 1
        }

        resolvedStages.push({
          stageTemplateId: stageTemplate.id,
          stageOrder: stage.stageOrder,
          stageName: stage.stageName,
          plannedDate: stage.plannedDate,
        })
      }

      const createdTemplate = await tx.productTemplate.create({
        data: {
          name: templateName,
          description: description || null,
          stages: {
            create: resolvedStages,
          },
        },
      })

      return tx.productTemplate.findUniqueOrThrow({
        where: { id: createdTemplate.id },
        include: {
          stages: {
            orderBy: { stageOrder: 'asc' },
            include: {
              stageTemplate: {
                select: {
                  participatesInAutoshift: true,
                },
              },
            },
          },
        },
      })
    })

    return NextResponse.json({
      ...template,
      stages: template.stages.map((stage) => ({
        id: stage.id,
        stageTemplateId: stage.stageTemplateId,
        stageOrder: stage.stageOrder,
        stageName: stage.stageName,
        plannedDate: stage.plannedDate,
        participatesInAutoshift: stage.stageTemplate.participatesInAutoshift,
      })),
    }, { status: 201 })
  } catch (error) {
    console.error('[product-templates:create] Failed to create template', error)
    return NextResponse.json({ error: 'Не удалось создать шаблон этапов' }, { status: 500 })
  }
}
