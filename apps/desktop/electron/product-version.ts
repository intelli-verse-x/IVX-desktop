import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import seed from '../product-version.json'

const RECEIPT_NAME = 'hermes-prebuilt.json'
const VERSION_RE = /^\d+\.\d+\.\d+$/

export function seedProductVersion(): string {
  return VERSION_RE.test(seed.version) ? seed.version : '1.0.0'
}

/** Prefer the CI receipt next to the packaged exe; fall back to the seed file. */
export function resolveProductVersion(updateRoot: string): string {
  const receiptPath = path.join(updateRoot, 'apps', 'desktop', 'release', 'win-unpacked', RECEIPT_NAME)

  if (existsSync(receiptPath)) {
    try {
      const payload = JSON.parse(readFileSync(receiptPath, 'utf8')) as { productVersion?: unknown }
      const recorded = typeof payload.productVersion === 'string' ? payload.productVersion.trim() : ''

      if (VERSION_RE.test(recorded)) {
        return recorded
      }
    } catch {
      // Seed below.
    }
  }

  return seedProductVersion()
}
