# DAA Project Context: Closest Pair + Karatsuba with Desktop GUI

## 1. About the user and how to help

- User: Rayyan Aamir, CS student at FAST NUCES. Group project for the course **Design and Analysis of Algorithms (DAA)**.
- Most comfortable in **C++**.
- Prefers **plain-language, analogy-driven explanations** (the "restaurant" analogy has been used: C++ engine = kitchen, React = dining room, Electron = the building, JSON messages = waiters).
- The group is on **Windows 11**; group size 3.

---

## 2. Project summary

Build two divide-and-conquer algorithms, generate 20 reproducible input files, run both algorithms on all files, and present everything in a desktop GUI.

1. **Closest pair of points (2-D)**: O(n log n) divide and conquer (Kleinberg, Section 5.4). Output the closest pair and the distance.
2. **Integer multiplication**: Karatsuba, switching to schoolbook multiplication when numbers become small. Output the product.

### Marks breakdown
| Part | Points | What |
|---|---|---|
| 2 | 10 | Implement both algorithms; generate 10 input files for each problem |
| 3 | 5 | Apply the algorithms on all the input datasets |
| 4 | 30 | Desktop GUI: select any input file; small inputs shown step by step; large inputs show final result and running time |

---

## 3. Original assignment requirements (verbatim summary)

### General requirements (apply to all parts)
- **Language:** any. C++, Java, C# or Rust recommended for inputs in the millions. Python allowed but watch the recursion limit and list copying.
- **Input size:** every program must run correctly for n = 10 and must complete for n = 1,000,000. Input size is chosen by the user at run time and must **not be hard-coded**.
- **Library routines:** do **not** call built-in sorting, big-integer multiplication, or closest-pair routines inside the algorithms. They may be used **only to check correctness**.
- **Random data:** all random inputs must come from a generator with a **fixed, recorded seed** so the same data can be regenerated.
- **Large values:** use **64-bit integers** wherever a count can exceed about 2 x 10^9 (e.g., number of inversions).

### Part 2: generate 10 sample inputs per problem (20 files total)
Smallest size > 100, largest in the millions (at least 1,000,000). Save as text files.

**Closest pair input files**

| File | Number of points | Content |
|---|---|---|
| cp01-cp04 | 10^3, 10^4, 10^5, 10^6 | Uniform random real coordinates in [0, 10^6] |
| cp05 | 1,000,000 | Clustered: points around 10 random centers |
| cp06 | 1,000,000 | Integer coordinates in a small range, many duplicate points (closest distance 0) |
| cp07 | 100,000 | All points on one vertical line |
| cp08 | 100,000 | Equally spaced grid (many tied closest pairs) |
| cp09 | 1,000,000 | Closest pair placed across the middle dividing line |
| cp10 | 101 | Small file for showing the algorithm step by step |

**Integer multiplication input files** (each file holds two non-negative integers)

| File | Digits per number | Content |
|---|---|---|
| im01-im04 | 10^3, 10^4, 10^5, 10^6 | Random digits, no leading zero |
| im05 | 1,000,000 and 10 | Numbers of very different lengths |
| im06 | 100,000 | One number is all 9s |
| im07 | 99,999 | Odd length, with many zeros |
| im08 | 1,000,000 | Both numbers are powers of 10 |
| im09 | 1 and 1,000,000 | One number is 0 |
| im10 | 101 | Small file for showing the algorithm step by step |

**File formats (plain text)**
- Closest pair: first line is `n`, then one `x y` pair per line.
- Integer multiplication: two lines, each holding one number in decimal digits.

### What to submit
- The **generator program**, the **seed used for each file**, and **only the files smaller than 1 MB**.
- The large files will be **regenerated from the generator during marking**.
- Python groups may limit integer multiplication to 100,000 digits if they cannot finish the 1,000,000-digit files, but must state this in the report (not relevant if using C++).

### Part 3 (5 points)
Apply these algorithms on the input datasets.

### Part 4 (30 points)
A "very nice user interface" where the user can select any input file (assumed valid), then shows the working of both algorithms:
- **Small inputs:** show the algorithm **step by step**.
- **Large inputs (in the millions):** show the **final result and the running time**.

---

## 4. Tech stack [DECIDED]

