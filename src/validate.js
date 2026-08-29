// ============================================================================
// dsh-lichuang-eda · 结构校验 + 网表推导 + 连通性检查（供测试与插件调用）
// ============================================================================
// 纯 ESM、零 npm 依赖。基于 src/json-gen.js 的生成物与输入 design 做校验：
//   - validateSchematic(obj)   : 结构校验（顶层/head/canvas/shape/BBox/colors）
//   - deriveNetlist(design)    : 从 design（元件引脚/导线/网络）推导网表
//   - checkConnectivity(design): 连通性检查（悬空引脚 / 孤立网络 / 未闭合）
//
// 说明：支持 9 种两脚水平符号（与 json-gen.js 的 SYMBOL_BUILDERS 一致）：
//       resistor / capacitor / switch / inductor / crystal / battery / fuse
//          → 引脚间距 100（脚距 ±50，引脚1 在右 / 引脚2 在左）；
//       led / diode → 引脚间距 80（脚距 ±40，引脚1=阳极在右 / 引脚2=阴极在左）。
//       引脚几何与对应 buildXxxLib 硬编码一致（旋转 0/180）。
// ============================================================================

/** 坐标归一化为键（保留 2 位小数），用于去重/连通。 */
export function coordKey(x, y) {
  return `${Math.round(Number(x) * 100) / 100},${Math.round(Number(y) * 100) / 100}`
}

/**
 * 元件引脚点（与生成器硬编码一致）：
 *   led / diode：引脚1=阳极（右 +40），引脚2=阴极（左 -40），脚距 80；
 *   resistor / capacitor / switch / inductor / crystal / battery / fuse：引脚1（右 +50），引脚2（左 -50），脚距 100。
 * @returns {Array<{x,y,ref,pin}>}
 */
export function pinPoints(comp) {
  const cx = Number(comp.pos?.x ?? NaN)
  const cy = Number(comp.pos?.y ?? NaN)
  if (Number.isNaN(cx) || Number.isNaN(cy)) return []
  // 两脚间距 80（±40）：LED / 二极管（阳极右=引脚1，阴极左=引脚2）
  if (comp.type === 'led' || comp.type === 'diode') {
    return [
      { x: cx + 40, y: cy, ref: comp.ref, pin: 1 },
      { x: cx - 40, y: cy, ref: comp.ref, pin: 2 },
    ]
  }
  // 两脚间距 100（±50）：电阻/电容/开关/电感/晶振/电池/保险丝（引脚1 右，引脚2 左）
  if (
    comp.type === 'resistor' ||
    comp.type === 'capacitor' ||
    comp.type === 'switch' ||
    comp.type === 'inductor' ||
    comp.type === 'crystal' ||
    comp.type === 'battery' ||
    comp.type === 'fuse'
  ) {
    return [
      { x: cx + 50, y: cy, ref: comp.ref, pin: 1 },
      { x: cx - 50, y: cy, ref: comp.ref, pin: 2 },
    ]
  }
  return []
}

/** 极简 union-find。 */
function makeUnionFind(keys) {
  const parent = new Map()
  for (const k of keys) parent.set(k, k)
  const find = (x) => {
    while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x) }
    return x
  }
  const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb) }
  return { find, union }
}

/**
 * 从 design 推导网表：把导线顶点、元件引脚、网络标签/接地标志按坐标合并成
 * 连通网络。返回 { nets: [ { name, pins:[{ref,pin}], points:[coords] } ],
 *                  dangling: [ {ref,pin} ] }。
 * @param {object} design { components, wires, nets, ... }
 */
