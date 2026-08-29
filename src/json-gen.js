// ============================================================================
// dsh-lichuang-eda · 第一版「嘉立创 EDA 标准版 (EasyEDA Standard) 原理图 JSON」生成器
// ============================================================================
// 纯 ESM、零 npm 依赖。可直接 `node src/json-gen.js` 运行 main()，
// 生成 src/output/demo.json（平面单片 docType=1 形式）、
// src/output/demo-project.json（docType=5 工程包装形式）与
// src/output/demo-netlist.json（网表推导 + 一致性自检结果）。
// 另导出 validateSchematic(obj) 结构 lint 与 deriveNetlist(sheet) 网表推导，
// 自动化测试见 src/json-gen.test.js（node --test，Node 自带）。
// 除 main() 使用 node:fs / node:path 外，其余函数均为纯 JS，可在浏览器复用。
//
// 格式依据（全部来自官方/真实样本，未凭空编造字段）：
//   1. easyeda/easyeda-documents 仓库 Open-File-Format/common.md、schematic.md
//      （官方开放文件格式文档：head/canvas/shape 及各 shape 前缀串格式）
//   2. docs.easyeda.com「EasyEDA Schematic File Format」「Common Information」
//   3. 真实编辑器导出样本（editorVersion 6.5.34，2023，KiCad 官方 QA 数据，
//      qa/data/pcbnew/plugins/easyeda/SCH_ESP32-PICO-D4 smart watch_2023-09-02.json）：
//      平面单片 dataStr = { head(对象), canvas, shape, BBox, colors }；
//      导线 W / 网络标签 N / 网络标志 F / 节点 J / 元件 LIB 全部位于 shape 数组。
//      （当前标准版格式没有 wire/component/net/designer 顶层数组，
//        任务描述中的这些字段名来自旧版「文件对象」格式或早期文档，见 docs/json-format.md）
// ============================================================================

// ----------------------------------------------------------------------------
// 工具
// ----------------------------------------------------------------------------

let __gid = 0
/** 生成形如 gge1/gge2 的自增 id（真实文件同样使用 gge+数字 作为普通图形 id） */
export function nextId() {
  __gid += 1
  return `gge${__gid}`
}

/** 生成 32 位十六进制 uuid（head.uuid 使用），不依赖 node:crypto，保持纯 JS 可运行 */
export function rand32Hex() {
  const chars = '0123456789abcdef'
  let s = ''
  for (let i = 0; i < 32; i++) s += chars[Math.floor(Math.random() * 16)]
  return s
}