| Layer | Choice | Role |
|---|---|---|
| Algorithms engine | **C++** (command-line program, `engine.exe`) | Closest pair + Karatsuba, timing, trace output |
| Desktop shell | **Electron** | Window, file dialogs, launching the engine via Node `child_process.spawn` |
| UI | **React** (SVG / `<canvas>` for visuals) | File picker, mode display, step player, results panel |
| Scaffolding | **electron-vite** with React template [PROPOSED] | Pre-wired Electron + React project |
| Version control | **Git + GitHub** | Shared repo |
| Editor | **VS Code** | |
| Generator + checker | **C++** | Seeded file generation and correctness verification |

### Alternatives considered and rejected
- **Qt (C++ end to end):** viable fallback if nobody in the group knows React. Harder to build nice visuals.
- Native Node addon: painful build setup, no benefit.
- WebAssembly: poor fit for 10^6 points/digits (memory, speed).
- Tauri: backend is Rust, loses C++ comfort.
- C# WPF / Java Swing / Python Tkinter: leave C++ or too slow.

### Tool versions (verified on Rayyan's machine) [DECIDED]
- OS: Windows 11 (Version 10.0.26300)
- Node.js: **v24.14.0**
- npm: **11.9.0**
- g++: **14.2.0** (MinGW-W64 x86_64-ucrt-posix-seh, by Brecht Sanders, r2)
- Action for the group: everyone should run `node -v`, `npm -v`, `g++ --version` and match the **Node major version (v24)** to avoid "works on my machine" issues.

---

## 5. Architecture and application flow

The C++ engine and the React UI **never share code**, only JSON messages over stdout.

### Setup done once (offline)
1. The generator runs with fixed seeds and creates the 20 input files.
2. The C++ engine is compiled into `engine.exe`.

### Runtime flow
1. **Launch:** Electron starts, opens a window, React draws the home screen.
2. **Pick a file:** React asks the Electron main process to open the file dialog (React cannot touch the disk directly).
3. **Peek at the file:** the main process reads just the header (closest pair: first line `n`; multiplication: length of the two numbers). It detects which algorithm the file belongs to and decides the display mode by size.
4. **Press Run:** React sends the request to the main process.
5. **Engine launched** as a background child process with the file path (and `--trace` in step-by-step mode only), so the window never freezes.
6. **Engine works:**
   - Step mode: prints a stream of step events, then a result.
   - Large mode: prints only one final result message.
7. **Engine exits**; the main process tells React it is done.
8. **React displays:**
   - Step mode: a player (Play, Pause, Next, Back, speed slider) over the **fully collected** event list (collecting first is what makes Back/Pause possible). Visuals: points, dividing line, strip, highlighted pairs; digit splits and Karatsuba recursion tree.
   - Large mode: results panel with answer and running time.
9. **Optional Verify button:** runs the checker (brute force or library routines) and shows whether the answer matches.

### Display modes [PROPOSED, partly OPEN]
The requirements say only "small = step by step, millions = result + time"; the cutoff is **our own design decision**.
- **Stage 1:** strict two modes, step-by-step only for tiny files (cp10, im10), cutoff around **n <= 200** (guess, adjustable).
- **Stage 2:** add a **snapshot mode** for mid-size files (up to roughly 10,000 points): draw the final picture (all points with the closest pair highlighted, or the product) plus the time, with no stepping. Above that, text-only results.
- **[OPEN]** Exact cutoff numbers; check the marking rubric or instructor if "small" has a specific meaning.

---

## 6. Engine design notes

### Command-line interface [PROPOSED]
```
engine closest-pair cp10.txt --trace
engine karatsuba im10.txt
```
- Input size is read from the file or run-time arguments, never hard-coded.
- The engine refuses `--trace` above the small-mode cutoff and returns an `error`.

### Closest pair
- Use **own merge sort** (no library sort in the algorithm). Sort by x once up front; **merge by y on the way up** instead of re-sorting at each level (this is what keeps it O(n log n)).
- Avoid copying vectors at each recursion level. Recursion depth is only about log n, so recursion is safe.
- Watch the **deliberate trap files:** duplicates (distance 0, cp06), all points on one vertical line (all x equal, degenerate split, cp07), grid with many ties (cp08), closest pair straddling the dividing line (cp09), clustered data (cp05).
- Use exact comparisons where possible (squared distances) so ties are handled consistently.

