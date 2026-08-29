/**
 * dsh-lichuang-eda — 框内定位（layout）核心。
 *
 * 实战固化（esp32_multitool 真机实测）：
 *   - 原理图坐标单位 10mil，A4 页面 = 1170 × 825（titleBlockData.Width/Height）；
 *   - 放置必须落在图框内（内边距 ≥ margin），100 单位网格步进；
 *   - 与已有图元（含导线采样点）最小间距 minGap（Chebyshev）；
 *   - 从未占用区域"右上→左下"逐行扫描，同排元素保持同一行/列间距 ≥ grid。
 *
 * 纯函数（可单测）：读页面交给工具层（桥端代码在 layout.js 之外）。
 */

/** 在页面上为 count 个元件挑选互不冲突的框内网格点。 */
export function pickSpots({
  pageWidth,
  pageHeight,
  used = [],
  count = 1,
  margin = 80,
  grid = 100,
  minGap = 150,
}) {
  const spots = []
  const taken = used.map((u) => ({ x: Number(u.x) || 0, y: Number(u.y) || 0 }))
  const conflict = (x, y) =>
    taken.some((u) => Math.abs(u.x - x) < minGap && Math.abs(u.y - y) < minGap) ||
    spots.some((s) => Math.abs(s.x - x) < minGap && Math.abs(s.y - y) < minGap)

  let y = margin + grid
  while (spots.length < count && y <= pageHeight - margin) {
    let x = pageWidth - margin - grid
    while (x >= margin && spots.length < count) {
      if (!conflict(x, y)) {
        spots.push({ x, y, inside: x >= margin && x <= pageWidth - margin && y >= margin && y <= pageHeight - margin })
      }
      x -= grid
    }
    y += grid
  }
  return spots
}

/** 校验一个点是否在两段式框内（margin 内）。 */
export function insideFrame({ x, y, pageWidth, pageHeight, margin = 80 }) {
  return x >= margin && x <= pageWidth - margin && y >= margin && y <= pageHeight - margin
}
