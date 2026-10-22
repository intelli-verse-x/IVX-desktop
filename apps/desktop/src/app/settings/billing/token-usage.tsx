import { compactNumber } from '@hermes/shared'
import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { useI18n } from '@/i18n'
import { Activity } from '@/lib/icons'
import { $brandSession } from '@/store/brand-session'

import { ListRow, SettingsSection } from '../primitives'

interface ModelUsageRow {
  inputTokens: number
  model: string
  outputTokens: number
}

interface DesktopUsageView {
  creditCents: number
  email: string
  inputTokens: number
  modelUsage: ModelUsageRow[]
  outputTokens: number
}

function dollars(cents: number): string {
  return `$${(Math.max(0, cents) / 100).toFixed(2)}`
}

/** Official token usage from the admin Desktop access API (same DB as the portal). */
export function TokenUsage() {
  const { t } = useI18n()
  const copy = t.settings.account
  const brand = useStore($brandSession)
  const [view, setView] = useState<DesktopUsageView | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!brand.signedIn) {
      setView(null)
      setFailed(false)
      setLoading(false)

      return
    }

    const api = window.hermesDesktop?.desktopAccess
    if (!api?.status) {
      setFailed(true)
      setView(null)

      return
    }

    let cancelled = false
    setLoading(true)
    setFailed(false)

    const load = () => {
      void api
        .status(brand.activeAppId)
        .then(next => {
          if (cancelled) {
            return
          }

          if (!next) {
            setView(null)
            setFailed(true)

            return
          }

          const modelUsage = Array.isArray(next.modelUsage)
            ? next.modelUsage
                .map(row => ({
                  model: String(row?.model || '').trim(),
                  inputTokens: Number(row?.inputTokens) || 0,
                  outputTokens: Number(row?.outputTokens) || 0
                }))
                .filter(row => row.model && row.inputTokens + row.outputTokens > 0)
            : []

          setView({
            email: next.email,
            creditCents: Number(next.creditCents) || 0,
            inputTokens: Number(next.inputTokens) || 0,
            outputTokens: Number(next.outputTokens) || 0,
            modelUsage
          })
          setFailed(false)
        })
        .catch(() => {
          if (!cancelled) {
            setFailed(true)
            setView(null)
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false)
          }
        })
    }

    load()
    const timer = window.setInterval(load, 15_000)

    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [brand.activeAppId, brand.signedIn])

  const total = (view?.inputTokens || 0) + (view?.outputTokens || 0)

  return (
    <SettingsSection icon={Activity} title={copy.limitsTitle}>
      {!brand.signedIn ? (
        <p className="mb-4 text-sm text-(--ui-text-tertiary)">Sign in to load token usage from the server.</p>
      ) : failed ? (
        <p className="mb-4 text-sm text-(--ui-text-tertiary)">{copy.usageUnavailable}</p>
      ) : loading && !view ? (
        <p className="mb-4 text-sm text-(--ui-text-tertiary)">Loading token usage…</p>
      ) : view && total > 0 ? (
        <>
          <ListRow action={compactNumber(total)} description={view.email} title={copy.usageTotal} />
          <ListRow action={compactNumber(view.inputTokens)} title={copy.usageInput} />
          <ListRow action={compactNumber(view.outputTokens)} title={copy.usageOutput} />
          <ListRow action={dollars(view.creditCents)} title="Plan credit" />
          {view.modelUsage.length > 0 ? (
            <>
              <p className="mt-3 mb-1 text-xs font-medium text-(--ui-text-secondary)">{copy.usageModels}</p>
              {view.modelUsage.map(row => (
                <ListRow
                  action={compactNumber(row.inputTokens + row.outputTokens)}
                  description={`in ${compactNumber(row.inputTokens)} · out ${compactNumber(row.outputTokens)}`}
                  key={row.model}
                  title={row.model}
                />
              ))}
            </>
          ) : null}
        </>
      ) : (
        <p className="mb-4 text-sm text-(--ui-text-tertiary)">{copy.usageEmpty}</p>
      )}
    </SettingsSection>
  )
}
