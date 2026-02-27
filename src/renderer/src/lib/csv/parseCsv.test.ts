import { describe, expect, it } from 'vitest'
import { parseCsv } from './parseCsv'

const SAMPLE_CSV = `TimeStampMS,GPS.Lat,GPS.Lng,GPS.Alt,GPS.Spd,ARSP.Airspeed,ATT.Pitch,ATT.Roll,ATT.Yaw
3,26.3,-97.1,100,11,15,3,4,350
1,26.1,-97.3,95,9,13,1,2,10
2,26.2,-97.2,98,10,14,2,3,20`

describe('parseCsv', () => {
  it('parses telemetry rows and sorts by timestamp', () => {
    const frames = parseCsv(SAMPLE_CSV)

    expect(frames).toHaveLength(3)
    expect(frames[0].timestampMs).toBe(1)
    expect(frames[1].timestampMs).toBe(2)
    expect(frames[2].timestampMs).toBe(3)
    expect(frames[0].source).toBe('csv')
  })

  it('throws when required columns are missing', () => {
    const brokenCsv = `TimeStampMS,GPS.Lat\n1,2`
    expect(() => parseCsv(brokenCsv)).toThrow('Missing required CSV column')
  })

  it('supports UTF-8 BOM on first header', () => {
    const csvWithBom = `\uFEFFTimeStampMS,GPS.Lat,GPS.Lng,GPS.Alt,GPS.Spd,ARSP.Airspeed,ATT.Pitch,ATT.Roll,ATT.Yaw\n1,26.1,-97.3,95,9,13,1,2,10`
    const frames = parseCsv(csvWithBom)
    expect(frames).toHaveLength(1)
    expect(frames[0].timestampMs).toBe(1)
  })
})
