// Dev: 框内定位实测 —— 读页面尺寸 + 已有图元 bbox → 100 单位网格选空位 →
// 在原理图框内放置 3 个元件 → 验证 → 清理（保持画板干净）。
const PORT = process.env.EDA_BRIDGE_PORT ?? '49620'
const SLEEP = (ms) => new Promise((r) => setTimeout(r, ms))

async function execute(code, timeoutMs = 25000) {
  const res = await fetch(`http://127.0.0.1:${PORT}/execute`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ code }),
    signal: AbortSignal.timeout(timeoutMs),
  })
  const text = await res.text()
  if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 200)}` }
  let j; try { j = JSON.parse(text) } catch { j = null }
  if (j && j.success === false) return { ok: false, error: String(j.error ?? 'bridge').slice(0, 250) }
  const val = j?.result !== undefined ? j.result : text
  return { ok: true, result: typeof val === 'string' ? val : JSON.stringify(val) }
}

async function execJson(code) {
  const r = await execute(code)
  if (!r.ok) throw new Error(r.error)
  try { return JSON.parse(r.result) } catch { return r.result }
}

/** getAll-like calls are flaky on the official API — retry with backoff. */
async function execJsonRetry(code, tries = 4) {
  let last
  for (let i = 0; i < tries; i++) {
    try { return await execJson(code) } catch (e) { last = e }
    await SLEEP(800)
  }
  throw last
}

// ---------- 0) 先清理上次残留（坐标 590/790/990, y=180 的部件） ----------
const cleanup = await execJsonRetry(`return await (async () => {
  const all = await eda.sch_PrimitiveComponent.getAll();
  const arr = Array.isArray(all) ? all : [];
  const ids = arr.filter(c => { try { return c.getState_X() === 590 || c.getState_X() === 790 || c.getState_X() === 990; } catch { return false; } }).map(c => c.getState_PrimitiveId());
  if (ids.length) { try { await eda.sch_PrimitiveComponent.delete(ids); } catch (e) {} }
  return { removed: ids.length };
})();`)
console.log('预清理残留:', JSON.stringify(cleanup))
await SLEEP(800)

// ---------- 1) 页面尺寸 + 已有图元 bbox（在桥端映射方法调用） ----------
const proj = await execJson('return await eda.dmt_Project.getCurrentProjectInfo();')
const page = proj.data?.[0]?.schematic?.page?.[0]
const W = Number(page?.titleBlockData?.Width?.value ?? page?.titleBlockData?.Width ?? 1170)
const H = Number(page?.titleBlockData?.Height?.value ?? page?.titleBlockData?.Height ?? 825)
console.log(`页面: ${page?.name ?? 'P'} 尺寸 ${W} x ${H} (10mil)`)

await execJson(`return await eda.dmt_EditorControl.openDocument('${page.uuid}');`)
await SLEEP(1200)
const layout = await execJson(`return await (async () => {
  const comps = await eda.sch_PrimitiveComponent.getAll();
  const wires = await eda.sch_PrimitiveWire.getAll();
  const used = [];
  for (const c of (comps || [])) {
    try { used.push({ x: c.getState_X(), y: c.getState_Y() }); } catch (e) {}
  }
  for (const w of (wires || [])) {
    try { const l = w.getState_Line(); for (let i = 0; i + 1 < l.length; i += 2) used.push({ x: l[i], y: l[i + 1] }); } catch (e) {}
  }
  return { compCount: (comps || []).length, wireCount: (wires || []).length, used };
})();`)
const used = layout.used ?? []
console.log(`已有图元: ${layout.compCount} 元件(含网络标志), ${layout.wireCount} 导线 -> 采样点 ${used.length}`)

// ---------- 2) 网格选点（10mil 单位 · 100 网格 · 图框内边距 80 · 冲突距离 150） ----------
const MARGIN = 80      // 图框内边距
const GRID = 100
const MIN_GAP = 150    // 与已有图元的最小间距
function collides(x, y) {
  return used.some((u) => Math.abs(u.x - x) < MIN_GAP && Math.abs(u.y - y) < MIN_GAP)
}
function findSpots(count) {
  const spots = []
  let y = MARGIN + GRID
  while (spots.length < count && y <= H - MARGIN) {
    let x = W - MARGIN - GRID
    while (x >= MARGIN && spots.length < count) {
      if (!collides(x, y) && !spots.some((s) => Math.abs(s.x - x) < MIN_GAP && Math.abs(s.y - y) < MIN_GAP)) {
        spots.push({ x, y, inside: x > 0 && x < W && y > 0 && y < H })
      }
      x -= GRID
    }
    y += GRID
  }
  return spots
}
const spots = findSpots(3)
console.log('推荐点:', JSON.stringify(spots))

// ---------- 3) 框内放置 3 个元件（R / C / LED） ----------
const wants = [
  { keyword: 'R0402', label: '电阻' },
  { keyword: 'C0603', label: '电容' },
  { keyword: 'LED', label: 'LED' },
]
const placed = []
for (let i = 0; i < wants.length; i++) {
  const want = wants[i]
  const code = `return await (async () => {
    const list = await eda.lib_Device.search('${want.keyword}');
    if (!list || list.length === 0) return null;
    const c = await eda.sch_PrimitiveComponent.create(list[0], ${spots[i].x}, ${spots[i].y}, undefined, 0, false, true, true);
    if (!c) return null;
    return { id: c.getState_PrimitiveId(), name: list[0].name, designator: c.getState_Designator(), x: c.getState_X(), y: c.getState_Y() };
  })();`
  const r = await execJson(code)
  console.log(`放置 ${want.label}:`, JSON.stringify(r))
  placed.push(r)
  await SLEEP(500)
}
await execJson('return await eda.sch_Document.save();')
await SLEEP(800)

// ---------- 4) 验证：全部在图框内 + 不与用户 bbox 重叠 ----------
const check = await execJsonRetry(`return await (async () => {
  const all = await eda.sch_PrimitiveComponent.getAll();
  return (all || []).map(c => {
    try { return { id: c.getState_PrimitiveId(), d: c.getState_Designator ? c.getState_Designator() : '?', x: c.getState_X(), y: c.getState_Y() }; }
    catch (e) { return null; }
  }).filter(Boolean).filter(c => (${JSON.stringify(placed.filter(Boolean).map(p => ({ id: p.id, x: p.x, y: p.y }))) }).some(p => p.id === c.id));
})();`)
console.log('框内验证:')
for (const c of check) {
  const near = used.some((u) => Math.abs(u.x - c.x) < MIN_GAP && Math.abs(u.y - c.y) < MIN_GAP)
  console.log(`  ${c.d} @(${c.x},${c.y}) inFrame=${c.x >= 60 && c.x <= W - 60 && c.y >= 60 && c.y <= H - 60} nearUser=${near}`)
}

// ---------- 5) 清理（只删刚放的） ----------
const ids = check.map((c) => c.id)
if (ids.length) {
  const del = await execJson(`return await eda.sch_PrimitiveComponent.delete(${JSON.stringify(ids)});`)
  console.log('清理:', del)
  await execJson('return await eda.sch_Document.save();')
}
console.log('DONE')
