# Engine <-> UI Protocol (v1)

This file is the **contract** between the C++ engine (`engine.exe`) and the Electron/React app.
The engine never knows about the UI, and the UI never knows about the algorithms. They only agree on this file.

Analogy: the engine is the kitchen, the UI is the dining room, and these messages are the waiters. If both sides follow this menu, either side can be rebuilt without the other noticing.

---

## 1. Running the engine

```
engine closest-pair <input-file> [--trace] [--out <file>]
engine karatsuba    <input-file> [--trace] [--out <file>]
```

| Argument | Meaning |
|---|---|
| `closest-pair` / `karatsuba` | Which algorithm to run. |
| `<input-file>` | Path to an input file (formats in section 7). |
| `--trace` | Emit `step` events. Only allowed for small inputs (section 6). |
| `--out <file>` | Karatsuba only: where to write the full product. Default: `out/<input-stem>.product.txt` (the `out/` folder is created if missing). |
| `--cutoff <limbs>` | Karatsuba only: below this many limbs (9 digits each) in the shorter number, use grade-school multiplication. Default 128 (4 in `--trace` mode). Values below 4 are raised to 4. Useful for tuning experiments. |

**Streams**
- **stdout:** protocol messages only, one JSON object per line (JSON Lines). Nothing else, ever.
- **stderr:** free-form human debug text. The UI ignores it (and may show it in a "log" panel).

**Exit codes:** `0` = finished, last stdout line is a `result`. `1` = failed, last stdout line is an `error`.

**Encoding:** UTF-8, lines end with `\n`. Flush stdout after every line so the UI sees events live.

---

## 2. General rules

1. **One JSON object per line.** No pretty-printing, no blank lines.
2. Every object has a string field `type`: `hello`, `step`, `result`, or `error`.
3. The **first** line is always `hello`. The **last** line is always `result` or `error`.
4. **Big numbers travel as strings.** Anything that can exceed 2^53 (about 9e15) is a JSON string, not a number. This covers all Karatsuba values (operands, products, limbs). Counts such as `n` fit comfortably in a double, so they stay JSON numbers.
5. **Real numbers (coordinates, distances)** are JSON numbers printed with enough precision to round-trip a `double` (use `%.17g`).
6. Unknown fields must be **ignored** by the UI (so we can add fields without breaking anything). Unknown `type` values are ignored too.
7. Indices are **0-based**.

---

## 3. Message types

### 3.1 `hello`

```json
{"type":"hello","protocol":1,"engine":"daa-engine","version":"0.1.0"}
```
The UI checks `protocol === 1`. If it differs, the UI shows "engine/UI version mismatch" and stops.

### 3.2 `error`

```json
{"type":"error","code":"BAD_FORMAT","message":"Line 3: expected two numbers, found 'abc'"}
```

| code | When |
|---|---|
| `BAD_ARGS` | Unknown algorithm, missing file argument, unknown flag. |
| `FILE_NOT_FOUND` | Cannot open the input file. |
| `BAD_FORMAT` | File does not match the format in section 7. |
| `TRACE_TOO_LARGE` | `--trace` requested above the small-mode cutoff (section 6). |
| `INTERNAL` | Anything else (bug, out of memory). |

After an `error` the engine exits with code `1`.

### 3.3 `result` (always the last line on success)

Common fields:

| Field | Type | Meaning |
|---|---|---|
| `algorithm` | string | `"closest-pair"` or `"karatsuba"` |
| `file` | string | Input file path as given on the command line |
| `traced` | bool | `true` if the run used `--trace`. Then `timeMs` also includes the cost of printing events, so it is not a benchmark figure. |
| `timeMs` | number | Wall-clock milliseconds for the **algorithm only** (not file reading, not printing), measured with `std::chrono::steady_clock`, decimals allowed |
| `answer` | object | Algorithm-specific (below) |

#### Closest pair

```json
{"type":"result","algorithm":"closest-pair","file":"data/large/cp04.txt","n":1000000,
 "timeMs":842.7,"traced":false,
 "answer":{
   "p1":[10.5,20.1],"p2":[10.6,20.1],
   "p1Index":48213,"p2Index":771902,
   "distance":0.1,"distanceSquared":0.010000000000000002}}
```

| Field | Meaning |
|---|---|
| `n` | Number of points read |
| `p1`, `p2` | Coordinates `[x, y]` of the two points |
| `p1Index`, `p2Index` | 0-based positions of those points in the input file (`p1Index < p2Index`) |
| `distance` | Euclidean distance |
| `distanceSquared` | Squared distance (use this for exact tie comparison) |

