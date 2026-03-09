import { describe, expect, it } from 'vitest'
import { assertSerialConnectOptions, assertWebSocketConnectOptions } from './validators'

describe('IPC validators', () => {
  describe('assertSerialConnectOptions', () => {
    it('accepts valid serial payloads and trims path', () => {
      const options = assertSerialConnectOptions({ path: '  /dev/cu.usbmodem1201  ', baudRate: 115200 })
      expect(options).toEqual({ path: '/dev/cu.usbmodem1201', baudRate: 115200 })
    })

    it('rejects invalid path', () => {
      expect(() => assertSerialConnectOptions({ path: '   ', baudRate: 115200 })).toThrow('path must be non-empty')
      expect(() => assertSerialConnectOptions({ path: 123, baudRate: 115200 })).toThrow('path must be a string')
    })

    it('rejects non-integer or out-of-range baud rate', () => {
      expect(() => assertSerialConnectOptions({ path: 'COM4', baudRate: 115200.5 })).toThrow('baudRate must be an integer')
      expect(() => assertSerialConnectOptions({ path: 'COM4', baudRate: 1000 })).toThrow('between 1200 and 3000000')
      expect(() => assertSerialConnectOptions({ path: 'COM4', baudRate: 4000000 })).toThrow('between 1200 and 3000000')
    })
  })

  describe('assertWebSocketConnectOptions', () => {
    it('accepts valid ws and wss urls and trims value', () => {
      expect(assertWebSocketConnectOptions({ url: '  ws://127.0.0.1:14550  ' })).toEqual({
        url: 'ws://127.0.0.1:14550'
      })

      expect(assertWebSocketConnectOptions({ url: 'wss://example.com/mavlink' })).toEqual({
        url: 'wss://example.com/mavlink'
      })
    })

    it('rejects invalid websocket urls', () => {
      expect(() => assertWebSocketConnectOptions({ url: '' })).toThrow('url must be non-empty')
      expect(() => assertWebSocketConnectOptions({ url: 'not-a-url' })).toThrow('url must be a valid URL')
      expect(() => assertWebSocketConnectOptions({ url: 'http://example.com' })).toThrow('protocol must be ws or wss')
    })
  })
})
