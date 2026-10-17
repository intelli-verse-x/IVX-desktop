import { useStore } from '@nanostores/react'
import { useEffect, useRef } from 'react'

import { $brandConnectors, emptyBrandConnectors } from '@/store/brand-connectors'
import { $brandSession, type BrandSession } from '@/store/brand-session'

import { releaseBrandMcp, syncBrandMcp } from './sync-brand-mcp'

function applyBrand(next: BrandSession): void {
  $brandSession.set(next)
}

/**
 * Loads portal brand state in the background. Sign-in is optional — never block
 * the app with a login cover for new or signed-out users.
 */
export function BrandGate() {
  const brand = useStore($brandSession)
  const wasSignedIn = useRef(false)
  const api = typeof window !== 'undefined' ? window.hermesDesktop?.brand : undefined

  useEffect(() => {
    if (!api) {
      return
    }

    let cancelled = false

    void api
      .get()
      .then(next => {
        if (!cancelled) {
          applyBrand(next)
        }
      })
      .catch(() => undefined)

    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    if (!api?.connectors) {
      return
    }

    if (!brand.signedIn || !brand.activeAppId) {
      $brandConnectors.set(emptyBrandConnectors())

      if (wasSignedIn.current) {
        wasSignedIn.current = false
        void releaseBrandMcp().catch(() => undefined)
      }

      return
    }

    wasSignedIn.current = true

    let cancelled = false

    void api
      .connectors()
      .then(next => {
        if (cancelled) {
          return
        }

        $brandConnectors.set(next)
        void syncBrandMcp(next.connectors).catch(() => undefined)
      })
      .catch(() => {
        if (!cancelled) {
          $brandConnectors.set({
            ...emptyBrandConnectors(brand.activeAppId),
            error: 'Could not load this brand’s tools.'
          })
        }
      })

    return () => {
      cancelled = true
    }
  }, [api, brand.activeAppId, brand.signedIn])

  return null
}
