import { useStore } from '@nanostores/react'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useI18n } from '@/i18n'
import { COMPLETION_SOUND_VARIANTS, previewCompletionSound } from '@/lib/completion-sound'
import { triggerHaptic } from '@/lib/haptics'
import { Bell, Play } from '@/lib/icons'
import { $completionSoundVariantId, setCompletionSoundVariantId } from '@/store/completion-sound'
import {
  $nativeNotifyPrefs,
  NATIVE_NOTIFICATION_KINDS,
  sendTestNativeNotification,
  setNativeNotifyEnabled,
  setNativeNotifyKind
} from '@/store/native-notifications'
import { notify } from '@/store/notifications'

import { CONTROL_TEXT } from './constants'
import './chat-settings.css'
import { ListRow, SettingsContent, ToggleRow } from './primitives'
import { notificationKindSettingId, SETTING_IDS, settingElementId } from './settings-manifest'
import { useSettingDeepLink } from './use-setting-deep-link'

interface NotificationsSettingsProps {
  subpage?: string
}

export function NotificationsSettings({ subpage }: NotificationsSettingsProps = {}) {
  const { t } = useI18n()
  const prefs = useStore($nativeNotifyPrefs)
  const completionSoundVariantId = useStore($completionSoundVariantId)
  const copy = t.settings.notifications
  const showAlerts = subpage === undefined || subpage === 'alerts'
  const showSounds = subpage === undefined || subpage === 'sounds'

  useSettingDeepLink('notifications', page => subpage === undefined || page === subpage)

  const runTest = async () => {
    triggerHaptic('open')
    const ok = await sendTestNativeNotification(copy.testTitle, copy.testBody)
    notify({ kind: ok ? 'info' : 'error', message: ok ? copy.testSent : copy.testUnsupported })
  }

  return (
    <SettingsContent>
      {showAlerts && (
        <section className={`grid gap-3.5${subpage === undefined && showSounds ? ' mb-8' : ''}`} data-notifications-alerts="">
          <header className="space-y-1.5">
            <h1 className="text-[32px] font-extrabold leading-none tracking-tight text-[#0f172a] dark:text-foreground">
              {t.settings.subpages.notificationAlerts}
            </h1>
            <p className="max-w-3xl text-[14px] text-[#64748b] dark:text-(--ui-text-tertiary)">{copy.intro}</p>
          </header>

          <div data-notifications-alerts-card="">
            <div className="scroll-mt-6" data-chat-settings-row="" id={settingElementId(SETTING_IDS.notifications.enableAll)}>
              <ToggleRow
                checked={prefs.enabled}
                description={copy.enableAllDesc}
                label={copy.enableAll}
                onChange={setNativeNotifyEnabled}
              />
            </div>

            {NATIVE_NOTIFICATION_KINDS.map(kind => (
              <div
                className="scroll-mt-6"
                data-chat-settings-row=""
                id={settingElementId(notificationKindSettingId(kind))}
                key={kind}
              >
                <ToggleRow
                  checked={prefs.enabled && prefs.kinds[kind]}
                  description={copy.kinds[kind].description}
                  disabled={!prefs.enabled}
                  label={copy.kinds[kind].label}
                  onChange={on => setNativeNotifyKind(kind, on)}
                />
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <Button className="self-start gap-1.5" data-notifications-test="" onClick={() => void runTest()} size="sm" type="button" variant="outline">
              <Bell className="size-3.5" />
              {copy.test}
            </Button>
            <p className="text-[13px] text-[#64748b] dark:text-(--ui-text-tertiary)">{copy.focusedHint}</p>
          </div>
        </section>
      )}

      {showSounds && (
        <section className="grid gap-3.5" data-notifications-sounds="">
          <header className="space-y-1.5">
            <h1 className="text-[32px] font-extrabold leading-none tracking-tight text-[#0f172a] dark:text-foreground">
              {t.settings.subpages.notificationSounds}
            </h1>
            <p className="max-w-3xl text-[14px] text-[#64748b] dark:text-(--ui-text-tertiary)">{copy.completionSoundDesc}</p>
          </header>

          <div data-notifications-sounds-card="">
            <div
              className="scroll-mt-6"
              data-chat-settings-row=""
              id={settingElementId(SETTING_IDS.notifications.completionSound)}
            >
              <ListRow
                action={
                  <div className="flex flex-col items-stretch gap-2 @2xl:items-end">
                    <Select
                      onValueChange={value => {
                        const variantId = Number.parseInt(value, 10)

                        setCompletionSoundVariantId(variantId)
                        previewCompletionSound(variantId)
                        triggerHaptic('selection')
                      }}
                      value={String(completionSoundVariantId)}
                    >
                      <SelectTrigger className={`${CONTROL_TEXT} min-w-56`}>
                        <SelectValue />
                      </SelectTrigger>

                      <SelectContent>
                        {COMPLETION_SOUND_VARIANTS.map(variant => (
                          <SelectItem key={variant.id} value={String(variant.id)}>
                            {variant.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Button
                      className="gap-1.5 self-end"
                      onClick={() => {
                        previewCompletionSound()
                        triggerHaptic('crisp')
                      }}
                      size="sm"
                      type="button"
                      variant="outline"
                    >
                      <Play className="size-3.5" />
                      {copy.completionSoundPreview}
                    </Button>
                  </div>
                }
                description={copy.completionSoundDesc}
                title={copy.completionSoundTitle}
              />
            </div>
          </div>
        </section>
      )}
    </SettingsContent>
  )
}
