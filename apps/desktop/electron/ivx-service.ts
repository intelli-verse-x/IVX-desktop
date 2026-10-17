import { ipcMain } from 'electron'

/**
 * Bundled IntelliVerseX managed inference credentials.
 * Set at package / ops time via env — never prompt the user for these.
 *
 *   IVX_SERVICE_BASE_URL  OpenAI-compatible base URL
 *   IVX_SERVICE_API_KEY   API key for that endpoint
 *   IVX_SERVICE_MODEL     Optional default model id
 */
export interface IvxServiceConfig {
  apiKey: string
  baseUrl: string
  model: string
}

export function readIvxServiceConfig(): IvxServiceConfig | null {
  const baseUrl = String(process.env.IVX_SERVICE_BASE_URL || '').trim()
  const apiKey = String(process.env.IVX_SERVICE_API_KEY || '').trim()
  const model = String(process.env.IVX_SERVICE_MODEL || '').trim() || 'default'

  if (!baseUrl || !apiKey) {
    return null
  }

  return { apiKey, baseUrl, model }
}

export function registerIvxServiceIpc(): void {
  ipcMain.handle('hermes:ivxService:getConfig', () => readIvxServiceConfig())
}
