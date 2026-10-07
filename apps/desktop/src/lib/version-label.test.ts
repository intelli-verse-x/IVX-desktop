import { describe, expect, it } from 'vitest'

import { bumpProductVersion, displayVersion, shortVersion } from './version-label'

describe('shortVersion', () => {
  it('keeps the distance past the release and drops the commit', (): void => {
    expect(shortVersion('0.21.5+1913.gf83a9e9')).toBe('0.21.5+1913')
    expect(shortVersion('v0.21.5+1913.gf83a9e9.dirty')).toBe('0.21.5+1913')
    expect(shortVersion('0.21.5+1913')).toBe('0.21.5+1913')
    expect(shortVersion('0.21.5')).toBe('0.21.5')
  })
})

describe('bumpProductVersion', () => {
  it('rolls patch at 5, then minor at 5', (): void => {
    expect(bumpProductVersion('1.0.0')).toBe('1.0.1')
    expect(bumpProductVersion('1.0.5')).toBe('1.1.0')
    expect(bumpProductVersion('1.5.5')).toBe('2.0.0')
  })
})

describe('displayVersion', () => {
  it('shows the product version for git checkouts', (): void => {
    expect(displayVersion('git.abcdef1', '1.0.3')).toBe('1.0.3')
  })
})
