/**
 * dsh-lichuang-eda — 画板认知与验收（board）模块。
 *
 * - buildOverview: 把桥返回的原始图元数据规范化为 agent 可读摘要
 *   （元件清单/导线/网络/引脚可选）；
 * - pickSpotsPcb: PCB 版框内定位（无页面概念 → 基于已有图元 bbox 外扩网格）；
 * - saveTrace: 截图 base64 落盘（~/.dsh/eda/shots/）。
 * 纯函数可单测；桥调用在工具层。
 */
import { promises as fsp } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

export function defaultShotsDir() {
  return join(homedir(), '.dsh', 'eda', 'shots')
}

/** 规范化原理图/Pcb 原始图元（桥端映射结果）为摘要。 */
export function buildOverview(raw, { full = false } = {}) {
  const out = {
    domain: raw?.domain ?? 'sch',
    doc: raw?.doc ?? null,
    pageSize: raw?.pageSize ?? null,
    componentCount: (raw?.components ?? []).length,
    wireCount: raw?.wireCount ?? 0,
    viaCount: raw?.viaCount ?? 0,
    lineCount: raw?.lineCount ?? 0,
    nets: (raw?.nets ?? []).slice(0, 60),
    componentsPreview: (raw?.components ?? []).slice(0, full ? 200 : 40).map((c) => ({
      designator: c.d ?? '?',
      name: c.n ?? '',
      type: c.t ?? '',
      x: c.x,
      y: c.y,
      net: c.net ?? '',
    })),
    truncated: (raw?.components ?? []).length > (full ? 200 : 40),
  }
  return out
}

/** PCB 定位：无页面边界 → 以已有图元 bbox 外扩网格选点（互不冲突）。 */
export function pickSpotsPcb(used = [], count = 1, { gap = 600, grid = 300 } = {}) {
  const xs = used.map((u) => u.x)
  const ys = used.map((u) => u.y)
  const minX = xs.length ? Math.min(...xs) - 2 * gap : 0
  const maxX = xs.length ? Math.max(...xs) + 2 * gap : 2 * gap
  const rowBase = ys.length ? Math.max(...ys) : 0
  const spots = []
  const conflict = (x, y) =>
    used.some((u) => Math.abs(u.x - x) < gap && Math.abs(u.y - y) < gap) ||
    spots.some((s) => Math.abs(s.x - x) < gap && Math.abs(s.y - y) < gap)
  // 从 bbox 上方外侧起，向上排 3 行、左右展开；不够再从下方排 2 行
  const rows = [rowBase + gap, rowBase + gap + grid, rowBase + gap + 2 * grid, rowBase - gap, rowBase - gap - grid]
  for (const y of rows) {
    if (y < -3 * gap) continue
    let x = maxX + grid
    while (x >= minX - grid && spots.length < count) {
      if (!conflict(x, y)) spots.push({ x, y })
      x -= grid
    }
    if (spots.length >= count) break
  }
  return spots
}

/** 截图 base64 → PNG 落盘，返回 { ok, path, size, type }。 */
export async function saveTrace(b64, { dir = defaultShotsDir(), name = null } = {}) {
  if (typeof b64 !== 'string' || b64 === '') return { ok: false, error: '截图数据为空' }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
  const file = name ? `${name}-${stamp}.png` : `board-${stamp}.png`
  const target = join(dir, file)
  try {
    await fsp.mkdir(dir, { recursive: true })
    await fsp.writeFile(target, Buffer.from(b64, 'base64'))
    return { ok: true, path: target, size: Buffer.from(b64, 'base64').length, file }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
