import { useState, useEffect, useRef, useCallback } from 'react'
import ClosestPairCanvas from '../visualizers/ClosestPairCanvas'
import KaratsubaTree from '../visualizers/KaratsubaTree'
import './StepPlayer.css'

/*
  StepPlayer — Play/Pause/Next/Back/Speed controls over the trace event list.

  Protocol:
  - steps[0] is always "init"
  - steps[1..] are the algorithm steps (divide, base, strip, compare, update, merge for CP;
    split, base, combine for Karatsuba)
  - We step through 0..steps.length-1; the current event caption comes from steps[cursor].msg
*/

const SPEEDS = [0.25, 0.5, 1, 2, 4, 8]

export default function StepPlayer({ steps, result, fileInfo, collecting }) {
  const [cursor,  setCursor]  = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(2)   // default 1×
  const intervalRef = useRef(null)

  const total  = steps.length
  const speed  = SPEEDS[speedIdx]
  const delay  = Math.round(600 / speed)        // ms between auto-steps
  const isCP   = fileInfo?.algorithm === 'closest-pair'
  const isKara = fileInfo?.algorithm === 'karatsuba'

  // Reset to 0 when a new run starts
  useEffect(() => {
    setCursor(0)
    setPlaying(false)
  }, [steps[0]?.seq])  // seq resets to 0 on each new run

  // Auto-advance when playing
  useEffect(() => {
    clearInterval(intervalRef.current)
    if (playing) {
      intervalRef.current = setInterval(() => {
        setCursor(c => {
          if (c >= total - 1) {
            setPlaying(false)
            clearInterval(intervalRef.current)
            return c
          }
          return c + 1
        })
      }, delay)
    }
    return () => clearInterval(intervalRef.current)
  }, [playing, delay, total])

  const goTo    = useCallback(i => setCursor(Math.max(0, Math.min(i, total - 1))), [total])
  const prev    = useCallback(() => { setPlaying(false); goTo(cursor - 1) }, [cursor, goTo])
  const next    = useCallback(() => { setPlaying(false); goTo(cursor + 1) }, [cursor, goTo])
  const toStart = useCallback(() => { setPlaying(false); goTo(0) },         [goTo])
  const toEnd   = useCallback(() => { setPlaying(false); goTo(total - 1) }, [goTo, total])
  const togglePlay = useCallback(() => {
    if (cursor >= total - 1) { goTo(0); setPlaying(true) }
    else setPlaying(p => !p)
  }, [cursor, total, goTo])

  const curStep = steps[cursor]

  return (
    <div className="step-player">
      {/* ── Top bar: controls ── */}
      <div className="sp-controls">
        <div className="sp-left">
          <button className="sp-btn" onClick={toStart} title="First step">⏮</button>
          <button className="sp-btn" onClick={prev}    title="Previous step" disabled={cursor === 0}>◀</button>
          <button className="sp-btn sp-play" onClick={togglePlay}>
            {playing ? '⏸' : '▶'}
          </button>
          <button className="sp-btn" onClick={next}    title="Next step" disabled={cursor >= total - 1}>▶</button>
          <button className="sp-btn" onClick={toEnd}   title="Last step">⏭</button>
        </div>

        <div className="sp-progress">
          <input
            type="range"
            min={0} max={Math.max(0, total - 1)}
            value={cursor}
            onChange={e => { setPlaying(false); goTo(Number(e.target.value)) }}
            style={{ width: '100%' }}
          />
          <span className="sp-counter">{cursor + 1} / {total}</span>
        </div>

        <div className="sp-right">
          <span className="sp-speed-label">Speed</span>
          <div className="sp-speed-buttons">
            {SPEEDS.map((s, i) => (
              <button
                key={s}
                className={`sp-speed ${i === speedIdx ? 'active' : ''}`}
                onClick={() => setSpeedIdx(i)}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Event caption ── */}
      <div className="sp-caption">
        {curStep && (
          <>
            <span className={`sp-kind-badge kind-${curStep.kind}`}>{curStep.kind}</span>
            <span className="sp-msg">{curStep.msg}</span>
            <span className="sp-depth">depth {curStep.depth}</span>
          </>
        )}
        {collecting && <span className="sp-collecting">⟳ still collecting…</span>}
      </div>

      {/* ── Visualizer area ── */}
      <div className="sp-visual">
        {isCP   && <ClosestPairCanvas steps={steps} cursor={cursor} result={result} />}
        {isKara && <KaratsubaTree    steps={steps} cursor={cursor} result={result} />}
      </div>

      {/* ── Event log panel ── */}
      <EventLog steps={steps} cursor={cursor} onSelect={i => { setPlaying(false); goTo(i) }} />
    </div>
  )
}

/* Scrollable list of events with the current one highlighted */
function EventLog({ steps, cursor, onSelect }) {
  const listRef = useRef(null)
  const activeRef = useRef(null)

  useEffect(() => {
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [cursor])

  return (
    <div className="event-log">
      <div className="el-header">Event Log</div>
      <div className="el-list" ref={listRef}>
        {steps.map((s, i) => (
          <div
            key={i}
            ref={i === cursor ? activeRef : null}
            className={`el-item ${i === cursor ? 'active' : ''}`}
            onClick={() => onSelect(i)}
          >
            <span className="el-seq">#{s.seq}</span>
            <span className={`el-kind kind-${s.kind}`}>{s.kind}</span>
            <span className="el-msg">{s.msg}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

