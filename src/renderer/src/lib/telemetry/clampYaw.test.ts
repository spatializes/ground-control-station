import { describe, expect, it } from 'vitest'
import { clampYaw } from './clampYaw'

describe('clampYaw', () => {
  it('normalizes negative and overflow values', () => {
    expect(clampYaw(-10)).toBe(350)
    expect(clampYaw(370)).toBe(10)
    expect(clampYaw(720)).toBe(0)
  })
})
