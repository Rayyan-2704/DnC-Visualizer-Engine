import { useEffect, useRef, useState } from 'react'
import './SnapshotCanvas.css'

/*
  SnapshotCanvas — Stage 2 Mid-Size Visualizer (up to 10,000 points).
  Draws the full point cloud with the closest pair highlighted in gold,
  with pan, zoom, point count, and distance overlay.
*/

export default function SnapshotCanvas({ points, answer }) {
  const canvasRef = useRef(null)
  const containerRef = useRef(null)
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const isDragging = useRef(false)
  const lastMouse = useRef({ x: 0, y: 0 })

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container || !points || points.length === 0) return

    const W = container.clientWidth || 800
    const H = container.clientHeight || 500
    canvas.width = W
    canvas.height = H

    const ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, W, H)

    // Compute bounds
    const xs = points.map(p => p[0])
    const ys = points.map(p => p[1])
    const xMin = Math.min(...xs), xMax = Math.max(...xs)
    const yMin = Math.min(...ys), yMax = Math.max(...ys)
    const xRange = xMax - xMin || 1
    const yRange = yMax - yMin || 1

    const PAD = 50
    const toSx = (x) => pan.x + (PAD + ((x - xMin) / xRange) * (W - 2 * PAD) - W / 2) * zoom + W / 2
    const toSy = (y) => pan.y + ((H - PAD) - ((y - yMin) / yRange) * (H - 2 * PAD) - H / 2) * zoom + H / 2

    // Background grid
    ctx.strokeStyle = 'rgba(255,255,255,0.03)'
    ctx.lineWidth = 1
    for (let x = 0; x < W; x += 40) {
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke()
    }
    for (let y = 0; y < H; y += 40) {
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke()
    }

    // Draw non-closest points
    const p1Idx = answer?.p1Index
    const p2Idx = answer?.p2Index

    ctx.fillStyle = 'rgba(108,99,255,0.5)'
    const r = points.length > 2000 ? 1.5 : 2.5
    for (let i = 0; i < points.length; i++) {
      if (i === p1Idx || i === p2Idx) continue
      const [x, y] = points[i]
      const sx = toSx(x), sy = toSy(y)
      if (sx < -10 || sx > W + 10 || sy < -10 || sy > H + 10) continue
      ctx.beginPath()
      ctx.arc(sx, sy, r, 0, Math.PI * 2)
      ctx.fill()
    }

    // Draw closest pair if available
    if (answer?.p1 && answer?.p2) {
      const [ax, ay] = answer.p1
      const [bx, by] = answer.p2
      const sax = toSx(ax), say = toSy(ay)
      const sbx = toSx(bx), sby = toSy(by)

      // Connecting line
      ctx.strokeStyle = '#ffd700'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(sax, say)
      ctx.lineTo(sbx, sby)
      ctx.stroke()

      // Target rings
      for (const [sx, sy, label] of [[sax, say, `P${p1Idx}`], [sbx, sby, `P${p2Idx}`]]) {
        ctx.beginPath()
        ctx.arc(sx, sy, 8, 0, Math.PI * 2)
        ctx.strokeStyle = 'rgba(255,215,0,0.5)'
        ctx.lineWidth = 2
        ctx.stroke()

        ctx.beginPath()
        ctx.arc(sx, sy, 4, 0, Math.PI * 2)
        ctx.fillStyle = '#ffd700'
        ctx.fill()

        ctx.font = 'bold 12px Inter, monospace'
        ctx.fillStyle = '#ffd700'
        ctx.fillText(label, sx + 10, sy - 5)
      }
    }
  }, [points, answer, zoom, pan])

  // Mouse pan/zoom handlers
  const handleWheel = (e) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.15 : 0.85
    setZoom(z => Math.max(0.2, Math.min(20, z * factor)))
  }

  const handleMouseDown = (e) => {
    isDragging.current = true
    lastMouse.current = { x: e.clientX, y: e.clientY }
  }

  const handleMouseMove = (e) => {
    if (!isDragging.current) return
    const dx = e.clientX - lastMouse.current.x
    const dy = e.clientY - lastMouse.current.y
    lastMouse.current = { x: e.clientX, y: e.clientY }
    setPan(p => ({ x: p.x + dx, y: p.y + dy }))
  }

  const handleMouseUp = () => { isDragging.current = false }

  const resetView = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  return (
    <div
      ref={containerRef}
      className="sc-container"
      onWheel={handleWheel}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <canvas ref={canvasRef} className="sc-canvas" />
      <div className="sc-toolbar">
        <span className="sc-info">
          📍 {points?.length?.toLocaleString()} points (Snapshot mode)
        </span>
        <button className="sc-btn" onClick={() => setZoom(z => z * 1.25)} title="Zoom In">+</button>
        <button className="sc-btn" onClick={() => setZoom(z => z * 0.8)}  title="Zoom Out">-</button>
        <button className="sc-btn" onClick={resetView} title="Reset View">Reset</button>
      </div>
    </div>
  )
}

