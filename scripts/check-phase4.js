// Phase 4 check. Run from the repo root:  node scripts\check-phase4.js
// Runs the engine with --trace on small inputs and REPLAYS every event, checking the rules of
// docs/protocol.md and the maths behind each step (not just that the final answer is right).
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const EXT = process.platform === "win32" ? ".exe" : "";
const ENGINE = path.join("bin", "engine" + EXT);
const GEN = path.join("bin", "gen" + EXT);
const CHECK = path.join("bin", "check" + EXT);
const TMP = path.join("out", "trace-tests");

class Bad extends Error {}
const need = (cond, msg) => { if (!cond) throw new Bad(msg); };
const near = (a, b) => Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(a), Math.abs(b));

function runEngine(args) {
  const r = spawnSync(ENGINE, args, { encoding: "utf8", maxBuffer: 1 << 28 });
  const lines = (r.stdout || "").split("\n").filter((l) => l.length);
  const msgs = lines.map((l) => JSON.parse(l)); // throws if a line is not valid JSON
  return { code: r.status, msgs, raw: r.stdout || "" };
}

function commonChecks(run) {
  const m = run.msgs;
  need(m.length >= 3, "too few messages");
  need(m[0].type === "hello" && m[0].protocol === 1, "first line is not hello");
  need(m[m.length - 1].type === "result", "last line is not a result (" + JSON.stringify(m[m.length - 1]).slice(0, 150) + ")");
  need(!run.raw.includes("\r"), "output contains a carriage return");
  const steps = m.filter((x) => x.type === "step");
  need(steps.length === m.length - 2, "stray non-step messages in the middle");
  steps.forEach((s, i) => {
    need(s.seq === i, "seq is not 0,1,2,... at event " + i);
    for (const k of ["id", "depth", "kind", "msg"]) need(s[k] !== undefined, "event " + i + " lacks " + k);
  });
  return { steps, result: m[m.length - 1] };
}

// group events by call id, in order
function byId(steps) {
  const g = new Map();
  for (const s of steps) { if (!g.has(s.id)) g.set(s.id, []); g.get(s.id).push(s); }
  return g;
}

