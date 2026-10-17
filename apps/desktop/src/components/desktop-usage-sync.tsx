import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { $brandSession } from '@/store/brand-session'
import { $activeConnectionId } from '@/store/connections'
import { requestGatewayForAgent } from '@/store/gateway'
import { $gatewayState } from '@/store/session'
import { $settingsScopeProfile } from '@/store/settings-scope'
import { $usageMode, refreshDesktopAccess } from '@/store/usage-mode'

interface UsageSummary {
  cost_usd: number
  input_tokens: number
  models?: Array<{ model: string }>
  output_tokens: number
}

/** Posts the gateway's running token totals. The admin database keeps the official count. */
export function DesktopUsageSync() {
  const gatewayState = useStore($gatewayState)
  const brand = useStore($brandSession)
  const mode = useStore($usageMode)
  const connectionId = useStore($activeConnectionId)
  const scopeProfile = useStore($settingsScopeProfile)

  useEffect(() => {
    if (gatewayState !== 'open' || !brand.signedIn || mode !== 'ivx') {
      return
    }

    let stopped = false

    const tick = async () => {
      const summary = await requestGatewayForAgent<UsageSummary>(
        connectionId,
        scopeProfile,
        'usage.summary',
        scopeProfile ? { profile: scopeProfile } : {},
        undefined,
        undefined,
        { spawnPriority: 'background' }
      ).catch(() => null)

      if (stopped || !summary) {
        return
      }

      await window.hermesDesktop?.desktopAccess
        ?.reportUsage({
          inputTokens: summary.input_tokens,
          outputTokens: summary.output_tokens,
          costUsd: summary.cost_usd,
          model: summary.models?.[0]?.model || '',
          appId: brand.activeAppId
        })
        .catch(() => undefined)

      if (!stopped) {
        await refreshDesktopAccess()
      }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), 30_000)

    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [brand.activeAppId, brand.signedIn, connectionId, gatewayState, mode, scopeProfile])

  return null
}
