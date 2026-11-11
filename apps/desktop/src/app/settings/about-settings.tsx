import { useStore } from '@nanostores/react'
import { type ReactElement, useEffect } from 'react'

import { UpdateStatusCard, VersionHero } from '@/components/update-status'
import { VersionDetails } from '@/components/version-details'
import { useI18n } from '@/i18n'
import { $connection } from '@/store/session'
import { $desktopVersion, checkBackendUpdates, refreshDesktopVersion } from '@/store/updates'

import './chat-settings.css'
import { SettingsContent } from './primitives'
import { SETTING_IDS, settingElementId } from './settings-manifest'
import { UninstallSection } from './uninstall-section'
import { useSettingDeepLink } from './use-setting-deep-link'

interface AboutSettingsProps {
  subpage?: string
}

export function AboutSettings({ subpage }: AboutSettingsProps = {}): ReactElement {
  useSettingDeepLink('about', page => subpage === undefined || page === subpage)

  if (subpage === 'uninstall') {
    return (
      <SettingsContent>
        <UninstallSection />
      </SettingsContent>
    )
  }

  return <AppUpdatesSettings includeUninstall={subpage === undefined} />
}

interface AppUpdatesSettingsProps {
  includeUninstall: boolean
}

function AppUpdatesSettings({ includeUninstall }: AppUpdatesSettingsProps): ReactElement {
  const { t } = useI18n()
  const version = useStore($desktopVersion)
  const connection = useStore($connection)
  const remote = connection?.mode === 'remote'

  // Refresh the running version when About opens or the active gateway changes.
  useEffect((): void => {
    void refreshDesktopVersion()

    if (remote) {
      void checkBackendUpdates()
    }
  }, [connection, remote])

  return (
    <SettingsContent>
      <section className="grid gap-3.5" data-about-updates="">
        <header className="space-y-1.5">
          <h1 className="text-[32px] font-extrabold leading-none tracking-tight text-[#0f172a] dark:text-foreground">
            {t.settings.subpages.appUpdates}
          </h1>
          <p className="max-w-3xl text-[14px] text-[#64748b] dark:text-(--ui-text-tertiary)">
            {t.settings.about.updatesPageDesc}
          </p>
        </header>

        <div data-about-hero="">
          <VersionHero version={version} />
        </div>

        <div
          className="grid gap-0"
          data-about-updates-card=""
          id={settingElementId(SETTING_IDS.about.updates)}
        >
          <div data-about-update-status="">
            <UpdateStatusCard target="client" />
          </div>
          {/* Client and remote backend updates are independent. Only the client has release notes. */}
          {remote && (
            <div data-about-update-status="">
              <UpdateStatusCard showReleaseNotes={false} target="backend" />
            </div>
          )}
          {version && (
            <div data-about-version-details="">
              <VersionDetails version={version} />
            </div>
          )}
        </div>

        {includeUninstall && <UninstallSection />}
      </section>
    </SettingsContent>
  )
}
