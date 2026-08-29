// ============================================================================
// dsh-lichuang-eda · 自然语言 → 结构化电路设计（翻译层 v0）
// ============================================================================
// 面向 0 基础用户：把「中文需求 / 模板 ID」翻译成 json-gen.js 能消费的
// design 对象（{ name, components, wires, nets }）。
//
// v0 为规则版（模板 + 关键词匹配），生成器支持 9 种两脚水平符号：
// resistor / led / capacitor / diode / switch / inductor / crystal / battery / fuse。
// 模板与关键词命中即返回 design；其余需求如实返回 ok:false + 说明（不编造）。
// 后续接入 LLM 后可这里挂一个"语义翻译"钩子（见 TODO 注释）。
// ============================================================================

import { coordKey } from './validate.js'

/**
 * 模板目录（供 UI 卡片墙 / agent 展示）。
 * supported=false 的模板：真实生成暂不支持，但会给出解释。
 */
export const TEMPLATE_CATALOG = [
  {
    id: 'led-blink',
    ico: '💡',
    name: 'LED 点亮最小电路',
    desc: '限流电阻 + LED，5V 供电，电阻接 5V、LED 接 GND',
    supported: true,
  },
  {
    id: 'voltage-divider',
    ico: '⚡',
    name: '电阻分压（降压基准）',
    desc: '两电阻分压：5V → R1(1k) → R2(2k) → GND，中点 3.3V（近似）',
    supported: true,
  },
  {
    id: 'buck',
    ico: '🔋',
    name: '5V→3.3V 降压电路',
    desc: '专业降压需电感/稳压芯片，v0 提供电阻分压近似 + 说明',
    supported: 'approx',
  },
  {
    id: 'esp32-min',
    ico: '🛰️',
    name: 'ESP32 最小系统',
    desc: '需要主控芯片符号，v0 暂不支持该元件类型',
    supported: false,
  },
  {
    id: 'motor-drive',
    ico: '🟢',
    name: '电机驱动',
    desc: '需要 MOSFET/驱动芯片符号，v0 暂不支持',
    supported: false,
  },
  {
    id: 'uart-convert',
    ico: '🔌',
    name: '接口转换',
    desc: '需要电平转换/USB 芯片符号，v0 暂不支持',
    supported: false,
  },
  {
    id: 'cap-bypass',
    ico: '🔋',
    name: '电源去耦电容',
    desc: '5V → 电容(0.1u) → GND，为电源滤高频噪声',
    supported: true,
  },
  {
    id: 'diode-protect',
    ico: '🛡️',
    name: '二极管续流保护',
    desc: '感性负载并联二极管（防反接/续流）：R(10k) + D(1N4007) 于负载回路',
    supported: true,
  },
  {
    id: 'rc-delay',
    ico: '⏱️',
    name: 'RC 延时电路',
    desc: '电阻+电容，5V 经 R 充电到 C',
    supported: true,
  },
  {
    id: 'battery-switch-led',
    ico: '🔦',
    name: '电池开关 LED',
    desc: '电池+开关+限流电阻+LED 手电电路',
    supported: true,
  },
  {
    id: 'switch-demo',
    ico: '🔘',
    name: '开关符号演示',
    desc: '5V → 开关 → GND，展示开关元件符号',
    supported: true,
  },
]

/** 规则：生成 LED 点亮最小电路（R + LED 串联手拉手）。 */
function buildLedDesign() {
  return {
    name: 'led-blink',
    components: [
      { ref: 'R1', type: 'resistor', value: '220', pos: { x: 400, y: 300 } },
      { ref: 'LED1', type: 'led', value: 'red', pos: { x: 700, y: 300 } },
    ],
    // R1 右引脚(450,300) → LED1 阳极(740,300) 直连
    wires: [[450, 300, 740, 300]],
    nets: [
      { name: '5V', points: [[350, 300]] },
      { name: 'GND', points: [[660, 300]] },
    ],
  }
}

