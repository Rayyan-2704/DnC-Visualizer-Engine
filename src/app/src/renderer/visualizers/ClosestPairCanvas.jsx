import { useEffect, useRef, useMemo, useState } from 'react'
import './ClosestPairCanvas.css'

/*
  ClosestPairCanvas — renders the closest pair algorithm state on an interactive canvas.
  Features:
  - Auto-scaling of 2D coordinates
  - Animated dividing lines (O(n log n) recursive split)
  - Translucent δ-strip highlighting
  - Active comparison lines between candidate points
  - Golden line and coordinates for current optimal pair
  - Interactive pan & zoom + reset view
  - Point hover tooltip with index and coordinates
*/

const PAD = 50
const PT_R = 4.5
const HI_R = 7.5
const BEST_COLOR = '#ffd700'
const STRIP_COLOR = 'rgba(255,101,132,0.18)'
const CMP_COLOR = '#64b4ff'

export default function ClosestPairCanvas({ steps, cursor, result }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [hoveredPoint, setHoveredPoint] = useState(null)
  const isDragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })

  const state = useMemo(() => deriveState(steps, cursor), [steps, cursor])

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !state.points) return

    const W = container.clientWidth || 800
    const H = container.clientHeight || 500
    canvas.width = W
    canvas.height = H

    const ctx = canvas.getContext('2d')
    draw(ctx, W, H, state, zoom, pan)
  }, [state, zoom, pan])

  // Mouse pan/zoom handlers
  const handleWheel = (e) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.15 : 0.85
    setZoom((z) => Math.max(0.3, Math.min(15, z * factor)))
  }

  const handleMouseDown = (e) => {
    if (e.button !== 0) return
    isDragging.current = true
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current
    if (!canvas || !state.points) return

    const rect = canvas.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top

    if (isDragging.current) {
      const dx = e.clientX - lastMouse.current.x
      const dy = e.clientY - lastMouse.current.y
      lastMouse.current = { x: e.clientX, y: e.clientY }
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }))
    } else {
      // Check hover
      const W = canvas.width
      const H = canvas.height
      const xs = state.points.map((p) => p[0])
      const ys = state.points.map((p) => p[1])
      const xMin = Math.min(...xs), xMax = Math.max(...xs)
      const yMin = Math.min(...ys), yMax = Math.max(...ys)
      const xRange = xMax - xMin || 1
      const yRange = yMax - yMin || 1

      const toSx = (x) => pan.x + (PAD + ((x - xMin) / xRange) * (W - 2 * PAD) - W / 2) * zoom + W / 2
      const toSy = (y) => pan.y + ((H - PAD) - ((y - yMin) / yRange) * (H - 2 * PAD) - H / 2) * zoom + H / 2

      let found = null
      for (let i = 0; i < state.points.length; i++) {
        const [x, y] = state.points[i]
        const sx = toSx(x), sy = toSy(y)
        const dist = Math.hypot(mx - sx, my - sy)
        if (dist <= 8) {
          found = { pid: i, x, y, sx: mx, sy: my }
          break
        }
      }
      setHoveredPoint(found)
    }
  }

  const handleMouseUp = () => { isDragging.current = false }

  const resetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  return (
    <div
      ref={containerRef}
      className="cp-canvas-container"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas ref={canvasRef} className="cp-canvas" />

      {hoveredPoint && (
        <div
          className="cp-tooltip"
          style={{ left: hoveredPoint.sx + 12, top: hoveredPoint.sy - 28 }}
        >
          <strong>P{hoveredPoint.pid}</strong> ({hoveredPoint.x.toFixed(2)}, {hoveredPoint.y.toFixed(2)})
        </div>
      )}

      <div className="cp-canvas-controls">
        <button className="cp-zoom-btn" onClick={() => setZoom(z => z * 1.25)} title="Zoom In">+</button>
        <button className="cp-zoom-btn" onClick={() => setZoom(z => z * 0.8)}  title="Zoom Out">-</button>
        <button className="cp-zoom-btn" onClick={resetView} title="Reset View">Reset</button>
      </div>

      {state.bestPair && (
        <div className="cp-legend">
          <span className="legend-dot best" />
          <span>
            Best distance so far: <strong>{formatDist(Math.sqrt(state.bestPair.d2))}</strong>
          </span>
          {state.bestPair.a !== -1 && (
            <span className="legend-pair">
              (P{state.bestPair.a} ↔ P{state.bestPair.b})
            </span>
          )}
        </div>
      )}
    </div>
  )
}

