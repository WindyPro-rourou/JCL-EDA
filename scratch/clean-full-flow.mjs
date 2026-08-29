// Dev: 盘点并清理第一次全流程测试留下的内容（只删我们放的；用户原有内容不动）。
// 步骤：P1 getAll(components/wires) → 按位置/designator 精确匹配 → delete →
// PCB getAll(components/vias) → 匹配 LED1/U2 与已知过孔 → delete → 双保存 → 复验。
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'

const code = `return await (async () => {
  const out = {};
  const sleep = (ms) => new Promise(r => setTimeout(r, ms));

  // --- 原理图 P1 ---
  await eda.dmt_EditorControl.openDocument('2dd115fe3f36aaaa');
  await sleep(1200);
  const comps = await eda.sch_PrimitiveComponent.getAll();
  const wires = await eda.sch_PrimitiveWire.getAll();
  out.schComps = (comps || []).map(c => ({ id: c.getState_PrimitiveId(), designator: c.getState_Designator ? c.getState_Designator() : '', x: c.getState_X(), y: c.getState_Y(), type: c.getState_ComponentType && c.getState_ComponentType() }));
  out.schWires = (wires || []).map(w => ({ id: w.getState_PrimitiveId(), line: w.getState_Line(), net: w.getState_Net() }));

  // 删除测试内容（designator LED1 / U2 / netflag at our coords / our wires）
  const testCompIds = (comps || []).filter(c => {
    const d = (c.getState_Designator ? c.getState_Designator() : '') || '';
    const ct = (c.getState_ComponentType ? c.getState_ComponentType() : '') || '';
    if (d === 'LED1' || d === 'U2') return true;
    if (ct === 'netflag') {
      const x = c.getState_X(); const y = c.getState_Y();
      if ((x === 3400 && y === 4400) || (x === 4600 && y === 4400)) return true;
    }
    return false;
  }).map(c => c.getState_PrimitiveId());
  const testWireIds = (wires || []).filter(w => {
    const x = w.getState_Line()[0]; const y = w.getState_Line()[1];
    return (x === 3400 || x === 3600 || x === 4400 || x === 4600) && (y === 4000 || y === 4400);
  }).map(w => w.getState_PrimitiveId());

  const delComp = testCompIds.length ? await eda.sch_PrimitiveComponent.delete(testCompIds) : true;
  const delWire = testWireIds.length ? await eda.sch_PrimitiveWire.delete(testWireIds) : true;
  out.schDel = { compIds: testCompIds, wireIds: testWireIds, delComp, delWire };
  await sleep(600);
  await eda.sch_Document.save();
  await sleep(800);

  // --- PCB 1 ---
  await eda.dmt_EditorControl.openDocument('13a43dcf22b6b1b0');
  await sleep(1200);
  const pcbComps = await eda.pcb_PrimitiveComponent.getAll();
  const vias = await eda.pcb_PrimitiveVia.getAll();
  out.pcbComps = (pcbComps || []).map(c => ({ id: c.getState_PrimitiveId(), designator: (c.getState_Designator ? c.getState_Designator() : '') }));
  out.pcbVias = (vias || []).map(v => ({ id: v.getState_PrimitiveId(), net: v.getState_Net(), x: v.getState_X(), y: v.getState_Y() }));

  const pcbTestIds = (pcbComps || []).filter(c => {
    const d = (c.getState_Designator ? c.getState_Designator() : '') || '';
    return d === 'LED1' || d === 'U2';
  }).map(c => c.getState_PrimitiveId());
  const viaTestIds = (vias || []).filter(v => v.getState_X() === 1000 || v.getState_X() === 2000).map(v => v.getState_PrimitiveId());
  const delPcbComp = pcbTestIds.length ? await eda.pcb_PrimitiveComponent.delete(pcbTestIds) : true;
  const delVia = viaTestIds.length ? await eda.pcb_PrimitiveVia.delete(viaTestIds) : true;
  out.pcbDel = { compIds: pcbTestIds, viaIds: viaTestIds, delPcbComp, delVia };
  await sleep(600);
  await eda.pcb_Document.save();
  await sleep(800);

  // --- 复验 ---
  await eda.dmt_EditorControl.openDocument('2dd115fe3f36aaaa');
  await sleep(1000);
  const comps2 = await eda.sch_PrimitiveComponent.getAll();
  const wires2 = await eda.sch_PrimitiveWire.getAll();
  out.afterSch = { comps: (comps2 || []).map(c => ({ d: c.getState_Designator ? c.getState_Designator() : '', t: c.getState_ComponentType ? c.getState_ComponentType() : '', x: c.getState_X(), y: c.getState_Y() })), wires: (wires2 || []).length };
  return out;
})();`

const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code }),
  signal: AbortSignal.timeout(90000),
})
console.log('HTTP', res.status)
console.log((await res.text()).slice(0, 4000))
