// Dev probe (stepwise): find which API hangs the bridge.
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'
const code = process.argv[2]
const body = JSON.stringify({ code })
const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body,
  signal: AbortSignal.timeout(40000),
})
console.log('HTTP', res.status)
console.log((await res.text()).slice(0, 3000))