function deriveState(steps, cursor) {
  const state = {
    points: null,
    sortedByX: null,
    divideLines: [],
    strip: null,
    bestPair: null,
    comparePair: null
  }
  if (!steps || steps.length === 0) return state

  for (let i = 0; i <= cursor && i < steps.length; i++) {
    const s = steps[i]
    switch (s.kind) {
      case 'init':
        state.points = s.points
        state.sortedByX = s.sortedByX
        break
      case 'divide':
        state.divideLines = state.divideLines.filter((d) => d.depth < s.depth)
        state.divideLines.push({
          lineX: s.lineX,
          lo: s.lo,
          hi: s.hi,
          mid: s.mid,
          depth: s.depth
        })
        state.strip = null
        state.comparePair = null
        break
      case 'base':
        state.bestPair = state.bestPair
          ? s.best.d2 < state.bestPair.d2 ? s.best : state.bestPair
          : s.best
        state.comparePair = null
        break
      case 'strip':
        state.strip = s
        state.comparePair = null
        break
      case 'compare':
        state.comparePair = s
        break
      case 'update':
        state.bestPair = s.best
        break
      case 'merge':
        state.bestPair = s.best
        state.divideLines = state.divideLines.filter(
          (d) => !(d.lo === s.lo && d.hi === s.hi)
        )
        state.strip = null
        state.comparePair = null
        break
    }
  }
  return state
}