**Ties.** When several pairs share the minimum distance (grid file cp08, duplicates in cp06), the engine reports one of them. Which one is not part of the contract, so the checker compares **distances only**, never the pair itself. For duplicate points, `distance` is `0`.

#### Karatsuba

```json
{"type":"result","algorithm":"karatsuba","file":"data/large/im04.txt",
 "timeMs":5120.4,"traced":false,
 "answer":{
   "digitsA":1000000,"digitsB":1000000,
   "productDigits":2000000,
   "productHead":"5827103948...","productTail":"...0384756201",
   "outputFile":"out/im04.product.txt",
   "product":null}}
```

| Field | Meaning |
|---|---|
| `digitsA`, `digitsB` | Decimal digit counts of the two inputs (`"0"` counts as 1 digit) |
| `productDigits` | Decimal digit count of the product (`"0"` counts as 1) |
| `productHead` | First `min(50, productDigits)` digits, as a string |
| `productTail` | Last `min(50, productDigits)` digits, as a string |
| `outputFile` | Path of the file holding the **full** product (always written) |
| `product` | The full product as a string **if `productDigits <= 1000`**, otherwise `null` |

The UI never receives million-digit strings over the pipe.

### 3.4 `step` (only with `--trace`)

Every `step` has these common fields:

| Field | Type | Meaning |
|---|---|---|
| `type` | string | `"step"` |
| `seq` | number | Global event counter: 0, 1, 2, ... in emission order. The UI plays events in `seq` order. |
| `id` | number | Id of the **recursive call** this event belongs to. The root call is `0`. Several events can share one `id` (one call produces several events). |
| `parentId` | number or null | Id of the calling recursion level (`null` for the root). Lets the UI rebuild the recursion tree. |
| `depth` | number | Recursion depth (root = 0) |
| `kind` | string | What happened (below) |
| `msg` | string | One human-readable sentence describing the event, used as the caption in the player |

Kind-specific fields are added alongside these.

---

## 4. Closest pair trace events

**Point identity.** A point is identified by its **pid** = its 0-based index in the input file. The first step (`init`) sends all coordinates once, so later events refer to points by pid only.

**Positions.** After the up-front sort by x, points sit in an array `sortedByX` (list of pids). Ranges `[lo, hi)` (hi exclusive) refer to **positions in that array**, not pids.

| kind | When | Extra fields |
|---|---|---|
| `init` | Once, first step (`seq` 0, `id` 0) | `points`: `[[x,y], ...]` indexed by pid; `sortedByX`: `[pid, ...]` |
| `divide` | A range with more than the base-case size is split | `lo`, `hi`, `mid` (left = `[lo,mid)`, right = `[mid,hi)`), `lineX` (x of the dividing line) |
| `base` | Range is tiny (size <= 3), solved by brute force | `lo`, `hi`, `best`: `{a, b, d2}` (pids and squared distance of the best pair in this range) |
| `strip` | After both halves are solved: build the strip of points within `delta` of the line | `lineX`, `delta`, `stripPids`: pids in the strip **in y order**, `bestLeft`, `bestRight` (each `{a,b,d2}`) |
| `compare` | Two strip points are compared | `a`, `b` (pids), `d2`, `improved` (bool: true if this beats the current best) |
| `update` | A new best pair is adopted | `best`: `{a, b, d2}` |
| `merge` | This call finishes and returns upward | `lo`, `hi`, `best`: `{a, b, d2}` |

The base case is fixed: a range of 2 or 3 points is solved by brute force (`base`); a range of 4 or more points is divided. `delta` is the square root of the best squared distance found so far. `compare` events appear only for pairs the real inner loop looks at (strip points that are closer than `delta` in y), in the same order the loop visits them; an `improved` compare is always followed immediately by its `update`.

Event order inside one `divide` call: `divide`, (left child's events), (right child's events), `strip`, zero or more `compare`/`update`, `merge`. A base-case call emits `base` then nothing else (it is its own `merge`). The root's `merge` holds the final answer.

Example:
```json
{"type":"step","seq":5,"id":2,"parentId":1,"depth":2,"kind":"divide","lo":0,"hi":25,"mid":12,"lineX":183422.5,"msg":"Split positions 0-24 at x = 183422.5"}
{"type":"step","seq":61,"id":2,"parentId":1,"depth":2,"kind":"compare","a":17,"b":42,"d2":1523.25,"improved":false,"msg":"Compared points 17 and 42: d^2 = 1523.25, no improvement"}
```

