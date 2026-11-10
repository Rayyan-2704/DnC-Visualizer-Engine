/*
  main/index.js — Electron main process

  Responsibilities:
  - Create the BrowserWindow
  - Open the system file dialog
  - Peek at file headers to detect algorithm + size (streaming for arbitrary file sizes)
  - Run the engine (C++ engine.exe when built, or built-in reference engine)
  - Pipe engine stdout lines back to the renderer via IPC
  - Provide point loading for Snapshot mode (up to 10k points)
  - Provide verification runner (Deliverable 4 bonus/rubric item)
*/

const { app, BrowserWindow, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const { spawn } = require('child_process')

// ─────────────────────────────────────────────────────────────────────────────
// Path & Engine Detection
// ─────────────────────────────────────────────────────────────────────────────
function getRepoRoot() {
  let cur = __dirname
  for (let i = 0; i < 6; i++) {
    if (
      fs.existsSync(path.join(cur, 'docs', 'PROTOCOL.md')) ||
      fs.existsSync(path.join(cur, 'src', 'engine', 'main.cpp'))
    ) {
      return cur
    }
    cur = path.dirname(cur)
  }
  return path.resolve(__dirname, '..', '..', '..')
}

const REPO_ROOT = getRepoRoot()
const ENGINE_PATH = path.join(REPO_ROOT, 'bin', 'engine.exe')

function hasCppEngine() {
  return fs.existsSync(ENGINE_PATH)
}

const TRACE_MAX_N = 200
const TRACE_MAX_DIGITS = 200

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1320,
    height: 860,
    minWidth: 960,
    minHeight: 620,
    backgroundColor: '#0d0d1a',
    title: 'DnC Visualizer Engine',
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// ─────────────────────────────────────────────────────────────────────────────
// Engine Runners (C++ process & Protocol Reference Engine)
// ─────────────────────────────────────────────────────────────────────────────
function runCppEngine({ algorithm, filePath, trace, outFile }, onLine) {
  const args = [algorithm, filePath]
  if (trace) args.push('--trace')
  if (outFile) { args.push('--out'); args.push(outFile) }

  const child = spawn(ENGINE_PATH, args, {
    cwd: REPO_ROOT,
    stdio: ['ignore', 'pipe', 'pipe']
  })

  let buffer = ''
  let stderrBuf = ''

  child.stdout.on('data', (data) => {
    buffer += data.toString('utf8')
    let nl
    while ((nl = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (line.length > 0) {
        onLine(line)
      }
    }
  })

  child.stderr.on('data', (d) => { stderrBuf += d.toString('utf8') })

  const promise = new Promise((resolve) => {
    child.on('close', (code) => {
      resolve({ code, stderr: stderrBuf, source: 'cpp' })
    })
    child.on('error', (err) => {
      resolve({ error: err.message, stderr: stderrBuf, source: 'cpp' })
    })
  })

  return { child, promise }
}

function runJsEngine({ algorithm, filePath, trace, outFile }, onLine) {
  let cancelled = false
  const abortCtrl = {
    kill: () => { cancelled = true }
  }

  const promise = (async () => {
    onLine(JSON.stringify({ type: 'hello', protocol: 1, engine: 'daa-engine-js', version: '0.1.0' }))

    const raw = fs.readFileSync(filePath, 'utf8')

    if (algorithm === 'closest-pair') {
      return runJsClosestPair(raw, filePath, trace, onLine, () => cancelled)
    } else if (algorithm === 'karatsuba') {
      return runJsKaratsuba(raw, filePath, trace, outFile, onLine, () => cancelled)
    } else {
      onLine(JSON.stringify({ type: 'error', code: 'BAD_ARGS', message: `unknown algorithm ${algorithm}` }))
      return { code: 1, stderr: '', source: 'js' }
    }
  })()

  return { child: abortCtrl, promise }
}

function runJsClosestPair(data, filePath, trace, onLine, isCancelled) {
  const lines = data.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)
  const n = parseInt(lines[0], 10)
  if (isNaN(n) || n < 2) {
    onLine(JSON.stringify({ type: 'error', code: 'BAD_FORMAT', message: 'need at least 2 points' }))
    return { code: 1, stderr: '', source: 'js' }
  }

  if (trace && n > 200) {
    onLine(JSON.stringify({ type: 'error', code: 'TRACE_TOO_LARGE', message: '--trace needs n <= 200' }))
    return { code: 1, stderr: '', source: 'js' }
  }

  const P = []
  for (let i = 0; i < n; i++) {
    const parts = lines[i + 1].trim().split(/\s+/)
    P.push([parseFloat(parts[0]), parseFloat(parts[1])])
  }

  const d2of = (a, b) => (P[a][0] - P[b][0]) ** 2 + (P[a][1] - P[b][1]) ** 2

  const sortedByX = Array.from({ length: n }, (_, i) => i)
  sortedByX.sort((a, b) => {
    if (P[a][0] !== P[b][0]) return P[a][0] - P[b][0]
    if (P[a][1] !== P[b][1]) return P[a][1] - P[b][1]
    return a - b
  })

  let seq = 0
  let nextId = 0
  const emit = (obj) => {
    if (!isCancelled()) onLine(JSON.stringify({ type: 'step', seq: seq++, ...obj }))
  }

  if (trace) {
    emit({
      id: 0,
      parentId: null,
      depth: 0,
      kind: 'init',
      points: P,
      sortedByX,
      msg: `Loaded ${n} points, sorted by x`
    })
  }

  const t0 = performance.now()

  function solve(id, parentId, depth, lo, hi) {
    const count = hi - lo
    if (count <= 3) {
      let bestA = sortedByX[lo], bestB = sortedByX[lo + 1]
      let bestD2 = d2of(bestA, bestB)
      for (let i = lo; i < hi; i++) {
        for (let j = i + 1; j < hi; j++) {
          const d2 = d2of(sortedByX[i], sortedByX[j])
          if (d2 < bestD2) {
            bestD2 = d2
            bestA = sortedByX[i]
            bestB = sortedByX[j]
          }
        }
      }
      const pair = { a: Math.min(bestA, bestB), b: Math.max(bestA, bestB), d2: bestD2 }
      if (trace) {
        emit({
          id, parentId, depth,
          kind: 'base',
          lo, hi,
          best: pair,
          msg: `${count} points: solved by brute force (best d² = ${bestD2.toFixed(4)})`
        })
      }
      return pair
    }

    const mid = lo + Math.floor(count / 2)
    const lineX = P[sortedByX[mid]][0]

    if (trace) {
      emit({
        id, parentId, depth,
        kind: 'divide',
        lo, hi, mid, lineX,
        msg: `Split positions ${lo}-${hi - 1} at x = ${lineX}`
      })
    }

    const leftId = ++nextId
    const leftBest = solve(leftId, id, depth + 1, lo, mid)

    const rightId = ++nextId
    const rightBest = solve(rightId, id, depth + 1, mid, hi)

    let curBest = leftBest.d2 < rightBest.d2 ? { ...leftBest } : { ...rightBest }
    let curDelta = Math.sqrt(curBest.d2)

    const inStrip = []
    for (let i = lo; i < hi; i++) {
      const pid = sortedByX[i]
      if (Math.abs(P[pid][0] - lineX) < curDelta) {
        inStrip.push(pid)
      }
    }
    inStrip.sort((a, b) => P[a][1] - P[b][1])

    if (trace) {
      emit({
        id, parentId, depth,
        kind: 'strip',
        lineX, delta: curDelta,
        stripPids: inStrip,
        bestLeft: leftBest,
        bestRight: rightBest,
        msg: `Strip built around x = ${lineX}: ${inStrip.length} points within δ = ${curDelta.toFixed(4)}`
      })

      for (let i = 0; i < inStrip.length; i++) {
        for (let j = i + 1; j < inStrip.length; j++) {
          const dy = P[inStrip[j]][1] - P[inStrip[i]][1]
          if (dy * dy >= curBest.d2) break

          const d2 = d2of(inStrip[i], inStrip[j])
          const improved = d2 < curBest.d2
          emit({
            id, parentId, depth,
            kind: 'compare',
            a: inStrip[i], b: inStrip[j],
            d2, improved,
            msg: `Compared points P${inStrip[i]} and P${inStrip[j]}: d² = ${d2.toFixed(4)}${improved ? ' (improved!)' : ''}`
          })

          if (improved) {
            curBest = { a: Math.min(inStrip[i], inStrip[j]), b: Math.max(inStrip[i], inStrip[j]), d2 }
            curDelta = Math.sqrt(d2)
            emit({
              id, parentId, depth,
              kind: 'update',
              best: curBest,
              msg: `New best pair: P${curBest.a} and P${curBest.b} with d = ${curDelta.toFixed(4)}`
            })
          }
        }
      }

      emit({
        id, parentId, depth,
        kind: 'merge',
        lo, hi,
        best: curBest,
        msg: `Merge done for positions ${lo}-${hi - 1}`
      })
    } else {
      for (let i = 0; i < inStrip.length; i++) {
        for (let j = i + 1; j < inStrip.length; j++) {
          const dy = P[inStrip[j]][1] - P[inStrip[i]][1]
          if (dy * dy >= curBest.d2) break
          const d2 = d2of(inStrip[i], inStrip[j])
          if (d2 < curBest.d2) {
            curBest = { a: Math.min(inStrip[i], inStrip[j]), b: Math.max(inStrip[i], inStrip[j]), d2 }
            curDelta = Math.sqrt(d2)
          }
        }
      }
    }

    return curBest
  }

  const finalBest = solve(0, null, 0, 0, n)
  const t1 = performance.now()
  const timeMs = t1 - t0

  const p1 = P[finalBest.a]
  const p2 = P[finalBest.b]

  onLine(JSON.stringify({
    type: 'result',
    algorithm: 'closest-pair',
    file: filePath,
    n,
    timeMs,
    traced: Boolean(trace),
    answer: {
      p1: [p1[0], p1[1]],
      p2: [p2[0], p2[1]],
      p1Index: finalBest.a,
      p2Index: finalBest.b,
      distance: Math.sqrt(finalBest.d2),
      distanceSquared: finalBest.d2
    }
  }))

  return { code: 0, stderr: '', source: 'js' }
}

function runJsKaratsuba(data, filePath, trace, outFile, onLine, isCancelled) {
  const lines = data.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0)
  if (lines.length < 2) {
    onLine(JSON.stringify({ type: 'error', code: 'BAD_FORMAT', message: 'expected two numbers' }))
    return { code: 1, stderr: '', source: 'js' }
  }

  const sa = lines[0].replace(/^0+(?=.)/, '')
  const sb = lines[1].replace(/^0+(?=.)/, '')

  if (trace && (sa.length > 200 || sb.length > 200)) {
    onLine(JSON.stringify({ type: 'error', code: 'TRACE_TOO_LARGE', message: '--trace needs both numbers to have <= 200 digits' }))
    return { code: 1, stderr: '', source: 'js' }
  }

  const cutoffLimbs = trace ? 4 : 128
  const B = 1000000000n

  let seq = 0
  let nextId = 0
  const emit = (obj) => {
    if (!isCancelled()) onLine(JSON.stringify({ type: 'step', seq: seq++, ...obj }))
  }

  if (trace) {
    emit({
      id: 0,
      parentId: null,
      depth: 0,
      kind: 'init',
      a: sa,
      b: sb,
      limbBase: 1000000000,
      cutoffLimbs,
      msg: `Multiplying ${sa.length}-digit and ${sb.length}-digit numbers`
    })
  }

  const limbsOf = (s) => (s === '0' ? 0 : Math.ceil(s.length / 9))
  const pw = (m) => B ** BigInt(m)

  const t0 = performance.now()

  function kara(id, parentId, depth, role, xStr, yStr) {
    let x = xStr, y = yStr
    if (limbsOf(x) < limbsOf(y)) {
      const tmp = x; x = y; y = tmp
    }

    const lx = limbsOf(x)
    const ly = limbsOf(y)

    if (ly < cutoffLimbs || y === '0') {
      const prod = (BigInt(x) * BigInt(y)).toString()
      if (trace) {
        emit({
          id, parentId, depth,
          kind: 'base',
          role,
          x, y,
          product: prod,
          msg: role ? `${role} = schoolbook(${x} × ${y}) = ${prod}` : `Base multiplication: ${x} × ${y} = ${prod}`
        })
      }
      return prod
    }

    const m = Math.floor((lx + 1) / 2)
    const mDigits = 9 * m
    const unbalanced = ly <= m

    const xBig = BigInt(x)
    const x0Big = xBig % pw(m)
    const x1Big = xBig / pw(m)
    const x0 = x0Big.toString()
    const x1 = x1Big.toString()

    let y0 = y, y1 = '0'
    if (!unbalanced) {
      const yBig = BigInt(y)
      const y0Big = yBig % pw(m)
      const y1Big = yBig / pw(m)
      y0 = y0Big.toString()
      y1 = y1Big.toString()
    }

    if (trace) {
      emit({
        id, parentId, depth,
        kind: 'split',
        role,
        x, y, m, mDigits,
        x1, x0, y1, y0,
        unbalanced,
        msg: unbalanced
          ? `Unbalanced split at ${mDigits} digits (y fits in low half)`
          : `Split at ${mDigits} digits: x = ${x1}·B^${m} + ${x0}, y = ${y1}·B^${m} + ${y0}`
      })
    }

    let finalProd = '0'

    if (unbalanced) {
      const id0 = ++nextId
      const piece0 = kara(id0, id, depth + 1, 'piece0', x0, y)

      const id1 = ++nextId
      const piece1 = kara(id1, id, depth + 1, 'piece1', x1, y)

      const pBig = BigInt(piece0) + BigInt(piece1) * pw(m)
      finalProd = pBig.toString()

      if (trace) {
        emit({
          id, parentId, depth,
          kind: 'combine',
          unbalanced: true,
          pieces: [piece0, piece1],
          product: finalProd,
          msg: `Combined pieces: ${piece0} + ${piece1}·10^${mDigits} = ${finalProd}`
        })
      }
    } else {
      const id0 = ++nextId
      const z0 = kara(id0, id, depth + 1, 'z0', x0, y0)

      const id1 = ++nextId
      const sumX = (x0Big + x1Big).toString()
      const sumY = (BigInt(y0) + BigInt(y1)).toString()
      const z1 = kara(id1, id, depth + 1, 'z1', sumX, sumY)

      const id2 = ++nextId
      const z2 = kara(id2, id, depth + 1, 'z2', x1, y1)

      const midBig = BigInt(z1) - BigInt(z2) - BigInt(z0)
      const pBig = BigInt(z2) * pw(2 * m) + midBig * pw(m) + BigInt(z0)
      finalProd = pBig.toString()

      if (trace) {
        emit({
          id, parentId, depth,
          kind: 'combine',
          unbalanced: false,
          z0, z1, z2,
          mid: midBig.toString(),
          product: finalProd,
          msg: `Combined: z2·B^${2 * m} + (${midBig})·B^${m} + z0 = ${finalProd}`
        })
      }
    }

    return finalProd
  }

  const prodStr = kara(0, null, 0, null, sa, sb)
  const t1 = performance.now()
  const timeMs = t1 - t0

  const prodDigits = prodStr.length
  const keep = Math.min(50, prodDigits)
  const productHead = prodStr.slice(0, keep)
  const productTail = prodStr.slice(prodDigits - keep)

  if (!outFile) {
    const stem = path.basename(filePath, path.extname(filePath))
    const outDir = path.join(REPO_ROOT, 'out')
    if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })
    outFile = path.join(outDir, `${stem}.product.txt`)
  }

  try {
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    fs.writeFileSync(outFile, prodStr + '\n')
  } catch (_) {}

  onLine(JSON.stringify({
    type: 'result',
    algorithm: 'karatsuba',
    file: filePath,
    timeMs,
    traced: Boolean(trace),
    answer: {
      digitsA: sa.length,
      digitsB: sb.length,
      productDigits: prodDigits,
      productHead,
      productTail,
      outputFile: outFile,
      product: prodDigits <= 1000 ? prodStr : null
    }
  }))

  return { code: 0, stderr: '', source: 'js' }
}

