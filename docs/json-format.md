# 嘉立创 EDA 标准版（EasyEDA Standard）原理图 JSON 格式说明

> dsh-lichuang-eda 插件 · 第一版生成器配套文档
> 文档范围：本文件说明我们从**官方文档与真实导出样本**中确认到的原理图 JSON 字段结构、
> 生成器（`src/json-gen.js`）如何映射这些字段，以及现成第三方工具（`easyeda-converter` / npm `easyeda`）的用法。

---

## 0. 一句话结论（先看这里）

- 嘉立创 EDA 标准版（EasyEDA Standard / LCEDA 标准版，编辑器版本 6.x）的原理图文件是 **JSON**，
  顶层字段为 `head`（对象）、`canvas`（字符串）、`shape`（字符串数组）、`BBox`（对象）、`colors`（对象）。
- **导线、网络标签、接地标志、节点、元件符号全部位于 `shape` 数组内**，以带 `~` 分隔的字符串表示
  （导线 `W~…`、网络标签 `N~…`、网络标志 `F~…`、节点 `J~…`、元件 `LIB~…`）。
- 任务描述中提到的 `wire` / `component` / `net` / `designer` 顶层字段**在当前标准版格式中并不存在**
  （详见 §6「关于任务描述中字段名的澄清」）。
- 工程导出（多页工程、OSHWHub 下载）会把单片再包一层 docType=5 的 `schematics` 数组（见 §2），
  生成器已提供 `wrapAsProject()` 一键包装，产物见 `src/output/demo-project.json`。

---

## 1. 格式来源（本文件一切字段均以此为准）

