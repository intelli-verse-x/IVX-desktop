import { compactNumber } from '@hermes/shared'
import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { $brandSession } from '@/store/brand-session'

import '../chat-settings.css'
import { ListRow } from '../primitives'

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
  const billing = t.settings.billing
  const brand = useStore($brandSession)
  const apiBrand = typeof window !== 'undefined' ? window.hermesDesktop?.brand : undefined
  const [view, setView] = useState<DesktopUsageView | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [signingIn, setSigningIn] = useState(false)

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

  const signIn = () => {
    if (!apiBrand) {
      return
    }

    setSigningIn(true)
    void apiBrand
      .signIn()
      .then(next => $brandSession.set(next))
      .finally(() => setSigningIn(false))
  }

  return (
    <section className="grid gap-3.5" data-billing-token="">
      <header className="space-y-1">
        <h2 className="text-[15px] font-semibold tracking-tight text-[#0f172a] dark:text-foreground">
          {copy.limitsTitle}
        </h2>
      </header>

      <div data-billing-token-card="" data-empty={!brand.signedIn ? '' : undefined}>
        {!brand.signedIn ? (
          <div className="grid place-items-center px-6 py-12 text-center">
            <p className="text-[15px] font-semibold text-[#0f172a] dark:text-foreground">{billing.signInToLoadTitle}</p>
            <p className="mt-1.5 max-w-md text-[13px] text-[#64748b] dark:text-(--ui-text-tertiary)">
              {billing.signInToLoadDesc}
            </p>
            <Button
              className="mt-5"
              data-billing-cta=""
              disabled={signingIn || !apiBrand}
              onClick={signIn}
              type="button"
            >
              {copy.signIn}
            </Button>
          </div>
        ) : failed ? (
          <p className="px-5 py-6 text-[14px] text-[#64748b] dark:text-(--ui-text-tertiary)">{copy.usageUnavailable}</p>
        ) : loading && !view ? (
          <p className="px-5 py-6 text-[14px] text-[#64748b] dark:text-(--ui-text-tertiary)">Loading token usage…</p>
        ) : view && total > 0 ? (
          <>
            <div data-chat-settings-row="">
              <ListRow action={compactNumber(total)} description={view.email} title={copy.usageTotal} />
            </div>
            <div data-chat-settings-row="">
              <ListRow action={compactNumber(view.inputTokens)} title={copy.usageInput} />
            </div>
            <div data-chat-settings-row="">
              <ListRow action={compactNumber(view.outputTokens)} title={copy.usageOutput} />
            </div>
            <div data-chat-settings-row="">
              <ListRow action={dollars(view.creditCents)} title={billing.planCredit} />
            </div>
            {view.modelUsage.length > 0 ? (
              <>
                <p className="px-5 pt-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-[#94a3b8]">
                  {copy.usageModels}
                </p>
                {view.modelUsage.map(row => (
                  <div data-chat-settings-row="" key={row.model}>
                    <ListRow
                      action={compactNumber(row.inputTokens + row.outputTokens)}
                      description={`in ${compactNumber(row.inputTokens)} · out ${compactNumber(row.outputTokens)}`}
                      title={row.model}
                    />
                  </div>
                ))}
              </>
            ) : null}
          </>
        ) : (
          <p className="px-5 py-6 text-[14px] text-[#64748b] dark:text-(--ui-text-tertiary)">{copy.usageEmpty}</p>
        )}
      </div>
    </section>
  )
}
