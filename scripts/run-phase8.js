// Phase 8: batch run (assignment Part 3). Run from the repo root:
//
//   node scripts\run-phase8.js                  run all 20 files, 3 timed runs each
//   node scripts\run-phase8.js --runs 5         more runs per file (median is reported)
//   node scripts\run-phase8.js --only cp04,im04 only these ids (handy while testing)
//   node scripts\run-phase8.js --no-verify      skip the checker (timings only)
//   node scripts\run-phase8.js --verify-seeds   also run "bin\gen.exe verify" and record the outcome
//
// What it does, per file:
//   1. runs bin\engine.exe N times WITHOUT --trace (a traced run includes printing cost, so it is not a benchmark)
//   2. takes the engine's own timeMs (algorithm only: no file reading, no printing) and reports median / min / max
//   3. checks that every run gave the same answer
//   4. verifies the answer with bin\check.exe (a different method)
// Writes results\results.csv (for Part 3) and results\results.md (paste-ready table for the report).
// Needs: bin\engine.exe, bin\check.exe (build-tools.bat), and the 20 input files (bin\gen.exe all).
"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const EXT = process.platform === "win32" ? ".exe" : "";
const ENGINE = path.join("bin", "engine" + EXT);
const CHECK = path.join("bin", "check" + EXT);
const GEN = path.join("bin", "gen" + EXT);
const SEEDS = path.join("src", "generator", "seeds.txt");
const OUT_DIR = path.join("out", "phase8");
const RESULTS_DIR = "results";
const TIMEOUT_MS = 15 * 60 * 1000;

const ALL_IDS = [];
for (const p of ["cp", "im"]) for (let i = 1; i <= 10; i++) ALL_IDS.push(p + String(i).padStart(2, "0"));

// ----------------------------------------------------------------------------- args
function parseArgs(argv) {
  const o = { runs: 3, verify: true, verifySeeds: false, only: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--runs") o.runs = Math.max(1, parseInt(argv[++i], 10) || 3);
    else if (a === "--no-verify") o.verify = false;
    else if (a === "--verify-seeds") o.verifySeeds = true;
    else if (a === "--only") o.only = argv[++i].split(",").map((s) => s.trim()).filter(Boolean);
    else { console.error("unknown option " + a); process.exit(2); }
  }
  if (o.only) {
    const bad = o.only.filter((id) => !ALL_IDS.includes(id));
    if (bad.length) { console.error("unknown id(s): " + bad.join(", ")); process.exit(2); }
  }
  return o;
}

