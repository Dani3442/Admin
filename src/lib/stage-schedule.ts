import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns'

export type SequentialStageInput = {
  plannedDate: Date | null
  durationDays?: number | null
  stageTemplateDurationDays?: number | null
}

export type SequentialStageScheduleItem<T extends SequentialStageInput> = T & {
  effectiveDurationDays: number
}

export function normalizeDurationDays(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const normalized = Math.max(1, Math.floor(value))
  return normalized > 0 ? normalized : null
}

export function deriveSequentialStageDurations<T extends SequentialStageInput>(stages: T[]) {
  let previousResolvedDuration: number | null = null

  return stages.map((stage, index) => {
    const explicitDuration = normalizeDurationDays(stage.durationDays)
    const nextStage = stages[index + 1]

    let derivedDuration: number | null = null
    if (explicitDuration === null && stage.plannedDate && nextStage?.plannedDate) {
      const dayDiff = differenceInCalendarDays(startOfDay(nextStage.plannedDate), startOfDay(stage.plannedDate))
      if (dayDiff > 0) {
        derivedDuration = dayDiff
      }
    }

    const templateDuration = normalizeDurationDays(stage.stageTemplateDurationDays)
    const resolvedDuration =
      explicitDuration ??
      derivedDuration ??
      templateDuration ??
      previousResolvedDuration ??
      1

    previousResolvedDuration = resolvedDuration

    return {
      ...stage,
      durationDays: resolvedDuration,
    }
  })
}

export function recalculateSequentialStageDates<T extends SequentialStageInput>(stages: T[]) {
  const stagesWithDurations = deriveSequentialStageDurations(stages)

  if (stagesWithDurations.length === 0) return stagesWithDurations

  const firstStageStart = stagesWithDurations[0].plannedDate
  if (!firstStageStart) return stagesWithDurations

  let cursor = startOfDay(firstStageStart)

  return stagesWithDurations.map((stage, index) => {
    if (index === 0) {
      return {
        ...stage,
        plannedDate: cursor,
      }
    }

    const previousDuration = stagesWithDurations[index - 1].durationDays ?? 1
    cursor = addDays(cursor, previousDuration)

    return {
      ...stage,
      plannedDate: cursor,
    }
  })
}

export function buildSequentialStageSchedule<T extends SequentialStageInput>(
  stages: T[]
): Array<SequentialStageScheduleItem<T>> {
  const stagesWithDurations = deriveSequentialStageDurations(stages)

  if (stagesWithDurations.length === 0) return []

  const firstStageStart = stagesWithDurations[0].plannedDate
  if (!firstStageStart) {
    return stagesWithDurations.map((stage, index) => ({
      ...(stages[index] as T),
      plannedDate: null,
      effectiveDurationDays: stage.durationDays ?? 1,
    }))
  }

  let cursor = startOfDay(firstStageStart)

  return stagesWithDurations.map((stage, index) => {
    if (index > 0) {
      const previousDuration = stagesWithDurations[index - 1].durationDays ?? 1
      cursor = addDays(cursor, previousDuration)
    }

    return {
      ...(stages[index] as T),
      plannedDate: cursor,
      effectiveDurationDays: stage.durationDays ?? 1,
    }
  })
}
