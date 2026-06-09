import assert from 'node:assert/strict'
import { serializeDateOnly } from '../src/lib/date-only'
import {
  applySequentialStageDateOverride,
  fillMissingSequentialStageDates,
} from '../src/lib/stage-schedule'

function localDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function stageDates(stages: Array<{ plannedDate: Date | null }>) {
  return stages.map((stage) => serializeDateOnly(stage.plannedDate))
}

const baseStages = [
  { plannedDate: localDate('2026-06-01'), durationDays: 3, participatesInAutoshift: true },
  { plannedDate: localDate('2026-06-04'), durationDays: 2, participatesInAutoshift: true },
  { plannedDate: localDate('2026-06-06'), durationDays: 1, participatesInAutoshift: true },
]

const savedManualDates = fillMissingSequentialStageDates([
  baseStages[0],
  { ...baseStages[1], plannedDate: localDate('2026-06-10') },
  { ...baseStages[2], plannedDate: localDate('2026-06-12') },
])
assert.deepEqual(stageDates(savedManualDates), ['2026-06-01', '2026-06-10', '2026-06-12'])

const disabledAutoshift = applySequentialStageDateOverride(
  [{ ...baseStages[0], participatesInAutoshift: false }, baseStages[1], baseStages[2]],
  0,
  baseStages[0].plannedDate
)
assert.deepEqual(stageDates(disabledAutoshift), ['2026-06-01', '2026-06-04', '2026-06-06'])

const shiftedFromFirstStage = applySequentialStageDateOverride(
  baseStages,
  0,
  localDate('2026-06-05')
)
assert.deepEqual(stageDates(shiftedFromFirstStage), ['2026-06-05', '2026-06-08', '2026-06-10'])

const shiftedParallelBlock = applySequentialStageDateOverride(
  [
    { ...baseStages[0], participatesInAutoshift: false },
    { ...baseStages[1], plannedDate: localDate('2026-06-01') },
    { ...baseStages[2], plannedDate: localDate('2026-06-03') },
  ],
  0,
  localDate('2026-06-05')
)
assert.deepEqual(stageDates(shiftedParallelBlock), ['2026-06-05', '2026-06-05', '2026-06-07'])

const filledMissingDates = fillMissingSequentialStageDates([
  baseStages[0],
  { ...baseStages[1], plannedDate: null },
  { ...baseStages[2], plannedDate: null },
])
assert.deepEqual(stageDates(filledMissingDates), ['2026-06-01', '2026-06-04', '2026-06-06'])

console.log('Stage schedule verification passed')