/** 规则：电阻分压（R1+R2 串联，中点网络标签 3.3V）。 */
function buildDividerDesign() {
  return {
    name: 'voltage-divider',
    components: [
      { ref: 'R1', type: 'resistor', value: '1k', pos: { x: 400, y: 300 } },
      { ref: 'R2', type: 'resistor', value: '2k', pos: { x: 900, y: 300 } },
    ],
    wires: [[450, 300, 850, 300]],
    nets: [
      { name: '5V', points: [[350, 300]] },
      { name: '3.3V', points: [[650, 300]] },
      { name: 'GND', points: [[950, 300]] },
    ],
  }
}

/** 电容去耦：VCC(5V) → C → GND（单电容，命名网闭合）。 */
function buildCapDesign() {
  return {
    name: 'cap-bypass',
    components: [{ ref: 'C1', type: 'capacitor', value: '0.1u', pos: { x: 400, y: 300 } }],
    wires: [],
    nets: [
      { name: '5V', points: [[450, 300]] },
      { name: 'GND', points: [[350, 300]] },
    ],
  }
}

/** 二极管续流保护：R(负载) 并联续流二极管 —— 5V 接 D 阴极，D 阳极 → R 左，R 右 → GND。 */
function buildDiodeProtectDesign() {
  return {
    name: 'diode-protect',
    components: [
      { ref: 'R1', type: 'resistor', value: '10k', pos: { x: 400, y: 300 } },
      { ref: 'D1', type: 'diode', value: '1N4007', pos: { x: 700, y: 300 } },
    ],
    wires: [[450, 300, 740, 300]], // R1 右(450,300) → D1 阳极(740,300)
    nets: [
      { name: 'GND', points: [[350, 300]] }, // R1 左(350,300)
      { name: '5V', points: [[660, 300]] }, // D1 阴极(660,300)
    ],
  }
}

/** RC 延时：5V → R → C → GND（R 右接 C 左，充电到 C）。 */
function buildRcDelayDesign() {
  return {
    name: 'rc-delay',
    components: [
      { ref: 'R1', type: 'resistor', value: '1k', pos: { x: 400, y: 300 } },
      { ref: 'C1', type: 'capacitor', value: '10u', pos: { x: 700, y: 300 } },
    ],
    wires: [[450, 300, 650, 300]], // R1 右(450,300) → C1 左(650,300)
    nets: [
      { name: '5V', points: [[350, 300]] }, // R1 左(350,300)
      { name: 'GND', points: [[750, 300]] }, // C1 右(750,300)
    ],
  }
}

/** 电池开关 LED 手电：BT(+) → SW → R → LED 阴极，LED 阳极 → BT(-) 同 GND。 */
function buildBatterySwitchLedDesign() {
  return {
    name: 'battery-switch-led',
    components: [
      { ref: 'BT1', type: 'battery', value: '3.7V', pos: { x: 300, y: 300 } },
      { ref: 'SW1', type: 'switch', value: 'SW', pos: { x: 600, y: 300 } },
      { ref: 'R1', type: 'resistor', value: '220', pos: { x: 900, y: 300 } },
      { ref: 'LED1', type: 'led', value: 'red', pos: { x: 1200, y: 300 } },
    ],
    wires: [
      [350, 300, 550, 300], // BT1 右(350) → SW1 左(550)
      [650, 300, 850, 300], // SW1 右(650) → R1 左(850)
      [950, 300, 1160, 300], // R1 右(950) → LED1 阴极(1160)
    ],
    nets: [
      { name: 'GND', points: [[1240, 300], [250, 300]] }, // LED1 阳极(1240) + BT1 左(250)
    ],
  }
}

/** 开关演示：VCC → SW → GND（展示开关符号）。 */
function buildSwitchDesign() {
  return {
    name: 'switch-demo',
    components: [{ ref: 'S1', type: 'switch', value: 'SW', pos: { x: 400, y: 300 } }],
    wires: [],
    nets: [
      { name: '5V', points: [[450, 300]] },
      { name: 'GND', points: [[350, 300]] },
    ],
  }
}

