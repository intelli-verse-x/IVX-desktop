/**
 * The one short form every surface names a version by: `<release>+<distance>`
 * (`0.21.5+1913`), matching `hermes --version` minus its commit. The commit
 * (`.g<sha>`, `.dirty`) is build metadata the expanded version details show in
 * full; in a label it only adds noise. Callers own the `v` prefix, which the
 * localized copy already carries.
 */
import productVersion from '../../product-version.json'

export function shortVersion(version: string): string {
  return version.replace(/^v/, '').replace(/(\+\d+)\.g[0-9a-f]+(?:\.dirty)?$/i, '$1')
}

/**
 * Source checkouts report `git.<sha>`. About shows this product version
 * instead. CI bumps it on each desktop publish (1.0.5 → 1.1.0, …, 1.5.5 → 2.0.0).
 */
export const PRODUCT_VERSION = productVersion.version

const PRODUCT_VERSION_RE = /^\d+\.\d+\.\d+$/

export function bumpProductVersion(version: string): string {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim())

  if (!match) {
    throw new Error(`invalid product version: ${version}`)
  }

  let major = Number(match[1])
  let minor = Number(match[2])
  let patch = Number(match[3]) + 1

  if (patch > 5) {
    patch = 0
    minor += 1

    if (minor > 5) {
      minor = 0
      major += 1
    }
  }

  return `${major}.${minor}.${patch}`
}

export function displayVersion(version: string, productVersionOverride?: string | null): string {
  const short = shortVersion(version)
  const product =
    productVersionOverride && PRODUCT_VERSION_RE.test(productVersionOverride)
      ? productVersionOverride
      : PRODUCT_VERSION

  return /^git\.[0-9a-f]+(?:\.dirty)?$/i.test(short) ? product : short
}
