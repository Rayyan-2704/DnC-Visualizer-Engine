import './EngineStatus.css'

export default function EngineStatus({ ok }) {
  if (ok === null) {
    return <div className="engine-status checking">Detecting engine…</div>
  }
  if (ok) {
    return (
      <div className="engine-status ok" title="C++ engine.exe compiled and ready">
        ✓ C++ engine.exe ready
      </div>
    )
  }
  return (
    <div
      className="engine-status js"
      title="Running built-in engine. To use C++ binary, run src\engine\build.bat"
    >
      ⚡ Built-in Engine Active
      <div className="es-hint">C++ binary: run <code>build.bat</code></div>
    </div>
  )
}