// ============================ closest pair =============================================
function validateCp(file, run) {
  const { steps, result } = commonChecks(run);
  const txt = fs.readFileSync(file, "utf8").split("\n");
  const n = Number(txt[0]);
  const P = [];
  for (let i = 0; i < n; i++) P.push(txt[i + 1].trim().split(/\s+/).map(Number));
  const d2of = (a, b) => (P[a][0] - P[b][0]) ** 2 + (P[a][1] - P[b][1]) ** 2;

  const init = steps[0];
  need(init.kind === "init" && init.id === 0 && init.parentId === null && init.depth === 0, "bad init step");
  need(init.points.length === n && init.points.every((p, i) => p[0] === P[i][0] && p[1] === P[i][1]), "init points differ from the file");
  const S = init.sortedByX;
  need(S.length === n && new Set(S).size === n, "sortedByX is not a permutation");
  for (let i = 1; i < n; i++) {
    const p = P[S[i - 1]], q = P[S[i]];
    need(p[0] < q[0] || (p[0] === q[0] && (p[1] < q[1] || (p[1] === q[1] && S[i - 1] < S[i]))), "sortedByX is not sorted");
  }

  const calls = byId(steps.slice(1));
  const info = new Map(); // id -> {lo, hi, best, first, last, kind}
  const idsInOrder = [...calls.keys()];
  need(calls.has(0), "no root call");

  for (const id of idsInOrder) {
    const ev = calls.get(id);
    const kinds = ev.map((e) => e.kind).join(",");
    const first = ev[0];
    need(first.kind === "divide" || first.kind === "base", "call " + id + " starts with " + first.kind);
    if (id === 0) need(first.parentId === null && first.depth === 0, "root must have parentId null, depth 0");
    ev.forEach((e) => need(e.parentId === first.parentId && e.depth === first.depth, "call " + id + " changes parent/depth"));
    if (first.kind === "base") {
      need(kinds === "base", "base call " + id + " has extra events");
      need(first.hi - first.lo >= 2 && first.hi - first.lo <= 3, "base range must hold 2 or 3 points");
    } else {
      need(/^divide,strip(,compare(,update)?)*,merge$/.test(kinds), "call " + id + " has events in the wrong order: " + kinds);
      need(first.hi - first.lo > 3, "divide on a range of <= 3 points");
      need(first.mid === first.lo + Math.floor((first.hi - first.lo) / 2), "wrong mid");
      need(first.lineX === P[S[first.mid]][0], "lineX is not the x of the middle point");
    }
    info.set(id, { lo: first.lo, hi: first.hi, kind: first.kind, ev, first: ev[0].seq, last: ev[ev.length - 1].seq, parentId: first.parentId, depth: first.depth });
  }

  const finalBest = (id) => { const ev = info.get(id).ev; return ev[ev.length - 1].best; };
  for (const id of idsInOrder) {
    const c = info.get(id);
    const range = S.slice(c.lo, c.hi);
    // closest pair of this range by brute force
    let bf = Infinity;
    for (let i = 0; i < range.length; i++) for (let j = i + 1; j < range.length; j++) bf = Math.min(bf, d2of(range[i], range[j]));
    const best = finalBest(id);
    need(best.a < best.b && range.includes(best.a) && range.includes(best.b), "call " + id + ": best pair is not inside its range");
    need(near(best.d2, d2of(best.a, best.b)), "call " + id + ": best.d2 does not match its pair");
    need(near(best.d2, bf), "call " + id + ": best d2 " + best.d2 + " is not the true minimum " + bf + " for its range");
    if (id !== 0) {
      const par = info.get(c.parentId);
      need(par && par.kind === "divide" && c.depth === par.depth + 1, "call " + id + ": bad parent/depth");
    }
    if (c.kind === "base") continue;

    // children, nesting, ranges
    const [dv, strip] = [c.ev[0], c.ev[1]];
    const kids = idsInOrder.filter((k) => info.get(k).parentId === id).sort((p, q) => info.get(p).first - info.get(q).first);
    need(kids.length === 2, "call " + id + " should have exactly 2 children");
    const [L, R] = [info.get(kids[0]), info.get(kids[1])];
    need(L.lo === dv.lo && L.hi === dv.mid && R.lo === dv.mid && R.hi === dv.hi, "children ranges do not split the parent range");
    need(L.first > dv.seq && L.last < R.first && R.last < strip.seq, "children events are not nested between divide and strip");
    // strip
    const bl = finalBest(kids[0]), br = finalBest(kids[1]);
    need(near(strip.bestLeft.d2, bl.d2) && near(strip.bestRight.d2, br.d2), "strip's bestLeft/bestRight differ from the children's results");
    let cur = Math.min(bl.d2, br.d2);
    need(strip.lineX === dv.lineX, "strip.lineX differs from divide.lineX");
    need(near(strip.delta * strip.delta, cur), "strip.delta is not sqrt of the best d2");
    const expectStrip = range.filter((p) => (P[p][0] - dv.lineX) ** 2 < cur);
    const got = strip.stripPids;
    need(got.length === expectStrip.length && expectStrip.every((p) => got.includes(p)), "strip holds the wrong points");
    for (let i = 1; i < got.length; i++) need(P[got[i - 1]][1] <= P[got[i]][1], "strip is not in y order");
    // replay the comparison loop exactly
    const rec = c.ev.slice(2, -1);
    let k = 0;
    for (let i = 0; i < got.length; i++) {
      for (let j = i + 1; j < got.length; j++) {
        const dy = P[got[j]][1] - P[got[i]][1];
        if (dy * dy >= cur) break;
        const d2 = d2of(got[i], got[j]);
        const improved = d2 < cur;
        const e = rec[k++];
        need(e && e.kind === "compare" && e.a === got[i] && e.b === got[j] && near(e.d2, d2) && e.improved === improved, "compare #" + k + " in call " + id + " differs from the real loop");
        if (improved) {
          const u = rec[k++];
          need(u && u.kind === "update" && near(u.best.d2, d2) && u.best.a === Math.min(got[i], got[j]) && u.best.b === Math.max(got[i], got[j]), "missing/wrong update after an improvement");
          cur = d2;
        }
      }
    }
    need(k === rec.length, "call " + id + " has extra compare/update events");
    need(near(best.d2, cur), "merge best differs from the end of the strip loop");
  }

  // the answer
  const root = finalBest(0), a = result.answer;
  need(near(a.distanceSquared, root.d2), "result distance differs from the root's best");
  need(new Set([a.p1Index, a.p2Index]).size === 2 && [a.p1Index, a.p2Index].every((v) => v === root.a || v === root.b), "result pair differs from the root's best pair");
  return steps.length + " events, depth " + Math.max(...steps.map((s) => s.depth)) + ", closest d = " + Math.sqrt(root.d2).toPrecision(8);
}