### Karatsuba
- Own big-number representation: digit array (`vector`) in **base 10^9** (or 10^4 for simpler carries), with 64-bit intermediates.
- Switch to **schoolbook** below a tuned cutoff.
- Handle **unbalanced lengths** explicitly (im05: 10 digits x 1,000,000 digits; im09: 1 digit / zero case). Do not pad the short number up to the long one's length.
- Handle zero and powers of 10 (im08, im09), all-9s (im06), odd length with many zeros (im07).
- Do not send giant products to the UI: show digit count, first and last ~50 digits, and write the full product to an output file.

### Timing
- Measure with `std::chrono` **inside C++ around the algorithm only** (not file reading), report in milliseconds with decimals.

### Generator
- Use `std::mt19937_64` with **our own simple mapping from raw bits to a range**. Do NOT use `std::uniform_int_distribution` / `uniform_real_distribution`, since results differ across compilers; the marker regenerates files, so "same seed, same file" must hold everywhere.
- Record the **seed for each of the 20 files** in a `seeds.txt` (submission requirement).
- Input size chosen at run time (command-line argument).

### Checker
- Separate program that verifies engine output using brute force or library routines (allowed **only** for checking). Compare across all 20 files (brute force O(n^2) is only feasible on smaller closest-pair files; use an independent method for the big ones).

---

## 7. JSON protocol between engine and UI [PROPOSED, to be written up as a spec]

**Rules**
- The engine prints **one JSON object per line** to stdout, each with a `type` field.
- Human-readable debug text goes to **stderr** only.
- First line: `{"type":"hello","protocol":1}` so the UI can detect a version mismatch.
- Types: `hello`, `step`, `result`, `error`. The `result` is always the last line.
- **Big numbers travel as strings**, never JSON numbers.
- For closest pair, also send **squared distance** as exact value where possible so ties compare exactly.
- On `error`: message string, then exit with non-zero code.

**`result` example**
```json
{"type":"result","algorithm":"closest-pair","n":1000000,
 "timeMs":842.7,
 "answer":{"p1":[10.5,20.1],"p2":[10.6,20.1],"distance":0.1}}
```
For Karatsuba, `answer` holds: `digitsA`, `digitsB`, `productDigits`, `productHead`, `productTail` (first and last ~50 digits), `outputFile`; small cases also include the full `product`.

**`step` events** (only with `--trace`): every step has `id`, `parentId`, `depth` (so React can rebuild the recursion tree), a `kind`, and kind-specific data.
- Closest pair kinds: `divide` (range + dividing line x), `base` (brute force on tiny group), `strip` (points within d of the line), `compare` (two strip points checked), `update` (new best pair), `merge` (result passed up).
- Karatsuba kinds: `split` (number sizes and split position m), `base` (schoolbook at cutoff), `combine` (three sub-products and assembly), `done` (product of this call).

**[OPEN]** Whether to change any event kinds before locking the protocol. Next step: write a full `protocol.md` spec with every field and example messages.

---

## 8. Proposed folder structure [PROPOSED]

```
daa-project/
├── README.md
├── context.md                 # this file
├── docs/
│   ├── protocol.md            # JSON message spec (contract between engine and UI)
│   └── report/                # final report (results table, timings, seeds, notes)
├── generator/
│   ├── gen.cpp                # seeded generator for all 20 files
│   ├── rng.h                  # mt19937_64 + own bits-to-range mapping
│   └── seeds.txt              # recorded seed per file (submission requirement)
├── engine/
│   ├── src/
│   │   ├── main.cpp           # CLI parsing, mode handling, JSON output
│   │   ├── closest_pair.cpp/.h
│   │   ├── karatsuba.cpp/.h
│   │   ├── bignum.h           # digit-array big number (base 10^9)
│   │   ├── mergesort.h        # own sort (no std::sort in algorithms)
│   │   └── json_out.h         # trace/result emitters
│   ├── bin/                   # compiled engine.exe (gitignored)
│   └── build.bat              # g++ build command
├── checker/
│   └── check.cpp              # brute force / library verification
├── data/
│   ├── small/                 # files under 1 MB, committed to Git (submitted)
│   └── large/                 # big files, gitignored, regenerated by generator
├── results/
│   └── results.csv            # part 3 output: file, algorithm, answer, time
└── app/                       # electron-vite + React project
    ├── package.json
    └── src/
        ├── main/              # Electron main process: file dialog, spawn engine
        ├── preload/           # safe bridge between main and renderer
        └── renderer/          # React UI
            ├── components/    # FilePicker, ModeBadge, StepPlayer, ResultsPanel
            ├── visualizers/   # ClosestPairCanvas, KaratsubaTree
            └── App.jsx
```
Notes: compiled `.exe` stays out of Git (each member compiles locally). Only files under 1 MB are submitted; the large files are regenerated at marking.

