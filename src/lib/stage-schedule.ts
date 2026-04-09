import { addDays, differenceInCalendarDays, startOfDay } from 'date-fns'

export type SequentialStageInput = {
  plannedDate: Date | null
  durationDays?: number | null
  stageTemplateDurationDays?: number | null
}

export function normalizeDurationDays(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const normalized = Math.max(1, Math.floor(value))
  return normalized > 0 ? normalized : null
}

export function deriveSequentialStageDurations<T extends SequentialStageInput>(stages: T[]) {
  return stages.map((stage, index) => {
    const explicitDuration = normalizeDurationDays(stage.durationDays)
    if (explicitDuration !== null) {
      return { ...stage, durationDays: explicitDuration }
    }

    const nextStage = stages[index + 1]
    if (stage.plannedDate && nextStage?.plannedDate) {
      const dayDiff = differenceInCalendarDays(
        startOfDay(nextStage.plannedDate),
        startOfDay(stage.plannedDate)
      )

      if (dayDiff > 0) {
        return { ...stage, durationDays: dayDiff }
      }
    }

    const templateDuration = normalizeDurationDays(stage.stageTemplateDurationDays)
    return {
      ...stage,
      durationDays: templateDuration ?? 1,
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
