import assert from 'node:assert/strict'
import { serializeDateOnly } from '../src/lib/date-only'
import { getFinalDateFromStages } from '../src/lib/product-derived-fields'

function localDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, month - 1, day)
}

function finalDate(stages: Parameters<typeof getFinalDateFromStages>[0]) {
  return serializeDateOnly(getFinalDateFromStages(stages))
}

const stages = [
  { stageOrder: 0, isCompleted: false, dateValue: localDate('2026-10-01') },
  { stageOrder: 1, isCompleted: false, dateValue: localDate('2026-12-01') },
  { stageOrder: 2, isCompleted: false, dateValue: localDate('2026-11-02') },
]

assert.equal(finalDate(stages), '2026-12-01')
assert.equal(finalDate(stages.filter((stage) => stage.stageOrder !== 1)), '2026-11-02')

assert.equal(
  finalDate([
    { stageOrder: 0, isCompleted: false, dateValue: localDate('2026-10-01') },
    { stageOrder: 1, isCompleted: false, dateValue: localDate('2027-01-15') },
  ]),
  '2027-01-15'
)

assert.equal(
  finalDate([
    { stageOrder: 0, isCompleted: false, dateValue: localDate('2026-10-01') },
    { stageOrder: 1, isCompleted: false, dateValue: localDate('2026-09-01') },
  ]),
  '2026-10-01'
)

assert.equal(
  finalDate([
    {
      stageOrder: 0,
      isCompleted: false,
      dateValue: null,
      plannedDate: localDate('2026-08-20'),
    },
  ]),
  '2026-08-20'
)

assert.equal(finalDate([]), null)
assert.equal(
  finalDate([{ stageOrder: 0, isCompleted: false, dateValue: null, plannedDate: null }]),
  null
)

console.log('Product final date verification passed')
