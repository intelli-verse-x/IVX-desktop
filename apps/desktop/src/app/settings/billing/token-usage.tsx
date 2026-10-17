import { compactNumber } from '@hermes/shared'
import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { useI18n } from '@/i18n'
import { Activity } from '@/lib/icons'
import { $activeConnectionId } from '@/store/connections'
import { requestGatewayForAgent } from '@/store/gateway'
import { $gatewayState } from '@/store/session'
import { $settingsScopeProfile } from '@/store/settings-scope'

import { ListRow, SettingsSection } from '../primitives'

interface UsageModelTotal {
  model: string
  total_tokens: number
  cost_usd: number
}

interface UsageSummary {
  input_tokens: number
  output_tokens: number
  cache_read_tokens: number
  cache_write_tokens: number
  reasoning_tokens: number
  total_tokens: number
  cost_usd: number
  chat_count: number
  models: UsageModelTotal[]
}

function formatCost(amount: number): string {
  return `$${amount.toFixed(2)}`
}

/** Gateway token usage (moved from Account into Billing). */
export function TokenUsage() {
  const { t } = useI18n()
  const copy = t.settings.account
  const gatewayState = useStore($gatewayState)
  const connectionId = useStore($activeConnectionId)
  const scopeProfile = useStore($settingsScopeProfile)
  const [summary, setSummary] = useState<UsageSummary | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (gatewayState !== 'open') {
      return
    }

    let cancelled = false
    setFailed(false)

    void requestGatewayForAgent<UsageSummary>(
      connectionId,
      scopeProfile,
      'usage.summary',
      scopeProfile ? { profile: scopeProfile } : {},
      undefined,
      undefined,
      { spawnPriority: 'foreground' }
    )
      .then(next => {
        if (!cancelled) {
          setSummary(next)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFailed(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [connectionId, gatewayState, scopeProfile])

  const cache = (summary?.cache_read_tokens ?? 0) + (summary?.cache_write_tokens ?? 0)

  return (
    <SettingsSection icon={Activity} title={copy.limitsTitle}>
      <p className="mb-2 text-[length:var(--conversation-caption-font-size)] leading-(--conversation-caption-line-height) text-(--ui-text-tertiary)">
        {copy.limitsBody}
      </p>
      {failed ? (
        <p className="mb-4 text-sm text-(--ui-text-tertiary)">{copy.usageUnavailable}</p>
      ) : summary && summary.total_tokens > 0 ? (
        <>
          <ListRow
            action={compactNumber(summary.total_tokens)}
            description={copy.usageChats(summary.chat_count)}
            title={copy.usageTotal}
          />
          <ListRow action={compactNumber(summary.input_tokens)} title={copy.usageInput} />
          <ListRow action={compactNumber(summary.output_tokens)} title={copy.usageOutput} />
          <ListRow action={compactNumber(cache)} title={copy.usageCache} />
          <ListRow action={compactNumber(summary.reasoning_tokens)} title={copy.usageReasoning} />
          <ListRow action={formatCost(summary.cost_usd)} title={copy.usageCost} />
          {summary.models.length > 0 ? (
            <>
              <p className="mt-3 mb-1 text-xs font-medium text-(--ui-text-secondary)">{copy.usageModels}</p>
              {summary.models.map(row => (
                <ListRow
                  action={compactNumber(row.total_tokens)}
                  description={formatCost(row.cost_usd)}
                  key={row.model}
                  title={row.model}
                />
              ))}
            </>
          ) : null}
        </>
      ) : (
        <p className="mb-4 text-sm text-(--ui-text-tertiary)">{summary ? copy.usageEmpty : ''}</p>
      )}
    </SettingsSection>
  )
}
