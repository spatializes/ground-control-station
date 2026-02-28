import { describe, expect, it } from 'vitest'
import { haversineDistanceM, normalizeDirectionDeg, offsetLatLonByMeters, toFlowVector } from './windMath'

describe('windMath', () => {
  it('normalizes direction into 0..359 range', () => {
    expect(normalizeDirectionDeg(370)).toBe(10)
    expect(normalizeDirectionDeg(-45)).toBe(315)
  })

  it('converts wind from-heading to flow vector', () => {
    const fromNorth = toFlowVector(0)
    expect(fromNorth.east).toBeCloseTo(0, 6)
    expect(fromNorth.north).toBeCloseTo(-1, 6)

    const fromWest = toFlowVector(270)
    expect(fromWest.east).toBeCloseTo(1, 6)
    expect(fromWest.north).toBeCloseTo(0, 6)
  })

  it('computes haversine distance in meters', () => {
    const distance = haversineDistanceM(30.2672, -97.7431, 30.2872, -97.7431)
    expect(distance).toBeGreaterThan(2_100)
    expect(distance).toBeLessThan(2_300)
  })

  it('offsets coordinates by east/north meters', () => {
    const shifted = offsetLatLonByMeters(30, -97, 1_000, 1_000)
    expect(shifted.latitudeDeg).toBeGreaterThan(30)
    expect(shifted.longitudeDeg).toBeGreaterThan(-97)
  })
})
