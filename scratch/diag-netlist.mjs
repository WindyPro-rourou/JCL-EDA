// Dev diagnose: PCB side netlist vs schematic netlist — why does Import Changes
// DRC keep reporting "netlist does not match"? Read-only.
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'

const code = `return await (async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};

  // PCB side
  await eda.dmt_EditorControl.openDocument('13a43dcf22b6b1b0');
  await sleep(1200);
  try { out.pcbNetlist = await eda.pcb_Net.getNetlist(); } catch (e) { out.pcbNetError = String(e); }
  await sleep(400);

  // Schematic side
  await eda.dmt_EditorControl.openDocument('2dd115fe3f36aaaa');
  await sleep(1200);
  try { out.schNetlist = await eda.sch_Netlist.getNetlist(); } catch (e) { out.schNetError = String(e); }
  await sleep(400);

  const parse = (s) => {
    try { return JSON.parse(s); } catch { return null; }
  };
  const compsOf = (n) => {
    if (!n || !n.components) return [];
    return Object.entries(n.components).map(([id, c]) => ({ id, designator: c?.props?.Designator ?? c?.props?.designator ?? '?' }));
  };
  const netsOf = (n) => {
    const set = new Set();
    if (n && n.nets) { for (const k of Object.keys(n.nets)) set.add(k); }
    if (n && n.components) {
      for (const c of Object.values(n.components)) {
        const pin = c.pinInfoMap;
        if (pin) for (const p of Object.values(pin)) if (p.net) set.add(p.net);
      }
    }
    return [...set];
  };
  const pcb = parse(out.pcbNetlist); const sch = parse(out.schNetlist);
  out.pcbInfo = { len: (out.pcbNetlist ?? '').length, comps: compsOf(pcb), nets: netsOf(pcb) };
  out.schInfo = { len: (out.schNetlist ?? '').length, comps: compsOf(sch), nets: netsOf(sch) };
  return out;
})();`

const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code }),
  signal: AbortSignal.timeout(60000),
})
console.log('HTTP', res.status)
const text = await res.text()
console.log(text.slice(0, 3000))
