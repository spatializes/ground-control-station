import { describe, expect, it, vi } from 'vitest'
import { fetchOpenMeteoWind, parseOpenMeteoWindPayload } from './fetchOpenMeteoWind'

describe('parseOpenMeteoWindPayload', () => {
  it('parses valid payload', () => {
    const snapshot = parseOpenMeteoWindPayload(
      {
        current: {
          wind_speed_10m: 8.3,
          wind_direction_10m: 405
        }
      },
      12345
    )

    expect(snapshot.source).toBe('open-meteo')
    expect(snapshot.speedMps).toBe(8.3)
    expect(snapshot.fromDirectionDeg).toBe(45)
    expect(snapshot.updatedAtMs).toBe(12345)
  })

  it('throws when required fields are missing', () => {
    expect(() => parseOpenMeteoWindPayload({ current: {} })).toThrowError(
      'Open-Meteo response missing current.wind_speed_10m'
    )
  })
})

describe('fetchOpenMeteoWind', () => {
  it('requests open-meteo and returns parsed snapshot', async () => {
    const fetchMock = vi.fn(async (input: URL | RequestInfo) => {
      const url = typeof input === 'string' ? input : String(input)
      expect(url).toContain('api.open-meteo.com/v1/forecast?')
      expect(url).toContain('latitude=30.267200')
      expect(url).toContain('longitude=-97.743100')
      expect(url).toContain('current=wind_speed_10m%2Cwind_direction_10m')

      return {
        ok: true,
        status: 200,
        json: async () => ({
          current: {
            wind_speed_10m: 7.2,
            wind_direction_10m: 212
          }
        })
      } as Response
    })

    const snapshot = await fetchOpenMeteoWind(30.2672, -97.7431, fetchMock as typeof fetch)

    expect(snapshot.speedMps).toBe(7.2)
    expect(snapshot.fromDirectionDeg).toBe(212)
    expect(snapshot.source).toBe('open-meteo')
  })

  it('throws for non-OK responses', async () => {
    const fetchMock = vi.fn(async () => {
      return {
        ok: false,
        status: 503,
        json: async () => ({})
      } as Response
    })

    await expect(fetchOpenMeteoWind(30, -97, fetchMock as typeof fetch)).rejects.toThrowError(
      'Open-Meteo request failed (503)'
    )
  })
})
