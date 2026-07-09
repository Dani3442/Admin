import { normalizeDurationDays } from '@/lib/stage-schedule'

export type ParallelRuleStage = {
  id: string
  stageOrder: number
  stageName: string
  durationDays?: number | null
}

export type ParallelStartRuleUpdate = {
  startTrigger: 'PRODUCT_CREATED' | 'PREVIOUS_STAGE_COMPLETED' | 'STAGE_STARTED' | 'STAGE_COMPLETED'
  startDelayDays: number
  startReferenceStageOrder: number | null
}

function byStageName(stages: ParallelRuleStage[]) {
  return new Map(stages.map((stage) => [stage.stageName, stage]))
}

function delayWeekBeforeEnd(durationDays?: number | null) {
  return Math.max((normalizeDurationDays(durationDays) ?? 30) - 7, 0)
}

function setRule(
  updates: Map<string, ParallelStartRuleUpdate>,
  stage: ParallelRuleStage | undefined,
  update: ParallelStartRuleUpdate
) {
  if (!stage) return
  updates.set(stage.id, update)
}

export function getParallelStartRuleUpdates(stages: ParallelRuleStage[]) {
  const stageByName = byStageName(stages)
  const updates = new Map<string, ParallelStartRuleUpdate>()

  const rfSample = stageByName.get('4.1. Образец')
  const rfDocuments = stageByName.get('4.2. Документы')
  const rfPreparation = stageByName.get('5. Подготовка')
  const rfProduction = stageByName.get('6.2. Производство')

  setRule(updates, rfDocuments, {
    startTrigger: 'STAGE_STARTED',
    startReferenceStageOrder: rfSample?.stageOrder ?? null,
    startDelayDays: 0,
  })
  setRule(updates, rfPreparation, {
    startTrigger: 'STAGE_COMPLETED',
    startReferenceStageOrder: rfSample?.stageOrder ?? null,
    startDelayDays: 0,
  })
  for (const stageName of ['6.1. ДС', '6.2. Производство', '6.3. Информирование']) {
    setRule(updates, stageByName.get(stageName), {
      startTrigger: 'STAGE_COMPLETED',
      startReferenceStageOrder: rfPreparation?.stageOrder ?? null,
      startDelayDays: 0,
    })
  }
  setRule(updates, stageByName.get('6.4. Чек пр-ва'), {
    startTrigger: 'STAGE_STARTED',
    startReferenceStageOrder: rfProduction?.stageOrder ?? null,
    startDelayDays: delayWeekBeforeEnd(rfProduction?.durationDays),
  })

  const chinaCargoSamples = stageByName.get('4.1. Подготовка карго образцов')
  const chinaDocs064 = stageByName.get('5.1. Документация 064')

  setRule(updates, chinaDocs064, {
    startTrigger: 'STAGE_STARTED',
    startReferenceStageOrder: chinaCargoSamples?.stageOrder ?? null,
    startDelayDays: 30,
  })
  setRule(updates, stageByName.get('7.1. Подготовка к запуску'), {
    startTrigger: 'STAGE_STARTED',
    startReferenceStageOrder: chinaDocs064?.stageOrder ?? null,
    startDelayDays: 0,
  })
  setRule(updates, stageByName.get('6.1. Декларация'), {
    startTrigger: 'PRODUCT_CREATED',
    startReferenceStageOrder: null,
    startDelayDays: 30,
  })

  return updates
}
