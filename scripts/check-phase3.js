// Phase 3 check. Run from the repo root:  node scripts\check-phase3.js
// Runs the engine on all 20 files and verifies every answer with bin\check.exe
// (a different method), plus a few error-handling checks.
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const EXT = process.platform === "win32" ? ".exe" : "";
const ENGINE = path.join("bin", "engine" + EXT);
const CHECK = path.join("bin", "check" + EXT);
let failures = 0;

function findInput(id) {
  for (const d of ["small", "large"]) {
    const p = path.join("data", d, id + ".txt");
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function runEngine(args) {
  const r = spawnSync(ENGINE, args, { encoding: "utf8", maxBuffer: 1 << 28 });
  const lines = (r.stdout || "").split("\n").filter((l) => l.length);
  const msgs = lines.map((l) => JSON.parse(l)); // throws if any line is not valid JSON
  return { code: r.status, msgs, raw: r.stdout || "" };
}

function protocolOk(run) {
  const m = run.msgs;
  if (m.length < 2) return "too few messages";
  if (m[0].type !== "hello" || m[0].protocol !== 1) return "first line is not a valid hello";
  const last = m[m.length - 1];
  if (last.type !== "result" && last.type !== "error") return "last line is not result/error";
  if (run.raw.includes("\r")) return "output contains a carriage return";
  return null;
}

function report(id, ok, ms, msg) {
  if (!ok) failures++;
  console.log(id.padEnd(5) + (ok ? "PASS" : "FAIL") + "  " + (ms !== null ? (ms.toFixed(1) + " ms").padStart(11) : " ".repeat(11)) + "  " + msg);
}

function checkCp(id) {
  const file = findInput(id);
  if (!file) return report(id, false, null, "input file not found (run gen.exe all first)");
  const run = runEngine(["closest-pair", file]);
  const bad = protocolOk(run);
  if (bad || run.code !== 0) return report(id, false, null, bad || "engine exit code " + run.code + " " + run.raw.slice(-200));
  const res = run.msgs[run.msgs.length - 1];
  const a = res.answer;
  // 1) the reported pair must be two real points of the file, and the distance must match them
  const text = fs.readFileSync(file, "utf8").split("\n");
  const pt = (i) => text[i + 1].trim().split(/\s+/).map(Number);
  const [p1, p2] = [pt(a.p1Index), pt(a.p2Index)];
  const d = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
  if (p1[0] !== a.p1[0] || p1[1] !== a.p1[1] || p2[0] !== a.p2[0] || p2[1] !== a.p2[1])
    return report(id, false, res.timeMs, "reported coordinates do not match the file at the reported indices");
  if (a.p1Index >= a.p2Index) return report(id, false, res.timeMs, "p1Index must be smaller than p2Index");
  if (Math.abs(d - a.distance) > 1e-9 * Math.max(1, d) || Math.abs(a.distance * a.distance - a.distanceSquared) > 1e-9 * Math.max(1, a.distanceSquared))
    return report(id, false, res.timeMs, "distance fields are inconsistent with the reported points");
  // 2) the distance must equal the true closest distance found by the checker
  const c = spawnSync(CHECK, ["cp", file, "--expect-distance", String(a.distance)], { encoding: "utf8", maxBuffer: 1 << 24 });
  const ok = c.status === 0;
  report(id, ok, res.timeMs, ok ? "distance " + a.distance.toPrecision(10) + " matches the checker" : "checker disagrees: " + c.stdout.trim().split("\n").slice(-2).join(" | "));
}

function checkIm(id) {
  const file = findInput(id);
  if (!file) return report(id, false, null, "input file not found (run gen.exe all first)");
  const run = runEngine(["karatsuba", file]);
  const bad = protocolOk(run);
  if (bad || run.code !== 0) return report(id, false, null, bad || "engine exit code " + run.code + " " + run.raw.slice(-200));
  const res = run.msgs[run.msgs.length - 1];
  const a = res.answer;
  const prod = fs.readFileSync(a.outputFile, "utf8").trim();
  if (prod.length !== a.productDigits) return report(id, false, res.timeMs, "productDigits does not match the output file");
  if (a.productHead !== prod.slice(0, 50) || a.productTail !== prod.slice(-50)) return report(id, false, res.timeMs, "head/tail do not match the output file");
  if ((prod.length <= 1000) !== (a.product !== null) || (a.product !== null && a.product !== prod)) return report(id, false, res.timeMs, "'product' field wrong");
  const c = spawnSync(CHECK, ["mul", file, "--product", a.outputFile], { encoding: "utf8", maxBuffer: 1 << 24 });
  const ok = c.status === 0;
  report(id, ok, res.timeMs, ok ? c.stdout.trim() : "checker: " + c.stdout.trim());
}

function checkErrors() {
  const cases = [
    ["missing file", ["closest-pair", "no_such_file.txt"], "FILE_NOT_FOUND"],
    ["unknown algorithm", ["sorting", "data/small/cp10.txt"], "BAD_ARGS"],
    ["no arguments", [], "BAD_ARGS"],
    ["unknown flag", ["karatsuba", "data/small/im10.txt", "--bogus"], "BAD_ARGS"],
    ["trace on a big file", ["closest-pair", "data/large/cp04.txt", "--trace"], "TRACE_TOO_LARGE"],
  ];
  for (const [name, args, code] of cases) {
    const run = runEngine(args);
    const last = run.msgs[run.msgs.length - 1];
    const ok = !protocolOk(run) && run.code === 1 && last.type === "error" && last.code === code;
    report("err", ok, null, name + " -> " + (last ? last.code : "?"));
  }
}

console.log("\n=== Phase 3: engine vs checker ===\n");
console.log("ID   Result      Engine time  Details");
for (let i = 1; i <= 10; i++) checkCp("cp" + String(i).padStart(2, "0"));
for (let i = 1; i <= 10; i++) checkIm("im" + String(i).padStart(2, "0"));
console.log("\n=== error handling ===");
checkErrors();
console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : "\n" + failures + " CHECK(S) FAILED\n");
process.exit(failures === 0 ? 0 : 1);