// ============================ Karatsuba ================================================
function limbs(s) { return s === "0" ? 0 : Math.ceil(s.length / 9); }
const B = 1000000000n;
const pw = (m) => B ** BigInt(m);

function validateKara(file, run) {
  const { steps, result } = commonChecks(run);
  const lines = fs.readFileSync(file, "utf8").split("\n").map((l) => l.trim()).filter((l) => l);
  const strip0 = (s) => s.replace(/^0+(?=.)/, "");
  const A = strip0(lines[0]), Bs = strip0(lines[1]);
  const init = steps[0];
  need(init.kind === "init" && init.id === 0 && init.parentId === null && init.a === A && init.b === Bs, "bad init step");
  need(init.limbBase === 1000000000 && Number.isInteger(init.cutoffLimbs) && init.cutoffLimbs >= 4, "bad limbBase/cutoffLimbs");
  const cutoff = init.cutoffLimbs;

  const calls = byId(steps.slice(1));
  need(calls.has(0), "no root call");
  const info = new Map();
  const ids = [...calls.keys()];
  for (const id of ids) {
    const ev = calls.get(id);
    const f = ev[0];
    need(f.kind === "split" || f.kind === "base", "call " + id + " starts with " + f.kind);
    ev.forEach((e) => need(e.parentId === f.parentId && e.depth === f.depth, "call " + id + " changes parent/depth"));
    if (id === 0) need(f.parentId === null && f.depth === 0 && f.role === null, "bad root");
    else need(["z0", "z1", "z2", "piece0", "piece1"].includes(f.role), "bad role " + f.role);
    need(limbs(f.x) >= limbs(f.y), "x must be the longer operand");
    const prod = BigInt(f.x) * BigInt(f.y);
    if (f.kind === "base") {
      need(ev.length === 1, "base call has extra events");
      need(f.y === "0" || limbs(f.y) < cutoff, "base used although both numbers are above the cutoff");
      need(BigInt(f.product) === prod, "base product is wrong: " + f.x + " x " + f.y);
    } else {
      need(ev.length === 2 && ev[1].kind === "combine", "split call must be followed by exactly one combine");
      need(limbs(f.y) >= cutoff, "split below the cutoff");
      const m = Math.floor((limbs(f.x) + 1) / 2);
      need(f.m === m && f.mDigits === 9 * m, "wrong split point m");
      need(f.unbalanced === (limbs(f.y) <= m), "unbalanced flag wrong");
      need(BigInt(f.x1) * pw(m) + BigInt(f.x0) === BigInt(f.x), "x != x1*B^m + x0");
      if (f.unbalanced) need(f.y1 === "0" && f.y0 === f.y, "unbalanced split must keep y whole");
      else need(BigInt(f.y1) * pw(m) + BigInt(f.y0) === BigInt(f.y) && f.y1 !== "0", "y != y1*B^m + y0");
      need(BigInt(ev[1].product) === prod, "combine product is not x*y");
    }
    info.set(id, { ev, kind: f.kind, parentId: f.parentId, depth: f.depth, role: f.role, first: ev[0].seq, last: ev[ev.length - 1].seq, x: BigInt(f.x), y: BigInt(f.y), prod: BigInt(ev[ev.length - 1].product) });
  }
  const key = (p, q) => [p, q].sort((u, v) => (u < v ? -1 : u > v ? 1 : 0)).join("x");
  for (const id of ids) {
    const c = info.get(id);
    if (id !== 0) {
      const par = info.get(c.parentId);
      need(par && par.kind === "split" && c.depth === par.depth + 1, "call " + id + ": bad parent/depth");
    }
    if (c.kind === "base") continue;
    const [sp, cb] = c.ev;
    const kids = ids.filter((k) => info.get(k).parentId === id).sort((p, q) => info.get(p).first - info.get(q).first).map((k) => info.get(k));
    const m = sp.m;
    const [x0, x1, y0, y1] = [BigInt(sp.x0), BigInt(sp.x1), BigInt(sp.y0), BigInt(sp.y1)];
    need(kids[0] && kids[0].first > sp.seq && kids[kids.length - 1].last < cb.seq, "children are not nested inside their parent");
    for (let i = 1; i < kids.length; i++) need(kids[i - 1].last < kids[i].first, "children overlap");
    const operands = (k) => key(k.x, k.y);
    if (sp.unbalanced) {
      need(kids.length === 2 && kids[0].role === "piece0" && kids[1].role === "piece1", "unbalanced call needs piece0, piece1");
      need(operands(kids[0]) === key(x0, BigInt(sp.y)) && operands(kids[1]) === key(x1, BigInt(sp.y)), "piece operands are wrong");
      need(cb.unbalanced === true && cb.pieces.length === 2 && BigInt(cb.pieces[0]) === kids[0].prod && BigInt(cb.pieces[1]) === kids[1].prod, "pieces differ from the children's products");
      need(BigInt(cb.pieces[0]) + BigInt(cb.pieces[1]) * pw(m) === BigInt(cb.product), "combine of pieces is wrong");
    } else {
      need(kids.length === 3 && kids.map((k) => k.role).join() === "z0,z1,z2", "balanced call needs z0, z1, z2 in order");
      need(operands(kids[0]) === key(x0, y0), "z0 operands wrong");
      need(operands(kids[1]) === key(x0 + x1, y0 + y1), "z1 operands wrong (must be x0+x1 and y0+y1)");
      need(operands(kids[2]) === key(x1, y1), "z2 operands wrong");
      need(cb.unbalanced === false && BigInt(cb.z0) === kids[0].prod && BigInt(cb.z1) === kids[1].prod && BigInt(cb.z2) === kids[2].prod, "z values differ from the children's products");
      need(BigInt(cb.mid) === BigInt(cb.z1) - BigInt(cb.z2) - BigInt(cb.z0), "mid is not z1 - z2 - z0");
      need(BigInt(cb.z2) * pw(2 * m) + BigInt(cb.mid) * pw(m) + BigInt(cb.z0) === BigInt(cb.product), "combine formula gives a different product");
    }
  }
  const root = info.get(0);
  need(root.prod === BigInt(A) * BigInt(Bs), "root product is not a x b");
  const a = result.answer;
  need(a.productDigits === root.prod.toString().length, "result productDigits wrong");
  if (a.product !== null) need(BigInt(a.product) === root.prod, "result product wrong");
  const unb = [...info.values()].filter((c) => c.kind === "split" && c.ev[0].unbalanced).length;
  return steps.length + " events, depth " + Math.max(...steps.map((s) => s.depth)) + (unb ? ", " + unb + " unbalanced split(s)" : "");
}

