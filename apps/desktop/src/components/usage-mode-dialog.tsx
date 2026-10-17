import { useStore } from '@nanostores/react'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'

import { SETTINGS_ROUTE } from '@/app/routes'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  preventCloseButtonAutoFocus
} from '@/components/ui/dialog'
import { useI18n } from '@/i18n'
import { Cloud, KeyRound } from '@/lib/icons'
import { ACCESS_LOCKS_ENABLED } from '@/store/access-locks'
import { $brandSession } from '@/store/brand-session'
import {
  $usagePromptOpen,
  $usagePromptStep,
  armUsagePrompt,
  chooseByok,
  chooseIvxService,
  chooseUsagePlan,
  dismissUsagePrompt,
  presentUsagePrompt,
  refreshDesktopAccess,
  USAGE_PLAN_AMOUNTS,
  type UsagePlanUsd
} from '@/store/usage-mode'

interface UsageModeDialogProps {
  /** When false (aux windows), never offer. */
  enabled?: boolean
}

/**
 * First-launch choice, before login: IntelliVerseX service or the user's own
 * keys. Our service asks for login, then shows $50 / $100 / $200. Closing the
 * dialog leaves the app usable. Sending a chat opens it again until they finish.
 */
export function UsageModeDialog({ enabled = true }: UsageModeDialogProps) {
  const { t } = useI18n()
  const copy = t.usageMode
  const open = useStore($usagePromptOpen)
  const step = useStore($usagePromptStep)
  const navigate = useNavigate()
  const [busy, setBusy] = useState<'byok' | 'ivx' | 'login' | UsagePlanUsd | null>(null)

  useEffect(() => {
    if (!enabled || !ACCESS_LOCKS_ENABLED) {
      dismissUsagePrompt()

      return
    }

    armUsagePrompt()
    void refreshDesktopAccess().finally(() => presentUsagePrompt())
  }, [enabled])

  if (!enabled || !open) {
    return null
  }

  const pickIvx = () => {
    if (busy) {
      return
    }

    setBusy('ivx')
    chooseIvxService()
    setBusy(null)
  }

  const pickByok = () => {
    if (busy) {
      return
    }

    setBusy('byok')
    chooseByok()
    navigate(`${SETTINGS_ROUTE}?tab=providers&pview=keys`)
    setBusy(null)
  }

  const pickLogin = () => {
    if (busy) {
      return
    }

    const api = window.hermesDesktop?.brand

    if (!api?.signIn) {
      return
    }

    setBusy('login')
    void api
      .signIn()
      .then(next => {
        $brandSession.set(next)

        if (next.signedIn) {
          chooseIvxService()
          void refreshDesktopAccess().finally(() => presentUsagePrompt())
        }
      })
      .finally(() => setBusy(null))
  }

  const pickPlan = (amount: UsagePlanUsd) => {
    if (busy) {
      return
    }

    setBusy(amount)
    void chooseUsagePlan(amount)
      .catch(() => undefined)
      .finally(() => setBusy(null))
  }

  const title =
    step === 'blocked' ? copy.blockedTitle : step === 'plans' ? copy.plansTitle : step === 'login' ? copy.loginTitle : copy.title
  const body =
    step === 'blocked' ? copy.blockedBody : step === 'plans' ? copy.plansBody : step === 'login' ? copy.loginBody : copy.body

  return (
    <Dialog onOpenChange={next => !next && dismissUsagePrompt()} open>
      <DialogContent className="max-w-md" onOpenAutoFocus={preventCloseButtonAutoFocus}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>

        {step === 'choice' ? (
          <div className="flex flex-col gap-2 pt-1">
            <Button
              className="h-auto justify-start gap-3 px-3 py-3 text-left"
              disabled={busy !== null}
              onClick={pickIvx}
              type="button"
              variant="outline"
            >
              <Cloud className="size-4 shrink-0 text-(--ui-text-secondary)" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{copy.ivxTitle}</span>
                <span className="text-[length:var(--conversation-caption-font-size)] font-normal text-(--ui-text-tertiary)">
                  {copy.ivxBody}
                </span>
              </span>
            </Button>

            <Button
              className="h-auto justify-start gap-3 px-3 py-3 text-left"
              disabled={busy !== null}
              onClick={pickByok}
              type="button"
              variant="outline"
            >
              <KeyRound className="size-4 shrink-0 text-(--ui-text-secondary)" />
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-foreground">{copy.byokTitle}</span>
                <span className="text-[length:var(--conversation-caption-font-size)] font-normal text-(--ui-text-tertiary)">
                  {copy.byokBody}
                </span>
              </span>
            </Button>
          </div>
        ) : null}

        {step === 'login' ? (
          <Button disabled={busy !== null} onClick={pickLogin} type="button">
            {busy === 'login' ? copy.loginBusy : copy.loginAction}
          </Button>
        ) : null}

        {step === 'plans' ? (
          <div className="flex flex-col gap-2 pt-1">
            {USAGE_PLAN_AMOUNTS.map(amount => (
              <Button
                disabled={busy !== null}
                key={amount}
                onClick={() => pickPlan(amount)}
                type="button"
                variant="outline"
              >
                {busy === amount ? copy.planBusy : copy.planLabel(amount)}
              </Button>
            ))}
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}
