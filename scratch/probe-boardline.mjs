// Dev: find the right args for pcb_PrimitiveLine.create on BOARD_OUTLINE (11).
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'
const code = `return await (async () => {
  const out = {};
  const tries = [
    { label: 'net=null layer=11', fn: () => eda.pcb_PrimitiveLine.create(null, 11, 2000, 2000, 3000, 2000, 10, false) },
    { label: "net='' layer='11'", fn: () => eda.pcb_PrimitiveLine.create('', '11', 2000, 2000, 3000, 2000, 10, false) },
    { label: 'net=VCC layer=11', fn: () => eda.pcb_PrimitiveLine.create('VCC', 11, 2000, 2000, 3000, 2000, 10, false) },
    { label: "net='' layer='BOARD_OUTLINE'", fn: () => eda.pcb_PrimitiveLine.create('', 'BOARD_OUTLINE', 2000, 2000, 3000, 2000, 10, false) },
  ];
  const got = [];
  for (const t of tries) {
    try { const r = await t.fn(); got.push({ label: t.label, ok: !!r, id: r ? r.getState_PrimitiveId() : null, err: null }); }
    catch (e) { got.push({ label: t.label, ok: false, id: null, err: String(e).slice(0, 120) }); }
  }
  out.tries = got;
  // cleanup what was created
  for (const g of got) { if (g.id) { try { await eda.pcb_PrimitiveLine.delete(g.id); } catch (e) {} } }
  return out;
})();`
const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code }),
  signal: AbortSignal.timeout(60000),
})
console.log('HTTP', res.status)
console.log((await res.text()).slice(0, 1500))