// ============================ test runner ==============================================
function mulberry32(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function randDigits(rng, n) { let s = String(1 + Math.floor(rng() * 9)); for (let i = 1; i < n; i++) s += Math.floor(rng() * 10); return s; }

function main() {
  fs.mkdirSync(TMP, { recursive: true });
  let failures = 0;
  const report = (name, ok, msg) => { if (!ok) failures++; console.log((ok ? "PASS  " : "FAIL  ") + name.padEnd(34) + msg); };
  const gen = (id, n, seed, name) => {
    const out = path.join(TMP, name + ".txt");
    const r = spawnSync(GEN, ["one", id, "--n", String(n), "--seed", String(seed), "--out", out], { encoding: "utf8" });
    if (r.status !== 0) throw new Error("gen failed: " + r.stdout + r.stderr);
    return out;
  };
  const writeNums = (name, a, b) => { const p = path.join(TMP, name + ".txt"); fs.writeFileSync(p, a + "\n" + b + "\n"); return p; };
  const rng = mulberry32(2024);

  const cp = [
    ["cp10 (101 points)", "data/small/cp10.txt"],
    ["cp01  n=2", gen("cp01", 2, 11, "cp_n2")], ["cp01  n=3", gen("cp01", 3, 12, "cp_n3")], ["cp01  n=4", gen("cp01", 4, 13, "cp_n4")],
    ["cp01  n=7", gen("cp01", 7, 14, "cp_n7")], ["cp01  n=200 (largest allowed)", gen("cp01", 200, 15, "cp_n200")],
    ["cp05  n=180 clusters", gen("cp05", 180, 16, "cp_clu")], ["cp06  n=150 duplicates", gen("cp06", 150, 17, "cp_dup")],
    ["cp07  n=120 vertical line", gen("cp07", 120, 18, "cp_line")], ["cp08  n=100 grid ties", gen("cp08", 100, 19, "cp_grid")],
    ["cp09  n=200 straddling pair", gen("cp09", 200, 20, "cp_cross")],
  ];
  console.log("\n=== closest pair: --trace replay ===");
  for (const [name, file] of cp) {
    try {
      const t = runEngine(["closest-pair", file, "--trace"]);
      const info = validateCp(file, t);
      const plain = runEngine(["closest-pair", file]);
      const [x, y] = [t.msgs[t.msgs.length - 1].answer, plain.msgs[plain.msgs.length - 1].answer];
      need(x.p1Index === y.p1Index && x.p2Index === y.p2Index && x.distanceSquared === y.distanceSquared, "traced run and plain run give different answers");
      const c = spawnSync(CHECK, ["cp", file, "--expect-distance", String(x.distance)], { encoding: "utf8", maxBuffer: 1 << 24 });
      need(c.status === 0, "checker disagrees with the distance");
      report(name, true, info);
    } catch (e) { report(name, false, e.message); }
  }

  const im = [
    ["im10 (101 digits)", "data/small/im10.txt"],
    ["im01  n=1 digit", gen("im01", 1, 21, "im_d1")], ["im01  n=20 digits", gen("im01", 20, 22, "im_d20")],
    ["im02  n=200 digits", gen("im02", 200, 23, "im_d200")], ["im06  all 9s, n=150", gen("im06", 150, 24, "im_nines")],
    ["im07  sparse zeros, n=199", gen("im07", 199, 25, "im_sparse")], ["im08  powers of 10, n=200", gen("im08", 200, 26, "im_pow10")],
    ["im09  zero x 150 digits", gen("im09", 150, 27, "im_zero")], ["im05  200 x 10 digits", gen("im05", 200, 28, "im_lop")],
    ["200 x 40 digits (unbalanced)", writeNums("im_unb1", randDigits(rng, 200), randDigits(rng, 40))],
    ["40 x 200 digits (swapped)", writeNums("im_unb2", randDigits(rng, 40), randDigits(rng, 200))],
    ["199 x 37 digits (unbalanced)", writeNums("im_unb3", randDigits(rng, 199), randDigits(rng, 37))],
    ["200 x 200, all limbs 999999999", writeNums("im_9s", "9".repeat(198), "9".repeat(198))],
    ["limb-sized zero blocks", writeNums("im_zblk", "7" + "000000000".repeat(20), "1" + "000000000".repeat(20) + "5")],
  ];
  console.log("\n=== Karatsuba: --trace replay ===");
  for (const [name, file] of im) {
    try {
      const t = runEngine(["karatsuba", file, "--trace", "--out", path.join(TMP, "prod.txt")]);
      const info = validateKara(file, t);
      const plain = runEngine(["karatsuba", file, "--out", path.join(TMP, "prod2.txt")]);
      const [x, y] = [t.msgs[t.msgs.length - 1].answer, plain.msgs[plain.msgs.length - 1].answer];
      need(x.productHead === y.productHead && x.productTail === y.productTail && x.productDigits === y.productDigits, "traced run and plain run give different products");
      report(name, true, info);
    } catch (e) { report(name, false, e.message); }
  }

  console.log("\n=== limits ===");
  const big1 = gen("cp01", 201, 31, "cp_n201"), big2 = writeNums("im_201", randDigits(rng, 201), randDigits(rng, 5));
  for (const [name, args, code] of [
    ["201 points with --trace", ["closest-pair", big1, "--trace"], "TRACE_TOO_LARGE"],
    ["201 digits with --trace", ["karatsuba", big2, "--trace"], "TRACE_TOO_LARGE"],
  ]) {
    const r = runEngine(args);
    const last = r.msgs[r.msgs.length - 1];
    report(name, r.code === 1 && last.type === "error" && last.code === code, "-> " + last.code);
  }
  console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : "\n" + failures + " CHECK(S) FAILED\n");
  process.exit(failures === 0 ? 0 : 1);
}

if (require.main === module) main();
else module.exports = { validateCp, validateKara, runEngine };