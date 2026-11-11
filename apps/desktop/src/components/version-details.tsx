import type { DesktopVersionInfo, RuntimeSource } from '@/global'
import { useI18n } from '@/i18n'
import { distributionLabelKey } from '@/lib/distribution-label'
import { displayVersion } from '@/lib/version-label'

/**
 * Human label for an external build's runtime source: the resolution rung
 * plus the location it resolved from, when there is one.
 */
function runtimeSourceLabel(source: RuntimeSource): string {
  const where = 'root' in source && source.root ? source.root : 'command' in source ? source.command : null

  return where ? `${source.type} (${where})` : source.type
}

/**
 * Shared build-provenance display. Reads from `$desktopVersion`
 * (populated from the build stamp / `hermes:version` IPC), so every
 * surface — the About settings page, the updates overlay — shows the
 * same version, branch, commit, distribution, runtime, and install id
 * from one source of truth.
 */
export function VersionDetails({ version }: { version: DesktopVersionInfo }) {
  const { t } = useI18n()
  const u = t.updates

  const source =
    version.source === 'ci' ? 'CI' : version.source ? version.source[0].toUpperCase() + version.source.slice(1) : null

  // The Distribution row: one resolver owns the label policy — see
  // distribution-label.ts. Nix and Docker are product names, rendered
  // verbatim; every other shape comes from the stamp via i18n.
  const distributionKey = distributionLabelKey(version)

  const distribution =
    version.distribution === 'nix'
      ? 'Nix'
      : version.distribution === 'docker'
        ? 'Docker'
        : distributionKey
          ? u[distributionKey]
          : null

  const runtime =
    version.hermesRuntime?.type === 'embedded'
      ? u.versionDetailsRuntimeEmbedded
      : version.hermesRuntime?.type === 'external' && version.hermesRuntime.source
        ? runtimeSourceLabel(version.hermesRuntime.source)
        : version.hermesRuntime?.type === 'external'
          ? u.versionDetailsRuntimeExternal
          : null

  return (
    <dl className="grid gap-0 rounded-lg border border-border/70 bg-muted/20 px-3 py-1 text-sm" data-version-details="">
      <div className="flex justify-between gap-4 py-3" data-version-details-row="">
        <dt className="text-muted-foreground">{u.versionDetailsVersion}</dt>
        <dd className="text-right font-medium text-foreground">
          {version.appVersion
            ? `v${displayVersion(version.appVersion, version.productVersion)}`
            : u.versionUnavailable}
          {version.dirty && <span className="text-warning"> (!)</span>}
        </dd>
      </div>
      {source && (
        <div className="flex justify-between gap-4 py-3" data-version-details-row="">
          <dt className="text-muted-foreground">{u.versionDetailsBuildOrigin}</dt>
          <dd className="text-right font-medium text-foreground">
            {source}
            {version.branch && version.branch !== 'main' ? ` (${version.branch})` : ''}
          </dd>
        </div>
      )}
      {distribution && (
        <div className="flex justify-between gap-4 py-3" data-version-details-row="">
          <dt className="text-muted-foreground">{u.versionDetailsDistribution}</dt>
          <dd className="text-right font-medium text-foreground">{distribution}</dd>
        </div>
      )}
      {runtime && (
        <div className="flex justify-between gap-4 py-3" data-version-details-row="">
          <dt className="text-muted-foreground">{u.versionDetailsRuntime}</dt>
          <dd className="break-all text-right font-medium text-foreground">{runtime}</dd>
        </div>
      )}
      {version.hermesRoot && (
        <div className="flex justify-between gap-4 py-3" data-version-details-row="">
          <dt className="text-muted-foreground">{u.versionDetailsInstallId}</dt>
          <dd className="break-all text-right font-medium text-foreground">{version.hermesRoot}</dd>
        </div>
      )}
    </dl>
  )
}
