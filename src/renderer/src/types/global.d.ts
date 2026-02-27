import type { GcsApi } from '@shared/types'

declare global {
  interface Window {
    gcsApi?: GcsApi
  }
}

export {}
