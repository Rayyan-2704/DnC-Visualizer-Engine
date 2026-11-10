// Validate runner output against scripts/check-phase4.js validation functions!
const path = require('path')
const { validateCp, validateKara } = require('./check-phase4')
const { runJsEngine } = require('../src/app/src/main/engine-runner')

async function runCheck() {
  console.log('Testing CP10 with check-phase4 validator...')
  const cpFile = path.resolve(__dirname, '../data/small/cp10.txt')
  const cpLines = []
  const cpRes = await runJsEngine(
    { algorithm: 'closest-pair', filePath: cpFile, trace: true },
    (line) => cpLines.push(line)
  ).promise

  const cpRun = {
    code: cpRes.code,
    msgs: cpLines.map(l => JSON.parse(l)),
    raw: cpLines.join('\n')
  }

  const cpMsg = validateCp(cpFile, cpRun)
  console.log('PASS CP10:', cpMsg)

  console.log('Testing IM10 with check-phase4 validator...')
  const imFile = path.resolve(__dirname, '../data/small/im10.txt')
  const imLines = []
  const imRes = await runJsEngine(
    { algorithm: 'karatsuba', filePath: imFile, trace: true },
    (line) => imLines.push(line)
  ).promise

  const imRun = {
    code: imRes.code,
    msgs: imLines.map(l => JSON.parse(l)),
    raw: imLines.join('\n')
  }

  const imMsg = validateKara(imFile, imRun)
  console.log('PASS IM10:', imMsg)
  console.log('\nPERFECT PROTOCOL COMPLIANCE CONFIRMED!')
}

runCheck().catch(err => {
  console.error('FAIL:', err)
  process.exit(1)
})