---

## 9. Suggested work split (adjust to actual group size) [PROPOSED]

- **Person A:** generator, seeds, checker, batch runner for part 3 (results table and timings).
- **Person B:** C++ closest pair and Karatsuba engines, including trace output.
- **Person C (and D):** Electron + React app: file picker, mode switch, step player, visualizations, results panel.
- **Shared first task:** agree on the JSON protocol, since it is the contract between B and C.
- **[OPEN]** Group size and who knows React (if nobody does and time is tight, consider the Qt fallback).

---

## 10. Development phases [PROPOSED]

1. **Phase 0: Setup.** Everyone verifies tool versions (Node v24, npm, g++). Create GitHub repo, folder skeleton, `.gitignore`. Scaffold the Electron + React app with electron-vite.
2. **Phase 1: Contract.** Write `protocol.md` (JSON message formats). Lock event kinds.
3. **Phase 2: Generator + checker.** Produce all 20 files reproducibly; record seeds; verify the same seed regenerates identical files.
4. **Phase 3: Core engines (no trace).** Closest pair and Karatsuba correct on all 20 files, with timing. Validate against the checker.
5. **Phase 4: Trace output.** Add `--trace` event emission to both engines (small inputs only).
6. **Phase 5: App shell.** File picker, header peek, mode detection, spawning the engine, results panel for large mode.
7. **Phase 6: Step player + visualizations.** Play/Pause/Next/Back/speed, closest pair canvas, Karatsuba recursion tree. (Riskiest and most time-consuming piece, so start engines early.)
8. **Phase 7: Snapshot mode** for mid-size files (final picture + time).
9. **Phase 8: Batch run (part 3).** Run both algorithms on all 20 files, produce the results table and timings.
10. **Phase 9: Verification, polish, report, packaging.** Verify button, UI polish, final report (including seeds), optional `electron-builder` packaging. Prepare the submission: generator, seeds, files under 1 MB.

---

## 11. Risks and gotchas

- Closest pair on 10^6 points: avoid re-sorting by y at each level; avoid per-call copying.
- The edge-case files (duplicates, vertical line, grid, cross-middle pair) are deliberate traps.
- Karatsuba at 10^6 digits is heavy; unbalanced operand handling matters.
- Never render huge outputs in the UI.
- Compiler-dependent random distributions break reproducibility; use own bit-to-range mapping.
- Node version mismatches across teammates; compiled binary differs per OS (the group is all Windows 11, which helps).
- Antivirus/firewall may occasionally warn when Electron spawns a child process (harmless).
- Use 64-bit integers wherever counts can exceed about 2 x 10^9.

---

## 12. Current status (as of this file's creation)

Done in conversation:
- Read and analyzed the requirements.
- Chose the stack: Electron + React + C++ engine.
- Confirmed environment: Windows 11, VS Code, GitHub, MinGW g++ 14.2.0, Node v24.14.0, npm 11.9.0 all installed and verified.
- Walked through the full runtime flow.
- Discussed display modes and leaned toward "strict two modes first, then add a snapshot mode".
- Drafted the JSON protocol outline.
- Drafted the folder structure, work split, and phases above.

Next steps:
1. Confirm group size and roles.
2. Confirm the mode cutoff (and ask the instructor if "small" is defined).
3. Write `protocol.md` in full, with every field and example messages.
4. Set up the repo and scaffold the app, then start on the generator and engines.
