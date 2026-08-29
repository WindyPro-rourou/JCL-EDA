# dsh-lichuang-eda (JCL-EDA)

面向 **0 基础开发者** 的 DeepSeek Harness(DSH) 插件：用自然语言，在 **嘉立创 EDA（专业版·网页版为主）** 里自动生成原理图 / PCB 草图，并给出导入与打样引导。

> 设计主张：**不用"截图找坐标"的 computer-use，而用嘉立创官方 API + WebSocket 桥接**，直接驱动用户正在浏览器里打开的在线专业版画板——确定性高、所见即所得。

## 安装（开箱即用，三步）

```bash
# 1) 安装到 DSH web profile（GitHub 源，或 npm: npm i @windypro-rourou/dsh-eda）
cd ~/.dsh/profiles/web && npm i github:WindyPro-rourou/JCL-EDA

# 2) 在 profile 的 cordis.patch.yml 追加一行（已有则跳过）
- insert:
    - id: eda
      name: '@windypro-rourou/dsh-eda'

# 3) 重启 DSH Web GUI → 侧边栏出现「嘉立创 EDA」
```

插件加载后**全自动**：自动启动官方桥 → 面板顶部连接卡 + 教程（一键安装官方桥/启动/官方扩展 Run API Gateway/刷新）→ 状态变绿即连上你的云端画板；生成直接在对话里说「嘉立创EDA，启动！…」。

## 项目定位（最终形态）

本插件 = **平台层**，**生成电路图 = 在对话里进行（skill 式直觉）**：

- **插件 = 平台层**：负责官方桥的 **一键安装 / 启动 / 连接 / 状态**，并在连接后提供执行**官方 `eda.*` API** 的双手（`eda_exec` + 框内定位 `eda_pick_spot` + 能力清单 `eda_capabilities` + 校验工具）+ **离线兜底**（`eda_generate_schematic_json`）。
- **生成电路图 = 在对话里直接进行**：用户直接对 AI 说"嘉立创EDA，启动！帮我画一个…"，agent 用 `eda_exec` 逐步执行官方 `eda.*` API 在用户的**云端画板**实时画（放元件→引脚级连线→网络标志→DRC/网表/BOM→PCB 元件/过孔/走线→截图）。官方文档/样例已随桥 vendored 到 `~/.dsh/eda/bridge/`，agent 先 `read` 再调用。
- **离线生成 = 兜底**：仅无法连接画板时使用（本地产出可导入嘉立创 EDA 标准版的 JSON，写 `~/.dsh/eda/output/`）。
- **面板 = 记录式时间线**：每一步（序号/动作/耗时/结果/会话）落盘 `~/.dsh/eda/activity.jsonl`（重启不空），支持**撤回该步**（自动记录新建图元，一键删除）、**清空记录**、**紧急保存**（`.epro2` + SVG 预览 + 网表/BOM + 动作日志 → `~/.dsh/eda/snapshots/`）。

> 仅使用**官方栈**：官方桥 `easyeda/easyeda-api-skill` + 官方扩展 **Run API Gateway** + 官方 API（prodocs.easyeda.com）。**无任何第三方后端**（easyeda-agent / jlcmcp / easyeda-mcp-pro 已弃用，详见 `docs/eda-backend-research.md` §0.6）。

## 为什么做这个

- 0 基础用户不会画电路图，会说中文需求，希望**有人替他把图画出来**、还能拿去嘉立创打样。
- 嘉立创 EDA 专业版提供官方 API，官方 `easyeda-api-skill` 把「官方桥 + 官方 eda.* API」封装成 AI harness 可用的「画板之手」。
- 本项目把这些**复用**起来，包装成一个 DSH 插件 + 中文引导，做「自然语言 → 电路图」的桥。

## 目录结构（仓库根 = 插件包）

```
├─ lib/                           ← 插件本体（服务端：apply() 17 工具/7 路由/系统提示 + 时间线/快照/布局/能力清单）
│   ├─ index.js / backend.js / installer.js / snapshot.js / activity.js / layout.js / capabilities.js
│   └─ client.js                  ← 浏览器端：平台仪表盘（连接卡/轨迹时间线/撤回/清空/紧急保存）
├─ src/                           ← 离线生成器（标准版 JSON：json-gen / validate / nl-to-design + 14 例测试）
├─ cordis.patch.yml               ← 热插拔挂载（插入到 DSH web profile roster）
├─ test/ fixtures/                ← 插件单测（52 例）与 mock 桥
├─ scripts/publish.mjs            ← npm 发布脚本（lib+src+patch 进包）
├─ docs/                          ← 调研/引导/格式/真机实测修正（eda-conversation-skill.md 附二~附六）
└─ package.json                   ← @windypro-rourou/dsh-eda（files 含 lib/src/patch；npm i github:… 即装）
```

