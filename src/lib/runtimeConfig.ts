type RuntimeWindow = Window & {
  __WORLD_CUP_AGENT_CONFIG__?: {
    API_BASE_URL?: string
    WS_BASE_URL?: string
    PUBLIC_BUYER_ONLY?: boolean
  }
}

function cleanBaseUrl(value: string | undefined) {
  return (value || '').trim().replace(/\/+$/, '')
}

const runtime = (window as RuntimeWindow).__WORLD_CUP_AGENT_CONFIG__ || {}

export const runtimeConfig = {
  apiBaseUrl: cleanBaseUrl(runtime.API_BASE_URL ?? import.meta.env.VITE_API_BASE_URL),
  wsBaseUrl: cleanBaseUrl(runtime.WS_BASE_URL ?? import.meta.env.VITE_WS_BASE_URL),
  publicBuyerOnly: String(runtime.PUBLIC_BUYER_ONLY ?? import.meta.env.VITE_PUBLIC_BUYER_ONLY ?? '').toLowerCase() === 'true',
}

export function apiUrl(path: string) {
  return `${runtimeConfig.apiBaseUrl}${path}`
}

export function wsUrl(path: string) {
  if (runtimeConfig.wsBaseUrl) return `${runtimeConfig.wsBaseUrl}${path}`

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  const wsHost = window.location.port === '5173' ? `${window.location.hostname}:8787` : window.location.host
  return `${protocol}://${wsHost}${path}`
}
