import { Background, Handle, MarkerType, Position, ReactFlow } from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Bot, Brain, Crown, LineChart, Tags, TicketCheck } from 'lucide-react'
import clsx from 'clsx'
import type { AgentState, DemoState } from '../lib/types'

const iconMap = {
  demand: LineChart,
  pricing: Tags,
  sales: TicketCheck,
  orchestrator: Crown,
}

function AgentNode({ data }: { data: AgentState & { selectedAgent: string; onSelect: (id: string) => void } }) {
  const Icon = iconMap[data.id as keyof typeof iconMap] || Bot
  return (
    <button className={clsx('agent-node', data.status, { selected: data.selectedAgent === data.id })} onClick={() => data.onSelect(data.id)}>
      <Handle type="target" position={Position.Left} />
      <Icon size={20} />
      <div>
        <strong>{data.name}</strong>
        <span>{data.hermesProfile}</span>
      </div>
      <Handle type="source" position={Position.Right} />
    </button>
  )
}

function BrainNode({ data }: { data: { mode: string } }) {
  return (
    <div className={clsx('brain-node', data.mode)}>
      <Handle type="target" position={Position.Left} />
      <Brain size={26} />
      <strong>Company memory</strong>
      <span>{data.mode === 'graph' ? 'shared graph' : 'separate department notes'}</span>
      <Handle type="source" position={Position.Right} />
    </div>
  )
}

const nodeTypes = { agent: AgentNode, brain: BrainNode }

type Props = {
  state: DemoState
  selectedAgent: string
  onSelectAgent: (id: string) => void
}

export function AgentCanvas({ state, selectedAgent, onSelectAgent }: Props) {
  const nodes = [
    { id: 'demand', type: 'agent', position: { x: 40, y: 70 }, data: { ...state.agents.demand, selectedAgent, onSelect: onSelectAgent } },
    { id: 'pricing', type: 'agent', position: { x: 40, y: 230 }, data: { ...state.agents.pricing, selectedAgent, onSelect: onSelectAgent } },
    { id: 'sales', type: 'agent', position: { x: 670, y: 150 }, data: { ...state.agents.sales, selectedAgent, onSelect: onSelectAgent } },
    { id: 'orchestrator', type: 'agent', position: { x: 360, y: 28 }, data: { ...state.agents.orchestrator, selectedAgent, onSelect: onSelectAgent } },
    { id: 'brain', type: 'brain', position: { x: 315, y: 210 }, data: { mode: state.contextMode } },
  ]

  const directEdges = [
    ['demand', 'brain'],
    ['pricing', 'brain'],
    ['sales', 'brain'],
    ['brain', 'sales'],
  ]

  const orchestratedEdges = [
    ['demand', 'orchestrator'],
    ['pricing', 'orchestrator'],
    ['sales', 'orchestrator'],
    ['orchestrator', 'brain'],
    ['brain', 'orchestrator'],
  ]

  const edges = (state.orchestratorEnabled ? orchestratedEdges : directEdges).map(([source, target], index) => ({
    id: `${source}-${target}`,
    source,
    target,
    animated: state.metrics.doubleSoldSeats > 0 || state.orchestratorEnabled,
    className: state.metrics.doubleSoldSeats > 0 && !state.orchestratorEnabled ? 'edge-danger' : 'edge-normal',
    markerEnd: { type: MarkerType.ArrowClosed },
    style: { strokeWidth: 2 + (index % 2) },
  }))

  return (
    <div className="canvas-shell">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView proOptions={{ hideAttribution: true }}>
        <Background color="#d8dee8" gap={22} />
      </ReactFlow>
      <div className="canvas-caption">
        <span>{state.contextMode === 'graph' ? 'Shared graph memory' : 'Separate department memory'}</span>
        <strong>{state.orchestratorEnabled ? 'Orchestrator owns commits' : 'Specialists commit directly'}</strong>
      </div>
    </div>
  )
}
