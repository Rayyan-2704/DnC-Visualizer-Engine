import { useState, useEffect, useCallback, useRef } from 'react'
import FilePicker from './components/FilePicker'
import ModeBadge from './components/ModeBadge'
import StepPlayer from './components/StepPlayer'
import ResultsPanel from './components/ResultsPanel'
import EngineStatus from './components/EngineStatus'
import SnapshotCanvas from './visualizers/SnapshotCanvas'
import './App.css'

/*
  App state machine:
  idle → peeked → running → done (step | snapshot | bench)
                 ↘ error
*/

export default function App() {
  const [fileInfo, setFileInfo]     = useState(null)   // { path, algorithm, mode, n?, digitsA?, digitsB? }
  const [phase, setPhase]           = useState('idle')  // idle | peeked | running | done | error
  const [steps, setSteps]           = useState([])      // collected step messages (trace mode)
  const [result, setResult]         = useState(null)    // final result message
  const [snapshotPoints, setSnapshotPoints] = useState(null) // points loaded for snapshot mode
  const [errorMsg, setErrorMsg]     = useState(null)
  const [engineOk, setEngineOk]     = useState(null)   // null=checking, true, false
  const [stderr, setStderr]         = useState('')

  const stepsRef = useRef([])
  const removeLineListener  = useRef(null)
  const removeDoneListener  = useRef(null)

  // Check if C++ engine.exe is built on mount
  useEffect(() => {
    window.electronAPI.engineExists().then(ok => setEngineOk(ok))
  }, [])

  // ── File selected ──────────────────────────────────────────────────────────
  const handleFileSelected = useCallback(async (filePath) => {
    if (!filePath) return
    const info = await window.electronAPI.peekFile(filePath)
    if (info.error) {
      setErrorMsg(info.error)
      setPhase('error')
      return
    }
    setFileInfo({ path: filePath, ...info })
    setPhase('peeked')
    setResult(null)
    setSteps([])
    stepsRef.current = []
    setErrorMsg(null)
    setStderr('')

    // If snapshot mode, pre-load points for preview
    if (info.algorithm === 'closest-pair' && info.mode === 'snapshot') {
      const ptData = await window.electronAPI.loadPoints(filePath, 10000)
      if (ptData && !ptData.error) {
        setSnapshotPoints(ptData.points)
      }
    } else {
      setSnapshotPoints(null)
    }
  }, [])

  // ── Run ────────────────────────────────────────────────────────────────────
  const handleRun = useCallback(async () => {
    if (!fileInfo) return
    setPhase('running')
    setSteps([])
    stepsRef.current = []
    setResult(null)
    setErrorMsg(null)
    setStderr('')

    // Attach streaming listener first
    if (removeLineListener.current) removeLineListener.current()
    if (removeDoneListener.current) removeDoneListener.current()

    removeLineListener.current = window.electronAPI.onEngineLine((rawLine) => {
      let msg
      try { msg = JSON.parse(rawLine) } catch { return }

      if (msg.type === 'hello') return
      if (msg.type === 'step') {
        stepsRef.current = [...stepsRef.current, msg]
        setSteps(prev => [...prev, msg])
      }
      if (msg.type === 'result') {
        setResult(msg)
      }
      if (msg.type === 'error') {
        setErrorMsg(`[${msg.code}] ${msg.message}`)
        setPhase('error')
      }
    })

    removeDoneListener.current = window.electronAPI.onEngineDone(({ code, stderr: se }) => {
      setStderr(se || '')
      if (code === 0) {
        setPhase('done')
      } else if (phase !== 'error') {
        setPhase('error')
        if (!errorMsg) setErrorMsg(`Engine exited with code ${code}`)
      }
    })

    const opts = {
      algorithm: fileInfo.algorithm,
      filePath: fileInfo.path,
      trace: fileInfo.mode === 'step'
    }

    const runResult = await window.electronAPI.runEngine(opts)
    if (runResult?.error) {
      setErrorMsg(runResult.error)
      setPhase('error')
    }
  }, [fileInfo])

  // ── Cancel ─────────────────────────────────────────────────────────────────
  const handleCancel = useCallback(async () => {
    await window.electronAPI.cancelEngine()
    setPhase('peeked')
  }, [])

  // ── Reset ──────────────────────────────────────────────────────────────────
  const handleReset = useCallback(() => {
    window.electronAPI.cancelEngine()
    setFileInfo(null)
    setPhase('idle')
    setSteps([])
    stepsRef.current = []
    setResult(null)
    setSnapshotPoints(null)
    setErrorMsg(null)
    setStderr('')
  }, [])

  const isStep     = fileInfo?.mode === 'step'
  const isSnapshot = fileInfo?.mode === 'snapshot'
  const isBench    = fileInfo?.mode === 'bench'

  return (
    <div className="app-shell">
      {/* ── Sidebar ── */}
      <aside className="sidebar">
        <div className="logo">
          <span className="logo-icon">∞</span>
          <div>
            <div className="logo-title">DnC Visualizer</div>
            <div className="logo-sub">D&amp;A of Algorithms</div>
          </div>
        </div>

        <EngineStatus ok={engineOk} />

        <FilePicker
          onFileSelected={handleFileSelected}
          disabled={phase === 'running'}
        />

        {fileInfo && (
          <div className="file-summary">
            <div className="fs-name">{fileInfo.path.split(/[\\/]/).pop()}</div>
            <div className="fs-path" title={fileInfo.path}>{fileInfo.path}</div>
            {fileInfo.algorithm === 'closest-pair' && (
              <div className="fs-meta">n = {fileInfo.n?.toLocaleString()} points</div>
            )}
            {fileInfo.algorithm === 'karatsuba' && (
              <div className="fs-meta">
                {fileInfo.digitsA?.toLocaleString()} × {fileInfo.digitsB?.toLocaleString()} digits
              </div>
            )}
            <ModeBadge algorithm={fileInfo.algorithm} mode={fileInfo.mode} />
          </div>
        )}

        <div className="sidebar-actions">
          {phase === 'peeked' && (
            <button className="btn-run" onClick={handleRun}>
              ▶ Run Algorithm
            </button>
          )}
          {phase === 'running' && (
            <button className="btn-cancel" onClick={handleCancel}>
              ■ Cancel
            </button>
          )}
          {(phase === 'done' || phase === 'error') && (
            <>
              <button className="btn-run" onClick={handleRun}>
                ↺ Run Again
              </button>
              <button className="btn-reset" onClick={handleReset}>
                ✕ Clear
              </button>
            </>
          )}
        </div>

        {phase === 'running' && (
          <div className="running-indicator">
            <div className="spinner" />
            <span>Computing result…</span>
          </div>
        )}

        {stderr && (
          <details className="stderr-box">
            <summary>Engine Debug Log</summary>
            <pre>{stderr}</pre>
          </details>
        )}
      </aside>

      {/* ── Main content ── */}
      <main className="main-content">
        {phase === 'idle' && <WelcomeScreen />}

        {phase === 'peeked' && (
          <div className="peeked-hint">
            <div className="hint-icon">📂</div>
            <h2>Ready to run</h2>
            <p>
              Selected: <strong>{fileInfo.path.split(/[\\/]/).pop()}</strong> ({fileInfo.mode} mode)
            </p>
            <button className="btn-run-large" onClick={handleRun}>
              ▶ Run Algorithm
            </button>
          </div>
        )}

        {phase === 'running' && (
          <div className="peeked-hint">
            <div className="spinner-large" />
            <h2>Running Algorithm…</h2>
            <p>
              {isStep
                ? 'Collecting trace steps for animation…'
                : 'Executing divide and conquer algorithm (high speed mode)…'}
            </p>
            {steps.length > 0 && (
              <p className="steps-counter">{steps.length} trace events collected</p>
            )}
          </div>
        )}

        {phase === 'error' && (
          <div className="error-panel">
            <div className="error-icon">✗</div>
            <h2>Execution Error</h2>
            <p>{errorMsg || 'Unknown error occurred'}</p>
          </div>
        )}

        {phase === 'done' && result && (
          <div className="results-wrapper">
            <ResultsPanel result={result} fileInfo={fileInfo} />

            {/* Step-by-step player (small mode) */}
            {isStep && steps.length > 0 && (
              <StepPlayer
                steps={steps}
                result={result}
                fileInfo={fileInfo}
              />
            )}

            {/* Snapshot canvas (mid-size mode: 200 < n <= 10,000) */}
            {isSnapshot && snapshotPoints && (
              <div className="snapshot-wrapper">
                <SnapshotCanvas
                  points={snapshotPoints}
                  answer={result.answer}
                />
              </div>
            )}
          </div>
        )}

        {/* Live view during trace collection */}
        {phase === 'running' && isStep && steps.length > 0 && (
          <div className="results-wrapper">
            <StepPlayer
              steps={steps}
              result={null}
              fileInfo={fileInfo}
              collecting={true}
            />
          </div>
        )}
      </main>
    </div>
  )
}