## 已注册的 agent 工具（17 个）

| 工具 | 用途 |
|---|---|
| `eda_status` | 插件/官方桥状态（装没装 / 端口 / 是否就绪） |
| `eda_template_list` / `eda_translate_request` | 模板卡目录 / 中文需求→结构化草稿（离线兜底用） |
| `eda_generate_schematic_json` | **离线兜底**：需求/模板 → 可导入标准版原理图 JSON + 结构/连通性校验 |
| `eda_bridge_install` / `eda_backend_connect` | 一键安装官方桥 / 启动·连接官方桥 |
| `eda_exec` | **云端实时生成的双手**：执行任意官方 `eda.*` 代码（需已连接；自动记录新建图元→可撤回） |
| `eda_pick_spot` | **框内定位**：读页面尺寸+已有图元 → 返回互不冲突的框内网格空位（放元件前必调） |
| `eda_capabilities` | **能力清单**：官方 eda.* API 结构化目录（域/方法/用法/坑/实测片段）——agent 主动查询 |
| `eda_board_overview` | **画板全览**：当前文档图元/网络/页面尺寸摘要（agent 的眼睛，画前画后都可用） |
| `eda_trace` | **现场截图**：缩放适配 → PNG 存 `~/.dsh/eda/shots/`（效果确认/视觉留档） |
| `eda_snapshot` | **紧急保存**：画板现场（`.epro2`+SVG 预览+网表/BOM）+ 动作日志 → `~/.dsh/eda/snapshots/` |
| `eda_verify` | **一键验收**：DRC + 网表 + BOM 一次返回（画完即验） |
| `eda_skill_read` | **官方 skill 全库查阅**：读 SKILL.md / references/classes/*.md / guide 等官方文档（写 eda.* 前必查） |
| `eda_sch_drc` / `eda_get_netlist` / `eda_get_bom` | DRC（verbose）/ 网表（File.text）/ BOM（二进制 xlsx→base64） |

**生命周期**：插件加载时若检测到官方桥已安装，**自动启动并自动连接**（无需人工）；面板实时显示 装没装 / 端口 / 是否就绪。

**限制（诚实说明）**：v0 离线生成器仅支持 **电阻 / LED** 两种符号；云端实时生成能力以官方 `eda.*` API 为准（**已知边界见 `docs/eda-conversation-skill.md` 附五缺陷速查表**：importChanges/setNetlist 不可靠、板框无 API、getNetlist('EasyEDA') 挂起、getAll 间歇失败等）。

## 如何运行 / 开发

> 见上方「安装（开箱即用，三步）」。开发自检：`npm run test:all`（插件 60+ 例 + 生成器 14 例 + 自检）与 `npm run check`；发布：`node scripts/publish.mjs [--dry]`（需 `$env:NPM_TOKEN`）；**发版**：`node scripts/release.mjs --version=<新版本>`（自动 bump → npm publish → git commit+tag+push；push 走系统凭据管理器 + 自动探测代理；打 tag 后 CI 自动发布）。插件规范详见 `docs/plugin-spec.md` 与 `docs/plugin.md`。

## 当前进度

- [x] DSH 插件规范 + 官方桥（easyeda-api-skill）安装/启动/连接/自愈
- [x] 云端实时全流程真机验证（esp32_multitool）：14 大类放置（原理图+PCB）、引脚级连线、焊盘级布线、DRC/网表/BOM、PCB 元件/过孔/走线、截图、紧急保存（详见 `docs/verification-report.md`）
- [x] 面板记录式时间线（持久化/撤回/清空）+ 紧急保存 + 框内定位 + 能力清单
- [x] 安装发布链路：`npm i github:WindyPro-rourou/JCL-EDA`（或 `npm i @windypro-rourou/dsh-eda`）开箱即用；版本随 release 脚本一致（tag v* 自动发布）

**测试（全部通过）**：插件 52/52、生成器 14/14、自检 OK、v6 样本 62/62 + 13/13。

## 测试门禁

```bash
npm run test:all        # json-gen 测试 + 插件自检 + 插件测试（52 例）
npm run check           # 语法检查（index/client/backend）
npm run gen             # 重新生成 src/output/demo*.json
```

> 沙箱受限时：`npm run test:json` / `npm run test:plugin` 已内置 `--experimental-test-isolation=none`。
> 本机 `npm.ps1` 被 PowerShell ExecutionPolicy 禁用时，用 `npm.cmd`（如 `C:\Program Files\nodejs\npm.cmd run test:all`）。
