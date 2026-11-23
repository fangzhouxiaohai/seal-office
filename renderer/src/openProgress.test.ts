import { expect, it } from 'vitest'
import { needsBackgroundRead } from './openProgress'

it('starts background loading strictly above five decimal megabytes', () => {
  expect([4_999_999, 5_000_000, 5_000_001].map(needsBackgroundRead)).toEqual([false,false,true])
})