function WelcomeScreen() {
  return (
    <div className="welcome">
      <div className="welcome-hero">
        <div className="welcome-logo">∞</div>
        <h1>Divide &amp; Conquer Visualizer</h1>
        <p className="welcome-sub">
          Interactive desktop workbench for <strong>Closest Pair of Points</strong> and{' '}
          <strong>Karatsuba Integer Multiplication</strong>.
        </p>
      </div>
      <div className="welcome-cards">
        <div className="wcard">
          <div className="wcard-icon">📍</div>
          <h3>Closest Pair 2-D</h3>
          <p>
            Kleinberg Section 5.4 O(n log n) divide-and-conquer. Animated dividing lines, δ-strips,
            point comparisons, and optimal distance updates.
          </p>
        </div>
        <div className="wcard">
          <div className="wcard-icon">✖</div>
          <h3>Karatsuba</h3>
          <p>
            Sub-quadratic integer multiplication. Interactive visual recursion tree showing
            split operands, three sub-problems, and assembly.
          </p>
        </div>
        <div className="wcard">
          <div className="wcard-icon">⚡</div>
          <h3>Benchmarks &amp; Millions</h3>
          <p>
            Instantly handle inputs in the millions (1,000,000+ points and digits) with
            precise wall-clock timing and verified correctness.
          </p>
        </div>
      </div>
      <p className="welcome-cta">
        ← Select any input file from the sidebar or click Browse to begin
      </p>
    </div>
  )
}
