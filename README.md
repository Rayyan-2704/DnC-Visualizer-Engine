# Divide & Conquer Visualizer Engine

Desktop visualization workbench and high-performance engine for two classic divide-and-conquer algorithms:
1. **Closest Pair of 2D Points** ($O(n \log n)$ Kleinberg Section 5.4 algorithm)
2. **Karatsuba Integer Multiplication** (sub-quadratic divide-and-conquer for big integers)

Built for the **Design and Analysis of Algorithms (DAA)** course at FAST NUCES.

---

## Deliverables & Architecture

- **Backend Engine (C++)**: `src/engine/` command-line executable (`engine.exe`) that runs closest pair and Karatsuba on inputs ranging from small test cases up to millions of points and digits, reporting wall-clock time with `std::chrono`.
- **JSON Protocol (v1)**: `docs/PROTOCOL.md` defines the JSON Lines contract over stdout/stdin between the engine and the UI.
- **Frontend User Interface (Deliverable 4 - 30 Points)**: `src/app/` cross-platform desktop GUI built with **Electron + React + Vite + SVG Canvas**.

---

## Deliverable 4 Features (Desktop GUI)

### 1. Flexible Input File Selection
- System file dialog (**Browse…**) to pick any `.txt` input file from the filesystem.
- Pre-populated quick-picker of all 20 benchmark input files grouped by problem (`cp01`–`cp10` and `im01`–`im10`).
- Header peeking: dynamically reads only the first bytes of a file to detect algorithm and operand size without loading gigabytes into memory.

### 2. Three Adaptive Display Modes
- **Step-by-step Mode** (Small inputs: $n \le 200$ points, $\le 200$ digits):
  - Emits and collects complete trace events (`--trace`).
  - Full VCR step player: Play, Pause, Step Forward, Step Backward, Jump to Start, Jump to End.
  - Interactive scrubbing timeline and speed controls ($0.25\times$, $0.5\times$, $1\times$, $2\times$, $4\times$, $8\times$).
  - Live human-readable step explanations and recursion depth indicators.
  - Scrollable event log with click-to-jump.
- **Snapshot Mode** (Mid-size inputs: $200 < n \le 10,000$ points):
  - Renders the full 2D point cloud with pan, zoom, and reset controls.
  - Connects and highlights the optimal closest pair in gold with index labels and distance overlay.
- **Benchmark Mode** (Large inputs in the millions: up to $1,000,000+$):
  - High-speed execution without trace overhead.
  - High-precision wall-clock running time display (milliseconds / seconds).
  - Clean summary of closest pair coordinates and distance / BigInt head, tail, and digit count.
  - Safe memory handling: never dumps million-digit numbers into the DOM (prevents freezing).

### 3. Interactive Visualizers
- **Closest Pair 2-D Canvas**:
  - Coordinate normalization and auto-scaling.
  - Animated dividing lines (dashed lines at split point $x = \text{mid}$).
  - Shaded $\delta$-strip band showing points within distance $\delta$ of the partition boundary.
  - Candidate comparison lines (pulsing cyan) for points being tested in the strip.
  - Current best pair highlighted in gold with real-time distance updates.
  - Interactive pan, zoom, and point hover tooltips showing $(x, y)$ coordinates.
- **Karatsuba Recursion Tree**:
  - Interactive hierarchical tree diagram of recursive calls.
  - Distinguishes balanced splits ($z_0, z_1, z_2$), unbalanced splits ($piece_0, piece_1$), and base cases.
  - Formula bar explaining the current algebraic breakdown:
    - Split: $X = X_1 \cdot 10^m + X_0$, $Y = Y_1 \cdot 10^m + Y_0$
    - Combine: $P = z_2 \cdot 10^{2m} + (z_1 - z_2 - z_0) \cdot 10^m + z_0$
    - Base case: schoolbook multiplication below cutoff.
  - Node inspector: click any node in the tree to view its operands and intermediate product.

### 4. Verification System
- Built-in **Verify Answer** button in the results panel:
  - Validates closest pair results using an independent $O(n^2)$ brute-force check.
  - Validates Karatsuba products against independent arbitrary-precision arithmetic.
  - Displays instant verification status (matched / discrepancy).

---

## How to Run the Frontend GUI

### Prerequisites
- Node.js (v24.x recommended, v18+ supported)
- npm (v11.x)
- C++ compiler (`g++` / MinGW) for compiling `engine.exe` (optional: built-in protocol engine is included as automatic fallback)

### Quick Start
To launch the desktop interface:
```bash
# From the repository root
scripts\run-app.bat
```

Or manually:
```bash
cd src/app
npm install
npm run dev
```

To build a standalone production bundle:
```bash
cd src/app
npm run build
npm run preview
```

### Compiling the C++ Engine
```bash
cd src/engine
build.bat
```
This produces `bin\engine.exe` which the GUI automatically detects and connects to.

