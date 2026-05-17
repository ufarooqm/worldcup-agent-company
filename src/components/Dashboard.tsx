import { useState } from 'react'
import { AlertTriangle, GitBranch, Play, RefreshCcw, RotateCcw, Send, ShieldCheck, Sparkles } from 'lucide-react'
import { askAgent, hardResetDemo, resetDemo, setContextMode, setOrchestrator, simulateBuyers } from '../lib/api'
import type { DemoState } from '../lib/types'
import { AgentCanvas } from './AgentCanvas'

type Props = {
  state: DemoState
  connected: boolean
}

export function Dashboard({ state, connected }: Props) {
  const [selectedAgent, setSelectedAgent] = useState('sales')
  const [hardResetting, setHardResetting] = useState(false)
  const [question, setQuestion] = useState('')
  const [pendingQuestion, setPendingQuestion] = useState('')
  const [lastExchange, setLastExchange] = useState<{ agentId: string; question: string } | null>(null)
  const [asking, setAsking] = useState(false)
  const [loadTesting, setLoadTesting] = useState(false)
  const selected = state.agents[selectedAgent] || state.agents.sales
  const copy = exhibitCopy(state)
  const showScoreboard = state.metrics.buyers > 0 || state.stage.id === 'chaos-rush' || state.stage.id === 'orchestrated-rush'
  const defaultQuestion = 'What data can you see?'
  const loadTestNeedsGraph = state.contextMode !== 'graph'
  const lesson = demoLesson(state)

  async function onHardReset() {
    setHardResetting(true)
    try {
      await hardResetDemo()
    } finally {
      setHardResetting(false)
    }
  }

  async function onAskAgent(value = question) {
    const trimmed = value.trim() || defaultQuestion
    setPendingQuestion(trimmed)
    setLastExchange({ agentId: selected.id, question: trimmed })
    setQuestion('')
    setAsking(true)
    try {
      await askAgent(selected.id, trimmed)
    } finally {
      setAsking(false)
      setPendingQuestion('')
    }
  }

  async function runBuyerRushTest() {
    if (loadTestNeedsGraph) return
    setLoadTesting(true)
    try {
      for (let batch = 0; batch < 12; batch += 1) {
        await simulateBuyers(10)
        await new Promise((resolve) => setTimeout(resolve, 140))
      }
    } finally {
      setLoadTesting(false)
    }
  }

  return (
    <main className="dashboard">
      <header className="exhibit-header">
        <div>
          <div className="eyebrow"><Sparkles size={16} /> Live agent company</div>
          <h1>{copy.headline}</h1>
          <p>{copy.subhead}</p>
        </div>
        <div className="status-cluster">
          <span className={connected ? 'live-pill online' : 'live-pill'}>{connected ? 'live' : 'offline'}</span>
          <a href="/" target="_blank" className="ghost-link">Open buyer site</a>
        </div>
      </header>

      <section className="mode-bar">
        <div className="mode-group">
          <span><GitBranch size={14} /> Memory</span>
          <div className="segmented-control">
            <button className={state.contextMode === 'silo' ? 'active' : ''} onClick={() => setContextMode('silo')}>Silos</button>
            <button className={state.contextMode === 'graph' ? 'active' : ''} onClick={() => setContextMode('graph')}>Graph</button>
          </div>
        </div>
        <div className="mode-group">
          <span><ShieldCheck size={14} /> Control</span>
          <div className="segmented-control">
            <button className={!state.orchestratorEnabled ? 'active' : ''} onClick={() => setOrchestrator(false)}>Direct</button>
            <button className={state.orchestratorEnabled ? 'active' : ''} onClick={() => setOrchestrator(true)}>Orchestrated</button>
          </div>
        </div>
        <div className="mode-explainer">
          {state.contextMode === 'graph' ? 'Agents can read connected company memory.' : 'Agents can only read their department notes.'}
          {' '}
          {state.orchestratorEnabled ? 'The orchestrator owns commits.' : 'Specialists can write directly.'}
        </div>
      </section>

      <section className={`lesson-card ${lesson.tone}`}>
        <span>{lesson.kicker}</span>
        <strong>{lesson.title}</strong>
        <p>{lesson.body}</p>
      </section>

      {showScoreboard && (
        <section className="metrics-grid exhibit-scoreboard">
          <Metric label="Buyers" value={state.metrics.buyers} />
          <Metric label="Confirmed" value={state.metrics.confirmed} tone="good" />
          <Metric label="Double sold" value={state.metrics.doubleSoldSeats} tone={state.metrics.doubleSoldSeats ? 'bad' : 'good'} />
          <Metric label="Price conflicts" value={state.metrics.priceConflicts} tone={state.metrics.priceConflicts ? 'bad' : 'good'} />
          <Metric label="Oversold" value={state.metrics.oversold} tone={state.metrics.oversold ? 'bad' : 'good'} />
        </section>
      )}

      <section className="dash-layout">
        <div className="canvas-card">
          <AgentCanvas state={state} selectedAgent={selectedAgent} onSelectAgent={setSelectedAgent} />
        </div>
        <aside className="side-panel evidence-panel">
          <div className="panel-card agent-console">
            <div className="agent-profile">
              <div className="agent-profile-top">
                <div>
                  <span className="field-label">Selected agent</span>
                  <h2>{selected.name}</h2>
                </div>
                <span className="agent-runtime">{selected.runtime}</span>
              </div>
              <div className="agent-facts">
                <div>
                  <span className="field-label">Role</span>
                  <p>{selected.role}</p>
                </div>
                <div>
                  <span className="field-label">Memory access</span>
                  <div className="context-pills">
                    {selected.visibleContext.map((item) => <code key={item}>{item}</code>)}
                  </div>
                </div>
              </div>
            </div>

            <div className="ask-console">
              <div className="chat-title">
                <span className="field-label">Agent chat</span>
                <strong>Ask {selected.name}</strong>
              </div>
              <div className="chat-thread" aria-live="polite">
                {asking && pendingQuestion && (
                  <div className="chat-message user">
                    <span>You</span>
                    <p>{pendingQuestion}</p>
                  </div>
                )}
                {!asking && lastExchange?.agentId === selected.id && (
                  <div className="chat-message user">
                    <span>You</span>
                    <p>{lastExchange.question}</p>
                  </div>
                )}
                <div className={`chat-message assistant ${asking ? 'thinking' : ''}`}>
                  <span>{selected.name}</span>
                  {asking ? (
                    <p className="typing-line">
                      Thinking
                      <i />
                      <i />
                      <i />
                    </p>
                  ) : (
                    <p>{selected.lastDecision}</p>
                  )}
                </div>
              </div>
              <span className="field-label">Suggested questions</span>
              <div className="ask-chips">
                {['What data can you see?', 'Why is this price changing?', 'What would you do next?'].map((chip) => (
                  <button key={chip} onClick={() => onAskAgent(chip)} disabled={asking}>{chip}</button>
                ))}
              </div>
              <form
                onSubmit={(event) => {
                  event.preventDefault()
                  onAskAgent()
                }}
              >
                <textarea
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={`Ask ${selected.name}...`}
                  rows={2}
                />
                <button type="submit" disabled={asking}>
                  <Send size={15} /> {asking ? 'Thinking' : 'Ask'}
                </button>
              </form>
            </div>

          </div>
        </aside>
      </section>

      <section className="presenter-dock">
        <button className="control-button" onClick={() => resetDemo()}><RefreshCcw size={16} /> Reset demo</button>
        <button className="control-button danger" onClick={onHardReset} disabled={hardResetting}>
          <RotateCcw size={16} /> {hardResetting ? 'Resetting agents...' : 'Hard reset agents'}
        </button>
        <button
          className="control-button danger"
          title={loadTestNeedsGraph ? 'Turn Memory to Graph first. The load test is the orchestration lesson, after the memory lesson is fixed.' : 'Runs 120 synthetic buyer requests in small batches. Live phones still use the buyer page.'}
          onClick={runBuyerRushTest}
          disabled={loadTesting || loadTestNeedsGraph}
        >
          <Play size={16} /> {loadTestNeedsGraph ? 'Turn Graph on before load test' : loadTesting ? 'Running buyer rush...' : 'Run 120-buyer load test'}
        </button>
      </section>

      <section className="lower-grid">
        <div className="seat-map panel-card">
          <div className="panel-title">
            <strong>Seat map</strong>
            <span>{state.metrics.doubleSoldSeats > 0 ? 'red = double-sold seat' : 'clean'}</span>
          </div>
          <div className="seat-legend">
            <span><i className="available" /> Available</span>
            <span><i className="sold" /> Sold once</span>
            <span><i className="collision" /> Double-sold</span>
          </div>
          <div className="seats">
            {state.tickets.map((ticket) => (
              <span
                key={ticket.id}
                title={`${ticket.id} ${ticket.confirmations.length} confirmations`}
                className={ticket.confirmations.length > 1 ? 'collision' : ticket.status === 'confirmed' ? 'sold' : ''}
              />
            ))}
          </div>
        </div>

        <div className="event-stream panel-card">
          <div className="panel-title">
            <strong>Buyer trace</strong>
            <span>{state.events.length} events</span>
          </div>
          <div className="events">
            {state.events.slice(0, 12).map((event) => (
              <div className={`event ${event.type}`} key={event.id}>
                <AlertTriangle size={14} />
                <span>{event.message}</span>
              </div>
            ))}
          </div>
        </div>
      </section>
    </main>
  )
}