// ----------------------------------------------------------------------------- helpers
function findInput(id) {
  for (const d of ["small", "large"]) {
    const p = path.join("data", d, id + ".txt");
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function runEngine(args) {
  const r = spawnSync(ENGINE, args, { encoding: "utf8", maxBuffer: 1 << 26, timeout: TIMEOUT_MS });
  if (r.error) throw new Error(r.error.code === "ETIMEDOUT" ? "engine timed out" : "cannot run engine: " + r.error.message);
  const raw = r.stdout || "";
  const msgs = raw.split("\n").filter((l) => l.length).map((l) => {
    try { return JSON.parse(l); } catch (e) { throw new Error("engine printed a line that is not JSON: " + l.slice(0, 80)); }
  });
  return { code: r.status, msgs, raw };
}

function median(a) {
  const s = [...a].sort((x, y) => x - y), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function readSeeds() {
  const map = new Map();
  if (!fs.existsSync(SEEDS)) return map;
  for (const line of fs.readFileSync(SEEDS, "utf8").split(/\r?\n/)) {
    if (!line || line[0] === "#") continue;
    const m = line.match(/^(\S+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([0-9a-f]+)\s*(.*)$/);
    if (m) map.set(m[1], { seed: m[2], desc: m[6] });
  }
  return map;
}

function csvCell(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const fmtMs = (x) => x.toFixed(3);

// ----------------------------------------------------------------------------- one file
function benchFile(id, opt) {
  const file = findInput(id);
  if (!file) throw new Error("input file not found in data\\small or data\\large (run bin\\gen.exe all)");
  const isCp = id.startsWith("cp");
  const algorithm = isCp ? "closest-pair" : "karatsuba";
  const productPath = path.join(OUT_DIR, id + ".product.txt");

  const times = [];
  let first = null, sig0 = null;
  for (let r = 0; r < opt.runs; r++) {
    const args = [algorithm, file];
    if (!isCp) args.push("--out", productPath);
    const run = runEngine(args);

    const m = run.msgs, last = m[m.length - 1];
    if (!m.length || m[0].type !== "hello" || m[0].protocol !== 1) throw new Error("first line is not a valid hello");
    if (run.code !== 0 || !last || last.type !== "result") {
      throw new Error("engine failed: " + (last && last.type === "error" ? last.code + " " + last.message : "exit code " + run.code));
    }
    if (last.traced) throw new Error("result says traced=true (benchmark runs must not use --trace)");
    if (typeof last.timeMs !== "number") throw new Error("result has no numeric timeMs");

    const a = last.answer;
    const sig = isCp ? String(a.distanceSquared) : [a.productDigits, a.productHead, a.productTail].join("|");
    if (sig0 === null) { sig0 = sig; first = { res: last, hello: m[0] }; }
    else if (sig !== sig0) throw new Error("run " + (r + 1) + " gave a different answer than run 1 (engine is not deterministic)");
    times.push(last.timeMs);
  }

  const a = first.res.answer;
  const row = {
    id, file, algorithm,
    engineVersion: first.hello.version || "?",
    size: isCp ? String(first.res.n) : a.digitsA + "x" + a.digitsB,
    times, med: median(times), min: Math.min(...times), max: Math.max(...times),
    verified: opt.verify ? "FAIL" : "skipped", detail: "",
  };

  if (isCp) {
    row.answer = "distance=" + a.distance + "; p1=(" + a.p1.join(" ") + "); p2=(" + a.p2.join(" ") + ")";
    row.short = "d = " + Number(a.distance).toPrecision(10);
  } else {
    row.answer = a.productDigits + " digits; head=" + a.productHead + "; tail=" + a.productTail;
    const h = a.productHead, t = a.productTail;
    row.short = a.productDigits + " digits: " + h.slice(0, 12) + (a.productDigits > 24 ? "..." + t.slice(-12) : "");
  }

  if (opt.verify) {
    if (isCp) {
      const c = spawnSync(CHECK, ["cp", file, "--expect-distance", String(a.distance)], { encoding: "utf8", maxBuffer: 1 << 24, timeout: TIMEOUT_MS });
      if (c.status === 0) row.verified = "PASS";
      else row.detail = "checker: " + (c.stdout || c.stderr || "").trim().split("\n").slice(-2).join(" | ");
    } else {
      const prod = fs.readFileSync(a.outputFile, "utf8").trim();
      if (prod.length !== a.productDigits || prod.slice(0, 50) !== a.productHead || prod.slice(-50) !== a.productTail) {
        row.detail = "output file does not match productDigits/head/tail";
      } else {
        const c = spawnSync(CHECK, ["mul", file, "--product", a.outputFile], { encoding: "utf8", maxBuffer: 1 << 24, timeout: TIMEOUT_MS });
        if (c.status === 0) row.verified = "PASS";
        else row.detail = "checker: " + (c.stdout || c.stderr || "").trim().split("\n").slice(-2).join(" | ");
      }
    }
  }
  return row;
}

// ----------------------------------------------------------------------------- output files
function machineInfo() {
  const cpus = os.cpus();
  let gpp = "g++ not found on PATH";
  const g = spawnSync("g++", ["--version"], { encoding: "utf8" });
  if (!g.error && g.stdout) gpp = g.stdout.split("\n")[0].trim();
  return {
    cpu: cpus.length ? cpus[0].model.trim() : "unknown", cores: cpus.length,
    ram: (os.totalmem() / 2 ** 30).toFixed(1) + " GB", os: os.type() + " " + os.release(),
    node: process.version, gpp,
  };
}

function writeCsv(rows, seeds) {
  const head = ["file", "algorithm", "size", "seed", "time_ms", "min_ms", "max_ms", "runs", "answer", "verified"];
  const lines = [head.join(",")];
  for (const r of rows) {
    const s = seeds.get(r.id);
    lines.push([r.id, r.algorithm, r.size, s ? s.seed : "", fmtMs(r.med), fmtMs(r.min), fmtMs(r.max), r.times.length, r.answer, r.verified].map(csvCell).join(","));
  }
  fs.writeFileSync(path.join(RESULTS_DIR, "results.csv"), lines.join("\n") + "\n");
}

function writeMarkdown(rows, failures, seeds, info, opt, seedNote) {
  const L = [];
  L.push("# Phase 8: results of running both algorithms on all input files", "");
  L.push("Generated by `scripts/run-phase8.js` on " + new Date().toISOString().slice(0, 10) + ".", "");
  L.push("**Machine:** " + info.cpu + " (" + info.cores + " logical cores), " + info.ram + " RAM, " + info.os + "  ");
  L.push("**Toolchain:** " + info.gpp + ", Node " + info.node + "  ");
  L.push("**Engine:** daa-engine " + (rows[0] ? rows[0].engineVersion : "?") + ", built with `-O2`  ");
  L.push("**Method:** each file is run " + opt.runs + " time(s) without `--trace`. Time is the engine's own `std::chrono::steady_clock` measurement of the algorithm only (file reading and output excluded); the median is reported, with min and max beside it.  ");
  L.push("**Verification:** " + (opt.verify ? "every answer was checked by `bin/check.exe`, which computes the answer by a different method than the engine (see `src/checker/check.cpp`)." : "skipped for this run."));
  if (seedNote) L.push("", "**Reproducibility:** " + seedNote);
  L.push("", "| File | Algorithm | Size | Median (ms) | Min - Max (ms) | Answer | Check | Input |", "|---|---|---|---:|---:|---|:---:|---|");
  for (const r of rows) {
    const s = seeds.get(r.id);
    L.push("| " + [r.id, r.algorithm, r.size, fmtMs(r.med), fmtMs(r.min) + " - " + fmtMs(r.max), "`" + r.short + "`", r.verified, s ? s.desc : ""].join(" | ") + " |");
  }
  L.push("", "Size is the number of points (closest pair) or the digit counts of the two numbers (Karatsuba).");
  L.push("For files with tied closest pairs (cp06 duplicates, cp08 grid) the engine reports one of the tied pairs; only the distance is compared.");
  if (failures.length) {
    L.push("", "## Failures", "");
    for (const f of failures) L.push("- " + f);
  }
  fs.writeFileSync(path.join(RESULTS_DIR, "results.md"), L.join("\n") + "\n");
}

// ----------------------------------------------------------------------------- main
function main() {
  const opt = parseArgs(process.argv.slice(2));
  const ids = opt.only || ALL_IDS;

  const missing = [ENGINE].concat(opt.verify ? [CHECK] : []).concat(opt.verifySeeds ? [GEN] : []).filter((p) => !fs.existsSync(p));
  if (missing.length) {
    console.error("Missing: " + missing.join(", ") + "\nBuild them first:  src\\engine\\build.bat   and   scripts\\build-tools.bat");
    process.exit(2);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(RESULTS_DIR, { recursive: true });

  const seeds = readSeeds();
  let seedNote = "";
  let failures = [];

  if (opt.verifySeeds) {
    console.log("\n=== seeds: regenerating all 20 files in memory and comparing hashes ===");
    const g = spawnSync(GEN, ["verify"], { encoding: "utf8", maxBuffer: 1 << 24, timeout: TIMEOUT_MS });
    const out = (g.stdout || "").trim().split("\n");
    seedNote = out[out.length - 1] || "gen verify printed nothing";
    console.log(seedNote);
    if (g.status !== 0) failures.push("gen verify: " + seedNote);
  }

  console.log("\n=== Phase 8: batch run (" + opt.runs + " run(s) per file" + (opt.verify ? ", verified" : ", NOT verified") + ") ===\n");
  console.log("File  Algorithm      Size              Median ms     Min - Max ms              Check   Answer");

  const rows = [];
  for (const id of ids) {
    try {
      const r = benchFile(id, opt);
      rows.push(r);
      const ok = r.verified !== "FAIL";
      if (!ok) failures.push(id + ": " + (r.detail || "verification failed"));
      console.log(
        id.padEnd(6) + r.algorithm.padEnd(15) + r.size.padEnd(18) + fmtMs(r.med).padStart(10) + "    " +
        (fmtMs(r.min) + " - " + fmtMs(r.max)).padEnd(26) + r.verified.padEnd(8) + r.short + (ok ? "" : "   <-- " + r.detail)
      );
    } catch (e) {
      failures.push(id + ": " + e.message);
      console.log(id.padEnd(6) + "FAIL  " + e.message);
    }
  }

  if (rows.length) {
    writeCsv(rows, seeds);
    writeMarkdown(rows, failures, seeds, machineInfo(), opt, seedNote);
    console.log("\nWrote results\\results.csv and results\\results.md (" + rows.length + " row(s)).");
  }
  if (failures.length) {
    console.log("\n" + failures.length + " PROBLEM(S):");
    for (const f of failures) console.log("  - " + f);
    console.log("");
    process.exit(1);
  }
  console.log(opt.only ? "\nDONE (partial run: --only was used)\n" : "\nALL 20 FILES DONE\n");
}

main();