---

## 5. Karatsuba trace events

**Numbers in steps are decimal strings.** Internally the engine always uses limbs of base `limbBase` = 10^9 (9 digits per limb), so splits happen on 9-digit boundaries. `init` reports `limbBase` and `cutoffLimbs`. In `--trace` mode the cutoff is 4 limbs (36 digits), so even the 101-digit file recurses a couple of levels.

**x is always the longer operand.** In every `split` and `base`, `x` has at least as many limbs as `y` (the engine swaps the two if needed), so `x` and `y` of a child call can appear in the opposite order to the parent's `x0`/`y0`. Compare them as a pair, not by position.

**Notation.** For a call multiplying `x` and `y`, with split point `m` limbs:
`x = x1*B^m + x0`, `y = y1*B^m + y0`, where `B = limbBase`.
`z0 = x0*y0`, `z2 = x1*y1`, `z1 = (x0+x1)*(y0+y1)`, and
`x*y = z2*B^(2m) + (z1 - z2 - z0)*B^m + z0`.

Each of `z0`, `z1`, `z2` is computed by a child call. The child's first event carries `role` (`"z0"`, `"z1"`, or `"z2"`; the root has `role: null`).

| kind | When | Extra fields |
|---|---|---|
| `init` | Once, first step (`seq` 0, `id` 0) | `a`, `b` (decimal strings), `limbBase`, `cutoffLimbs` (below this size schoolbook is used) |
| `split` | A call is big enough to recurse (the shorter number has at least `cutoffLimbs` limbs) | `role`, `x`, `y` (decimal strings), `m` (split point in limbs, always `ceil(limbs(x)/2)`), `mDigits` (`9*m`), `x1`, `x0`, `y1`, `y0` (decimal strings), `unbalanced` (bool, see below) |
| `base` | A call is small (the shorter number has fewer than `cutoffLimbs` limbs), or one operand is zero; solved by schoolbook | `role`, `x`, `y`, `product` (decimal strings). A zero operand shows as `"0"` with product `"0"` |
| `combine` | All children are done; the call assembles its answer | balanced: `unbalanced:false`, `z0`, `z1`, `z2`, `mid` (= z1 - z2 - z0), `product`. Unbalanced: `unbalanced:true`, `pieces` (array of 2 decimal strings), `product` |

Event order inside one recursing call: `split`, (child z0 events), (child z1 events), (child z2 events), `combine`. A base call emits only `base`.

The root's `combine` or `base` holds the final product.

**Unbalanced calls (no padding).** If the shorter number fits inside the low half (`limbs(y) <= m`), Karatsuba's trick saves nothing, so the engine does NOT pad `y` up to `x`'s length. Instead the `split` event has `unbalanced:true`, `y1` = `"0"`, `y0` = `y`, and the call has exactly two children with roles `piece0` (= x0 * y) and `piece1` (= x1 * y), in that order. Its `combine` has `unbalanced:true` and `pieces` = the two products, with `product = piece0 + piece1 * 10^(9m)`. This case appears whenever one number is much shorter than the other (in the 101-digit trace file it can still appear deeper in the tree, because `x0 + x1` and `y0 + y1` may differ in length).

Child order inside a balanced call is `z0`, `z1`, `z2`, each as one complete sub-tree of events.

---

## 6. Display modes and the trace cutoff

The cutoff is **our own design decision** (the assignment only says "small = step by step, millions = result + time").

| Constant | Value | Meaning |
|---|---|---|
| `TRACE_MAX_N` | 200 | Closest pair: `--trace` allowed only if `n <= 200` |
| `TRACE_MAX_DIGITS` | 200 | Karatsuba: `--trace` allowed only if both numbers have `<= 200` digits |

Above the cutoff, `--trace` returns `error` with code `TRACE_TOO_LARGE`. The UI should check size first (by peeking at the file header) and simply not pass `--trace`.

| Mode | Condition | Engine call | UI |
|---|---|---|---|
| Step-by-step | within cutoff | with `--trace` | Player over the collected events |
| Benchmark | above cutoff | without `--trace` | Result panel with answer + `timeMs` |

A later **snapshot mode** (mid-size files drawn as a final picture) needs no protocol change: it uses a normal `result`, and the UI draws the points itself using `p1`/`p2`.

---

## 7. Input file formats

**Closest pair:** first line `n`, then `n` lines, each `x y` (two real numbers separated by whitespace).

