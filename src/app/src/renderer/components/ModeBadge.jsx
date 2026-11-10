import './ModeBadge.css'

export default function ModeBadge({ algorithm, mode }) {
  const algoLabel = algorithm === 'closest-pair' ? '📍 Closest Pair' : '✖ Karatsuba'
  const modeLabel =
    mode === 'step'
      ? '⏩ Step-by-step Mode'
      : mode === 'snapshot'
      ? '📷 Snapshot Mode'
      : '⚡ Benchmark Mode'

  const modeClass = mode === 'step' ? 'step' : mode === 'snapshot' ? 'snapshot' : 'bench'

  return (
    <div className="mode-badge">
      <span className="mb-algo">{algoLabel}</span>
      <span className={`mb-mode ${modeClass}`}>{modeLabel}</span>
    </div>
  )
}
