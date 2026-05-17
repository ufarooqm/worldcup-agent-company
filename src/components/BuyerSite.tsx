import { useMemo, useState } from 'react'
import { CheckCircle2, Clock3, ShieldCheck, Ticket, Trophy } from 'lucide-react'
import { buyTicket } from '../lib/api'
import type { Confirmation, DemoState } from '../lib/types'

type Props = {
  state: DemoState
}

export function BuyerSite({ state }: Props) {
  const [name, setName] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)

  const defaultName = useMemo(() => `Guest ${state.metrics.buyers + 1}`, [state.metrics.buyers])
  const remaining = Math.max(0, state.tickets.length - state.metrics.confirmed)
  const hasCollision = state.metrics.doubleSoldSeats > 0

  async function onBuy() {
    setBusy(true)
    try {
      const result = await buyTicket(name.trim() || defaultName)
      setConfirmation(result)
    } finally {
      setBusy(false)
    }
  }

  function resetBuyerForm() {
    setConfirmation(null)
    setName('')
  }

  return (
    <main className="buyer-page">
      <section className="buyer-drop">
        <div className="drop-glass">
          <div className="drop-topline">
            <span><Trophy size={15} /> World Cup Ticket Company</span>
            <strong className={hasCollision ? 'danger' : ''}>{hasCollision ? 'Collision' : `${remaining}/${state.tickets.length} left`}</strong>
          </div>

          {!confirmation && (
            <div className="drop-intro">
              <h1>World Cup ticket drop.</h1>
              <p>A limited block of seats is live now. One tap asks the Hermes Sales Agent to claim your ticket.</p>
              <label className="name-field">
                <span>Your name</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder={defaultName}
                  autoComplete="name"
                />
              </label>
              <button className="primary-action drop-action" onClick={onBuy} disabled={busy}>
                <Ticket size={20} />
                {busy ? 'Asking Sales Agent...' : 'Buy ticket'}
              </button>
              <div className="trust-row">
                <span><ShieldCheck size={16} /> Demo only</span>
                <span><Clock3 size={16} /> No payment</span>
              </div>
            </div>
          )}

          {confirmation && (
            <div className={`ticket-stub ${confirmation.status}`}>
              <div className="stub-status">
                <CheckCircle2 size={18} />
                {confirmation.status === 'confirmed' ? 'Confirmed' : 'Waitlisted'}
              </div>
              <div className="stub-buyer">{confirmation.buyerName}</div>
              <div className="stub-seat">
                <span>Seat</span>
                <strong>{confirmation.seat}</strong>
              </div>
              <div className="stub-details">
                <div><span>Section</span><strong>{confirmation.section}</strong></div>
                <div><span>Price</span><strong>${confirmation.price}</strong></div>
                <div><span>Code</span><strong>{confirmation.id}</strong></div>
              </div>
              <p>{confirmation.note}</p>
              <button className="primary-action drop-action secondary" onClick={resetBuyerForm}>
                <Ticket size={20} />
                Buy another ticket
              </button>
            </div>
          )}

          <div className="mini-inventory" aria-label="Live ticket inventory">
            <div className="mini-inventory-head">
              <span>Live inventory</span>
              <strong>{hasCollision ? `${state.metrics.doubleSoldSeats} double-sold` : state.orchestratorEnabled ? 'Orchestrated' : 'Direct commit'}</strong>
            </div>
            <div className="inventory-grid">
              {state.tickets.map((ticket) => (
                <span
                  key={ticket.id}
                  className={ticket.confirmations.length > 1 ? 'collision' : ticket.status === 'confirmed' ? 'sold' : ''}
                  title={`${ticket.id}: ${ticket.status}`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
