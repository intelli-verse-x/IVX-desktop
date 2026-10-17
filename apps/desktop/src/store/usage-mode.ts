import { atom } from 'nanostores'

import { persistString, storedString } from '@/lib/storage'
import { ACCESS_LOCKS_ENABLED } from '@/store/access-locks'
import { $brandSession } from '@/store/brand-session'
import { setMainModelAssignment } from '@/store/model-assignment'
import { notify, notifyError } from '@/store/notifications'

const MODE_KEY = 'ivx.desktop.usageMode.v2'
const PLAN_KEY = 'ivx.desktop.usagePlanUsd.v1'

/** How the user wants to run model inference in this install. */
export type UsageMode = 'byok' | 'ivx'

/** Dialog the user is looking at. `choice` is before login. */
export type UsagePromptStep = 'blocked' | 'choice' | 'login' | 'plans'

export interface DesktopAccessState {
  allowed: boolean
  free: boolean
  reason: string
  status: 'active' | 'killed' | 'paused' | 'unknown'
}

/** Last access read from the admin server. Null until a signed-in user is checked. */
export const $desktopAccess = atom<DesktopAccessState | null>(null)

export const USAGE_PLAN_AMOUNTS = [50, 100, 200] as const
export type UsagePlanUsd = (typeof USAGE_PLAN_AMOUNTS)[number]

function parseMode(raw: null | string): UsageMode | null {
  return raw === 'byok' || raw === 'ivx' ? raw : null
}

function parsePlan(raw: null | string): UsagePlanUsd | null {
  const amount = Number(raw)

  return USAGE_PLAN_AMOUNTS.includes(amount as UsagePlanUsd) ? (amount as UsagePlanUsd) : null
}

/** Persisted choice. `null` until they pick our service or their own keys. */
export const $usageMode = atom<UsageMode | null>(parseMode(storedString(MODE_KEY)))

/** Dollar plan they chose after login. `null` until they pick $50, $100, or $200. */
export const $usagePlanUsd = atom<UsagePlanUsd | null>(parsePlan(storedString(PLAN_KEY)))

/** Which step is on screen. Closing the dialog does not clear the saved choice. */
export const $usagePromptStep = atom<UsagePromptStep>('choice')

/** Whether the dialog is open. Closing it lets them keep looking around the app. */
export const $usagePromptOpen = atom(false)

/** Set when the first-launch dialog is actually on screen. Chat tests never mount it. */
const $usagePromptArmed = atom(false)

export function armUsagePrompt(): void {
  $usagePromptArmed.set(true)
}

export function usageModeDecided(mode: UsageMode | null = $usageMode.get()): boolean {
  return mode === 'byok' || mode === 'ivx'
}

/** Chat stays open for own keys, and for our service only after a plan is chosen. */
export function usageGateActive(): boolean {
  if (!$usagePromptArmed.get()) {
    return false
  }

  const mode = $usageMode.get()

  if (mode === 'byok') {
    return false
  }

  const access = $desktopAccess.get()

  if (mode === 'ivx' && access?.allowed) {
    return false
  }

  return true
}

export async function refreshDesktopAccess(): Promise<void> {
  const api = typeof window !== 'undefined' ? window.hermesDesktop?.desktopAccess : undefined
  const brand = $brandSession.get()

  if (!api?.status || !brand.signedIn) {
    $desktopAccess.set(null)

    return
  }

  try {
    const next = await api.status(brand.activeAppId)

    if (!next) {
      $desktopAccess.set(null)

      return
    }

    $desktopAccess.set({
      allowed: next.allowed === true,
      free: next.free === true,
      reason: typeof next.reason === 'string' ? next.reason : 'payment_required',
      status: next.status === 'paused' || next.status === 'killed' || next.status === 'active' ? next.status : 'unknown'
    })
  } catch {
    $desktopAccess.set(null)
  }
}