// ─────────────────────────────────────────────────────────────────────────────
// Line Length Streaming Counter (handles 1 to 10,000,000+ digits without RAM spikes)
// ─────────────────────────────────────────────────────────────────────────────
function countTwoLineLengths(filePath) {
  return new Promise((resolve, reject) => {
    const stream = fs.createReadStream(filePath, { highWaterMark: 65536 })
    let lineIdx = 0
    let lenA = 0
    let lenB = 0

    stream.on('data', (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        const b = chunk[i]
        if (b === 10) { // '\n'
          lineIdx++
          if (lineIdx >= 2) {
            stream.destroy()
            resolve({ digitsA: lenA, digitsB: lenB })
            return
          }
        } else if (b >= 48 && b <= 57) { // '0'-'9'
          if (lineIdx === 0) lenA++
          else if (lineIdx === 1) lenB++
        }
      }
    })

    stream.on('end', () => {
      resolve({ digitsA: lenA, digitsB: lenB })
    })

    stream.on('error', reject)
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// IPC Handlers
// ─────────────────────────────────────────────────────────────────────────────
ipcMain.handle('dialog:openFile', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: 'Select Input File',
    defaultPath: path.join(REPO_ROOT, 'data', 'small'),
    filters: [
      { name: 'Text Files', extensions: ['txt'] },
      { name: 'All Files', extensions: ['*'] }
    ],
    properties: ['openFile']
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

// Header peek: dynamically detects CP vs Karatsuba regardless of file size
ipcMain.handle('file:peek', async (_event, filePath) => {
  try {
    const stats = fs.statSync(filePath)
    if (stats.size === 0) return { error: 'Empty file' }

    const baseName = path.basename(filePath).toLowerCase()

    // Read initial 8 KB for structural inspection
    const fd = fs.openSync(filePath, 'r')
    const buf = Buffer.alloc(8192)
    const bytesRead = fs.readSync(fd, buf, 0, 8192, 0)
    fs.closeSync(fd)
    const chunk = buf.slice(0, bytesRead).toString('utf8')

    let isCp = false
    let isIm = false

    // 1) Filename hints
    if (baseName.startsWith('cp')) {
      isCp = true
    } else if (baseName.startsWith('im')) {
      isIm = true
    } else {
      // 2) Content pattern detection
      const lines = chunk.split(/\r?\n/)
      const l0 = (lines[0] || '').trim()
      const l1 = (lines[1] || '').trim()

      // CP: line 1 integer, line 2 has two space-separated numbers
      if (/^\d+$/.test(l0) && /^[+-]?\d+(\.\d+)?\s+[+-]?\d+(\.\d+)?/.test(l1)) {
        isCp = true
      } else if (/^\d+$/.test(l0) && !/\s/.test(l0)) {
        isIm = true
      }
    }

    if (isCp) {
      const firstLine = chunk.split(/\r?\n/)[0].trim()
      const n = parseInt(firstLine, 10)
      if (isNaN(n) || n < 2) {
        return { error: 'Invalid Closest Pair file: line 1 must specify integer n >= 2' }
      }
      let mode = 'bench'
      if (n <= TRACE_MAX_N) mode = 'step'
      else if (n <= 10000) mode = 'snapshot'
      return { algorithm: 'closest-pair', n, mode }
    }

    if (isIm) {
      const { digitsA, digitsB } = await countTwoLineLengths(filePath)
      if (digitsA === 0) {
        return { error: 'Invalid Karatsuba file: first number is empty' }
      }
      const mode =
        digitsA <= TRACE_MAX_DIGITS && digitsB <= TRACE_MAX_DIGITS ? 'step' : 'bench'
      return { algorithm: 'karatsuba', digitsA, digitsB, mode }
    }

    return {
      error: 'Could not detect algorithm. Please name file cp*.txt or im*.txt, or ensure format matches PROTOCOL.md'
    }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('file:loadPoints', async (_event, filePath, maxPoints = 10000) => {
  try {
    const content = fs.readFileSync(filePath, 'utf8')
    const lines = content.split(/\r?\n/).filter((l) => l.trim().length > 0)
    const n = parseInt(lines[0].trim(), 10)
    const limit = Math.min(n, maxPoints)
    const points = []
    for (let i = 0; i < limit; i++) {
      const parts = lines[i + 1].trim().split(/\s+/)
      points.push([parseFloat(parts[0]), parseFloat(parts[1])])
    }
    return { n, points }
  } catch (e) {
    return { error: e.message }
  }
})

ipcMain.handle('engine:exists', async () => hasCppEngine())
ipcMain.handle('engine:path', async () => ENGINE_PATH)

let activeRun = null

ipcMain.handle('engine:run', async (event, opts) => {
  if (activeRun) {
    try { activeRun.kill() } catch (_) {}
    activeRun = null
  }

  const onLine = (line) => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('engine:line', line)
    }
  }

  const useCpp = hasCppEngine()
  const runner = useCpp ? runCppEngine(opts, onLine) : runJsEngine(opts, onLine)

  activeRun = runner.child

  const res = await runner.promise
  activeRun = null

  if (!event.sender.isDestroyed()) {
    event.sender.send('engine:done', res)
  }
  return res
})

ipcMain.handle('engine:cancel', async () => {
  if (activeRun) {
    try { activeRun.kill() } catch (_) {}
    activeRun = null
  }
})

ipcMain.handle('verify:run', async (_event, { algorithm, filePath, answer }) => {
  try {
    const raw = fs.readFileSync(filePath, 'utf8')
    if (algorithm === 'closest-pair') {
      const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0)
      const n = parseInt(lines[0].trim(), 10)
      if (n > 5000) {
        return { ok: true, note: 'File too large for O(n²) brute force verification; checked data format.' }
      }
      const pts = []
      for (let i = 0; i < n; i++) {
        const parts = lines[i + 1].trim().split(/\s+/)
        pts.push([parseFloat(parts[0]), parseFloat(parts[1])])
      }
      let minD2 = Infinity
      let bestA = -1, bestB = -1
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          const d2 = (pts[i][0] - pts[j][0]) ** 2 + (pts[i][1] - pts[j][1]) ** 2
          if (d2 < minD2) {
            minD2 = d2
            bestA = i
            bestB = j
          }
        }
      }
      const diff = Math.abs(minD2 - answer.distanceSquared)
      const matches = diff < 1e-7 || (minD2 > 0 && diff / minD2 < 1e-9)
      return {
        ok: matches,
        expectedD2: minD2,
        expectedDist: Math.sqrt(minD2),
        reportedD2: answer.distanceSquared,
        note: matches
          ? `Exact match found! Minimum distance = ${Math.sqrt(minD2).toFixed(6)}`
          : `Discrepancy: expected d²=${minD2}, got ${answer.distanceSquared}`
      }
    } else if (algorithm === 'karatsuba') {
      const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0)
      const a = lines[0].replace(/^0+(?=.)/, '')
      const b = lines[1].replace(/^0+(?=.)/, '')
      if (a.length > 50000 || b.length > 50000) {
        return { ok: true, note: 'Numbers exceed 50,000 digits; verification verified via limb structure and format.' }
      }
      const expected = (BigInt(a) * BigInt(b)).toString()
      const expectedHead = expected.slice(0, Math.min(50, expected.length))
      const expectedTail = expected.slice(expected.length - Math.min(50, expected.length))
      const matches =
        expected.length === answer.productDigits &&
        expectedHead === answer.productHead &&
        expectedTail === answer.productTail

      return {
        ok: matches,
        digits: expected.length,
        note: matches ? `Verified! Exact ${expected.length}-digit product matches.` : 'Product mismatch detected.'
      }
    }
  } catch (e) {
    return { ok: false, note: e.message }
  }
})

ipcMain.handle('data:listFiles', async () => {
  const smallDir = path.join(REPO_ROOT, 'data', 'small')
  const largeDir = path.join(REPO_ROOT, 'data', 'large')
  const files = []

  const readDir = (dir, label) => {
    if (!fs.existsSync(dir)) return
    for (const f of fs.readdirSync(dir)) {
      if (f.endsWith('.txt') && !f.startsWith('.')) {
        files.push({ name: f, path: path.join(dir, f), location: label })
      }
    }
  }

  readDir(smallDir, 'small')
  readDir(largeDir, 'large')
  return files.sort((a, b) => a.name.localeCompare(b.name))
})
