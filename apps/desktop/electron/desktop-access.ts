import { ipcMain, session } from 'electron'

import { openCheckoutUrl } from './brand-login'

const PORTAL_ORIGIN = 'https://admin.intelli-verse-x.ai'
const PARTITION = 'persist:ivx-portal'

export interface DesktopAccessView {
  email: string
  appId: string
  status: 'active' | 'paused' | 'killed'
  free: boolean
  creditCents: number
  spentCents: number
  inputTokens: number
  outputTokens: number
  lastModel?: string
  models?: string[]
  modelUsage?: Array<{ model: string; inputTokens: number; outputTokens: number }>
  allowed: boolean
  reason: string
}

async function portalJson(
  method: string,
  urlPath: string,
  body?: unknown
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const response = await session.fromPartition(PARTITION).fetch(`${PORTAL_ORIGIN}${urlPath}`, {
    method,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body)
  })
  const parsed = await response.json().catch(() => null)

  return { ok: response.ok, status: response.status, body: parsed }
}

function dataOf(body: unknown): DesktopAccessView | null {
  if (!body || typeof body !== 'object') {
    return null
  }

  const record = body as { data?: unknown }
  const data = record.data

  if (!data || typeof data !== 'object') {
    return null
  }

  return data as DesktopAccessView
}

export function registerDesktopAccessIpc(): void {
  ipcMain.handle('hermes:desktopAccess:status', async (_event, appId: unknown) => {
    const id = typeof appId === 'string' ? appId.trim() : ''
    const path = id
      ? `/api/portal/brand-control/desktop/me?appId=${encodeURIComponent(id)}`
      : '/api/portal/brand-control/desktop/me'
    const result = await portalJson('GET', path)

    return dataOf(result.body)
  })

  ipcMain.handle('hermes:desktopAccess:checkout', async (_event, amountUsd: unknown, appId: unknown) => {
    const result = await portalJson('POST', '/api/portal/brand-control/desktop/checkout', {
      amountUsd,
      appId: typeof appId === 'string' ? appId : '',
      origin: PORTAL_ORIGIN
    })
    const body = result.body as { data?: { url?: string } } | null
    const url = String(body?.data?.url || '')

    if (!result.ok || !url) {
      throw new Error('Could not start PayPal checkout.')
    }

    return { url }
  })

  ipcMain.handle('hermes:desktopAccess:openUrl', async (_event, url: unknown) => openCheckoutUrl(String(url || '')))

  ipcMain.handle('hermes:desktopAccess:usage', async (_event, payload: unknown) => {
    const result = await portalJson('POST', '/api/portal/brand-control/desktop/usage', payload)
    const data = dataOf(result.body)

    if (!result.ok || !data) {
      console.error('[ivx desktop-access] usage report failed', result.status, result.body)
      throw new Error('Could not report desktop token usage.')
    }

    return data
  })
}
