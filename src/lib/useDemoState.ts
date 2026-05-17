import { useEffect, useState } from 'react'
import { fetchState } from './api'
import { wsUrl } from './runtimeConfig'
import type { DemoState } from './types'

export function useDemoState() {
  const [state, setState] = useState<DemoState | null>(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let closed = false
    fetchState().then((next) => {
      if (!closed) setState(next)
    })

    const socket = new WebSocket(wsUrl('/ws'))
    socket.addEventListener('open', () => setConnected(true))
    socket.addEventListener('close', () => setConnected(false))
    socket.addEventListener('message', (event) => {
      const payload = JSON.parse(event.data)
      if (payload.type === 'state') setState(payload.state)
    })

    return () => {
      closed = true
      socket.close()
    }
  }, [])

  return { state, connected }
}
