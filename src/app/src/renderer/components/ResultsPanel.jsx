import { useState } from 'react'
import './ResultsPanel.css'

/*
  ResultsPanel — displays the final result message from the engine.
  Shows detailed statistics for closest-pair vs karatsuba,
  with an independent verification feature and copy buttons.
*/
export default function ResultsPanel({ result, fileInfo }) {
  const [verifying, setVerifying] = useState(false)
  const [verifyResult, setVerifyResult] = useState(null)
  const [copied, setCopied] = useState(false)

  if (!result) return null
  const { algorithm, timeMs, traced, answer } = result

  const handleVerify = async () => {
    setVerifying(true)
    setVerifyResult(null)
    try {
      const res = await window.electronAPI.verifyResult({
        algorithm,
        filePath: fileInfo.path,
        answer
      })
      setVerifyResult(res)
    } catch (e) {
      setVerifyResult({ ok: false, note: e.message })
    } finally {
      setVerifying(false)
    }
  }

  const handleCopyProduct = () => {
    const textToCopy = answer.product || `${answer.productHead}...${answer.productTail}`
    navigator.clipboard.writeText(textToCopy)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="results-panel">
      <div className="rp-header">
        <div className="rp-title-wrap">
          <h2 className="rp-title">
            {algorithm === 'closest-pair' ? '📍 Closest Pair Result' : '✖ Karatsuba Result'}
          </h2>
          <div className="rp-meta">
            {traced ? (
              <span className="rp-badge traced">trace mode (with step events)</span>
            ) : (
              <span className="rp-badge bench">benchmark mode (high performance)</span>
            )}
          </div>
        </div>

        <div className="rp-actions">
          <button
            className="rp-verify-btn"
            onClick={handleVerify}
            disabled={verifying}
            title="Run independent checker to verify this result"
          >
            {verifying ? 'Verifying…' : '✓ Verify Answer'}
          </button>
        </div>
      </div>

      {verifyResult && (
        <div className={`rp-verify-banner ${verifyResult.ok ? 'success' : 'fail'}`}>
          <span className="vb-icon">{verifyResult.ok ? '✓' : '⚠'}</span>
          <span className="vb-text">{verifyResult.note}</span>
        </div>
      )}

      <div className="rp-cards">
        {/* ── Timing card ── */}
        <div className="rp-card timing">
          <div className="rpc-label">Running Time</div>
          <div className="rpc-value time">
            {timeMs < 1
              ? `${timeMs.toFixed(3)} ms`
              : timeMs < 1000
                ? `${timeMs.toFixed(2)} ms`
                : `${(timeMs / 1000).toFixed(3)} s`}
          </div>
          {traced ? (
            <div className="rpc-note">Algorithm + trace print</div>
          ) : (
            <div className="rpc-note">Algorithm only (std::chrono)</div>
          )}
        </div>

        {algorithm === 'closest-pair' ? (
          <ClosestPairAnswer answer={answer} n={result.n} />
        ) : (
          <KaratsubaAnswer
            answer={answer}
            onCopy={handleCopyProduct}
            copied={copied}
          />
        )}
      </div>
    </div>
  )
}

function ClosestPairAnswer({ answer, n }) {
  const { p1, p2, p1Index, p2Index, distance, distanceSquared } = answer
  return (
    <>
      <div className="rp-card">
        <div className="rpc-label">Input Size</div>
        <div className="rpc-value">{n?.toLocaleString()} points</div>
      </div>
      <div className="rp-card highlight">
        <div className="rpc-label">Closest Pair</div>
        <div className="rpc-pair">
          <div className="rpc-point">
            <span className="pt-index">P{p1Index}</span>
            <span className="pt-coords">
              ({formatCoord(p1[0])}, {formatCoord(p1[1])})
            </span>
          </div>
          <div className="rpc-arrow">↔</div>
          <div className="rpc-point">
            <span className="pt-index">P{p2Index}</span>
            <span className="pt-coords">
              ({formatCoord(p2[0])}, {formatCoord(p2[1])})
            </span>
          </div>
        </div>
      </div>
      <div className="rp-card">
        <div className="rpc-label">Minimum Distance</div>
        <div className="rpc-value accent">{formatFloat(distance)}</div>
        <div className="rpc-note">d² = {formatFloat(distanceSquared)}</div>
      </div>
    </>
  )
}

function KaratsubaAnswer({ answer, onCopy, copied }) {
  const {
    digitsA,
    digitsB,
    productDigits,
    productHead,
    productTail,
    outputFile,
    product
  } = answer

  const showFull = product !== null && product !== undefined

  return (
    <>
      <div className="rp-card">
        <div className="rpc-label">Input Lengths</div>
        <div className="rpc-value">
          {digitsA?.toLocaleString()} × {digitsB?.toLocaleString()} digits
        </div>
      </div>
      <div className="rp-card highlight">
        <div className="rpc-label">Product Length</div>
        <div className="rpc-value accent">{productDigits?.toLocaleString()} digits</div>
      </div>
      {showFull ? (
        <div className="rp-card full-product">
          <div className="rpc-header-row">
            <div className="rpc-label">Product (Full)</div>
            <button className="rpc-copy-btn" onClick={onCopy}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <div className="rpc-bignum">{product}</div>
        </div>
      ) : (
        <>
          <div className="rp-card">
            <div className="rpc-label">First 50 Digits</div>
            <div className="rpc-bignum">{productHead}…</div>
          </div>
          <div className="rp-card">
            <div className="rpc-label">Last 50 Digits</div>
            <div className="rpc-bignum">…{productTail}</div>
          </div>
          <div className="rp-card">
            <div className="rpc-label">Product File</div>
            <div className="rpc-file" title={outputFile}>
              {outputFile}
            </div>
          </div>
        </>
      )}
    </>
  )
}

function formatCoord(v) {
  if (Number.isInteger(v)) return String(v)
  return v.toPrecision(7).replace(/\.?0+$/, '')
}

function formatFloat(v) {
  if (v === 0) return '0'
  if (Number.isInteger(v)) return String(v)
  return parseFloat(v.toPrecision(10)).toString()
}