const TEMPLATE_BUILDERS = {
  'led-blink': buildLedDesign,
  'voltage-divider': buildDividerDesign,
  buck: buildDividerDesign, // 近似：分压 + 说明
  'cap-bypass': buildCapDesign,
  'diode-protect': buildDiodeProtectDesign,
  'rc-delay': buildRcDelayDesign,
  'battery-switch-led': buildBatterySwitchLedDesign,
  'switch-demo': buildSwitchDesign,
}

/**
 * 按模板 ID 生成设计。
 * @returns {{ ok:boolean, design?:object, note?:string, title:string }}
 */
export function templateById(id) {
  const meta = TEMPLATE_CATALOG.find((t) => t.id === id)
  if (meta === undefined) return { ok: false, title: id, note: `未知模板：${id}` }
  if (meta.supported === false) {
    return { ok: false, title: meta.name, note: `模板「${meta.name}」需要其他元件符号（${meta.desc}），v0 生成器目前支持常见的两脚无源元件（电阻/电容/电感/二极管/LED/开关/晶振/电池/保险丝），尚不支持芯片等复杂符号。` }
  }
  const builder = TEMPLATE_BUILDERS[id]
  if (builder === undefined) return { ok: false, title: meta.name, note: `模板「${meta.name}」尚未实现规则。` }
  const design = builder()
  const note = id === 'buck' ? '提示：电阻分压只适合小电流基准；真正的 5V→3.3V 降压建议用降压芯片（后续版本支持）。' : undefined
  return { ok: true, design, title: meta.name, note }
}

/** 简单关键词匹配（规则版 NLU）。返回 { ok, design?, note?, title?, matched? } */
function matchByKeywords(text) {
  const t = String(text ?? '').toLowerCase()
  if (/led|发光|灯.?闪|点.?亮/.test(t)) {
    return templateById('led-blink')
  }
  if (/分压|降压|3\.3v|3v3|基准电压/.test(t)) {
    return templateById('buck')
  }
  if (/电容|去耦|滤波|cap/.test(t)) {
    return templateById('cap-bypass')
  }
  if (/电容|充电|延时/.test(t)) {
    return templateById('rc-delay')
  }
  if (/二极管|续流|防反接|diode/.test(t)) {
    return templateById('diode-protect')
  }
  if (/电池|手电|开关.*灯|开关.*led/.test(t)) {
    return templateById('battery-switch-led')
  }
  if (/开关|switch/.test(t)) {
    return templateById('switch-demo')
  }
  return null
}

/**
 * 中文需求 → design。规则版：先模板匹配，未命中则提示。
 * @param {string} text 用户的中文描述
 * @param {object} opts { template?: string } 可指定模板 ID
 * @returns {{ ok:boolean, design?:object, title:string, note?:string, matched?:string }}
 */
export function translateRequest(text, opts = {}) {
  if (opts.template) return templateById(opts.template)
  const byKw = matchByKeywords(text)
  if (byKw !== null) return { ...byKw, matched: true }
  return {
    ok: false,
    title: '待支持的电路',
    note:
      'v0 规则版可识别「LED 点亮 / 电阻分压 / 降压 / 电容去耦 / RC 延时 / 二极管续流(防反接) / 电池开关 LED / 开关」等需求。' +
      '请用这些词（例：一个 LED 点亮电路、电阻分压、RC 延时电路、二极管续流保护、电池开关灯）或从模板卡选择；' +
      '完整自然语言理解将在接入 LLM 翻译层后支持。',
  }
}

/** 给 UI/agent 用的设计摘要。 */
export function describeDesign(design) {
  if (design === undefined) return '（无设计）'
  const comps = design.components.map((c) => `${c.ref}(${c.type}) ${c.value}@${coordKey(c.pos?.x, c.pos?.y)}`).join('、')
  const nets = (design.nets ?? []).map((n) => n.name).join('、')
  return `元件: ${comps || '无'}; 导线: ${(design.wires ?? []).length} 条; 网络: ${nets || '无'}`
}