/** 清洗文本字段，防止 ~ ` ^^ 等分隔符破坏格式 */
function sanitize(text) {
  return String(text ?? '').replace(/[~`^]/g, '_')
}

/** 数值格式化：保留最多两位小数 */
const num = (v) => String(Math.round(Number(v) * 100) / 100)

// ----------------------------------------------------------------------------
// 顶层字段构造
// ----------------------------------------------------------------------------

/**
 * head（对象形态，与真实 v6 编辑器导出逐字段一致）
 * docType "1" = 原理图单片（schematic sheet）
 */
export function makeHead(opts = {}) {
  return {
    docType: '1',
    editorVersion: opts.editorVersion || '6.5.34',
    newgId: true,
    c_para: { 'Prefix Start': '1' },
    c_spiceCmd: 'null',
    hasIdFlag: true,
    uuid: rand32Hex(),
    x: '0',
    y: '0',
    portOfADImportHack: '',
    importFlag: 0,
    transformList: '',
  }
}

/**
 * canvas 串：CA~视宽~视高~背景~网格可见~网格色~网格大小~画布宽~画布高~网格样式~吸附~单位~ALT吸附~原点x~原点y
 * 与真实样本格式一致（15 段）。
 */
export function makeCanvas(width = 1200, height = 800, grid = 10) {
  return [
    'CA', width, height, '#FFFFFF', 'yes', '#CCCCCC', grid,
    width, height, 'line', grid, 'pixel', 5, 0, 0,
  ].join('~')
}

// ----------------------------------------------------------------------------
// shape 前缀串构造（v6 形态，均带尾部 ~0 锁定字段，与真实导出一致）
// ----------------------------------------------------------------------------

/**
 * 导线：W~x1 y1 x2 y2 …~颜色~线宽~线型~填充~id~locked
 * points 为扁平坐标数组 [x1,y1,x2,y2,…]（与 design.wires 一致）
 */
export function wireShape(points, opts = {}) {
  const id = opts.id || nextId()
  const pts = []
  for (let i = 0; i < points.length; i += 2) {
    pts.push(`${num(points[i])} ${num(points[i + 1])}`)
  }
  return `W~${pts.join(' ')}~${opts.color || '#0099FF'}~${opts.width ?? 1}~0~none~${id}~0`
}

/** 网络标签：N~x~y~旋转~颜色~名称~id~对齐~文本x~文本y~字体~字号~locked */
export function netlabelShape(x, y, name, opts = {}) {
  const id = opts.id || nextId()
  return (
    `N~${num(x)}~${num(y)}~0~${opts.color || '#880000'}~${sanitize(name)}~${id}` +
    `~start~${num(x + 2)}~${num(y - 2.5)}~Times New Roman~7pt~0`
  )
}

/** 节点（连接点圆点）：J~x~y~半径~颜色~id~locked */
export function junctionShape(x, y, opts = {}) {
  const id = opts.id || nextId()
  return `J~${num(x)}~${num(y)}~2.5~${opts.color || '#CC0000'}~${id}~0`
}

/**
 * 网络标志（电源符号），内置 GND 接地标志（part_netLabel_gnD，与真实样本相同的
 * 图形：竖线 + 4 条渐短横线，画在 pin dot 上方；文本画在下方）。
 * F~partid~x~y~旋转~id~~locked^^pinDotX~pinDotY^^名称~色~文本x~文本y~旋转~对齐~可见~字体~字号~flagId^^PL~…(图形)
 */
export function netflagShape(x, y, name = 'GND', opts = {}) {
  const id = opts.id || nextId()
  const dx = Number(x)
  const dy = Number(y)
  // 图形段：竖线（dot 上方 10px）与 4 条横线（逐级收窄），与真实 GND 标志一致
  const lines = [
    `PL~${num(dx)} ${num(dy - 10)} ${num(dx)} ${num(dy)}~#000000~1~0~transparent~${id}_p1~0`,
    `PL~${num(dx - 9)} ${num(dy - 10)} ${num(dx + 9)} ${num(dy - 10)}~#000000~1~0~transparent~${id}_p2~0`,
    `PL~${num(dx - 6)} ${num(dy - 12)} ${num(dx + 6)} ${num(dy - 12)}~#000000~1~0~transparent~${id}_p3~0`,
    `PL~${num(dx - 3)} ${num(dy - 14)} ${num(dx + 3)} ${num(dy - 14)}~#000000~1~0~transparent~${id}_p4~0`,
    `PL~${num(dx - 1)} ${num(dy - 16)} ${num(dx + 1)} ${num(dy - 16)}~#000000~1~0~transparent~${id}_p5~0`,
  ]
  const mark =
    `${sanitize(name)}~#000000~${num(dx - 13)}~${num(dy + 26)}~0~start~1~Times New Roman~9pt~flag_${id}`
  return [
    `F~part_netLabel_gnD~${num(dx)}~${num(dy)}~0~${id}~~0`,
    `${num(dx)}~${num(dy)}`,
    mark,
    ...lines,
  ].join('^^')
}

/**
 * 引脚（元件符号内）：P~show~电气类型~spice引脚号~x~y~旋转~id~locked
 *   ^^ 引脚点 x~y
 *   ^^ 引脚线 path~颜色
 *   ^^ 名称（可见~x~y~旋转~名称~对齐~字体~字号~颜色）
 *   ^^ 编号（同上）
 *   ^^ 圆点（可见~x~y）
 *   ^^ 时钟符号（可见~path）
 * 与真实 v6 引脚串逐段一致。rotation: 0=朝右, 180=朝左（引脚点在外侧）。
 */
export function pinShape({ x, y, rotation = 0, number = 1, name = '', id, pinLength = 20, color = '#880000' }) {
  const px = Number(x)
  const py = Number(y)
  let path
  if (rotation === 0) path = `M ${num(px - pinLength)} ${num(py)} h ${pinLength}`
  else if (rotation === 180) path = `M ${num(px + pinLength)} ${num(py)} h -${pinLength}`
  else if (rotation === 90) path = `M ${num(px)} ${num(py - pinLength)} v ${pinLength}`
  else if (rotation === 270) path = `M ${num(px)} ${num(py + pinLength)} v -${pinLength}`
  else throw new Error(`pinShape: 不支持的旋转 ${rotation}`)

  const nameVisible = name ? 1 : 0
  const nameX = rotation === 0 ? px - 14 : px + 14
  const numX = rotation === 0 ? px - 6 : px + 6
  // 名称/编号文本：可见~x~y~旋转~文本~对齐~字体~字号~颜色（v6 尾部带颜色）
  const nameSec =
    `${nameVisible}~${num(nameX)}~${num(py - 4)}~0~${sanitize(name) || number}~start~~~#000000`
  const numSec = `0~${num(numX)}~${num(py - 4)}~0~${number}~end~~~#000000`
  // 圆点与时钟（隐藏装饰，结构与真实样本一致）
  const dotX = rotation === 0 ? px + 13 : px - 13
  const clockDir = rotation === 0 ? -1 : 1
  const cx = px + clockDir * 3
  const clockSec = `0~M ${num(cx)} ${num(py - 3)} L ${num(cx + clockDir * 3)} ${num(py)} L ${num(cx)} ${num(py + 3)}`
  return [
    `P~show~0~${number}~${num(px)}~${num(py)}~${rotation}~${id}~0`,
    `${num(px)}~${num(py)}`,
    `${path}~${color}`,
    nameSec,
    numSec,
    `0~${num(dotX)}~${num(py)}`,
    clockSec,
  ].join('^^')
}

/** 折线（符号内图形）：PL~x1 y1 x2 y2 …~颜色~线宽~线型~填充~id~locked */
export function polylineShape(points, opts = {}) {
  const id = opts.id || nextId()
  const pts = points.map((p) => `${num(p[0])} ${num(p[1])}`).join(' ')
  return `PL~${pts}~${opts.color || '#A00000'}~1~0~none~${id}~0`
}

/** 矩形（符号内图形/标注）：R~x~y~rx~ry~宽~高~描边色~线宽~线型~填充~id~locked~ */
export function rectShape(x, y, w, h, opts = {}) {
  const id = opts.id || nextId()
  return `R~${num(x)}~${num(y)}~~~${num(w)}~${num(h)}~${opts.color || '#000000'}~1~0~none~${id}~0~`
}

/** 文本（元件内 T~N=值 / T~P=位号；画布上 T~L=标注） */
export function textShape(mark, x, y, text, opts = {}) {
  const id = opts.id || nextId()
  return (
    `T~${mark}~${num(x)}~${num(y)}~0~#000080~Arial~~~~~comment~${sanitize(text)}` +
    `~1~start~${id}~0~pinpart`
  )
}

// ----------------------------------------------------------------------------
// 元件符号（LIB 条目）构造
// ----------------------------------------------------------------------------

/**
 * 电阻符号（两脚，水平）：本体矩形 60×20，脚长 20，引脚间距 100；
 * 位号在上、值在下。返回完整 LIB 串。
 * LIB 头字段（按官方文档与真实样本交集）：
 *   LIB~x~y~c_para(反引号键值对)~旋转~importFlag~id
 * 子图形以 #@$ 连接。
 */
export function buildResistorLib(center, value, designator, opts = {}) {
  const cx = Number(center.x)
  const cy = Number(center.y)
  const pinLength = 20
  const pin1x = cx + 50 // 右侧脚（旋转 0，引脚点朝外）
  const pin2x = cx - 50 // 左侧脚（旋转 180）
  const body = rectShape(cx - 30, cy - 10, 60, 20, { color: '#000000' })
  const p1 = pinShape({ x: pin1x, y: cy, rotation: 0, number: 1, name: '1', id: nextId(), pinLength, color: '#880000' })
  const p2 = pinShape({ x: pin2x, y: cy, rotation: 180, number: 2, name: '2', id: nextId(), pinLength, color: '#880000' })
  const tValue = textShape('N', cx, cy + 26, value || '?')
  const tRef = textShape('P', cx, cy - 26, designator)
  const cPara =
    `package\`NONE\`nameAlias\`Value\`Value\`${sanitize(value || '?')}\`spicePre\`R\`spiceSymbolName\`resistor\``
  const children = [tRef, tValue, body, p1, p2]
  return `LIB~${num(cx)}~${num(cy)}~${cPara}~0~0~${nextId()}#@$` + children.join('#@$')
}

/**
 * LED 符号（两脚，水平，阳极朝右）：三角形 + 阴极竖线，阳极脚在右（旋转 0），
 * 阴极脚在左（旋转 180）。位号在上、值在下。
 */
export function buildLedLib(center, value, designator, opts = {}) {
  const cx = Number(center.x)
  const cy = Number(center.y)
  const pinLength = 20
  const anodeX = cx + 40 // 阳极（右）
  const cathodeX = cx - 40 // 阴极（左）
  // 三角形：底边在左 (cx-20)，顶点在右 (cx+20)，闭合
  const tri = polylineShape(
    [
      [cx - 20, cy - 10],
      [cx + 20, cy],
      [cx - 20, cy + 10],
      [cx - 20, cy - 10],
    ],
    { color: '#A00000' },
  )
  // 阴极竖线（三角形底边左侧）
  const bar = polylineShape(
    [
      [cx - 25, cy - 8],
      [cx - 25, cy + 8],
    ],
    { color: '#A00000' },
  )
  const p1 = pinShape({ x: anodeX, y: cy, rotation: 0, number: 1, name: 'A', id: nextId(), pinLength, color: '#880000' })
  const p2 = pinShape({ x: cathodeX, y: cy, rotation: 180, number: 2, name: 'K', id: nextId(), pinLength, color: '#880000' })
  const tValue = textShape('N', cx, cy + 26, value || 'LED')
  const tRef = textShape('P', cx, cy - 26, designator)
  const cPara =
    `package\`NONE\`nameAlias\`Value\`Value\`${sanitize(value || 'LED')}\`spicePre\`D\`spiceSymbolName\`led\``
  const children = [tRef, tValue, tri, bar, p1, p2]
  return `LIB~${num(cx)}~${num(cy)}~${cPara}~0~0~${nextId()}#@$` + children.join('#@$')
}

/** 类型 → 符号构造器 */
const SYMBOL_BUILDERS = {
  resistor: buildResistorLib,
  led: buildLedLib,
}

// ----------------------------------------------------------------------------
// 顶层生成入口
// ----------------------------------------------------------------------------

/**
 * 生成一份符合嘉立创 EDA 标准版（EasyEDA Standard v6）格式的平面单片原理图对象。
 *
 * design 形如：
 * {
 *   name: 'demo',
 *   components: [ { ref:'R1', type:'resistor', value:'10k', pos:{x:400,y:300} }, ... ],
 *   wires:     [ [x1,y1,x2,y2, ...], ... ],   // 折线坐标（须与引脚点/网络点重合才连通）
 *   nets:      [ { name:'5V',  points:[[x,y],...] }, ... ],  // GND 名 → 接地标志，其余 → 网络标签
 * }
 *
 * 返回对象：{ head, canvas, shape, BBox, colors }（与真实 v6 平面单片逐键一致）。
 */
export function generateSchematic(design = {}) {
  const d = design
  const components = d.components || []
  const wires = d.wires || []
  const nets = d.nets || []

  const shape = []
  const allCoords = []

  // 1) 元件（LIB 条目）
  for (const comp of components) {
    const builder = SYMBOL_BUILDERS[comp.type]
    if (!builder) {
      throw new Error(
        `generateSchematic: 不支持的元件类型 "${comp.type}"（可选：${Object.keys(SYMBOL_BUILDERS).join(', ')}）`,
      )
    }
    shape.push(builder(comp.pos, comp.value, comp.ref))
    allCoords.push([comp.pos.x, comp.pos.y])
  }

  // 2) 导线
  for (const w of wires) {
    shape.push(wireShape(w))
    for (let i = 0; i < w.length; i += 2) allCoords.push([w[i], w[i + 1]])
  }

  // 3) 网络（网络标签 / 接地标志）
  for (const net of nets) {
    for (const [nx, ny] of net.points) {
      shape.push(
        net.name === 'GND' ? netflagShape(nx, ny, 'GND') : netlabelShape(nx, ny, net.name),
      )
      allCoords.push([nx, ny])
    }
  }

  // BBox：按内容坐标外扩 60
  const xs = allCoords.map((p) => p[0])
  const ys = allCoords.map((p) => p[1])
  const minX = Math.min(...xs) - 60
  const minY = Math.min(...ys) - 60
  const maxX = Math.max(...xs) + 60
  const maxY = Math.max(...ys) + 60
  const BBox = { x: minX, y: minY, width: maxX - minX, height: maxY - minY }

  return {
    head: makeHead(),
    canvas: makeCanvas(1200, 800, 10),
    shape,
    BBox,
    colors: {},
  }
}

/**
 * 将平面单片包装为 docType=5 的工程导出形式（与真实编辑器导出
 * SCH_*.json 的结构完全一致：editorVersion/docType/title/description/colors/schematics）。
 */
export function wrapAsProject(sheet, meta = {}) {
  return {
    editorVersion: (sheet.head && sheet.head.editorVersion) || '6.5.34',
    docType: 5,
    title: meta.title || 'demo',
    description: meta.description || '',
    colors: sheet.colors || {},
    schematics: [
      {
        docType: '1',
        title: meta.title || 'Sheet_1',
        description: meta.description || '',
        dataStr: sheet,
      },
    ],
  }
}

// ----------------------------------------------------------------------------
// 网表推导与一致性自检（从生成的 sheet 反推网络表，验证电路是否闭合）
// ----------------------------------------------------------------------------

const round2 = (v) => Math.round(Number(v) * 100) / 100

/**
 * 从原理图对象（shape 数组）推导网表并做一致性检查。
 *
 * 解析：LIB（元件位号 T~P + 引脚 P^^ 引脚点）、W（导线折线）、N（网络标签）、
 *       F（网络标志，如 GND）、J（节点）。
 * 以坐标点（四舍五入到 0.01）为节点、导线线段为边做连通图，每个连通分量 = 一个网络。
 *
 * 一致性规则（与 docs/json-format.md §7.3 一致）：
 *   1. 悬空导线端点：导线端点若不与任何其他导线、引脚点、标签、节点重合 → 报错；
 *   2. 孤立导线：某导线所在连通分量没有任何引脚/标签 → 报错；
 *   3. 未闭合网络：无标签网络必须 ≥2 个引脚（1 个引脚 = 悬空引脚/断开连接）→ 报错；
 *      有标签网络（如 5V/GND 电源标签）允许 1 个引脚（标签表示外部连接）；
 *   4. 同名标签冲突：同一网络含多个不同名称的标签 → 报错；
 *   5. 位号重复 → 报错。
 *
 * @param {object} sheet generateSchematic() 的输出（或任意符合格式的 sheet）
 * @returns {{ components:Array, nets:Array, checks:{ok:boolean, errors:string[], warnings:string[]} }}
 */
export function deriveNetlist(sheet) {
  const errors = []
  const warnings = []
  const shape = Array.isArray(sheet && sheet.shape) ? sheet.shape : []
  const keyOf = (x, y) => `${round2(x)},${round2(y)}`

  // ---- 1) 解析 ----
  const comps = [] // { designator, pins:[{number,key}] }
  const wires = [] // [{ keys:[...] }]
  const labels = [] // [{ name, key }]
  const junctions = [] // [key]

  for (const s of shape) {
    if (typeof s !== 'string') continue
    const cmd = s.split('~')[0]
    if (cmd === 'LIB') {
      const [head, ...children] = s.split('#@$')
      const hf = head.split('~')
      let designator = null
      const pins = []
      for (const c of children) {
        if (c.startsWith('T~P')) designator = c.split('~')[12] || null
        else if (c.startsWith('P~')) {
          const secs = c.split('^^')
          const h = secs[0].split('~')
          const dot = secs[1] ? secs[1].split('~') : []
          if (dot.length >= 2) pins.push({ number: h[3], key: keyOf(dot[0], dot[1]) })
        }
      }
      comps.push({ designator: designator || `U${comps.length + 1}`, pins, x: Number(hf[1]), y: Number(hf[2]) })
    } else if (cmd === 'W') {
      const pts = String(s.split('~')[1] || '').trim().split(/\s+/).map(Number)
      const keys = []
      for (let i = 0; i + 1 < pts.length; i += 2) keys.push(keyOf(pts[i], pts[i + 1]))
      if (keys.length >= 2) wires.push({ keys })
    } else if (cmd === 'N') {
      const f = s.split('~')
      labels.push({ name: f[5], key: keyOf(f[1], f[2]) })
    } else if (cmd === 'F') {
      const secs = s.split('^^')
      const dot = secs[1] ? secs[1].split('~') : []
      const mark = secs[2] ? secs[2].split('~') : []
      if (dot.length >= 2 && mark.length >= 1) {
        labels.push({ name: mark[0], key: keyOf(dot[0], dot[1]) })
      }
    } else if (cmd === 'J') {
      const f = s.split('~')
      junctions.push(keyOf(f[1], f[2]))
    }
  }

  // ---- 2) 位号唯一性 ----
  const seenDesignators = new Set()
  for (const c of comps) {
    if (seenDesignators.has(c.designator)) errors.push(`位号重复: ${c.designator}`)
    seenDesignators.add(c.designator)
  }

  // ---- 3) 建图 ----
  const adj = new Map() // key -> Set(key)
  const segCount = new Map() // key -> 作为线段端点的次数
  const pinAt = new Map() // key -> [{designator, number}]
  const labelAt = new Map() // key -> name
  const wireVertices = new Set()

  const bump = (m, k) => m.set(k, (m.get(k) || 0) + 1)
  const link = (a, b) => {
    if (a === b) return
    if (!adj.has(a)) adj.set(a, new Set())
    if (!adj.has(b)) adj.set(b, new Set())
    adj.get(a).add(b)
    adj.get(b).add(a)
    bump(segCount, a)
    bump(segCount, b)
  }

  for (const w of wires) {
    for (const k of w.keys) wireVertices.add(k)
    for (let i = 0; i + 1 < w.keys.length; i++) link(w.keys[i], w.keys[i + 1])
  }
  for (const c of comps) {
    for (const p of c.pins) {
      const arr = pinAt.get(p.key) || []
      arr.push({ designator: c.designator, number: p.number })
      pinAt.set(p.key, arr)
    }
  }
  for (const l of labels) labelAt.set(l.key, l.name)

  // ---- 4) 悬空导线端点 ----
  for (const w of wires) {
    for (const k of w.keys) {
      const touching =
        (segCount.get(k) || 0) >= 2 || pinAt.has(k) || labelAt.has(k) || junctions.includes(k)
      if (!touching) errors.push(`悬空导线端点: (${k.replace(',', ', ')})`)
    }
  }

  // ---- 5) 连通分量 → 网络 ----
  const visited = new Set()
  const allNodes = new Set([...adj.keys(), ...pinAt.keys(), ...labelAt.keys()])
  const nets = []
  let unnamedSeq = 0
  for (const start of allNodes) {
    if (visited.has(start)) continue
    const stack = [start]
    visited.add(start)
    const nodes = new Set()
    while (stack.length) {
      const n = stack.pop()
      nodes.add(n)
      for (const m of adj.get(n) || []) {
        if (!visited.has(m)) {
          visited.add(m)
          stack.push(m)
        }
      }
    }
    const pins = []
    for (const n of nodes) for (const p of pinAt.get(n) || []) pins.push(p)
    const lab = []
    for (const n of nodes) if (labelAt.has(n)) lab.push(labelAt.get(n))
    const uniqueLabs = [...new Set(lab)]
    const netIssues = []
    if (uniqueLabs.length > 1) {
      netIssues.push(`同一网络含多个不同名称的标签: ${uniqueLabs.join(' / ')}`)
    }
    if (uniqueLabs.length >= 1) {
      if (pins.length < 1) netIssues.push(`网络 ${uniqueLabs[0]}（标签）没有任何引脚`)
    } else {
      unnamedSeq += 1
      if (pins.length < 2) {
        const desc = pins.map((p) => `${p.designator} 引脚 ${p.number}`).join(', ')
        netIssues.push(
          `网络 Net${unnamedSeq} 未闭合：只有 ${pins.length} 个引脚且无网络标签（${desc || '无引脚'}）`,
        )
      }
    }
    // 孤立导线：该分量有导线顶点但没有任何引脚/标签
    const hasWireVertex = [...nodes].some((n) => wireVertices.has(n))
    if (hasWireVertex && pins.length === 0 && uniqueLabs.length === 0) {
      netIssues.push(`孤立导线：导线未连接任何元件引脚或标签`)
    }
    errors.push(...netIssues)
    const name = uniqueLabs[0] || `Net${unnamedSeq}`
    const sorted = [...pins].sort((a, b) => (a.designator < b.designator ? -1 : a.designator > b.designator ? 1 : Number(a.number) - Number(b.number)))
    nets.push({
      name,
      label: uniqueLabs[0] || null,
      pins: sorted,
      wireVertices: [...nodes].filter((n) => wireVertices.has(n)).length,
      closed: netIssues.length === 0,
    })
  }

  // 有引脚但整个图里没有任何导线/标签时也要能体现（上面已覆盖：无标签+1 引脚 → 未闭合）

  return {
    components: comps.map((c) => ({
      designator: c.designator,
      pins: c.pins.map((p) => ({ number: p.number })),
    })),
    nets,
    checks: { ok: errors.length === 0, errors, warnings },
  }
}

// ----------------------------------------------------------------------------
// 结构 lint：validateSchematic(obj) → { ok, errors[] }
// 检查顶层/必需字段与字段类型（对齐 docs/json-format.md §2~§5 确认的结构）
// ----------------------------------------------------------------------------

const KNOWN_SHAPE_PREFIXES = new Set([
  'LIB', 'W', 'N', 'F', 'J', 'T', 'PL', 'PG', 'PT', 'R', 'E', 'C', 'I', 'B', 'BE', 'O', 'A', 'AR', 'P',
])

// 各前缀的“段数”（~ 分隔），v6 形态（含尾部 locked 字段），依据真实样本
const SHAPE_FIELD_COUNTS = { W: 8, N: 13, J: 6, T: 18, R: 14, PL: 8, O: 7, E: 11, C: 9, I: 8, A: 8, AR: 8, PG: 7, PT: 7, B: 7, BE: 7 }

// 各前缀主 id 所在段下标（用于唯一性检查）
const ID_IDX = { W: 6, N: 6, J: 5, F: 5, T: 15, PL: 6, R: 11, E: 9, O: 3, P: 7, LIB: 6 }

function idOfShapeString(s) {
  const cmd = s.split('~')[0]
  const idx = ID_IDX[cmd]
  if (idx === undefined) return null
  return s.split('~')[idx] || null
}

/**
 * 结构 lint：校验顶层字段、head 各字段、canvas 段数、shape 条目的前缀/段数/坐标、
 * BBox、colors，以及全文件 id 唯一性。
 * @param {unknown} obj 待校验对象
 * @returns {{ ok: boolean, errors: string[] }}
 */
export function validateSchematic(obj) {
  const errors = []
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    return { ok: false, errors: ['顶层必须是 JSON 对象'] }
  }

  // ---- 顶层键 ----
  const keys = Object.keys(obj).sort()
  const expected = ['BBox', 'canvas', 'colors', 'head', 'shape']
  if (keys.join(',') !== expected.join(',')) {
    errors.push(`顶层键必须恰为 ${expected.join(',')}（当前: ${keys.join(',') || '空'}）`)
  }

  // ---- head ----
  const h = obj.head
  if (!h || typeof h !== 'object' || Array.isArray(h)) {
    errors.push('head 必须是对象')
  } else {
    const reqHead = {
      docType: 'string',
      editorVersion: 'string',
      newgId: 'boolean',
      c_para: 'object',
      c_spiceCmd: 'string',
      hasIdFlag: 'boolean',
      uuid: 'string',
      x: 'string',
      y: 'string',
      portOfADImportHack: 'string',
      importFlag: 'number',
      transformList: 'string',
    }
    for (const [k, t] of Object.entries(reqHead)) {
      if (!(k in h)) errors.push(`head 缺少必需字段 ${k}`)
      else if (typeof h[k] !== t) errors.push(`head.${k} 类型应为 ${t}，实际 ${typeof h[k]}`)
    }
    if (typeof h.docType === 'string' && h.docType !== '1') {
      errors.push(`head.docType 应为 "1"（原理图单片），实际 "${h.docType}"`)
    }
    if (typeof h.uuid === 'string' && !/^[0-9a-f]{32}$/.test(h.uuid)) {
      errors.push('head.uuid 应为 32 位十六进制字符串')
    }
  }

  // ---- canvas ----
  if (typeof obj.canvas !== 'string') {
    errors.push('canvas 必须是字符串')
  } else {
    const f = obj.canvas.split('~')
    if (f[0] !== 'CA') errors.push('canvas 必须以 "CA" 开头')
    if (f.length !== 15) errors.push(`canvas 应为 15 段，实际 ${f.length} 段`)
    else if (f[11] !== 'pixel') errors.push('canvas 第 12 段（单位）应为 pixel')
  }

  // ---- shape ----
  if (!Array.isArray(obj.shape)) {
    errors.push('shape 必须是数组')
  } else {
    if (obj.shape.length === 0) errors.push('shape 不能为空')
    const allIds = []
    for (let i = 0; i < obj.shape.length; i++) {
      const s = obj.shape[i]
      if (typeof s !== 'string' || s.length === 0) {
        errors.push(`shape[${i}] 应为非空字符串`)
        continue
      }
      const cmd = s.split('~')[0]
      if (!KNOWN_SHAPE_PREFIXES.has(cmd)) errors.push(`shape[${i}] 未知前缀 "${cmd}"`)
      if (s.includes('NaN')) errors.push(`shape[${i}] 含 NaN 坐标`)
      const n = s.split('~').length
      const expect = SHAPE_FIELD_COUNTS[cmd]
      if (expect && n !== expect) errors.push(`shape[${i}] ${cmd} 应为 ${expect} 段，实际 ${n} 段`)
      if (cmd === 'F' && n < 8) errors.push(`shape[${i}] F 头应 ≥8 段`)
      if (cmd === 'LIB') {
        if (!s.includes('#@$')) errors.push(`shape[${i}] LIB 缺少 #@$ 子图形连接符`)
        else if (n < 7) errors.push(`shape[${i}] LIB 头应 ≥7 段`)
      }
      const id = idOfShapeString(s)
      if (id) allIds.push(id)
      // LIB 子图形 id（T/R/PL/P 等）
      if (cmd === 'LIB') {
        for (const c of s.split('#@$')) {
          const cid = idOfShapeString(c)
          if (cid) allIds.push(cid)
        }
      }
    }
    const seen = new Set()
    const dups = []
    for (const id of allIds) {
      if (seen.has(id) && !dups.includes(id)) dups.push(id)
      seen.add(id)
    }
    if (dups.length) errors.push(`存在重复 id: ${dups.join(', ')}`)
  }

  // ---- BBox ----
  const b = obj.BBox
  if (!b || typeof b !== 'object' || Array.isArray(b)) {
    errors.push('BBox 必须是对象')
  } else {
    for (const k of ['x', 'y', 'width', 'height']) {
      if (typeof b[k] !== 'number' || !Number.isFinite(b[k])) {
        errors.push(`BBox.${k} 应为有限数字`)
      }
    }
  }

  // ---- colors ----
  if (!obj.colors || typeof obj.colors !== 'object' || Array.isArray(obj.colors)) {
    errors.push('colors 应为对象（可为空对象）')
  }

  return { ok: errors.length === 0, errors }
}

