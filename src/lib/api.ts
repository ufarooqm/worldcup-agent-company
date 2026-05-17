import type { Confirmation, ContextMode, DemoState } from './types'
import { apiUrl } from './runtimeConfig'

async function post<T>(url: string, body: unknown = {}): Promise<T> {
  const response = await fetch(apiUrl(url), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`${url} failed`)
  return response.json()
}

export async function fetchState(): Promise<DemoState> {
  const response = await fetch(apiUrl('/api/state'))
  if (!response.ok) throw new Error('state failed')
  return response.json()
}

export function buyTicket(buyerName: string): Promise<Confirmation> {
  return post('/api/buy', { buyerName })
}

export function explainPrice(): Promise<unknown> {
  return post('/api/explain-price')
}

export function askAgent(agentId: string, question: string): Promise<unknown> {
  return post('/api/ask-agent', { agentId, question })
}

export function resetDemo(): Promise<DemoState> {
  return post('/api/admin/reset')
}

export function hardResetDemo(): Promise<DemoState> {
  return post('/api/admin/hard-reset')
}

export function setContextMode(mode: ContextMode): Promise<DemoState> {
  return post('/api/admin/context', { mode })
}

export function setOrchestrator(enabled: boolean): Promise<DemoState> {
  return post('/api/admin/orchestrator', { enabled })
}

export function setRush(open: boolean): Promise<DemoState> {
  return post('/api/admin/rush', { open })
}

export function simulateBuyers(count: number): Promise<DemoState> {
  return post('/api/admin/simulate', { count })
}

export function setStage(index: number): Promise<DemoState> {
  return post('/api/admin/stage', { index })
}

export function nextStage(): Promise<DemoState> {
  return post('/api/admin/stage/next')
}

export function previousStage(): Promise<DemoState> {
  return post('/api/admin/stage/previous')
}
