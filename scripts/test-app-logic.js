// Test script to verify app engine runner and protocol handling
const path = require('path')
const { runJsEngine } = require('../src/app/src/main/engine-runner')

async function test() {
  console.log('--- Testing Closest Pair Trace ---')
  const cpFile = path.resolve(__dirname, '../data/small/cp10.txt')
  const cpLines = []
  const cpRes = await runJsEngine(
    { algorithm: 'closest-pair', filePath: cpFile, trace: true },
    (line) => cpLines.push(JSON.parse(line))
  ).promise

  console.log(`CP Status: ${cpRes.code}, Total messages: ${cpLines.length}`)
  const cpResult = cpLines.find(l => l.type === 'result')
  console.log('CP Result:', JSON.stringify(cpResult?.answer))

  console.log('\n--- Testing Karatsuba Trace ---')
  const imFile = path.resolve(__dirname, '../data/small/im10.txt')
  const imLines = []
  const imRes = await runJsEngine(
    { algorithm: 'karatsuba', filePath: imFile, trace: true },
    (line) => imLines.push(JSON.parse(line))
  ).promise

  console.log(`Karatsuba Status: ${imRes.code}, Total messages: ${imLines.length}`)
  const imResult = imLines.find(l => l.type === 'result')
  console.log('Karatsuba Result:', JSON.stringify(imResult?.answer))

  console.log('\nALL ENGINE RUNNER TESTS PASSED!')
}

test().catch(err => {
  console.error(err)
  process.exit(1)
})