function Metric({ label, value, tone = 'neutral' }: { label: string; value: number; tone?: 'neutral' | 'good' | 'bad' }) {
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function exhibitCopy(state: DemoState) {
  if (state.stage.id === 'chaos-rush') {
    return {
      headline: 'Everyone buys at once. The company breaks.',
      subhead: 'The agents have shared memory now, but nobody owns the order of decisions. Watch seats double-sell and counters turn red.',
    }
  }
  if (state.stage.id === 'orchestrated-rush' || state.orchestratorEnabled) {
    return {
      headline: 'One orchestrator stops the double-sell.',
      subhead: 'Specialists can still reason, but only the orchestrator reserves seats and confirms buyers.',
    }
  }
  if (state.contextMode === 'graph') {
    return {
      headline: 'Now the agents share a company graph.',
      subhead: 'Sales can reason across demand, pricing, tickets, and decisions instead of guessing from one department folder.',
    }
  }
  return {
    headline: 'Three expert agents. Three separate memories.',
    subhead: 'Ask Sales why the ticket price changed. It is smart, but it can only see Sales notes.',
  }
}

function demoLesson(state: DemoState) {
  const loadTestHasRun = state.metrics.buyers >= 40

  if (loadTestHasRun && state.orchestratorEnabled) {
    return {
      tone: 'good',
      kicker: 'Orchestration lesson',
      title: 'Same 120 requests. One commit owner.',
      body: 'The first 36 buyers get the 36 real seats. Everyone after that is waitlisted because the orchestrator reserves inventory before Sales can promise it.',
    }
  }

  if (loadTestHasRun && state.contextMode === 'graph') {
    return {
      tone: 'bad',
      kicker: 'Orchestration lesson',
      title: 'The agents are smart now, but the company is still incoherent.',
      body: 'The load test creates 120 buyer requests against 36 seats. In Direct mode, specialists write confirmations themselves, so all 120 get promised something and seats collide.',
    }
  }

  if (loadTestHasRun) {
    return {
      tone: 'warn',
      kicker: 'Mixed failure',
      title: 'This combines two problems at once.',
      body: 'Silos make the agents reason with partial memory, and Direct mode lets them commit independently. For the clean orchestration demo, reset, switch Memory to Graph, then run the load test.',
    }
  }

  if (state.contextMode === 'graph') {
    return {
      tone: 'neutral',
      kicker: 'Context lesson',
      title: 'The memory problem is fixed. Now test coordination.',
      body: 'Graph mode lets agents reason from connected company memory. Let a few real buyers click, then run the 120-buyer load test to stress the commit path.',
    }
  }

  return {
    tone: 'neutral',
    kicker: 'Context lesson',
    title: 'Start by showing the memory problem.',
    body: 'Ask Sales why the price is changing. In Silos mode it can only see Sales notes, so it cannot explain demand or pricing. Then switch to Graph and ask again.',
  }
}
