export type ContextMode = 'silo' | 'graph'

export type AgentState = {
  id: string
  name: string
  role: string
  hermesProfile: string
  runtime: string
  status: 'idle' | 'working' | 'blocked' | 'active' | 'off'
  visibleContext: string[]
  lastDecision: string
  recent: string[]
}

export type Ticket = {
  id: string
  section: string
  sectionName: string
  seat: string
  owner: string | null
  price: number
  status: 'available' | 'reserved' | 'confirmed'
  confirmations: string[]
}

export type Confirmation = {
  id: string
  buyerId: string
  buyerName: string
  status: 'confirmed' | 'waitlisted'
  section: string
  seat: string
  ticketId: string | null
  price: number
  note: string
  createdAt: string
  agent: string
  agentText?: {
    provider: string
    model: string
    agentId: string
    text: string
  }
}

export type DemoEvent = {
  id: string
  type: string
  message: string
  createdAt: string
}

export type DemoState = {
  contextMode: ContextMode
  orchestratorEnabled: boolean
  rushOpen: boolean
  stageIndex: number
  stage: {
    id: string
    title: string
    narration: string
    click: string
    watch: string
    lesson: string
  }
  stages: Array<{
    id: string
    title: string
    narration: string
    click: string
    watch: string
    lesson: string
  }>
  runId: number
  tick: number
  agents: Record<string, AgentState>
  sections: Array<{ id: string; name: string; basePrice: number; capacity: number }>
  tickets: Ticket[]
  buyers: Array<{ id: string; name: string; simulated: boolean; createdAt: string }>
  confirmations: Confirmation[]
  events: DemoEvent[]
  metrics: {
    buyers: number
    confirmed: number
    waitlisted: number
    oversold: number
    doubleSoldSeats: number
    priceConflicts: number
    graphAnswers: number
    siloMisses: number
  }
  demand: {
    level: string
    activeBuyers: number
    velocity: number
    note: string
  }
  pricing: {
    currentPrice: number
    floor: number
    ceiling: number
    note: string
  }
  explanation: null | {
    mode: ContextMode
    title: string
    answer: string
    sources: string[]
  }
  vaultPath: string
}
