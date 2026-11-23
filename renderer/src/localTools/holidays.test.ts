import { expect, it } from 'vitest'
import { holidaysOn } from './holidays'

it('separates official days off and rescheduled workdays from holiday names', () => {
  for (const date of ['2026-01-01', '2026-01-02', '2026-01-03']) expect(holidaysOn(date).status).toBe('休')
  expect(holidaysOn('2026-01-04').status).toBe('班')
  expect(holidaysOn('2030-12-25').schedule).toBeUndefined()
  expect(holidaysOn('2030-12-25').list[0].name).toBe('圣诞节')
})

it.each([
  ['2026-02-16', '除夕'], ['2026-02-17', '春节'], ['2026-04-05','清明节'],
  ['2026-04-05','西方复活节'], ['2026-11-26', '美国感恩节'], ['2026-10-12', '加拿大感恩节'],
])('%s contains %s', (date, name) => expect(holidaysOn(date).list.map(item => item.name)).toContain(name))