// ----------------------------------------------------------------------------
// 内置示例电路：R1(10k) + LED1 串联，5V → R1 → LED → GND
// ----------------------------------------------------------------------------

export const DEFAULT_DESIGN = {
  name: 'demo',
  components: [
    { ref: 'R1', type: 'resistor', value: '10k', pos: { x: 400, y: 300 } },
    { ref: 'LED1', type: 'led', value: 'red', pos: { x: 700, y: 300 } },
  ],
  // R1 右引脚 (450,300) → 向下 → 向右 → 向上 → LED1 阳极 (740,300)，绕开元件本体
  wires: [[450, 300, 450, 380, 740, 380, 740, 300]],
  nets: [
    { name: '5V', points: [[350, 300]] }, // R1 左引脚 (350,300)
    { name: 'GND', points: [[660, 300]] }, // LED1 阴极引脚 (660,300)
  ],
}

// ----------------------------------------------------------------------------
// 直接运行：node src/json-gen.js → 写出 src/output/demo.json 与 demo-project.json
// ----------------------------------------------------------------------------

export async function main() {
  const fs = await import('node:fs')
  const path = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const __dirname = fileURLToPath(new URL('.', import.meta.url))
  const outDir = path.join(__dirname, 'output')
  fs.mkdirSync(outDir, { recursive: true })

  const sheet = generateSchematic(DEFAULT_DESIGN)
  const demoPath = path.join(outDir, 'demo.json')
  const projPath = path.join(outDir, 'demo-project.json')
  const nlPath = path.join(outDir, 'demo-netlist.json')
  fs.writeFileSync(demoPath, JSON.stringify(sheet, null, 2) + '\n', 'utf8')
  fs.writeFileSync(projPath, JSON.stringify(wrapAsProject(sheet, { title: 'demo' }), null, 2) + '\n', 'utf8')

  // 网表推导 + 一致性自检
  const netlist = deriveNetlist(sheet)
  fs.writeFileSync(
    nlPath,
    JSON.stringify({ source: 'demo.json', generatedBy: 'dsh-lichuang-eda json-gen.js deriveNetlist', ...netlist }, null, 2) + '\n',
    'utf8',
  )

  // 自检：JSON.parse 往返 + 结构断言 + 网表
  const round = JSON.parse(JSON.stringify(sheet))
  const shapePrefixes = {}
  for (const s of round.shape) {
    const p = s.split('~')[0]
    shapePrefixes[p] = (shapePrefixes[p] || 0) + 1
  }
  const ok =
    round.head.docType === '1' &&
    typeof round.canvas === 'string' &&
    round.canvas.startsWith('CA~') &&
    Array.isArray(round.shape) &&
    round.shape.length > 0 &&
    round.BBox &&
    typeof round.colors === 'object'

  console.log(`[json-gen] 已生成: ${demoPath}`)
  console.log(`[json-gen] 已生成: ${projPath}`)
  console.log(`[json-gen] 已生成: ${nlPath}`)
  console.log(`[json-gen] shape 条目数: ${sheet.shape.length}，前缀分布: ${JSON.stringify(shapePrefixes)}`)
  console.log(`[json-gen] 网表: ${netlist.nets.length} 个网络 (${netlist.nets.map((n) => `${n.name}[${n.pins.length}脚]`).join(', ')})，一致性自检: ${netlist.checks.ok ? '通过' : '失败'}`)
  console.log(`[json-gen] 结构自检(JSON.parse 往返+顶层键): ${ok ? '通过' : '失败'}`)
  return { demoPath, projPath, nlPath, shapeCount: sheet.shape.length, netlist, ok }
}

// 入口检测：node src/json-gen.js 直接运行
const isMain =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  (process.argv[1].endsWith('src/json-gen.js') || process.argv[1].endsWith('json-gen.js'))
if (isMain) {
  await main()
}
