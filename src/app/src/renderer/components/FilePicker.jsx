import { useState, useEffect } from 'react'
import './FilePicker.css'

/*
  FilePicker — lets users either:
  1. Click "Browse…" to open a system file dialog
  2. Pick from the bundled data files list (small + large)
*/
export default function FilePicker({ onFileSelected, disabled }) {
  const [dataFiles, setDataFiles] = useState([])
  const [loading, setLoading] = useState(false)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    window.electronAPI.listDataFiles().then(files => setDataFiles(files))
  }, [])

  const handleBrowse = async () => {
    const path = await window.electronAPI.openFile()
    if (path) onFileSelected(path)
  }

  const filtered = dataFiles.filter(f =>
    f.name.toLowerCase().includes(filter.toLowerCase())
  )

  // Group by cp / im
  const cpFiles = filtered.filter(f => f.name.startsWith('cp'))
  const imFiles = filtered.filter(f => f.name.startsWith('im'))
  const other   = filtered.filter(f => !f.name.startsWith('cp') && !f.name.startsWith('im'))

  const FileItem = ({ f }) => (
    <button
      className="file-item"
      disabled={disabled}
      onClick={() => onFileSelected(f.path)}
      title={f.path}
    >
      <span className={`fi-tag ${f.name.startsWith('cp') ? 'cp' : 'im'}`}>
        {f.name.startsWith('cp') ? 'CP' : 'IM'}
      </span>
      <span className="fi-name">{f.name}</span>
      <span className="fi-loc">{f.location}</span>
    </button>
  )

  return (
    <div className="file-picker">
      <div className="fp-header">
        <span className="fp-title">Select Input File</span>
        <button className="btn-browse" onClick={handleBrowse} disabled={disabled}>
          Browse…
        </button>
      </div>

      {dataFiles.length > 0 && (
        <>
          <input
            className="fp-filter"
            type="text"
            placeholder="Filter files…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
          />
          <div className="fp-list">
            {cpFiles.length > 0 && (
              <div className="fp-group">
                <div className="fp-group-label">📍 Closest Pair</div>
                {cpFiles.map(f => <FileItem key={f.path} f={f} />)}
              </div>
            )}
            {imFiles.length > 0 && (
              <div className="fp-group">
                <div className="fp-group-label">✖ Integer Multiplication</div>
                {imFiles.map(f => <FileItem key={f.path} f={f} />)}
              </div>
            )}
            {other.length > 0 && (
              <div className="fp-group">
                <div className="fp-group-label">Other</div>
                {other.map(f => <FileItem key={f.path} f={f} />)}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}