```
5
10.5 20.1
33 4.25
...
```

**Karatsuba:** exactly two lines, each a non-negative integer in decimal digits (no sign, no spaces, no leading zeros except the single number `0`).

```
123456789012345678901234567890
987654321098765432109876543210
```

The UI's header peek:
- Closest pair: read the first line -> `n`.
- Karatsuba: read the first two lines' lengths (stream only the first bytes of each line; never load a million-digit file into the UI).

---

## 8. Full example: tiny closest pair run (`--trace`)

Input (`n = 3`, small enough to be a single base case):
```
3
0 0
10 10
11 10
```
Output (one object per line):
```json
{"type":"hello","protocol":1,"engine":"daa-engine","version":"0.1.0"}
{"type":"step","seq":0,"id":0,"parentId":null,"depth":0,"kind":"init","points":[[0,0],[10,10],[11,10]],"sortedByX":[0,1,2],"msg":"Loaded 3 points, sorted by x"}
{"type":"step","seq":1,"id":0,"parentId":null,"depth":0,"kind":"base","lo":0,"hi":3,"best":{"a":1,"b":2,"d2":1},"msg":"3 points: solved by brute force"}
{"type":"result","algorithm":"closest-pair","file":"cp_tiny.txt","n":3,"timeMs":0.004,"traced":true,"answer":{"p1":[10,10],"p2":[11,10],"p1Index":1,"p2Index":2,"distance":1,"distanceSquared":1}}
```

## 9. Full example: tiny Karatsuba run (`--trace`)

Input: `12` and `34`, with `limbBase = 10`, `cutoffLimbs = 1` (illustration only; real runs use 10^9 or 10^4).
```json
{"type":"hello","protocol":1,"engine":"daa-engine","version":"0.1.0"}
{"type":"step","seq":0,"id":0,"parentId":null,"depth":0,"kind":"init","a":"12","b":"34","limbBase":10,"cutoffLimbs":1,"msg":"Multiplying 12 x 34"}
{"type":"step","seq":1,"id":0,"parentId":null,"depth":0,"kind":"split","role":null,"x":"12","y":"34","m":1,"mDigits":1,"x1":"1","x0":"2","y1":"3","y0":"4","unbalanced":false,"msg":"Split at 1 digit: 12 = 1*10 + 2, 34 = 3*10 + 4"}
{"type":"step","seq":2,"id":1,"parentId":0,"depth":1,"kind":"base","role":"z0","x":"2","y":"4","product":"8","msg":"z0 = 2 x 4 = 8"}
{"type":"step","seq":3,"id":2,"parentId":0,"depth":1,"kind":"base","role":"z1","x":"3","y":"7","product":"21","msg":"z1 = (2+1) x (4+3) = 21"}
{"type":"step","seq":4,"id":3,"parentId":0,"depth":1,"kind":"base","role":"z2","x":"1","y":"3","product":"3","msg":"z2 = 1 x 3 = 3"}
{"type":"step","seq":5,"id":0,"parentId":null,"depth":0,"kind":"combine","unbalanced":false,"z0":"8","z1":"21","z2":"3","mid":"10","product":"408","msg":"3*100 + 10*10 + 8 = 408"}
{"type":"result","algorithm":"karatsuba","file":"tiny.txt","timeMs":0.002,"traced":true,"answer":{"digitsA":2,"digitsB":2,"productDigits":3,"productHead":"408","productTail":"408","outputFile":"out/tiny.product.txt","product":"408"}}
```

---

## 10. Changes from the earlier outline in `context.md`

(Phase 4 additions: `traced` in results; `unbalanced`, `pieces` and `piece0`/`piece1` for Karatsuba; `--cutoff`; the zero-operand `base`; `x` is always the longer operand.)

- Added an `init` step kind to both algorithms (the UI needs the full point list / operands once).
- Karatsuba: `done` was merged into `base` and `combine` (both carry `product`), so fewer events and no duplicate information.
- Added `role`, `seq`, and `msg` fields to make the player and recursion tree simpler to build.
- Added `p1Index`/`p2Index`, `distanceSquared`, and `outputFile` to results.

## 11. Decisions that were open (now closed in Phase 3-4)

- Closest pair base-case size is 3 points (2 or 3 points: brute force).
- Karatsuba limb base is 10^9 everywhere, including `--trace` (trace cutoff: 4 limbs).
- Unbalanced operands use the `piece0`/`piece1` shape described in section 5.

Still open: an optional `progress` message for long runs, so the UI could show a spinner with a percentage.