export function deriveNetlist(design = {}) {
  const components = design.components ?? []
  const wires = design.wires ?? []
  const nets = design.nets ?? []

  // 收集所有节点坐标
  const nodeKeys = new Set()
  const wireLinks = [] // [ [key,key], ... ]
  const pinList = []   // { key, ref, pin }
  const labelPoints = [] // { key, name } (network label / GND flag)

  for (const comp of components) {
    for (const p of pinPoints(comp)) {
      const k = coordKey(p.x, p.y)
      nodeKeys.add(k)
      pinList.push({ key: k, ref: comp.ref, pin: p.pin })
    }
  }
  for (const w of wires) {
    for (let i = 0; i + 1 < w.length; i += 2) {
      const a = coordKey(w[i], w[i + 1])
      const b = coordKey(w[i + 2], w[i + 3])
      nodeKeys.add(a); nodeKeys.add(b)
      wireLinks.push([a, b])
    }
  }
  for (const net of nets) {
    for (const [nx, ny] of net.points) {
      const k = coordKey(nx, ny)
      nodeKeys.add(k)
      labelPoints.push({ key: k, name: net.name })
    }
  }

  const uf = makeUnionFind([...nodeKeys])
  for (const [a, b] of wireLinks) uf.union(a, b)

  // 分组：root -> { pins:[], labels:Set, points:Set }
  const groups = new Map()
  const attach = (key) => {
    const root = uf.find(key)
    let g = groups.get(root)
    if (g === undefined) { g = { pins: [], labels: new Set(), points: new Set() }; groups.set(root, g) }
    g.points.add(key)
    return g
  }
  for (const p of pinList) { const g = attach(p.key); g.pins.push({ ref: p.ref, pin: p.pin }) }
  for (const l of labelPoints) { const g = attach(l.key); g.labels.add(l.name) }

  // 每个连通组是 1 个"物理网"；网络名 = 组内标签名（GND 优先，取首个）。
  const netsOut = []
  const dangling = []
  for (const [, g] of groups) {
    const name = g.labels.size > 0 ? [...g.labels][0] : null // 网络标签/接地名（命名网）
    netsOut.push({ name, pins: g.pins, points: [...g.points] })
    // 悬空：某引脚所在的组只有它自己这一个引脚，且没有命名标签 → 未接入任何其他元件
    if (g.pins.length === 1 && name === null) dangling.push(...g.pins)
  }
  return { nets: netsOut, dangling }
}

/**
 * 结构校验：对生成物（平面单片对象）做字段级检查。
 * @param {object} obj generateSchematic 的返回值
 * @returns {{ ok:boolean, errors:string[] }}
 */
export function validateSchematic(obj) {
  const errors = []
  if (obj === null || typeof obj !== 'object') { return { ok: false, errors: ['not an object'] } }
  const mustHave = ['head', 'canvas', 'shape', 'BBox', 'colors']
  for (const k of mustHave) if (!(k in obj)) errors.push(`missing top-level key: ${k}`)
  if (obj.head) {
    for (const k of ['docType', 'editorVersion', 'newgId', 'c_para', 'c_spiceCmd', 'hasIdFlag', 'uuid', 'x', 'y', 'portOfADImportHack', 'importFlag', 'transformList']) {
      if (!(k in obj.head)) errors.push(`missing head key: ${k}`)
    }
    if (obj.head.docType !== '1') errors.push(`head.docType expected "1", got ${obj.head.docType}`)
  }
  if (typeof obj.canvas === 'string') {
    if (!obj.canvas.startsWith('CA~')) errors.push('canvas must start with CA~')
    if (obj.canvas.split('~').length !== 15) errors.push(`canvas expected 15 segments, got ${obj.canvas.split('~').length}`)
  } else errors.push('canvas must be a string')
  if (Array.isArray(obj.shape)) {
    if (obj.shape.length === 0) errors.push('shape is empty')
  } else errors.push('shape must be an array')
  if (!('BBox' in obj) || typeof obj.BBox !== 'object') errors.push('BBox missing or not object')
  if (!('colors' in obj) || typeof obj.colors !== 'object') errors.push('colors missing or not object')
  return { ok: errors.length === 0, errors }
}

/**
 * 连通性检查：网表推导 + 悬空引脚判定。
 * @param {object} design
 * @returns {{ ok:boolean, errors:string[], netlist:{nets,dangling} }}
 */
export function checkConnectivity(design = {}) {
  const { nets, dangling } = deriveNetlist(design)
  const errors = []
  // 每个元件引脚都必须落在某一命名网，或与其它元件引脚同网（即 ≥2 脚）。
  for (const d of dangling) errors.push(`引脚 ${d.ref}.${d.pin} 悬空（未连线/未打网络标签）`)
  return { ok: errors.length === 0, errors, netlist: { nets, dangling } }
}
