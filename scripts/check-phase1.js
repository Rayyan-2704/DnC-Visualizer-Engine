// Phase 0/1 check. Run from the daa-project folder:  node scripts\check-phase1.js
const fs = require("fs");
const path = require("path");

let failures = 0;
const pass = (m) => console.log("  PASS  " + m);
const fail = (m) => { console.log("  FAIL  " + m); failures++; };

console.log("\n[1] Folders and files exist");
const mustExist = [
  "README.md", ".gitignore", "setup-folders.bat",
  "docs/context.md", "docs/protocol.md", "docs/report",
  "src/generator", "src/engine", "src/checker", "src/app",
  "src/engine/build.bat", "bin", "data/small", "data/large",
  "results", "scripts/check-env.bat",
];
for (const p of mustExist) {
  fs.existsSync(path.join(process.cwd(), p)) ? pass(p) : fail("missing: " + p);
}

console.log("\n[2] protocol.md: every one-line JSON example parses");
const protoPath = path.join(process.cwd(), "docs", "protocol.md");
if (!fs.existsSync(protoPath)) {
  fail("docs/protocol.md not found (run this from the daa-project folder)");
} else {
  const lines = fs.readFileSync(protoPath, "utf8").split(/\r?\n/);
  let ok = 0, bad = 0;
  for (const l of lines) {
    const t = l.trim();
    if (t.startsWith('{"type"') && t.endsWith("}")) {
      try { JSON.parse(t); ok++; } catch (e) { bad++; console.log("        bad line: " + t.slice(0, 70)); }
    }
  }
  ok > 0 && bad === 0 ? pass(ok + " JSON lines parsed, 0 bad") : fail(ok + " ok, " + bad + " bad");
}

console.log("\n[3] Karatsuba example arithmetic (12 x 34)");
const z0 = 2 * 4, z2 = 1 * 3, z1 = (2 + 1) * (4 + 3), mid = z1 - z2 - z0;
const total = z2 * 100 + mid * 10 + z0;
total === 12 * 34 ? pass("3*100 + " + mid + "*10 + " + z0 + " = " + total) : fail("math wrong: " + total);

console.log(failures === 0 ? "\nALL CHECKS PASSED\n" : "\n" + failures + " CHECK(S) FAILED\n");
process.exit(failures === 0 ? 0 : 1);