/** Open the right step. Safe to call on launch and again when they try to chat. */
export function presentUsagePrompt(): void {
  if (!usageGateActive()) {
    $usagePromptOpen.set(false)

    return
  }

  const mode = $usageMode.get()
  const signedIn = $brandSession.get().signedIn

  const access = $desktopAccess.get()

  if (mode === 'ivx' && access && (access.status === 'paused' || access.status === 'killed')) {
    $usagePromptStep.set('blocked')
  } else if (mode === 'ivx' && signedIn) {
    $usagePromptStep.set('plans')
  } else if (mode === 'ivx') {
    $usagePromptStep.set('login')
  } else {
    $usagePromptStep.set('choice')
  }

  $usagePromptOpen.set(true)
}

export function dismissUsagePrompt(): void {
  $usagePromptOpen.set(false)
}

export function setUsageMode(mode: UsageMode): void {
  $usageMode.set(mode)
  persistString(MODE_KEY, mode)
}

function setUsagePlan(amount: UsagePlanUsd): void {
  $usagePlanUsd.set(amount)
  persistString(PLAN_KEY, String(amount))
}

/** Our service. Plans stay hidden until they are signed in. */
export function chooseIvxService(): void {
  setUsageMode('ivx')

  if ($brandSession.get().signedIn) {
    $usagePromptStep.set('plans')
    $usagePromptOpen.set(true)

    return
  }

  $usagePromptStep.set('login')
  $usagePromptOpen.set(true)
}

/** Own keys. Caller opens Providers. */
export function chooseByok(): void {
  setUsageMode('byok')
  $usagePromptOpen.set(false)
}

export interface IvxServiceConfig {
  apiKey: string
  baseUrl: string
  model: string
}

/** Pull managed credentials from the Electron main process (env-backed). */
export async function readIvxServiceConfig(): Promise<IvxServiceConfig | null> {
  const api = typeof window !== 'undefined' ? window.hermesDesktop?.ivxService : undefined

  if (!api?.getConfig) {
    return null
  }

  try {
    const config = await api.getConfig()

    if (
      !config ||
      typeof config.baseUrl !== 'string' ||
      typeof config.apiKey !== 'string' ||
      !config.baseUrl.trim() ||
      !config.apiKey.trim()
    ) {
      return null
    }

    return {
      apiKey: config.apiKey.trim(),
      baseUrl: config.baseUrl.trim(),
      model: typeof config.model === 'string' && config.model.trim() ? config.model.trim() : 'default'
    }
  } catch {
    return null
  }
}

async function applyIvxServiceCredentials(): Promise<boolean> {
  const config = await readIvxServiceConfig()

  if (!config) {
    return false
  }

  await setMainModelAssignment(
    {
      provider: 'custom',
      model: config.model,
      base_url: config.baseUrl,
      api_key: config.apiKey
    },
    undefined,
    { skipConfirmPrompt: true }
  )

  return true
}

/** After login: save the plan, turn on our endpoint, and open the in-app PayPal window. */
export async function chooseUsagePlan(amount: UsagePlanUsd): Promise<void> {
  const brand = $brandSession.get()

  if (!brand.signedIn) {
    $usagePromptStep.set('login')
    $usagePromptOpen.set(true)

    return
  }

  setUsageMode('ivx')
  setUsagePlan(amount)

  try {
    const applied = await applyIvxServiceCredentials()

    if (!applied) {
      notify({
        kind: 'info',
        title: 'Using IntelliVerseX service',
        message:
          'Managed API credentials are not packaged in this build yet. Payment still opens. Ops can set IVX_SERVICE_BASE_URL and IVX_SERVICE_API_KEY.'
      })
    }
  } catch (error) {
    notifyError(error, 'Could not enable IntelliVerseX service')
  }

  const api = typeof window !== 'undefined' ? window.hermesDesktop?.desktopAccess : undefined

  if (!api?.checkout || !api.openUrl) {
    notifyError(new Error('Payment window is unavailable'), 'Could not open PayPal')

    return
  }

  try {
    const started = await api.checkout(amount, brand.activeAppId)

    $usagePromptOpen.set(false)
    await api.openUrl(started.url)
  } catch (error) {
    notifyError(error, 'Could not open PayPal')
  }
}
