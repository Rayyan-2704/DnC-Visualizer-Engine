import { useMemo, useRef, useState } from 'react'
import './KaratsubaTree.css'

/*
  KaratsubaTree — renders the Karatsuba recursion tree as an interactive visual diagram.
  Features:
  - Interactive recursion tree layout
  - Active node highlighting and path tracing
  - Step formula bar showing algebraic breakdown
  - Node click inspector with complete limb details
  - Pan & Zoom controls
*/

const NODE_W = 170
const NODE_H = 76
const H_GAP = 24
const V_GAP = 64
const PAD = 30

export default function KaratsubaTree({ steps, cursor, result }) {
  const containerRef = useRef(null)
  const [selectedNode, setSelectedNode] = useState(null)
  const [zoom, setZoom] = useState(1)

  const { nodes, edges, activeId, activeStep } = useMemo(
    () => buildTree(steps, cursor),
    [steps, cursor]
  )

  if (!nodes || nodes.length === 0) {
    return (
      <div ref={containerRef} className="kt-container">
        <div className="kt-empty">Waiting for first Karatsuba event…</div>
      </div>
    )
  }

  const { positioned, svgW, svgH } = layout(nodes, edges)

  return (
    <div ref={containerRef} className="kt-container">
      {/* Top algebraic explanation formula bar */}
      <FormulaBar step={activeStep} result={result} />

      <div className="kt-tree-wrapper">
        <div className="kt-scroll" style={{ transform: `scale(${zoom})`, transformOrigin: 'top left' }}>
          <svg
            width={svgW}
            height={svgH}
            viewBox={`0 0 ${svgW} ${svgH}`}
            className="kt-svg"
          >
            {/* Edges */}
            {edges.map(({ from, to, label }, i) => {
              const f = positioned.find((n) => n.id === from)
              const t = positioned.find((n) => n.id === to)
              if (!f || !t) return null
              const x1 = f.cx, y1 = f.y + NODE_H
              const x2 = t.cx, y2 = t.y
              const my = (y1 + y2) / 2
              const isChildOfActive = f.id === activeId || t.id === activeId

              return (
                <g key={i}>
                  <path
                    d={`M ${x1} ${y1} C ${x1} ${my} ${x2} ${my} ${x2} ${y2}`}
                    stroke={isChildOfActive ? 'rgba(108,99,255,0.6)' : 'rgba(255,255,255,0.12)'}
                    strokeWidth={isChildOfActive ? 2 : 1.5}
                    fill="none"
                  />
                  {label && (
                    <text
                      x={(x1 + x2) / 2}
                      y={my - 4}
                      textAnchor="middle"
                      dominantBaseline="middle"
                      fontSize="10"
                      fontWeight="bold"
                      fill={isChildOfActive ? '#6c63ff' : 'rgba(255,183,71,0.8)'}
                    >
                      {label}
                    </text>
                  )}
                </g>
              )
            })}

            {/* Nodes */}
            {positioned.map((node) => (
              <KNode
                key={node.id}
                node={node}
                isActive={node.id === activeId}
                isSelected={selectedNode?.id === node.id}
                onClick={() => setSelectedNode(node)}
              />
            ))}
          </svg>
        </div>

        {/* Tree Zoom Controls */}
        <div className="kt-controls">
          <button className="kt-btn" onClick={() => setZoom((z) => Math.min(2.5, z * 1.2))} title="Zoom In">+</button>
          <button className="kt-btn" onClick={() => setZoom((z) => Math.max(0.4, z * 0.8))} title="Zoom Out">-</button>
          <button className="kt-btn" onClick={() => setZoom(1)} title="Reset Zoom">Reset</button>
        </div>

        {/* Selected Node Details Drawer */}
        {selectedNode && (
          <div className="kt-details-drawer">
            <div className="ktd-header">
              <span className="ktd-title">Call #{selectedNode.id} ({selectedNode.role || 'Root'})</span>
              <button className="ktd-close" onClick={() => setSelectedNode(null)}>✕</button>
            </div>
            <div className="ktd-body">
              <div className="ktd-row">
                <span className="ktd-lbl">Depth:</span>
                <span className="ktd-val">{selectedNode.depth}</span>
              </div>
              <div className="ktd-row">
                <span className="ktd-lbl">Type:</span>
                <span className="ktd-val">{selectedNode.isBase ? 'Base (Schoolbook)' : 'Karatsuba Divide'}</span>
              </div>
              <div className="ktd-row">
                <span className="ktd-lbl">X ({selectedNode.x?.length} digits):</span>
                <span className="ktd-bignum">{selectedNode.x}</span>
              </div>
              <div className="ktd-row">
                <span className="ktd-lbl">Y ({selectedNode.y?.length} digits):</span>
                <span className="ktd-bignum">{selectedNode.y}</span>
              </div>
              {selectedNode.product && (
                <div className="ktd-row highlight">
                  <span className="ktd-lbl">Product:</span>
                  <span className="ktd-bignum prod">{selectedNode.product}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function FormulaBar({ step, result }) {
  if (!step) return null

  if (step.kind === 'split') {
    return (
      <div className="kt-formula-bar">
        <span className="kt-fb-badge split">SPLIT</span>
        <span>
          Split at <strong>{step.mDigits} digits</strong> (m = {step.m} limbs):{' '}
          <code>X = X₁·10^{step.mDigits} + X₀</code>,{' '}
          <code>Y = Y₁·10^{step.mDigits} + Y₀</code>
        </span>
      </div>
    )
  }

  if (step.kind === 'combine') {
    return (
      <div className="kt-formula-bar">
        <span className="kt-fb-badge combine">COMBINE</span>
        <span>
          Assembling product:{' '}
          <code>P = z₂·10^(2m) + (z₁ - z₂ - z₀)·10^m + z₀</code>
        </span>
      </div>
    )
  }

  if (step.kind === 'base') {
    return (
      <div className="kt-formula-bar">
        <span className="kt-fb-badge base">BASE CASE</span>
        <span>
          Below cutoff (or zero operand): multiplied directly using <strong>schoolbook grade-school algorithm</strong>.
        </span>
      </div>
    )
  }

  return (
    <div className="kt-formula-bar">
      <span className="kt-fb-badge">INFO</span>
      <span>{step.msg}</span>
    </div>
  )
}

function KNode({ node, isActive, isSelected, onClick }) {
  const { cx, y } = node
  const nx = cx - NODE_W / 2

  let borderColor = 'rgba(255,255,255,0.14)'
  let bg = 'rgba(255,255,255,0.03)'

  if (isActive) {
    borderColor = '#6c63ff'
    bg = 'rgba(108,99,255,0.25)'
  } else if (isSelected) {
    borderColor = '#ffd700'
    bg = 'rgba(255,215,0,0.12)'
  } else if (node.done) {
    borderColor = 'rgba(67,233,123,0.6)'
    bg = 'rgba(67,233,123,0.08)'
  } else if (node.isBase) {
    borderColor = 'rgba(255,101,132,0.6)'
    bg = 'rgba(255,101,132,0.08)'
  }

  const roleColor =
    {
      z0: '#6c63ff',
      z1: '#43e97b',
      z2: '#ff6584',
      piece0: '#6c63ff',
      piece1: '#ff6584'
    }[node.role] || '#ffd700'

  return (
    <g
      transform={`translate(${nx}, ${y})`}
      onClick={onClick}
      style={{ cursor: 'pointer' }}
    >
      <rect
        width={NODE_W}
        height={NODE_H}
        rx={8}
        ry={8}
        fill={bg}
        stroke={borderColor}
        strokeWidth={isActive || isSelected ? 2 : 1}
      />

      {/* Role badge */}
      <text x={8} y={16} fontSize="10" fill={roleColor} fontWeight="bold">
        {node.role ? `${node.role}` : 'Root'}
      </text>

      {/* X operand */}
      <text
        x={NODE_W / 2}
        y={node.role ? 32 : 24}
        textAnchor="middle"
        fontSize="11"
        fill="#e8e8f0"
        fontFamily="monospace"
      >
        {truncNum(node.x)}
      </text>

      {/* Multiply icon */}
      <text
        x={NODE_W / 2}
        y={node.role ? 45 : 39}
        textAnchor="middle"
        fontSize="10"
        fill="#6c63ff"
      >
        ×
      </text>

      {/* Y operand */}
      <text
        x={NODE_W / 2}
        y={node.role ? 58 : 53}
        textAnchor="middle"
        fontSize="11"
        fill="#e8e8f0"
        fontFamily="monospace"
      >
        {truncNum(node.y)}
      </text>

      {/* Product if done */}
      {node.product && (
        <text
          x={NODE_W / 2}
          y={NODE_H - 4}
          textAnchor="middle"
          fontSize="9"
          fill="#43e97b"
          fontFamily="monospace"
        >
          = {truncNum(node.product, 16)}
        </text>
      )}

      {/* Active pulse dot */}
      {isActive && (
        <circle cx={NODE_W - 10} cy={10} r={5} fill="#6c63ff" />
      )}
    </g>
  )
}

function buildTree(steps, cursor) {
  if (!steps || steps.length < 2) return { nodes: [], edges: [], activeId: null, activeStep: null }

  const nodes = new Map()
  const edges = []
  let activeId = null
  let activeStep = null

  for (let i = 0; i < steps.length && i <= cursor; i++) {
    const s = steps[i]
    if (s.kind === 'init') continue

    if (s.kind === 'split' || s.kind === 'base') {
      if (!nodes.has(s.id)) {
        nodes.set(s.id, {
          id: s.id,
          parentId: s.parentId,
          depth: s.depth,
          role: s.role,
          x: s.x,
          y: s.y,
          isBase: s.kind === 'base',
          product: s.kind === 'base' ? s.product : null,
          done: s.kind === 'base',
          unbalanced: s.unbalanced || false
        })
        if (s.parentId !== null && s.parentId !== undefined) {
          edges.push({ from: s.parentId, to: s.id, label: s.role })
        }
      }
    }

    if (s.kind === 'combine') {
      if (nodes.has(s.id)) {
        const n = nodes.get(s.id)
        n.done = true
        n.product = s.product
      }
    }

    if (i === cursor) {
      activeId = s.id
      activeStep = s
    }
  }

  return { nodes: [...nodes.values()], edges, activeId, activeStep }
}

function layout(nodes, edges) {
  if (nodes.length === 0) return { positioned: [], svgW: 400, svgH: 200 }

  const byDepth = []
  for (const n of nodes) {
    while (byDepth.length <= n.depth) byDepth.push([])
    byDepth[n.depth].push(n)
  }

  const positioned = []

  for (let d = 0; d < byDepth.length; d++) {
    const row = byDepth[d]
    for (let i = 0; i < row.length; i++) {
      const n = row[i]
      const cx = PAD + i * (NODE_W + H_GAP) + NODE_W / 2
      const y = PAD + d * (NODE_H + V_GAP)
      positioned.push({ ...n, cx, y })
    }
  }

  const maxDepth = byDepth.length - 1
  const maxInRow = Math.max(...byDepth.map((r) => r.length))
  const svgW = PAD * 2 + maxInRow * (NODE_W + H_GAP)
  const svgH = PAD * 2 + (maxDepth + 1) * (NODE_H + V_GAP)

  return { positioned, svgW, svgH }
}

function truncNum(s, maxLen = 18) {
  if (!s) return '?'
  const str = String(s)
  if (str.length <= maxLen) return str
  return str.slice(0, 7) + '…' + str.slice(-7)
}
