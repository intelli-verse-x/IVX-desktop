import { useStore } from '@nanostores/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { User } from '@/lib/icons'
import { $brandSession } from '@/store/brand-session'

import './chat-settings.css'
import { ListRow, SettingsContent } from './primitives'

export function AccountSettings() {
  const brand = useStore($brandSession)
  const { t } = useI18n()
  const copy = t.settings.account
  const api = typeof window !== 'undefined' ? window.hermesDesktop?.brand : undefined
  const [busy, setBusy] = useState(false)
  const [draft, setDraft] = useState('')

  const brandLabel = brand.activeAppId || (brand.isSuper ? copy.allBrands : copy.signedOut)

  const signIn = () => {
    if (!api) {
      return
    }

    setBusy(true)
    void api
      .signIn()
      .then(next => $brandSession.set(next))
      .finally(() => setBusy(false))
  }

  const signOut = () => {
    if (!api) {
      return
    }

    setBusy(true)
    void api
      .signOut()
      .then(next => $brandSession.set(next))
      .finally(() => setBusy(false))
  }

  return (
    <SettingsContent>
      <section className="grid gap-3.5" data-account-page="">
        <header className="space-y-1.5">
          <h1 className="text-[32px] font-extrabold leading-none tracking-tight text-[#0f172a] dark:text-foreground">
            {copy.title}
          </h1>
          <p className="max-w-3xl text-[14px] text-[#64748b] dark:text-(--ui-text-tertiary)">
            {brand.signedIn ? copy.intro : copy.pageDesc}
          </p>
        </header>

        <div data-account-card="">
          {!brand.signedIn ? (
            <div className="flex flex-col items-start gap-3 px-5 py-5" data-chat-settings-row="">
              <div className="flex items-center gap-2.5">
                <span className="grid size-8 place-items-center rounded-full bg-[#eef2ff] text-[#4f46e5] dark:bg-(--ui-bg-quinary)">
                  <User className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-[#0f172a] dark:text-foreground">{copy.title}</p>
                  <p className="text-[13px] text-[#64748b] dark:text-(--ui-text-tertiary)">{copy.signedOut}</p>
                </div>
              </div>
              <Button data-account-cta="" disabled={busy || !api} onClick={signIn} type="button">
                {copy.signIn}
              </Button>
            </div>
          ) : (
            <>
              <div data-chat-settings-row="">
                <ListRow description={brand.email} title={copy.email} />
              </div>
              <div data-chat-settings-row="">
                <ListRow description={brandLabel} title={copy.brand} />
              </div>
              <div data-chat-settings-row="">
                <ListRow description={brand.isSuper ? copy.superAccess : copy.brandAccess} title={copy.access} />
              </div>
              {brand.appIds.length > 1 ? (
                <div data-chat-settings-row="">
                  <ListRow
                    action={
                      <select
                        aria-label={copy.brands}
                        className="bg-transparent text-sm"
                        onChange={event => {
                          void api?.select(event.target.value).then(next => $brandSession.set(next))
                        }}
                        value={brand.activeAppId}
                      >
                        {brand.appIds.map(appId => (
                          <option key={appId} value={appId}>
                            {appId}
                          </option>
                        ))}
                      </select>
                    }
                    title={copy.brands}
                  />
                </div>
              ) : null}
              {brand.isSuper ? (
                <div data-chat-settings-row="">
                  <ListRow
                    action={
                      <form
                        className="flex items-center gap-2"
                        onSubmit={event => {
                          event.preventDefault()
                          void api?.select(draft.trim()).then(next => {
                            $brandSession.set(next)
                            setDraft('')
                          })
                        }}
                      >
                        <input
                          aria-label={copy.brand}
                          className="w-32 bg-transparent text-sm outline-none"
                          onChange={event => setDraft(event.target.value)}
                          placeholder={copy.brand}
                          value={draft}
                        />
                        {brand.activeAppId ? (
                          <Button
                            onClick={() => {
                              void api?.select('').then(next => $brandSession.set(next))
                            }}
                            type="button"
                            variant="outline"
                          >
                            {copy.allBrands}
                          </Button>
                        ) : null}
                      </form>
                    }
                    title={copy.brand}
                  />
                </div>
              ) : null}
              <div className="px-5 py-4" data-chat-settings-row="">
                <Button disabled={busy || !api} onClick={signOut} type="button" variant="outline">
                  {copy.signOut}
                </Button>
              </div>
            </>
          )}
        </div>
      </section>
    </SettingsContent>
  )
}