function draw(ctx, W, H, state, zoom, pan) {
  const { points, divideLines, strip, bestPair, comparePair } = state
  ctx.clearRect(0, 0, W, H)

  ctx.fillStyle = '#0d0d1a'
  ctx.fillRect(0, 0, W, H)

  // Subtle grid
  ctx.strokeStyle = 'rgba(255,255,255,0.03)'
  ctx.lineWidth = 1
  for (let x = 0; x < W; x += 40) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
  }
  for (let y = 0; y < H; y += 40) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
  }

  if (!points || points.length === 0) {
    ctx.fillStyle = 'rgba(255,255,255,0.15)'
    ctx.font = '14px Inter, sans-serif'
    ctx.textAlign = 'center'
    ctx.fillText('Waiting for init event…', W / 2, H / 2)
    return
  }

  const xs = points.map((p) => p[0])
  const ys = points.map((p) => p[1])
  const xMin = Math.min(...xs), xMax = Math.max(...xs)
  const yMin = Math.min(...ys), yMax = Math.max(...ys)
  const xRange = xMax - xMin || 1
  const yRange = yMax - yMin || 1

  const toSx = (x) => pan.x + (PAD + ((x - xMin) / xRange) * (W - 2 * PAD) - W / 2) * zoom + W / 2
  const toSy = (y) => pan.y + ((H - PAD) - ((y - yMin) / yRange) * (H - 2 * PAD) - H / 2) * zoom + H / 2

  // Draw strip band
  if (strip) {
    const lx = toSx(strip.lineX)
    const delta = strip.delta || 0
    const dxPx = ((delta / xRange) * (W - 2 * PAD)) * zoom
    ctx.fillStyle = STRIP_COLOR
    ctx.fillRect(lx - dxPx, 0, dxPx * 2, H)

    ctx.strokeStyle = 'rgba(255,101,132,0.4)'
    ctx.lineWidth = 1
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(lx - dxPx, 0); ctx.lineTo(lx - dxPx, H)
    ctx.moveTo(lx + dxPx, 0); ctx.lineTo(lx + dxPx, H)
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Draw vertical divide lines
  const maxDepth = divideLines.reduce((m, d) => Math.max(m, d.depth), 0)
  for (const dl of divideLines) {
    const alpha = 0.3 + (dl.depth / (maxDepth + 1)) * 0.7
    const lx = toSx(dl.lineX)
    ctx.strokeStyle = `rgba(255,183,71,${alpha})`
    ctx.lineWidth = dl.depth === maxDepth ? 2 : 1
    ctx.setLineDash([6, 4])
    ctx.beginPath()
    ctx.moveTo(lx, 0)
    ctx.lineTo(lx, H)
    ctx.stroke()
    ctx.setLineDash([])

    // Label on line
    ctx.font = '10px Inter, sans-serif'
    ctx.fillStyle = `rgba(255,183,71,${alpha})`
    ctx.textAlign = 'center'
    ctx.fillText(`x = ${dl.lineX.toFixed(1)}`, lx, 18 + dl.depth * 14)
  }

  const bestSet = bestPair ? new Set([bestPair.a, bestPair.b]) : new Set()
  const stripSet = strip ? new Set(strip.stripPids || []) : new Set()
  const cmpSet = comparePair ? new Set([comparePair.a, comparePair.b]) : new Set()

  // Draw points
  for (let pid = 0; pid < points.length; pid++) {
    const [x, y] = points[pid]
    const sx = toSx(x), sy = toSy(y)

    let color = '#5555aa'
    let r = PT_R

    if (stripSet.has(pid)) { color = 'rgba(255,101,132,0.9)'; r = PT_R + 1 }
    if (bestSet.has(pid))  { color = BEST_COLOR; r = HI_R }
    if (cmpSet.has(pid))   { color = CMP_COLOR;  r = HI_R }

    ctx.beginPath()
    ctx.arc(sx, sy, r, 0, Math.PI * 2)
    ctx.fillStyle = color
    ctx.fill()

    if (bestSet.has(pid) || cmpSet.has(pid)) {
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.arc(sx, sy, r + 4, 0, Math.PI * 2)
      ctx.stroke()
    }
  }

  // Draw connecting line for active compare pair
  if (comparePair && points[comparePair.a] && points[comparePair.b]) {
    const [ax, ay] = points[comparePair.a]
    const [bx, by] = points[comparePair.b]
    ctx.strokeStyle = comparePair.improved ? '#ffd700' : CMP_COLOR
    ctx.lineWidth = comparePair.improved ? 2.5 : 1.5
    ctx.setLineDash([4, 4])
    ctx.beginPath()
    ctx.moveTo(toSx(ax), toSy(ay))
    ctx.lineTo(toSx(bx), toSy(by))
    ctx.stroke()
    ctx.setLineDash([])
  }

  // Draw connecting line for best pair so far
  if (bestPair && bestPair.a !== -1 && bestPair.b !== -1 && points[bestPair.a] && points[bestPair.b]) {
    const [ax, ay] = points[bestPair.a]
    const [bx, by] = points[bestPair.b]
    ctx.strokeStyle = BEST_COLOR
    ctx.lineWidth = 2.5
    ctx.beginPath()
    ctx.moveTo(toSx(ax), toSy(ay))
    ctx.lineTo(toSx(bx), toSy(by))
    ctx.stroke()

    // Label best pair points
    ctx.font = 'bold 11px Inter, monospace'
    ctx.fillStyle = BEST_COLOR
    ctx.textAlign = 'center'
    ctx.fillText(`P${bestPair.a}`, toSx(ax), toSy(ay) - HI_R - 5)
    ctx.fillText(`P${bestPair.b}`, toSx(bx), toSy(by) - HI_R - 5)
  }
}

function formatDist(d) {
  if (d === 0) return '0'
  return parseFloat(d.toPrecision(7)).toString()
}
