import { BuyerSite } from './components/BuyerSite'
import { Dashboard } from './components/Dashboard'
import { runtimeConfig } from './lib/runtimeConfig'
import { useDemoState } from './lib/useDemoState'
import './styles/app.css'

function App() {
  const { state, connected } = useDemoState()
  const isDashboard = !runtimeConfig.publicBuyerOnly && window.location.pathname.startsWith('/dashboard')

  if (!state) {
    return (
      <div className="loading-screen">
        <span />
        Loading the agent company...
      </div>
    )
  }

  return isDashboard ? <Dashboard state={state} connected={connected} /> : <BuyerSite state={state} />
}

export default App