| 来源 | 内容 | 用途 |
|---|---|---|
| [easyeda/easyeda-documents](https://github.com/easyeda/easyeda-documents) `Open-File-Format/common.md`、`schematic.md`（本仓库 `docs/ref/` 下已存副本） | 官方开放文件格式：分隔符、head/canvas、各 shape 前缀串的逐字段定义 | 字段名与段序的权威依据 |
| [docs.easyeda.com 原理图格式](https://docs.easyeda.com/cn/DocumentFormat/2-EasyEDA-Schematic-File-Format/) 与 [Common Information](https://docs.easyeda.com/cn/DocumentFormat/1-Common-Information/) | 与上述一致的官方网页版 | 交叉验证 |
| [docs.easyeda.com EasyEDA Schematic File Object](https://docs.easyeda.com/en/DocumentFormat/4-EasyEDA-Schematic-File-Object/) | 旧版「文件对象」格式（`wire`/`schlib`/`netlabel` 等键值对象 + `itemOrder`） | 区分新旧格式 |
| 真实编辑器导出样本 `docs/ref/SCH_ESP32-PICO-D4_smart_watch_2023-09-02.json`（editorVersion **6.5.34**，2023，来源 OSHWLAB，KiCad 官方 QA 数据 [qa/data/pcbnew/plugins/easyeda](https://gitlab.com/kicad/code/kicad/-/tree/master/qa/data/pcbnew/plugins/easyeda)） | 当前 v6 格式的真机导出（63 个 LIB、202 条 W、65 个 N、72 个 F、50 个 J） | 逐字段比对的“金标准” |
| [KiCad EasyEDA 导入格式文档](https://dev-docs.kicad.org/en/import-formats/easyeda/) | 第三方对标准版格式的解析说明（docType 取值、各前缀参数布局、图层） | 交叉验证字段含义 |
| [eggfly/easyeda-agent-skills spec/api-reference.md](https://github.com/eggfly/easyeda-agent-skills)（`docs/ref/api-reference.md`） | 反推的 v6 引脚串格式、shape 前缀 | 交叉验证 v6 细节 |

---

## 2. 顶层字段结构

### 2.1 平面单片（docType=1）—— 生成器默认产物

`src/json-gen.js` 的 `generateSchematic()` 输出即为此形态，`src/output/demo.json` 与之逐键一致：

```json
{
  "head":   { "docType": "1", "editorVersion": "6.5.34", "newgId": true, "c_para": {"Prefix Start": "1"},
              "c_spiceCmd": "null", "hasIdFlag": true, "uuid": "<32位hex>", "x": "0", "y": "0",
              "portOfADImportHack": "", "importFlag": 0, "transformList": "" },
  "canvas": "CA~1200~800~#FFFFFF~yes~#CCCCCC~10~1200~800~line~10~pixel~5~0~0",
  "shape":  [ "LIB~…", "W~…", "N~…", "F~…" ],
  "BBox":   { "x": 290, "y": 240, "width": 510, "height": 200 },
  "colors": {}
}
```

| 键 | 类型 | 说明 | 依据 |
|---|---|---|---|
| `head` | 对象 | 文档头（见 §3） | 真实样本 + [KiCad 文档](https://dev-docs.kicad.org/en/import-formats/easyeda/) |
| `canvas` | 字符串 | 画布配置（见 §4） | 官方 schematic.md + 真实样本 |
| `shape` | 字符串数组 | 全部图形/元件/导线/标签（见 §5） | 真实样本（v6 将 W/N/F/J 也放入 shape） |
| `BBox` | 对象 | `{x, y, width, height}` 内容包围盒（视图元数据，编辑器保存时自动维护） | 真实样本 |
| `colors` | 对象 | 网络颜色表，空对象即可 | 真实样本 |

### 2.2 工程导出（docType=5，多页/项目）

真实编辑器「导出工程」时（如 OSHWHub 下载的 `SCH_*.json`）是 docType=5 包装：

```json
{
  "editorVersion": "6.5.34",
  "docType": 5,
  "title": "ESP32-PICO-D4 smart watch",
  "description": "",
  "colors": {},
  "schematics": [
    { "docType": "1", "title": "Sheet_1", "description": "",
      "dataStr": { "head": {…}, "canvas": "…", "shape": […], "BBox": {…}, "colors": {} } }
  ]
}
```

`schematics[i].dataStr` 就是 §2.1 的平面单片对象。生成器 `wrapAsProject(sheet, meta)` 可完成该包装，
产物 `src/output/demo-project.json` 与真实样本顶层键逐键一致（已验证）。

> 说明：真实样本中单页 PCB 的导出是**平面**形态（顶层直接 `head/canvas/shape/layers/…`，无包装）；
> 原理图导出则是 docType=5 包装。两种形态生成器都支持，文档中如实标注：**默认交付平面单片**
> （即官方文档记载的原理图格式），`demo-project.json` 为与真实工程导出同构的包装形态。

---

## 3. `head` 字段（对象形态，v6）

| 字段 | 类型 | 含义 |
|---|---|---|
| `docType` | 字符串 "1" | 文档类型：1=原理图单片；2=符号；3=PCB；4=封装；5=原理图列表/工程；14=PCB 模块 |
| `editorVersion` | 字符串 | 编辑器版本，如 `6.5.34` |
| `newgId` | 布尔 | 是否使用新版图形 id 机制（真实样本为 `true`） |
| `c_para` | 对象 | 自定义参数（真实样本为 `{"Prefix Start": "1"}`，位号起始号） |
| `c_spiceCmd` | 字符串 | 仿真命令（真实样本为字符串 `"null"`） |
| `hasIdFlag` | 布尔 | 真实样本为 `true` |
| `uuid` | 字符串 | 32 位十六进制文档 uuid |
| `x` / `y` | 字符串 | 原点坐标（真实样本为 `"0"`/`"0"`） |
| `portOfADImportHack` | 字符串 | 旧版导入兼容字段，空串 |
| `importFlag` | 数字 | 导入标志（0 = 非导入） |
| `transformList` | 字符串 | 变换列表，空串 |

> 早期文档（≤1.11.x 时代）中 `head` 是**字符串**：`"1~1.11.3~Author`…`~TRAN`…"`（文档类型~版本~自定义属性~仿真配置）。
> 当前 v6 编辑器导出为**对象**形态（上表）。生成器采用对象形态以匹配当前编辑器。
> 参考：官方 [common.md](https://github.com/easyeda/easyeda-documents/blob/master/Open-File-Format/common.md) 的 Document Type 一节、[KiCad 文档](https://dev-docs.kicad.org/en/import-formats/easyeda/) DOC_TYPE 表。

---

## 4. `canvas` 字段（15 段，`~` 分隔）

```
CA~1200~800~#FFFFFF~yes~#CCCCCC~10~1200~800~line~10~pixel~5~0~0
```

| 段 | 示例 | 含义 |
|---|---|---|
| 0 | `CA` | 命令 |
| 1 | `1200` | 视图框宽（ViewBox 宽 / 画布宽 = 缩放 x） |
| 2 | `800` | 视图框高 |
| 3 | `#FFFFFF` | 背景色 |
| 4 | `yes` | 网格可见（yes/none） |
| 5 | `#CCCCCC` | 网格颜色 |
| 6 | `10` | 网格大小（像素） |
| 7 | `1200` | 画布宽 |
| 8 | `800` | 画布高 |
| 9 | `line` | 网格样式（line/dot） |
| 10 | `10` | 吸附步长 |
| 11 | `pixel` | 单位（恒为 pixel） |
| 12 | `5` | ALT 吸附步长 |
| 13 | `0` | 原点 x |
| 14 | `0` | 原点 y |

依据：[schematic.md Canvas 一节](https://github.com/easyeda/easyeda-documents/blob/master/Open-File-Format/schematic.md) + 真实样本（`CA~1000~1000~#FFFFFF~yes~#CCCCCC~5~1000~1000~line~5~pixel~5~0~0`）。

---

## 5. `shape` 数组：各前缀串格式（v6 形态）

> 分隔符体系（官方 common.md）：`~` 分隔属性、`` ` `` 分隔自定义参数键值、`^^` 连接复合元素的段
> （引脚/网络标志）、`#@$` 连接元件（LIB）的多个子图形。
> v6 相比早期文档，各条目尾部普遍多出 `~0`（locked 锁定标志）字段，文本段尾部多出颜色字段。

### 5.1 导线 `W`

```
W~450 300 450 380 740 380 740 300~#0099FF~1~0~none~gge14~0
```

`W~坐标(空格分隔的 x y 对)~颜色~线宽~线型~填充~id~locked`
线型 0=实线、1=虚线、2=点线。真实 v6 样本导线颜色 `#0099FF`、线宽 1。

### 5.2 网络标签 `N`

```
N~350~300~0~#880000~5V~gge15~start~352~297.5~Times New Roman~7pt~0
```

`N~引脚点x~引脚点y~旋转~颜色~名称~id~对齐~文本x~文本y~字体~字号~locked`
文本一般放在引脚点右上方 2~3 像素。

### 5.3 网络标志（电源符号）`F`

```
F~part_netLabel_gnD~660~300~0~gge16~~0
^^660~300
^^GND~#000000~647~326~0~start~1~Times New Roman~9pt~flag_gge16
^^PL~660 290 660 300~#000000~1~0~transparent~gge16_p1~0
^^PL~651 290 669 290~#000000~1~0~transparent~gge16_p2~0
^^PL~654 288 666 288~#000000~1~0~transparent~gge16_p3~0
^^PL~657 286 663 286~#000000~1~0~transparent~gge16_p4~0
^^PL~659 284 661 284~#000000~1~0~transparent~gge16_p5~0
```

- 段 0：`F~part_netLabel_gnD~x~y~旋转~id~~locked`（`part_netLabel_gnD` = 电源地标志；另有 `part_netLabel_VCC` 等样式名）
- 段 1：引脚点（导线连接处）
- 段 2：`名称~颜色~文本x~文本y~旋转~对齐~可见~字体~字号~flag_id`
- 其余段：标志图形（GND 为 1 竖线 + 4 条渐短横线，画在引脚点上方）

### 5.4 节点（连接点圆点）`J`

```
J~420~140~2.5~#CC0000~gge18~0
```

`J~x~y~半径~颜色~id~locked`。只在三线以上汇合处显式出现；本 demo 无分支故未使用。

### 5.5 元件符号 `LIB`（本生成器内置电阻 / LED）

```
LIB~400~300~package`NONE`nameAlias`Value`Value`10k`spicePre`R`spiceSymbolName`resistor`~0~0~gge6
#@$T~P~400~274~0~#000080~Arial~~~~~comment~R1~1~start~gge5~0~pinpart     ← 位号
#@$T~N~400~326~0~#000080~Arial~~~~~comment~10k~1~start~gge4~0~pinpart     ← 值
#@$R~370~290~~~60~20~#000000~1~0~none~gge1~0~                              ← 本体矩形
#@$P~show~0~1~450~300~0~gge2~0^^450~300^^M 430 300 h 20~#880000^^…           ← 引脚1（右）
#@$P~show~0~2~350~300~180~gge3~0^^350~300^^M 370 300 h -20~#880000^^…         ← 引脚2（左）
```

- LIB 头：`LIB~x~y~c_para(反引号键值对，含 spicePre 前缀/值等)~旋转~importFlag~id`
  （真实 v6 样本在该头后还有 symbolUuid/footprintUuid/时间戳等约 9 个扩展段；
  官方文档记载的最小形态为上述 6 段——自包含内联符号，无外部引用需要解析，生成器采用最小形态。）
- 子图形以 `#@$` 连接，类型可为 `T`（文本）、`R`（矩形）、`PL`（折线）、`E`（椭圆）、`P`（引脚）等。

#### 引脚 `P`（7 段，`^^` 连接，v6 形态）

```
P~show~0~1~450~300~0~gge2~0        ← P~显示~电气类型(0未定义/1输入/2输出/3I/O/4电源)~spice引脚号~x~y~旋转~id~locked
^^450~300                           ← 引脚点（导线连接处，重要）
^^M 430 300 h 20~#880000            ← 引脚线 SVG path~颜色
^^1~436~296~0~1~start~~~#000000     ← 名称文本（可见~x~y~旋转~文本~对齐~字体~字号~颜色）
^^0~444~296~0~1~end~~~#000000       ← 编号文本（同上）
^^0~463~300                         ← 圆点装饰（可见~x~y）
^^0~M 447 297 L 444 300 L 447 303   ← 时钟符号（可见~path）
```

旋转约定：`0` 引脚点朝右、`180` 朝左、`90/270` 上下；path 从元件本体边缘画到引脚点。

### 5.6 文本 `T`（画布标注 / 元件内位号与值）

```
T~L~895~-200~0~#000000~~9pt~~~~comment~说明文字~1~start~gge52~0~pinpart
```

`T~mark~x~y~旋转~颜色~字体~字号~字重~字型~基线~类型(comment/spice)~文本~可见~对齐~id~locked~pinpart`
元件内 `mark` 用 `P`（位号）、`N`（值）；画布标注用 `L`。

### 5.7 其他（未在 demo 中使用，供后续扩展）

`PL`（折线）、`PG`（多边形）、`PT`（路径）、`A`（弧）、`E`（椭圆）、`C`（圆）、`I`（图片）、
`B`（总线）、`BE`（总线入口）、`O`（不连接标志）——格式均见官方 [schematic.md](https://github.com/easyeda/easyeda-documents/blob/master/Open-File-Format/schematic.md)。

---

## 6. 关于任务描述中字段名的澄清（重要，避免误导）

任务描述示例提到顶层字段「head、canvas、shape、wire、component、net、designer 等」。经核实：

- **当前标准版 v6 格式**：平面单片只有 `head`/`canvas`/`shape`/`BBox`/`colors` 五个键，
  **没有** `wire`/`component`/`net`/`designer` 顶层数组——导线（W）、网络标签（N）、网络标志（F）、
  节点（J）全部在 `shape` 数组内。依据：真实 v6 导出样本（62 项结构校验通过）+ KiCad 导入器按 `shape`
  解析 W/N/F/J 的实现。
- **旧版「文件对象」格式**（docs.easyeda.com「EasyEDA Schematic File Object」，约 2017 年及更早）：
  `head`/`wire`/`schlib`/`netlabel`/`netflag`/`junction`/`annotation` + `itemOrder`，均为 **gId 键值对象**。
  该格式有 `wire`、`schlib` 等键，但**也没有** `component`/`net`/`designer`。
- 结论：`wire`/`component`/`net`/`designer` 这四个名字在两种已知格式中都不存在；
  生成器以「官方文档 + 真实样本」为准，未采用这些字段名（遵循任务要求「不要凭空编字段名」）。

---

## 7. 生成器 `src/json-gen.js` 的字段映射

| design 输入 | 输出字段 |
|---|---|
| `design.components[i]` `{ref, type, value, pos}` | `shape` 中的一条 `LIB~…`（type=resistor/led → 内置符号），`ref` → 子图形 `T~P`，`value` → `T~N` 与 `c_para`，`pos` → LIB 头坐标 |
| `design.wires[i]` `[x1,y1,x2,y2,…]` | `shape` 中的 `W~x1 y1 x2 y2 …~#0099FF~1~0~none~id~0` |
| `design.nets[i]` `{name, points}` | `name==='GND'` → `shape` 中 `F~part_netLabel_gnD~…` 接地标志；其余 → `N~…` 网络标签；`points` 为标签放置坐标 |
| 常量 | `head`（对象形态）、`canvas`（15 段）、`BBox`（按内容坐标外扩 60 计算）、`colors: {}` |
| `wrapAsProject(sheet, meta)` | docType=5 工程包装（与真实导出同构） |

**连通规则（决定网络表能否生成）**：导线端点、网络标签/接地标志的引脚点必须与元件引脚点**坐标完全重合**。
内置示例已按此排布并做连通性校验（见 §8）。

### 运行方式

```bash
node src/json-gen.js              # 生成 demo.json + demo-project.json + demo-netlist.json
node --test src/json-gen.test.js  # 自动化测试（Node 自带，见 §8.5）
node src/validate.mjs             # 62 项结构校验（与真实 v6 样本逐模式比对）
node src/validate2.mjs            # 工程包装 + 连通性校验
```

---

## 8. 自动化校验与测试（如何验证产物）

### 8.1 三层校验体系总览

| 层 | 入口 | 作用 | 输入 |
|---|---|---|---|
| 结构 lint | `validateSchematic(obj)`（**由 `src/json-gen.js` 导出**，符合任务要求） | 检查顶层/必需字段与字段类型、shape 前缀与段数、id 唯一性 | 生成物对象 |
| 网表自检 | `deriveNetlist(sheet)`（`src/json-gen.js` 导出） | 从生成物反推网表并做一致性检查（悬空/孤立/未闭合） | 生成物对象 |
| 结构+连通比对 | `src/validate.mjs` / `src/validate2.mjs` | 与真实 v6 导出样本逐字段比对、工程包装与引脚-导线-标签重合检查 | 生成物文件 |
| design 级校验 | `src/validate.js`（`checkConnectivity`/`pinPoints`/`deriveNetlist(design)`） | 供 `nl-to-design.js` 与插件在**生成前**对 design 做快速检查 | design 对象 |

### 8.2 结构校验 `validateSchematic(obj)` → `{ ok, errors[] }`

检查项（与本文档 §2~§5 确认的结构一一对应）：
- 顶层键必须**恰为** `head, canvas, shape, BBox, colors`（多一个少一个都报错）；
- `head` 12 个字段齐全且类型正确（`docType === "1"`、`uuid` 为 32 位 hex、`c_para` 为对象等）；
- `canvas` 为 15 段、以 `CA` 开头、单位 `pixel`；
- `shape` 为非空数组，每条为字符串：前缀 ∈ 已知集合（LIB/W/N/F/J/T/PL/PG/PT/R/E/C/I/B/BE/O/A/AR/P）、
  段数与 v6 形态一致（如 W=8、N=13、J=6、T=18、R=14、PL=8）、无 NaN 坐标、LIB 含 `#@$` 子图形、F 头 ≥8 段；
- 全文件 id（含 LIB 子图形 id）唯一；
- `BBox.x/y/width/height` 为有限数字；`colors` 为对象。

### 8.3 网表推导与一致性自检 `deriveNetlist(sheet)` + `src/output/demo-netlist.json`

原理：以坐标点为节点、导线线段为边建连通图，每个连通分量 = 一个网络；网络名取组件上的
网络标签/接地标志名（无标签则自动命名 `Net1/Net2/…`）。一致性规则：

1. **悬空导线端点**：导线端点若不与任何其他导线、引脚点、标签、节点重合 → 报错；
2. **孤立导线**：导线所在连通分量没有任何引脚/标签 → 报错；
3. **未闭合网络**：无标签网络必须 ≥2 个引脚；有标签网络（如 5V/GND）允许 1 个引脚
   （标签表示外部连接，这是电源网络的正常形态——所以规则不是死板的「每个网络 ≥2 引脚」）；
4. 同一网络含多个**不同名称**标签 → 报错；位号重复 → 报错。

`main()` 会把结果写到 `src/output/demo-netlist.json`（`source` 指向 demo.json），
**刻意不并入 demo.json**：真实 v6 平面单片的顶层键就是恰好 5 个，多一个键反而可能影响编辑器导入。

### 8.4 design 级校验 `src/validate.js`

- `pinPoints(comp)`：元件引脚几何（resistor ±50 / led ±40），与生成器硬编码一致；
- `deriveNetlist(design)`：在生成前从 design 直接推导网表（`{ nets, dangling }`）；
- `checkConnectivity(design)`：悬空引脚判定（未连线且未打标签的引脚）。

### 8.5 自动化测试（`node --test`，Node 自带，零依赖）

```bash
# 普通环境
node --test src/json-gen.test.js
# Windows 沙箱（DSH）下 node:test 默认的子进程隔离会被沙箱拦截（spawn EPERM）：
node --test --experimental-test-isolation=none src/json-gen.test.js
```

当前 14 个用例，分三类：
1. **合法电路**（电阻+LED）：`JSON.parse` 往返、顶层键/head 键符合文档结构、`validateSchematic` 通过、
   sheet 级网表自检通过（3 网络闭合、4 引脚各归其网）、design 级连通性通过、工程包装可 lint；
2. **故意做坏的电路**（3 种，断言自检**报出错误**）：悬空导线端点、引脚未连接（网络未闭合）、
   完全孤立导线——同时断言结构 lint 仍通过（格式合法、电路断开是两类问题）；
3. **结构 lint 防御**：残缺/非法对象（缺字段、类型错误、null/数组）必须报错；
   另含不支持的元件类型抛错、`main()` 产物可复现等。

### 8.6 覆盖边界（如实说明）

- **可全自动断言**：JSON 合法性（`JSON.parse`）、字段结构与类型（`validateSchematic`，62 项
  与真实 v6 样本逐键比对）、网表/连通性（`deriveNetlist`/`checkConnectivity`，悬空/孤立/未闭合全覆盖）。
- **必须真机验证**：「这份 JSON 能否被嘉立创 EDA 标准版无报错导入」——现阶段无账号/编辑器环境，
  无法实测。结论基于官方文档 + 与 2023 年真实导出样本逐字段同构 + KiCad 导入器可解析同构文件；
  最终导入行为（尤其 v6 编辑器对最小 LIB 头 6 段形态的兼容性）**仍需在标准版编辑器
  「文件 → 导入 → 嘉立创 EDA 文件 / EasyEDA 源文件」中实测**。官方也提供免导入自检：
  标准版编辑器「EasyEDA 源文件对话框」粘贴 JSON 后点 Apply（[common.md Q&A](https://github.com/easyeda/easyeda-documents/blob/master/Open-File-Format/common.md)）。

---

## 9. 第三方工具参考：`easyeda-converter` 与 npm `easyeda`

任务要求评估这两个现成方案。结论：**它们是「EasyEDA JSON → tscircuit/Circuit JSON」的解析/转换器，
不是原理图 JSON 生成器**，不能替代本生成器；但可作为格式校验的交叉参考。

### 9.1 `tscircuit/easyeda-converter`（GitHub）

- 作用：把 EasyEDA JSON（主要是 LCSC 元件封装/符号，含 `dataStr.head/canvas/shape`）转换成
  tscircuit 的 Circuit JSON 或 TSX 组件；也可以从 LCSC 元件 API 下载原始 JSON。
- 与本任务的差异：方向相反（读 EasyEDA → 写 tscircuit），且聚焦**元件库**数据而非整张原理图。
- 参考价值：其 `lib/schemas/easy-eda-json-schema.ts` 定义了 head/shape/BBox 等结构的 zod 校验
  （本仓库 `docs/ref/easyeda-converter-main/` 已存副本），可用于核对字段名。

### 9.2 npm `easyeda` 包

- 能否 `npm i`：可以（`npm i easyeda`，v0.0.343，就是上面仓库的发布产物；npm 上同名包可能混杂其他项目，以 `tscircuit/easyeda-converter` 仓库为准）。
- API 示例（官方 README）：
  ```js
  import { convertEasyEdaJsonToCircuitJson } from "easyeda"
  const soupJson = convertEasyEdaJsonToCircuitJson(rawEasyJson)   // EasyEDA JSON → Circuit JSON

  import { fetchEasyEDAComponent } from "easyeda"
  const rawEasyJson = await fetchEasyEDAComponent("C46749")        // 从 LCSC 下载元件 JSON
  ```
- 注意：它**不能**把电路描述生成标准版原理图 JSON；若后续需要「反向：从本生成器产物做兼容性验证」，
  可把 demo.json 的 `dataStr` 部分喂给该库的 schema 校验做一次第三方交叉检查（属后续增强，非本次交付）。

---

## 10. 交付物清单

| 文件 | 说明 |
|---|---|
| `src/json-gen.js` | 纯 ESM 生成器：`generateSchematic` / `wrapAsProject` / 内置示例 `DEFAULT_DESIGN` / `main()` / **`validateSchematic`（结构 lint）** / **`deriveNetlist(sheet)`（网表推导+一致性自检）** / 各 shape 构造器 |
| `src/validate.js` | design 级校验层：`pinPoints` / `deriveNetlist(design)` / `checkConnectivity`（供 `nl-to-design.js` 与插件用） |
| `src/nl-to-design.js` | 自然语言/模板 → design 翻译层 v0（LED 点亮、电阻分压等模板，如实标注不支持项） |
| `src/json-gen.test.js` | `node:test` 自动化测试，14 个用例（合法电路全通过 + 3 种坏电路必须报错 + lint 防御） |
| `src/output/demo.json` | 平面单片 docType=1 原理图（R1 10k + LED1 + 导线 + 5V 标签 + GND 接地标志） |
| `src/output/demo-project.json` | 同图的 docType=5 工程包装形态（与真实导出同构） |
| `src/output/demo-netlist.json` | 网表推导 + 一致性自检结果（3 网络：Net1/5V/GND，全部闭合） |
| `src/validate.mjs` / `src/validate2.mjs` | 独立校验脚本：与真实 v6 样本逐字段比对（62 项）+ 工程包装与连通性（13 项） |
| `src/output/preview.svg` | 几何目检预览（浏览器打开） |
| `docs/json-format.md` | 本文件 |
| `docs/ref/` | 引用依据存档：官方 common.md / schematic.md、官方 gist 示例、真实 v6 导出样本、KiCad 文档、easyeda-converter 源码、eggfly v6 引脚格式笔记 |
