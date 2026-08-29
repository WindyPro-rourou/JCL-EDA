// Dev: 按区域无差别清理测试内容（安全：用户原图在 x<500（10mil），
// 测试区全部在 x>=900——只删测试区）。先列清单 → 分类型删除 → 复验。
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'

const code = `return await (async () => {
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));
  const out = {};

  // --- 原理图 P1：列出测试区（x>=2500）的 component / wire ---
  await eda.dmt_EditorControl.openDocument('2dd115fe3f36aaaa');
  await sleep(1200);
  const comps = await eda.sch_PrimitiveComponent.getAll();
  const wires = await eda.sch_PrimitiveWire.getAll();
  const testComps = (comps || []).filter(c => c.getState_X() >= 2500).map(c => ({ id: c.getState_PrimitiveId(), d: c.getState_Designator ? c.getState_Designator() : '', t: c.getState_ComponentType ? c.getState_ComponentType() : '', x: c.getState_X(), y: c.getState_Y() }));
  const testWires = (wires || []).filter(w => { const l = w.getState_Line(); return Math.max(...l) >= 2500; }).map(w => ({ id: w.getState_PrimitiveId(), line: w.getState_Line() }));
  out.schList = { comps: testComps, wires: testWires };
  let delComp = true; let delWire = true;
  if (testComps.length) {
    const ids = testComps.map(c => c.id);
    try { delComp = await eda.sch_PrimitiveComponent.delete(ids); } catch (e) { delComp = 'ERR:' + String(e).slice(0, 120); }
    // 逐个兜底
    if (delComp === false) {
      delComp = { ok: false, fallback: [] };
      for (const id of ids) {
        try { const one = await eda.sch_PrimitiveComponent.delete(id); delComp.fallback.push({ id, ok: one }); }
        catch (e) { delComp.fallback.push({ id, err: String(e).slice(0, 80) }); }
      }
    }
  }
  if (testWires.length) {
    const ids = testWires.map(w => w.id);
    try { delWire = await eda.sch_PrimitiveWire.delete(ids); } catch (e) { delWire = 'ERR:' + String(e).slice(0, 120); }
    if (delWire === false) {
      delWire = { ok: false, fallback: [] };
      for (const id of ids) {
        try { const one = await eda.sch_PrimitiveWire.delete(id); delWire.fallback.push({ id, ok: one }); }
        catch (e) { delWire.fallback.push({ id, err: String(e).slice(0, 80) }); }
      }
    }
  }
  out.schDel = { comps: delComp, wires: delWire };
  await sleep(600);
  await eda.sch_Document.save();
  await sleep(800);

  // --- PCB：测试区（x>=900）的 component / via / line ---
  await eda.dmt_EditorControl.openDocument('13a43dcf22b6b1b0');
  await sleep(1200);
  const pcbComps = await eda.pcb_PrimitiveComponent.getAll();
  const vias = await eda.pcb_PrimitiveVia.getAll();
  const lines = await eda.pcb_PrimitiveLine.getAll();
  const testPcb = {
    comps: (pcbComps || []).filter(c => c.getState_X() >= 900).map(c => ({ id: c.getState_PrimitiveId(), d: c.getState_Designator ? c.getState_Designator() : '', x: c.getState_X(), y: c.getState_Y() })),
    vias: (vias || []).filter(v => v.getState_X() >= 900).map(v => ({ id: v.getState_PrimitiveId(), net: v.getState_Net(), x: v.getState_X() })),
    lines: (lines || []).filter(l => l.getState_StartX() >= 900 || l.getState_EndX() >= 900).map(l => ({ id: l.getState_PrimitiveId(), net: l.getState_Net() })),
  };
  out.pcbList = testPcb;
  const del = async (api, list) => {
    if (!list.length) return true;
    const ids = list.map(x => x.id);
    try {
      const r = await eda[api].delete(ids);
      if (r === true) return true;
      // fallback one-by-one
      let ok = 0;
      for (const id of ids) { try { if (await eda[api].delete(id)) ok++; } catch { /* ignore */ } }
      return { fallback: ok + '/' + ids.length };
    } catch (e) { return 'ERR:' + String(e).slice(0, 120); }
  };
  out.pcbDel = {
    comps: await del('pcb_PrimitiveComponent', testPcb.comps),
    vias: await del('pcb_PrimitiveVia', testPcb.vias),
    lines: await del('pcb_PrimitiveLine', testPcb.lines),
  };
  await sleep(600);
  await eda.pcb_Document.save();
  await sleep(800);

  // --- 复验 ---
  const compsA = await eda.sch_PrimitiveComponent.getAll();
  const wiresA = await eda.sch_PrimitiveWire.getAll();
  const pcbCompsA = await eda.pcb_PrimitiveComponent.getAll();
  const viasA = await eda.pcb_PrimitiveVia.getAll();
  const linesA = await eda.pcb_PrimitiveLine.getAll();
  out.after = {
    schComps: (compsA || []).length, schWires: (wiresA || []).length,
    schCompsLeft: (compsA || []).map(c => ({ d: c.getState_Designator ? c.getState_Designator() : '', t: c.getState_ComponentType ? c.getState_ComponentType() : '', x: c.getState_X() })),
    pcbComps: (pcbCompsA || []).length, pcbVias: (viasA || []).length, pcbLines: (linesA || []).length,
  };
  await eda.dmt_EditorControl.openDocument('2dd115fe3f36aaaa');
  return out;
})();`

const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code }),
  signal: AbortSignal.timeout(120000),
})
console.log('HTTP', res.status)
console.log((await res.text()).slice(0, 6000))
