import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { $brandSession } from '@/store/brand-session'
import { $activeConnectionId } from '@/store/connections'
import { requestGatewayForAgent } from '@/store/gateway'
import { $gatewayState, $sessions } from '@/store/session'
import { $settingsScopeProfile } from '@/store/settings-scope'
import { refreshDesktopAccess } from '@/store/usage-mode'

interface UsageModelTotal {
  input_tokens?: number
  model: string
  output_tokens?: number
  total_tokens?: number
}

interface UsageSummary {
  models?: UsageModelTotal[]
}

export interface ModelUsageReport {
  inputTokens: number
  model: string
  outputTokens: number
}

function modelsFromSessions(): ModelUsageReport[] {
  const byModel = new Map<string, ModelUsageReport>()

  for (const session of $sessions.get()) {
    const model = String(session.model || '').trim()
    if (!model) {
      continue
    }

    const inputTokens = Number(session.input_tokens) || 0
    const outputTokens = Number(session.output_tokens) || 0
    if (inputTokens + outputTokens < 1) {
      continue
    }

    const row = byModel.get(model) || { model, inputTokens: 0, outputTokens: 0 }
    row.inputTokens += inputTokens
    row.outputTokens += outputTokens
    byModel.set(model, row)
  }

  return [...byModel.values()]
}

function modelsFromSummary(summary: UsageSummary | null): ModelUsageReport[] {
  if (!summary?.models?.length) {
    return []
  }

  return summary.models
    .map(row => {
      const model = String(row.model || '').trim()
      const inputTokens = Number(row.input_tokens) || 0
      const outputTokens = Number(row.output_tokens) || 0
      const total = Number(row.total_tokens) || inputTokens + outputTokens
      if (!model || total < 1) {
        return null
      }

      if (inputTokens + outputTokens < 1 && total > 0) {
        return { model, inputTokens: total, outputTokens: 0 }
      }

      return { model, inputTokens, outputTokens }
    })
    .filter((row): row is ModelUsageReport => row !== null)
}

function pickModelReports(summary: UsageSummary | null): ModelUsageReport[] {
  const fromSummary = modelsFromSummary(summary)
  const fromSessions = modelsFromSessions()
  if (!fromSummary.length) {
    return fromSessions
  }
  if (!fromSessions.length) {
    return fromSummary
  }

  const summaryTotal = fromSummary.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0)
  const sessionTotal = fromSessions.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0)

  return sessionTotal > summaryTotal ? fromSessions : fromSummary
}

/** Posts per-model token totals. The admin database keeps the official count. */
export function DesktopUsageSync() {
  const gatewayState = useStore($gatewayState)
  const brand = useStore($brandSession)
  const connectionId = useStore($activeConnectionId)
  const scopeProfile = useStore($settingsScopeProfile)
  const sessions = useStore($sessions)

  useEffect(() => {
    if (!brand.signedIn) {
      return
    }

    let stopped = false

    const tick = async () => {
      let summary: UsageSummary | null = null

      if (gatewayState === 'open') {
        summary = await requestGatewayForAgent<UsageSummary>(
          connectionId,
          scopeProfile,
          'usage.summary',
          scopeProfile ? { profile: scopeProfile } : {},
          undefined,
          undefined,
          { spawnPriority: 'background' }
        ).catch(() => null)
      }

      if (stopped) {
        return
      }

      const models = pickModelReports(summary)
      if (!models.length) {
        return
      }

      try {
        const inputTokens = models.reduce((sum, row) => sum + row.inputTokens, 0)
        const outputTokens = models.reduce((sum, row) => sum + row.outputTokens, 0)
        const next = await window.hermesDesktop?.desktopAccess?.reportUsage({
          models,
          inputTokens,
          outputTokens,
          model: models[0]?.model,
          costUsd: 0,
          appId: brand.activeAppId
        })

        if (!next && !stopped) {
          console.warn('[ivx] desktop usage report returned no data')
        }
      } catch (error) {
        console.warn('[ivx] desktop usage report failed', error)
      }

      if (!stopped) {
        await refreshDesktopAccess()
      }
    }

    void tick()
    const timer = window.setInterval(() => void tick(), 15_000)

    return () => {
      stopped = true
      window.clearInterval(timer)
    }
  }, [brand.activeAppId, brand.signedIn, connectionId, gatewayState, scopeProfile, sessions])

  return null
}
