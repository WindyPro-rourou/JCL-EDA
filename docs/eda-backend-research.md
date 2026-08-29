# EDA 后端技术调研与选型决策（dsh-lichuang-eda）

> 调研目标：为 DSH 插件「dsh-lichuang-eda」选定后端，使插件能自动驱动**用户浏览器里打开的「嘉立创 EDA 专业版（网页版）」**在线画板，生成原理图 / PCB 草图，**并且自带校验/测试能力（DRC / 网表 / BOM / 一致性检查）形成「生成→校验→纠错」闭环**。
> 调研日期：2025-06（基于本轮 web_search 检索到的公开资料）。
> 产出：本文（决策文档）。**不写代码、不做 npm install、不启动服务**；如需试跑，见文末「轻量验证记录」。

---

## 0. 证据说明与置信度约定

- 本环境沙箱阻断了对 GitHub / npm / 官方文档站点的**直连抓取**（TLS 握手失败：`SEC_E_NO_CREDENTIALS`，且 DNS 仅解析到 IPv6），因此 README / 文档正文无法全文拉取。
- 所有结论来自 web_search 检索到的**官方文档页面标题/片段、GitHub 仓库标题与描述、npm 页面、DeepWiki 索引、社区文章**等公开证据。
- 置信度标注：
  - 【已核实】= 检索到明确来源（URL 与内容一致）。
  - 【部分核实】= 有片段/间接证据，或与多项来源吻合但未见全文。
  - 【待验证】= 基于项目形态推断，需在实现阶段实测确认。
- 凡【待验证】项，插件实现前必须按文末「待办核实清单」实测一次。

---

## 0.6 最终决策（用户拍板 2026-08：**只用官方栈**）★现行

> 第三方后端（easyeda-agent / jlcmcp / easyeda-mcp-pro）**全部弃用**。官方栈三件（均已读原文核实）：

| 件 | 是什么 | 来源（官方） |
|---|---|---|
| **官方 Bridge Server** | `scripts/bridge-server.mjs`（`npm run server`），自动选端口 **49620-49629**，握手 `service:"easyeda-bridge"`；仅依赖 `ws` | [easyeda/easyeda-api-skill](https://github.com/easyeda/easyeda-api-skill)（Skill `easyeda-api`，作者 **JLCEDA**，MIT，v1.1.28） |
| **官方扩展** | **Run API Gateway**：扩展管理安装，启动自动扫描 49620-49629 连出 + 握手 + 自愈重连；**必须勾「允许外部交互」与「显示在顶部菜单」** | [easyeda/eext-run-api-gateway](https://github.com/easyeda/eext-run-api-gateway)（[官方市场](https://jlc-ext.com/item/oshwhub/run-api-gateway)） |
| **官方 API** | `POST /execute {"code":"return await eda.xxx();"}` 在 EasyEDA Pro 内执行官方 `eda.*` API（120+ 类 / 62 枚举 / 70 接口） | [prodocs.easyeda.com/cn/api/](https://prodocs.easyeda.com/cn/api/) |

进度：`GET /health` 探活；动作 = 官方 API 代码（本插件映射：`sch.drc`→`eda.sch_Drc.check()`、`sch.netlist`→`eda.sch_ManufactureData.getNetlistFile()`、`sch.bom`→`eda.sch_ManufactureData.getBomFile()`、`pcb.drc`→`eda.pcb_Drc.check()`、`project.info`→`eda.dmt_Project.getCurrentProjectInfo()`；`code` 参数可直传任意官方代码）。兼容性（**已核实 2026-08**）：官方《扩展的获取和使用》明确给出**网页版**安装路径——`pro.lceda.cn/editor` → 顶部「高级」→「扩展管理器」（V3：联网可搜索安装/可导入 `.eext`）→「已安装」里可开「外部交互」权限与「显示在顶部菜单」→ 刷新页面即可。插件实现：`plugin/lib/backend.js`（spawn 官方桥 + 端口发现 + /execute）、`plugin/lib/installer.js`（一键安装官方桥：下载官方源码包→解压→离线 vendoring ws（npm 兜底）→验证）、工具 `eda_bridge_install` / `eda_backend_connect`、路由 `/install` `/bridge`。

> **定位（本轮定稿，贯彻到各文档）**：本插件 = **平台层**——负责官方桥的一键安装/启动/连接/状态 + 执行官方 `eda.*` API 的双手 + 校验工具 + 离线兜底；**生成电路图 = 在对话里进行（skill 式直觉）**——用户对 AI 说「嘉立创EDA，启动！帮我画一个 …」，agent 用 **`eda_exec`** 逐步执行官方 `eda.*` API 在用户**云端画板**实时画（放元件→连线→网络标签→DRC/网表/BOM），官方文档/样例已随桥 vendored 到 `~/.dsh/eda/bridge/`（docs/、user-guide/、guide/、format/ 目录），agent 先 read 再调用；**离线生成（`eda_generate_schematic_json`）仅作兜底**。工具共 **10 个**：`eda_status`、`eda_template_list`、`eda_translate_request`、`eda_generate_schematic_json`（离线兜底）、`eda_bridge_install`（一键装官方桥）、`eda_backend_connect`（启动/连接官方桥）、`eda_exec`（**云端实时生成的双手**）、`eda_sch_drc`、`eda_get_netlist`、`eda_get_bom`（后三个需已连接）。

> 注：下文 §0.5 记录的是 easyeda-agent 的核实结果，作为**历史对照保留**；现行方案以上表为准。

---

## 0.5 实测修订（2026-08 · easyeda-agent 仓库原文核实，**已被 §0.6 官方栈取代**，仅存档）

> 本节**更正**此前基于检索片段的结论；以下均已读原文。

1. **真实后端 = easyeda-agent（Go CLI/daemon + 连接器 .eext）**。架构：`Skill / CLI → Go daemon → EDA Agent Connector（.eext，唯一调用官方 eda.* 的组件）→ 官方 eda.* API`。
2. **没有 `easyeda mcp` 子命令**（§2.2 的 with stdio MCP 说法有误）。CLI 主形态：`easyeda daemon start`（前台阻塞常驻）+ typed 动作（94 个：49 pcb / 26 schematic / 7 board / 6 document / 2 system / 2 artifact …）。MCP 只是**可选 stdio 适配层**：仓库 `mcp/src/server.mjs` + `EASYEDA_BIN` 环境变量。
3. **不需要 Python/uv**（§2.2 有误）：CLI 为自包含二进制（macOS/Linux/Windows amd64/arm64）；仅个别辅助脚本（bom-enrich 等）需要 Python 3。
4. **连接流程**：daemon 监听**固定单端口 60832（0xEDA0）**（0.15.0 起弃用与官方 gateway 冲突的 49620）；EasyEDA Pro 内连接器端口扫描连出、握手、自愈重连。**必须开启「允许外部交互 / Allow external interaction」**（常见卡点第一位）。
5. **四件套必须同版本**（CLI / .eext / Skill / EasyEDA Pro）；`easyeda daemon health` 的 `connectorVersionOk` 判定；`easyeda update --check` 列清三方；连接器手动重导（uuid 去重：先卸载旧再导入，然后**彻底退出重开 EasyEDA**）。
6. **连接器显示名已改「EDA Agent Connector」**（内部包名 `easyeda-agent-connector`、uuid 不变）；市场 jlc-ext.com/item/zhoushoujian/easyeda-agent-connector（MIT），或 GitHub Release 侧载 `.eext`（严格同版）。
7. **Windows**：install.sh 仅 macOS/Linux；Windows 从 Release 下载 `easyeda_windows_amd64.exe` 放入 PATH。
8. **校验/生成动词（已核实）**：`easyeda health`、`easyeda sch check [--json] [--strict]`、`easyeda sch gate --strict --doc <page>`（**五关**：layout-lint→clusters→check→bridge-check→drc）、`easyeda sch netlist`（⚠ 官方 `eda.sch_Netlist.getNetlist()` 已废弃/悬空脚卡死，走 getNetlistFile）、`easyeda bom export --type csv`（自动补 LCSC C 号）、`easyeda sch export-image`（SVG/PNG/PDF）、`easyeda pcb drc` / `pcb check`、`easyeda blocks ls/show/search`（37 电路块，离线可用）、`easyeda doc reload`（PCB mutation 后必跑）。
9. **平台取向**：官方文档以 **EasyEDA Pro（桌面应用）** 为主；SKILL 原文注明「web 编辑器 + chrome-devtools MCP 时 agent 可自举全环境；桌面客户端需用户手动开/切工程（连接器照常附着）」。**网页版兼容性【待实测】**，接入指南已如实标注。
10. **本插件对应实现**：`plugin/lib/backend.js` 已改为真实 CLI/daemon 模式（spawn `easyeda daemon start` → `easyeda health` → typed 动作映射），mock CLI fixture 可测；`/api/dsh-eda/bridge` 与真实工具名在服务器下次重启后生效（当前进程为热加载的旧模块，见 plugin/README「不确定/未验证」）。

---

## 1. 结论速览（TL;DR）

| 问题 | 结论 |
|---|---|
| 用哪个做后端 | **首选 `zhoushoujianwork/easyeda-agent`**（以 **stdio MCP** 形态由插件 spawn）；备选 **`hyl64/jlcmcp`（官方栈版 MCP，59 工具）**；BOM/制造导出类补充用 **`easyeda-mcp-pro`**；`jlceda-codex-mcp` 不适合做画图后端（只做导出）。 |
| 校验/测试底座 | **官方 `easyeda/extension-dev-skill`**（官方 AI 技能包，recipes 覆盖**原理图 DRC / 网表 / BOM / PCB 制造数据**）作为**校验能力的标准实现蓝本**；运行时校验动作优先走所选后端暴露的命令，缺能力时由插件经同一 WebSocket 桥**直接调用官方 API**（`SCH_Drc.check()` / `SCH_Netlist.getNetlist()` / `SCH_ManufactureData.getBomFile()` 等，类与方法均已核实）。 |
| 怎么连上网页版画板 | **WebSocket 连本地**：编辑器里的「扩展」作为 WS **客户端**连出到本机桥接进程（127.0.0.1 某端口）；桥接进程由插件 spawn。**浏览器页面不能开监听端口，所以方向一定是「页面连出 → 本地桥」**。 |
| 用户要不要手动操作 | 要，但很少：**① 打开网页版并登录 → ② 新建/打开一张原理图 → ③ 在编辑器扩展中心装一次桥接扩展并点「运行」**→ 之后每次只需"打开画板 + 连接"。 |
| 要不要 token | **不需要**。鉴权 = 你浏览器里已登录的账号 + 本地回环（localhost）白名单。插件不碰账号密码。 |
| 校验能覆盖到什么程度 | **原理图 DRC / 网表一致性 / BOM 完整性 / PCB DRC 可全自动断言**（只要桥在线、文档打开）；**"选型是否正确、布线质量"等语义判断为半自动**（AI 判断 + 阈值）；**端到端"画板真的被画"必须真浏览器+登录验证**（无法离线 mock 全链）。 |
| 风险 | API 为官方公开（prodocs.easyeda.com），但桥接项目多为社区维护、易随编辑器升级失效；只能操作当前打开/★ 的文档；高级功能（批量 DRC 等）是否会员制待验证。 |

**一句话决策**：以「官方扩展 API（WebSocket 桥接）」为底座，包一层社区成熟封装 —— 首选 easyeda-agent（画图动作最全、专为 AI harness 设计、有官方扩展市场里的连接器扩展）；校验能力以官方 `extension-dev-skill` 的 recipes 为蓝本补齐（DRC/网表/BOM）；若希望纯 Node 依赖或更全的「自动布局/布线/DRC 自修复」工具，用 hyl64/jlcmcp。三者共享同一个官方机制（编辑器扩展 + 本地 WS），用户侧操作基本一致。

---

## 2. 候选方案逐一核实

### 2.1 官方：easyeda/easyeda-api-skill（+ easyeda/easyeda-api、easyeda/eext-run-api-gateway）

- 【已核实】仓库存在：`easyeda/easyeda-api-skill`，官方描述「嘉立创EDA专业版AI SKILL，为AI编程工具提供完整的EasyEDA Pro API接口和WebSocket桥接能力」；含 `README.md` / `README.zh-Hans.md` / `SKILL.md` / `package.json`。
- 【已核实】配套官方仓库：`easyeda/eext-run-api-gateway`（「Run API Gateway」扩展，README 含「如何安装 skill」章节，说明官方有 skill 安装器）；`easyeda/easyeda-api`（用户提供，调研中未直接检索到正文，按用户提供信息列入，【待验证】内容）。
- 【已核实】官方 API 文档站（双域名）：`prodocs.easyeda.com/cn/api/` 与 `prodocs.lceda.cn/cn/api/`，已知页面：
  - `guide/`（什么是扩展 API？）、`guide/how-to-start.html`（如何开始）、`guide/how-to-install.html`（如何安装）、`guide/invoke-apis.html`（调用扩展 API）、`guide/inline-frame.html`（内联框架支持）、`user-guide/using-extension.html`（扩展的获取和使用）、`reference/pro-api.html`（扩展 API 参考索引）。
  - API 参考（cn/en）：`PCB_Document`（含 **`PCB_Document.importAutoRouteJsonFile()`**）、`PCB_ManufactureData`（含 `getAutoRouteJsonFileForJRouter()` / `getBomFile()`）、`PCB_Drc`（含 `check()` / `getAllRuleConfigurations()`）、`SCH_Drc`（含 `check()`）、`SCH_Netlist`（含 `getNetlist()` / `setNetlist()`）、`SCH_ManufactureData`（含 `getNetlistFile()` / `getBomFile()`）、`SYS_WebSocket`（含 `register()`）—— 详见 §6。
- 【部分核实】官方 SKILL 定位：给 Claude Code / Cursor / Codex 等 AI 编程工具用；依赖编辑器扩展提供 WebSocket 桥接（「Run API Gateway」扩展即官方桥）。
- 结论：官方 = **协议/底座提供方**，本身不是「开箱即用的 DSH 后端」（要自己写调用层）；社区项目都是在它之上封装的。

### 2.2 官方：easyeda/extension-dev-skill（校验/测试专属技能包）★新增重点

- 【已核实】仓库存在，官方描述：「**用于Agent开发easyeda扩展的技能包**。AI Agent development skill for easyeda extension」；含 `README.md` / `README_EN.md` 与 **`recipes/`** 目录。
- 【已核实】recipes 已确认存在（本主题最相关的）：
  - **`recipes/sch_drc_check.md`** —— 适用摘要：「**对当前原理图执行 DRC（Design Rule Check）设计规则检查，可选择是否显示 UI 和是否返回详细错误信息**」（与用户提供的信息完全一致）。
  - **`recipes/sch_netlist_operations.md`** —— 「**原理图网表操作：获取/更新网表**」（对应 `SCH_Netlist.getNetlist()` / `setNetlist()`）。
  - `recipes/sch_manufacture_data.md`（原理图制造数据：网表文件/BOM 文件导出）。
  - `recipes/pcb_manufacture_data.md`（PCB 制造数据）。
  - `recipes/sch_document_operations.md`（原理图文档操作）。
  - `recipes/get_sch_components.md`（获取原理图元件列表）。
- 【部分核实】性质：这是**官方出的「AI 开发扩展」技能包** —— 即把「如何用官方 API 写扩展、跑 DRC、导网表/BOM」写成给 AI 看的 recipe 文档 + 代码模板，**不是运行时 MCP server**，不能直接 spawn。
- 结论：**它是校验能力的"官方标准答案"**：DRC/网表/BOM 的正确调用方式以它的 recipes + 官方参考页为准；我们的插件可把 recipes 作为实现蓝本（或直接注入系统提示让 AI 按 recipes 行事），比社区 MCP 的"约定俗成"更权威、更不易过期。

### 2.3 zhoushoujianwork/easyeda-agent（首选候选）

- 【已核实】仓库存在，官方描述：「嘉立创EDA专业版(EasyEDA Pro)自动化：给 AI harness 装上画板的『手』—— 一套 typed 原理图/PCB 动作，**CLI / Agent Skill / stdio MCP 三形态**融合接入」。
- 【已核实】配套**官方扩展市场**条目：`jlc-ext.com/item/zhoushoujian/easyeda-agent-connector`（「EasyEDA Agent Connector」—— 在编辑器里装的连接器扩展，说明它确实走"编辑器扩展 ↔ 本地桥"路线）。
- 【已核实】版本与更新：有 release `v1.0.0`、`v1.1.1`；仓库有 `install.sh`、`docs/quick-start.md`（「快速开始 & 使用注意事项」）、`docs/FEATURES.md`、`skills/easyeda-agent/SKILL.md`（含 `name: easyeda-agent`）、`skills/easyeda-agent/references/environment-setup.md`（「环境自举 — agent 自己把『可用的 EasyEDA 环境』拉起来」）。
- 【已核实】CLI 命令片段（检索到原文）：
  - `easyeda doc switch <name|uuid> [--project X]`（切换当前操作文档，FEATURES.md）；
  - `easyeda sch autoconnect`（原理图电源/地/netport 自动连接，design-flow.md：「电源/地/netport stub 用 easyeda sch autoconnect(别再手猜 connect --direction/--offset)…按真实 bbox/引脚/已有 flag 几何打分,确定性选 direction+offset」）；
  - `easyeda update`（alias `upgrade`，原地自更新「两个件」—— 即 CLI + 连接器扩展两块，FEATURES.md）。
- 【部分核实】技术栈：Python（uv 管理）+ Node（连接器扩展侧）；`install.sh` 为 bash 一键安装。
- 【部分核实】连接机制：本地 CLI 起 WS 桥 → 浏览器里打开的网页版专业版（装了 Connector 扩展）连出到本地 → 操作 **★（星标）活动文档**。
- 【待验证】精确安装/启动命令串、MCP 启动参数、Python 最低版本、Windows 支持程度（install.sh 是 bash，Windows 上可能要 WSL/手动装）；**其 DRC / 导网表 / 导 BOM 的确切子命令**（决定校验动作是"走后端命令"还是"插件直连官方 API"）。

### 2.4 easyeda-mcp-pro（npm：`easyeda-mcp-pro`，GitHub：oaslananka/easyeda-mcp-pro）

- 【已核实】npm 与 GitHub 均存在；官方描述：「MCP server for EasyEDA Pro: PCB inspection, BOM sourcing, manufacturing export, and AI-assisted hardware review」—— 定位偏**检测 / BOM 采购 / 制造导出 / 硬件评审**。
- 【已核实】配置项（README 原文片段）：`MCP_BRIDGE_BACKEND` = `local_bridge`（默认）或实验性 `remote_relay`；`TOOL_SCOPES`（能力域二次鉴权层）；`MCP_REMOTE_SESSION_ID`（remote_relay 用固定会话号）；非回环 HTTP 部署强制 OAuth2/OIDC。
- 【已核实】DeepWiki 文档结构透露其工具族：**Schematic Tools**、**Workflow Tools (L2) and Visual Tools**、**DRC/ERC Validation Tools**、**Device Catalog Tools**、**Schematic Layout Tools (L2)**，并有专章 **EasyEDA Bridge / Bridge Protocol and Manager / Extension Internals** —— 说明它同样需要编辑器里的 **「EasyEDA Bridge Extension」** 桥接扩展，且**明确有 DRC/ERC 校验工具族**（对"校验能力"是加分项）。
- 结论：Node 生态、功能全、带 DRC/ERC 工具族；但画图不是核心卖点，且多一层自有桥扩展；适合做 BOM/制造导出的补充后端，不宜做主力画图后端。

### 2.5 @vlabsoft/easyeda-pro-mcp（npm）与 VLab-Software/easyeda_mcp（GitHub）

- 【已核实】npm 包与 GitHub 仓库均存在；glama / mcp-marketplace / PulseMCP 等目录站收录（「EasyEDA Pro MCP Server by VLab-Software」）。
- 【部分核实】同为「MCP server + 编辑器桥接」形态（目录站将其列为 EasyEDA Pro MCP Server）；README 全文未取得。
- 【待验证】其桥接扩展的安装方式、工具清单（含是否暴露 DRC/网表/BOM）、与网页版的适配细节。
- 结论：与 easyeda-mcp-pro 同类竞品，未发现相对 easyeda-mcp-pro 的显著优势，不作为首选。

### 2.6 i1619khz/jlceda

- 【已核实】GitHub 存在，官方描述：「AI-driven PCB design pipeline via MCP — control JLCEDA Pro from any AI coding agent」；LobeHub MCP 目录收录。
- 【待验证】README 正文、连接机制、工具清单（校验能力未知）。
- 结论：同样走「MCP 控 JLCEDA Pro」路线，作为备选池成员；信息不足，暂不推荐。

### 2.7 Dissipative-ATLAS/jlceda-codex-mcp

- 【已核实】GitHub 存在，官方描述：「**JLCEDA Pro extension and local MCP bridge for DRC, netlist, and BOM JSON exports**」—— 明确**只做导出**（DRC / 网表 / BOM JSON），不做画图。
- 结论：**不适合作为画图后端**；其 DRC/网表/BOM 导出能力可作为「校验导出」的参考实现（与官方 `extension-dev-skill` recipes 对比后决定是否参考）。

### 2.8 调研中的额外发现（值得参考）

- 【已核实】`hyl64/jlcmcp`（npm：`@iflow-mcp/hyl64-jlcmcp`）：「嘉立创 EDA MCP Server（**官方栈版**）— **59 个工具**：PCB/原理图自动化 + 自动布局/布线/**DRC 自修复**/设计健康报告 等高级功能，**基于官方 Run API Gateway + easyeda-api-skill**」。→ **备选主推**：纯官方底座、工具全（含校验/自修复）、npm 安装。
- 【已核实】`chenjiajungithub/easyeda-deepseekharness`：「嘉立创扩展插件 ai助手（deepseek-harness）」—— 已有人把 EasyEDA 扩展与 DeepSeek Harness 直接打通，说明「编辑器扩展 ↔ 本地 Harness」路线可行（本项目相近思路的先行者，可参考）。
- 【已核实】社区教程类证据：知乎《揭秘，嘉立创EDA接入AI，自动画原理图》、腾讯云开发者《2025年起用龙虾接管了嘉立创EDA，有望实现全自动画图！》、jishuzhan《AI Agent辅助立创EDA设计——从原理图到PCB》—— 该流程已被社区多人实际跑通（网页版/桌面版均有）。

---

## 3. 选型结论表（含校验能力维度）

| 维度 | easyeda-agent（推荐） | hyl64/jlcmcp（备选） | **extension-dev-skill（官方，校验蓝本）** | easyeda-mcp-pro | @vlabsoft/easyeda-pro-mcp | jlceda (i1619khz) | jlceda-codex-mcp |
|---|---|---|---|---|---|---|---|
| 画图（放元件/连线/网络标签） | ✅ 主打 | ✅ 有（59 工具含原理图/PCB 自动化） | ⚠️ 教你怎么写扩展（模板） | ⚠️ 有 Schematic Tools 但主打评审 | ⚠️ 待验证 | 待验证 | ❌ 无 |
| 自动布局/布线（importAutoRouteJsonFile 类） | ✅ 有（sch autoconnect 等已核实） | ✅ 自动布局/布线/DRC自修复 | ✅ 以官方 API 为蓝本 | ⚠️ 部分 | 待验证 | 待验证 | ❌ |
| **DRC 校验** | ⚠️ 有 pcb/sch 子命令但【待验证】 | ✅ DRC 自修复 | ✅ **recipes/sch_drc_check.md 官方标准做法** | ✅ DRC/ERC 工具族 | 待验证 | 待验证 | ✅ 只导 DRC |
| **网表获取/比对** | ⚠️ export netlist【待验证】 | ✅ | ✅ **recipes/sch_netlist_operations.md** | ⚠️ 部分 | 待验证 | ✅ 网表导出 | ✅ 导网表 |
| **BOM 导出** | ⚠️【待验证】 | ✅ | ✅ **recipes/sch_manufacture_data.md** | ✅ 主打 | ✅ 主打 | ✅ | ✅ 导 BOM |
| DRC / 网表 / BOM 之外 | — | 设计健康报告 | 全套官方扩展开发法 | 元件目录、评审 | — | — | — |
| 面向 AI harness 形态 | CLI + Skill + **stdio MCP** 三形态 | MCP | **SKILL（文档+模板，非运行时）** | MCP | MCP | MCP | MCP |
| 依赖 | Python(uv) + Node + 连接器扩展 | Node + 官方 Run API Gateway 扩展 | 无独立运行时（作为文档/蓝本） | Node + 自有 Bridge 扩展 | Node + 自有桥 | 待验证 | 扩展 + 本地桥 |
| 维护方 | 社区 | 社区（官方栈背书） | **官方 easyeda** | 社区 | 社区 | 社区 | 社区 |
| 中文文档 | ✅ | ✅ | ✅ | ✅ | ✅ | 英文 | 英文 |
| 与「网页版在线专业版」契合度 | ✅ 官方扩展市场有专用连接器 | ✅（官方 Run API Gateway 扩展） | ✅（官方扩展体系内） | ✅（自有 Bridge 扩展） | 待验证 | 待验证 | 待验证 |
| 结论 | **主推（运行时）** | **备选主推（运行时）** | **校验能力蓝本（必用）** | 补充（BOM/制造/评审） | 补充候选 | 观察 | 不做主力 |

**选型理由**：
1. **匹配主场景**：easyeda-agent 明确覆盖「浏览器里打开的在线专业版」，其连接器扩展挂在**官方扩展市场 jlc-ext.com**，用户安装路径与官方一致，最贴合「0 基础用户网页版」目标。
2. **能力覆盖**：typed 原理图/PCB 动作 + 已核实的自动连线（`sch autoconnect`）、文档切换（`doc switch`）、自更新；画图链路（放元件→连线→网络标签→转 PCB→自动布局/布线）是它的设计目标。
3. **校验能力不赌在单一后端上**：DRC/网表/BOM 的"官方标准做法"在 `extension-dev-skill` recipes 里，且官方 API 参考页方法名已核实（§6）；无论选哪个运行时后端，插件都能经同一 WS 桥直接调用官方校验方法兜底。
4. **接入成本**：stdio MCP 形态让 DSH 插件只需 `child_process` spawn + MCP 客户端对话，不用自己实现桥接协议；同时提供 CLI 形态可退化为"命令行调用"。
5. **风险对冲**：hyl64/jlcmcp 基于**官方 Run API Gateway + easyeda-api-skill**，若 easyeda-agent 停更，可平移至 jlcmcp（同一底层机制、用户操作几乎不变）。

---

## 4. 推荐方案的安装与启动（可执行命令）

> 说明：以下命令串的**精确参数**未能在本环境全文核验（网络受限），给出的是各项目文档披露的形态；实现阶段需按仓库 README / `docs/quick-start.md` 实测一次（见文末「待办核实清单」）。

### 4.1 方案 A：easyeda-agent（首选，运行时后端）

```bash
# ① 拉取
git clone https://github.com/zhoushoujianwork/easyeda-agent.git
cd easyeda-agent

# ② 安装（仓库提供 install.sh；Python 项目用 uv 管理依赖）
#    需 Python 3.11+ 与 Node 18+（连接器扩展侧），Windows 无 install.sh 时手动 uv sync
bash install.sh            # 或：uv sync && uv build/install（以 README 为准）

# ③ 与画板建立连接（编辑器里先装好「EasyEDA Agent Connector」扩展并运行，见 §7/§8）
easyeda connect           # 形态待验证：也可能是 easyeda bridge / easyeda link

# ④ 以 stdio MCP 形态供 DSH 插件 spawn
easyeda mcp               # 形态待验证：也可能需要 --stdio / --transport stdio 参数
```

DSH 插件侧集成方式（推荐）：把 `easyeda mcp` 作为 **stdio MCP server** 用 `child_process.spawn` 拉起；对话走 MCP JSON-RPC（`initialize → tools/list → tools/call`）。

### 4.2 方案 B：hyl64/jlcmcp（备选主推，纯 npm）

```bash
# ① 安装（npm 包名已核实存在：@iflow-mcp/hyl64-jlcmcp）
npm install -g @iflow-mcp/hyl64-jlcmcp     # 或 npx 直接跑

# ② MCP 客户端配置（Claude/Cursor/自研 DSH 插件通用写法）
#  { "mcpServers": { "jlcmcp": { "command": "npx", "args": ["-y", "@iflow-mcp/hyl64-jlcmcp"] } } }
```

依赖：编辑器里先装官方 **Run API Gateway** 扩展并运行（官方栈）。

### 4.3 方案 C：校验能力蓝本（extension-dev-skill，非运行时）

```bash
# 不是 MCP server，不用装：把 recipes 作为"官方 API 用法手册"喂给插件/模型
# 实现校验动作时照抄其中调用方式（或注入系统提示让 AI 按 recipe 行事）
# 仓库：https://github.com/easyeda/extension-dev-skill
# 关键 recipe：recipes/sch_drc_check.md、recipes/sch_netlist_operations.md、
#              recipes/sch_manufacture_data.md、recipes/pcb_manufacture_data.md
```

### 4.4 环境/前置条件汇总（A/B 方案通用）

| 项 | 要求 | 说明 |
|---|---|---|
| 浏览器 | Chrome / Edge 等现代浏览器 | 打开专业版网页版，**页面保持打开** |
| 账号 | 嘉立创免费账号（网页版登录） | 不额外要 token/API Key |
| 本地端口 | 回环 127.0.0.1 可用 | 编辑器扩展连出到本地桥；端口号以扩展为准（【待验证】具体值） |
| 运行环境 | Python 3.11+ & Node 18+（A 方案）；Node 18+（B 方案） | 由 DSH 插件启动前自检并在面板提示 |

---

## 5. 暴露的动作/工具清单

### 5.1 官方 API 层（所有方案的共同底座，prodocs.easyeda.com/cn/api/）

**画图/编辑类**【已核实类，方法名见官方参考页】：

| 类 | 方法（已核实存在） | 用途 |
|---|---|---|
| `Schematic_Document` 等 | 放置/连线/网络标签类方法【方法名待验证】 | 原理图画图 |
| `PCB_Document` | **`importAutoRouteJsonFile()`** | 把自动布线结果 JSON 导入 PCB（自动布线落板） |
| `PCB_ManufactureData` | **`getAutoRouteJsonFileForJRouter()`** | 导出给 JRouter 的布线 JSON（自动布线前置） |
| `SYS_WebSocket` | **`register()`** | 外部程序注册 WebSocket（桥接协议入口） |

**校验/导出类**【已核实，详见 §6】：`SCH_Drc.check()`、`PCB_Drc.check()` / `getAllRuleConfigurations()`、`SCH_Netlist.getNetlist()` / `setNetlist()`、`SCH_ManufactureData.getNetlistFile()` / `getBomFile()`、`PCB_ManufactureData.getBomFile()`。

### 5.2 easyeda-agent CLI（已核实 + 推断形态）

【已核实】：
| 命令 | 用途 |
|---|---|
| `easyeda doc switch <name\|uuid> [--project X]` | 切换当前操作文档（对 ★ 活动文档列表操作） |
| `easyeda sch autoconnect` | 原理图自动连线（电源/地/netport stub 按几何打分选方向） |
| `easyeda update`（alias `upgrade`） | CLI + 连接器扩展双件原地自更新 |

【待验证】按 SKILL.md / FEATURES.md 推断的其余形态（`easyeda <ns> <verb> [args]`，ns ∈ `sch|pcb|doc|export|…`）：
`easyeda sch place <part>`（放元件）、`easyeda sch wire`（画线）、`easyeda sch netlabel`（网络标签）、`easyeda pcb layout`（自动布局）、`easyeda pcb route`（自动布线）、`easyeda pcb drc`（DRC）、`easyeda export netlist|bom`（导网表/BOM）等 —— **以仓库文档实测为准**。

### 5.3 与「用户要的能力」映射表（目标能力 → 实现来源）

| 用户想要的能力 | 官方 API 层 | easyeda-agent | jlcmcp（备选） | extension-dev-skill（蓝本） | easyeda-mcp-pro（补充） |
|---|---|---|---|---|---|
| 放元件 | Schematic_Document 放置类方法 | `sch place` 等【待验证】 | ✅ | ✅ 有 recipe/模板 | ⚠️ |
| 连线 / 网络标签 | Schematic_Document 画线/标签 | `sch wire / netlabel / autoconnect`【部分核实】 | ✅ | ✅ | ⚠️ |
| 转 PCB | PCB 文档创建/打开 | `pcb` 命名空间【待验证】 | ✅ | ✅ | ⚠️ |
| 自动布局 | PCB_Document 布局类方法 | `pcb layout`【待验证】 | ✅ 自动布局 | ✅ | ⚠️ |
| 自动布线 | `importAutoRouteJsonFile` + `getAutoRouteJsonFileForJRouter` | `pcb route`【待验证】 | ✅ 自动布线 | ✅ | ⚠️ |
| **原理图 DRC** | **`SCH_Drc.check()`** | `pcb/sch drc`【待验证】 | ✅ DRC 自修复 | ✅ **recipes/sch_drc_check.md** | ✅ DRC/ERC 工具族 |
| **PCB DRC** | **`PCB_Drc.check()` / `getAllRuleConfigurations()`** | 【待验证】 | ✅ | ✅ | ✅ |
| **导网表** | **`SCH_Netlist.getNetlist()` / `SCH_ManufactureData.getNetlistFile()`** | `export netlist`【待验证】 | ✅ | ✅ **recipes/sch_netlist_operations.md** | ✅ |
| **导 BOM** | **`SCH_ManufactureData.getBomFile()` / `PCB_ManufactureData.getBomFile()`** | `export bom`【待验证】 | ✅ | ✅ **recipes/sch_manufacture_data.md** | ✅ 主打 |
| 元件搜索/选型 | EEx_DB / 元件库 API | ✅（内置选型） | ✅ | ✅ | ✅ Device Catalog |

---

## 6. 校验 / 测试能力（重点章节）

> 用户最关心：**不只画，还要能检查**。本节给出：已核实的官方校验 API 方法清单 → 每个能力怎么调 → 官方蓝本 → 「生成→校验→纠错」闭环设计 → 覆盖程度如实说明。

### 6.1 已核实的官方校验 API 方法清单

全部来自官方 API 参考页（`prodocs.easyeda.com/cn/api/reference/` 与 `prodocs.lceda.cn/cn/api/reference/`），类与方法均【已核实存在】：

| 能力 | 类 | 方法 | 官方参考页（cn） | 用途/说明 |
|---|---|---|---|---|
| **原理图 DRC** | `SCH_Drc` | **`check()`** | `pro-api.sch_drc.check.html` | 对当前原理图执行设计规则检查；官方 recipe 摘要：「可选择是否显示 UI 和是否返回详细错误信息」 |
| **PCB DRC** | `PCB_Drc` | **`check()`** | `pro-api.pcb_drc.check.html` | 对当前 PCB 执行设计规则检查 |
| **PCB 规则配置** | `PCB_Drc` | `getAllRuleConfigurations()` | `pro-api.pcb_drc.getallruleconfigurations.html` | 读取当前全部 DRC 规则配置（可先读规则再判断违规） |
| **网表（内存对象）** | `SCH_Netlist` | **`getNetlist()`** | `pro-api.sch_netlist.getnetlist.html` | 从原理图取网表（程序可直接比对的 JSON 结构【格式待验证】） |
| **网表（更新）** | `SCH_Netlist` | `setNetlist()` | `pro-api.sch_netlist.setnetlist.html` | 回写/更新网表（recipe 名即「获取/更新网表」） |
| **网表文件** | `SCH_ManufactureData` | **`getNetlistFile()`** | `pro-api.sch_manufacturedata.getnetlistfile.html` | 生成可下载的网表文件（格式【待验证】） |
| **BOM 文件（原理图侧）** | `SCH_ManufactureData` | **`getBomFile()`** | `pro-api.sch_manufacturedata.getbomfile.html` | 生成 BOM 文件 |
| **BOM 文件（PCB 侧）** | `PCB_ManufactureData` | **`getBomFile()`** | `pro-api.pcb_manufacturedata.getbomfile.html` | 生成 BOM 文件（PCB 侧更全，含封装/位号） |
| **自动布线数据（导出）** | `PCB_ManufactureData` | `getAutoRouteJsonFileForJRouter()` | `pro-api.pcb_manufacturedata.getautoroutejsonfileforjrouter.html` | 导出供 JRouter 使用的布线 JSON |
| **自动布线（落板）** | `PCB_Document` | **`importAutoRouteJsonFile()`** | `pro-api.pcb_document.importautoroutejsonfile.html` | 把自动布线结果 JSON 导入 PCB |
| **桥接注册** | `SYS_WebSocket` | `register()` | `pro-api.sys_websocket.register.html` | 外部程序注册 WebSocket（一切调用的前提） |

### 6.2 原理图 DRC 的调用方式与返回结构

- **官方蓝本**：`extension-dev-skill/recipes/sch_drc_check.md`，适用摘要（原文）：「对当前原理图执行 DRC（Design Rule Check）设计规则检查，**可选择是否显示 UI 和是否返回详细错误信息**」。
- **调用形态**（依据 API 参考页类/方法 + recipe 摘要推断）：
  - 经 WS 桥调用 `SCH_Drc.check(...)`；参数疑似包含：目标文档标识、`showUI`（是否弹出检查界面）、`returnErrors/详细错误`（是否把错误列表作为返回值）等布尔开关【参数名与默认值待验证，以参考页为准】。
  - 返回结构推测为：`{ 通过与否, 错误列表: [{ 错误码/类型, 位置(元件/引脚/坐标), 描述 }] }`【字段名待验证】。
  - 可在调之前用 `PCB_Drc.getAllRuleConfigurations()`（PCB 侧）读取规则配置，实现"规则感知"的校验。
- **DSH 插件用法**：AI 画完 → 插件调 `sch_drc`（后端命令）或直连 `SCH_Drc.check()` → 把错误列表喂回 AI → AI 逐条修复 → 复跑 DRC 直到通过或达到轮次上限。

### 6.3 网表（netlist）：怎么从原理图拿到

- `SCH_Netlist.getNetlist()`：拿**内存级网表**（结构化数据），适合**程序化断言**——把"AI 画出来的实际网表"与"AI 从需求推导的期望网表"做集合对比（网络名集合、引脚连接关系），不一致即报错并给出差异清单。
- `SCH_Netlist.setNetlist()`：官方 recipe 明示支持**更新**网表（可作为纠错手段之一，但画图主路径仍走画图 API）。
- `SCH_ManufactureData.getNetlistFile()`：拿**网表文件**（面向导出的形态，格式如 CSV/JSON【待验证】），用于给用户下载/投板。
- 一致性断言示例（设计层面，实现阶段再落码）：期望网络 `{VCC, GND, 3V3, SDA, SCL, RST}` ⊆ 实际网络集合，且每个期望网络上的引脚集合非空 —— 全自动。

### 6.4 BOM 导出

- 原理图侧：`SCH_ManufactureData.getBomFile()`；PCB 侧：`PCB_ManufactureData.getBomFile()`（推荐 PCB 侧，含封装与位号）。
- 断言维度：BOM 非空；每个位号有元件型号（value 非空）；封装字段存在；与"需求里点名的关键器件"匹配（如要求 LED，BOM 里应有发光二极管类条目）—— 前两项全自动，第三项语义判断由 AI 做。

### 6.5 原理图 → PCB 自动布局 / 布线（含校验）

- 链路（官方 API，全部【已核实】方法）：`PCB_Document.importAutoRouteJsonFile()` ← 布线 JSON；布线 JSON 由 `PCB_ManufactureData.getAutoRouteJsonFileForJRouter()` 导出（配合 JRouter 自动布线服务）。
- 布线后校验：`PCB_Drc.check()` 跑 PCB 规则（线宽/间距/短路等），`getAllRuleConfigurations()` 先读规则。
- 布局环节：自动布局（摆元件）类方法在 `PCB_Document` 体系内【方法名待验证】；easyeda-agent `pcb layout`【待验证】、jlcmcp 自动布局【已核实有】。
- 备注：自动布线/布局**依赖已存在 PCB 文档**（先"转 PCB"），且**网页版在线画图免费，但 JRouter 自动布线服务是否免费/会员：待验证**。

### 6.6 ERC / 连通性 / 网络一致性：现状

- **ERC（电气规则检查）**：EasyEDA Pro 编辑器的 DRC 面板即涵盖电气类检查（社区教程将其称作 ERC）；**未检索到独立的 `SCH_Erc` 类** —— 电气规则检查应视为包含在 `SCH_Drc.check()` 的检查项内【待验证：确认 DRC 检查项清单】。
- **连通性/网络一致性**：官方文档未检索到专门的"连通性检查"API 方法；工程化做法是 **`getNetlist()` 与期望网表做程序化 diff**（§6.3），这是我们的主推一致性校验手段。PCB 布线后的连通性依靠 `PCB_Drc` + 布线完成事件【部分核实】。
- 若未来官方新增 ERC/连通性专用方法，插件按同样模式接入即可（官方参考页 `reference/pro-api.html` 是唯一事实来源）。

### 6.7 官方 extension-dev-skill vs 第三方 MCP：评估

| 维度 | **extension-dev-skill（官方）** | easyeda-agent | easyeda-mcp-pro | jlceda-codex-mcp | jlcmcp |
|---|---|---|---|---|---|
| 性质 | 官方 AI 技能包（**文档+代码模板**，非运行时） | 运行时 CLI/MCP | 运行时 MCP | 运行时 MCP（导出型） | 运行时 MCP（官方栈） |
| 校验能力覆盖 | ✅ 全（DRC/网表/BOM/制造数据 recipes） | ⚠️ 有但命令待验证 | ✅ DRC/ERC 工具族 | ✅ 只导出 | ✅ DRC 自修复+健康报告 |
| 权威性/正确性 | ✅ 官方维护，与编辑器同源 | 社区，可能滞后 | 社区 | 社区 | 社区（基于官方栈，较可信） |
| 可直接 spawn 给 DSH 用 | ❌ 不能（要自己写扩展/调用层） | ✅ | ✅ | ✅ | ✅ |
| 画图能力 | ⚠️ 模板示范 | ✅ 主打 | ⚠️ 次要 | ❌ | ✅ |
| 结论 | **校验能力的"标准答案"与实现蓝本** | 运行时主选 | 运行时补充 | 参考导出实现 | 运行时备选 |

**结论**：**官方 `extension-dev-skill` 更适合做"校验/测试能力"的地基（事实来源 + 正确调用范式），但不适合单独做运行时后端**（它不是 server）。正确组合 = **运行时后端（easyeda-agent，首选）+ 官方校验方法（按 extension-dev-skill recipes 实现，插件直连或后端命令）+ 官方 API 参考页兜底**。三方不是互斥，而是分层：`官方 API（协议） → extension-dev-skill（校验用法） → easyeda-agent/jlcmcp（运行时封装） → DSH 插件（编排）`。

### 6.8 「生成 → 自动校验 → 纠错」闭环（一次性做好的落地）

```
用户说需求（中文）
   │
   ▼
[1 生成]   AI 按需求画：放元件 → 连线 → 网络标签（easyeda-agent sch 命令 / 官方 API）
   │
   ▼
[2 校验]   (a) SCH_Drc.check()            → 错误列表（全自动）
           (b) getNetlist() vs 期望网表    → 网络集合 diff（全自动断言）
           (c) getBomFile()                → BOM 完整性断言（非空/位号/关键器件，全自动+AI 语义）
   │
   ▼
[3 纠错]   校验失败 → 把错误清单喂回 AI → AI 调画图命令修复（删/补/重连/改标签）
   │        循环直到：DRC 通过 ∧ 网表一致 ∧ BOM 满足，或达到轮次上限（如 5 轮）
   ▼
[4 转 PCB] 转 PCB → PCB_Drc.check() → （可选）getAutoRouteJsonFileForJRouter + importAutoRouteJsonFile 自动布线
   │        布线后再跑 PCB DRC（短路/间距）→ 失败则局部重布或标注人工介入
   ▼
[5 交付]   导出网表/BOM 文件（getNetlistFile / getBomFile）→ 用户下载/投板；离线备份标准版 JSON
```

实现要点：
- **校验动作必须是工具，不是模型自由发挥**：插件暴露 `eda_drc` / `eda_netlist` / `eda_bom` / `eda_net_assert` 等工具（`defineTool`），执行体走后端命令或直连官方 API，返回结构化结果（严格 schema），AI 只做"读结果→决定修什么"。
- **期望网表从哪来**：AI 在画图前先声明"需求 → 网络清单"（电源网络 + 关键信号网络 + 引脚约束），随画图过程逐步落盘；校验阶段与之比对。这是可全自动断言的根基。
- **轮次与止损**：固定最大修复轮次（如 3~5），超限输出"人工介入清单"（剩余 DRC 错误原文 + 建议），不无限循环。
- **结果留痕**：每次 DRC/网表/BOM 结果按时间归档（类似 dsh-logcat 的崩溃快照思路），面板可查历史。

### 6.9 测试/检查能覆盖到什么程度（如实说明）

| 层面 | 能全自动断言吗 | 说明 |
|---|---|---|
| 原理图 DRC 通过 | ✅ 全自动 | 桥在线 + 文档打开即可；错误列表可程序化判定 |
| 网表一致性（与期望 diff） | ✅ 全自动 | `getNetlist()` 结构化比对，可精确到网络/引脚 |
| BOM 完整性（非空/位号/关键器件存在） | ✅ 全自动（前两项）+ AI 语义（第三项） | 位号、value、封装字段可断言；"选型是否正确"需 AI/人工 |
| PCB DRC（转板后） | ✅ 全自动 | 依赖已转 PCB 且打开 |
| 自动布线完成 + 布线后 DRC | ✅ 半自动 | "完成事件"可自动等；"布线质量/美观"无客观标准，靠阈值或人工 |
| 画图动作"真的落在画板上" | ⚠️ 需真机验证 | 必须真浏览器 + 已登录账号 + 桥在线；**离线单测只能 mock WS 协议，无法代替端到端** |
| 登录/会话/断线 | ⚠️ 需真机验证 | 会话过期、页面关闭、杀软拦 WS 等只能在真实环境测 |
| 会员/收费功能边界 | ⚠️ 需真机验证 | 自动布线服务、批量 DRC 是否免费账号可用，只能实测 |

**结论**：核心闭环（画→DRC→网表→BOM→转PCB→PCB DRC）**几乎全部可自动断言**；真正离不开真机的是"端到端联通性"（登录/桥/页面）与"付费边界"。测试策略 = 离线单元测试（协议 mock）+ 真机冒烟清单（§12 待办清单第 8 项）。

---

## 7. 它怎么连上「浏览器里打开的网页版专业版画板」（重点）

### 7.1 总体架构（文字图）

```
┌─────────────── 用户电脑（同一台机器） ───────────────┐
│                                                       │
│  [浏览器]  pro.lceda.cn / pro.easyeda.com 专业版页面   │
│      │  ① 已登录；打开某工程的一张原理图/PCB           │
│      │  ② 页面内的【扩展】（连接器/Bridge/Run API      │
│      │     Gateway）作为 WebSocket【客户端】           │
│      ▼            连出到 ↓                            │
│  ws://127.0.0.1:<port>  ◄─── ③ 长连接                  │
│      │                                                 │
│  [本地桥进程]（插件 spawn 的 MCP server / CLI）         │
│      │  ④ JSON-RPC 风格请求/响应 + 事件回调             │
│  [DSH 插件 dsh-lichuang-eda]（Node 宿主）              │
│      │  ⑤ defineTool 暴露给模型                        │
│  [DeepSeek Harness 模型]                               │
└───────────────────────────────────────────────────────┘
```

要点：
1. **是 WebSocket 连本地**：浏览器页面**无法监听端口**（浏览器安全模型），所以方向为「编辑器扩展作为 WS 客户端 → 连出到本机 127.0.0.1 上的桥接进程」；官方 `SYS_WebSocket.register()` 就是桥接注册/握手入口，各项目均有「编辑器内桥接扩展」（Run API Gateway / Connector / Bridge Extension）佐证。【部分核实：方向与端口号待实测确认，但"编辑器扩展 + 本地 WS 桥"这一形态已由官方扩展市场条目与各项目文档确认】
2. **要不要用户点按钮**：要，但次数极少。用户在编辑器「扩展中心」安装一次桥接扩展（官方 Run API Gateway；或 easyeda-agent 的 EasyEDA Agent Connector；或 easyeda-mcp-pro 的 EasyEDA Bridge Extension），然后**点一次「运行/连接」**。之后每次使用 =「打开画板（页面保持打开）+ 本地桥自启 + 自动重连」。
3. **连上以后数据怎么走**：
   - 请求/响应：AI →（DSH 工具）→ 本地桥 → WS 消息 → 编辑器扩展 → 调用官方 API 在**当前打开的文档**上执行（放元件/连线/跑 DRC/取网表……）→ 结果原路返回。带请求 id，可并发。
   - 回调/事件：长耗时操作（自动布线、DRC、生成预览）完成后，编辑器侧**主动经 WS 推送事件**，桥再转成 MCP notification 回给 AI。
   - 「所见即所得」：每步执行后用户能在画板里**实时看到**元件/连线落下去。
4. **操作对象 = ★ 活动文档**：easyeda-agent 明确按「★（星标）活动文档」操作（`easyeda doc switch <name|uuid>` 可切换），即用户在工程树里**给当前要画的原理图/PCB 页打 ★**（或它自动取当前页）【部分核实：★ 机制来自 FEATURES.md 片段，具体交互以 quick-start 为准】。
5. **无云端中转、无独立 token**：链路全程本机回环；鉴权就是浏览器登录态 + localhost 白名单。非回环 HTTP 部署（easyeda-mcp-pro 文档）才要求 OAuth2，我们不涉及。

### 7.2 为什么这对 0 基础用户是"门槛最低"的路径

- 不需要会装桌面客户端、不需要申请 API Key、不需要理解 OAuth。
- 唯一的新概念是「扩展」：对应官方文档《扩展的获取和使用》（prodocs：`user-guide/using-extension.html`），入口在编辑器界面内（扩展中心），安装即点即用。
- 插件面板可把「装了没 / 连上没」做成三色状态（🔴🟡🟢，见 `docs/eda-onboarding-guide.md`），并给出「打开扩展中心」直达按钮。

---

## 8. 0 基础用户接入步骤（傻瓜式清单）

> 目标：让一个完全没画过电路的人，5 分钟内让 AI 开始在他自己的在线画板里画图。

| 步骤 | 用户手动做什么 | 插件能否自动化 |
|---|---|---|
| ① 打开网页版 | 浏览器访问 `https://pro.lceda.cn/`（或 pro.easyeda.com），登录免费账号 | 插件可提供「打开网页版」按钮（`open` URL） |
| ② 新建/打开工程 | 新建工程 → 新建一张原理图（Schematic）→ 打开它 | 打开 URL 可半自动；新建工程需用户点（网页版 UI 操作，暂不模拟） |
| ③ 安装桥接扩展（仅第一次） | 在编辑器「扩展中心」搜 **EasyEDA Agent Connector**（或官方 Run API Gateway）并安装 | 插件给出直达链接 `https://jlc-ext.com/item/zhoushoujian/easyeda-agent-connector`，用户点一次「安装」 |
| ④ 运行扩展 / 连接 | 在扩展面板点「运行/连接」；本地桥由插件自动 spawn 并监听 | **自动**（插件 spawn `easyeda mcp`；检测 WS 连上后面板变 🟢） |
| ⑤ 给文档打 ★（若需要） | 在工程树里给当前原理图页点星标（或保持其为唯一打开页） | 插件可检测当前文档并提示；`easyeda doc switch` 也能切换【待验证】 |
| ⑥ 描述需求 | 在 DSH 对话框用中文说：如「画一个 5V→3.3V 降压电路给 ESP32 供电」 | 自动（模型的活） |
| ⑦ 校验与交付 | 什么都不用做；AI 画完自动跑 DRC/网表/BOM 校验并自修复，通过后提示你导出 | **自动**（§6.8 闭环） |

**可自动化程度**：用户真正必须手动的是 **①②④ 的前半段**（打开+登录+新建工程+点一次运行）；③⑥⑦ 均可由插件引导/自动完成。这比任何「配 token / 装客户端 / 写配置文件」的方案都简单。

---

## 9. 风险与限制

| 类别 | 内容 | 缓解 |
|---|---|---|
| API 稳定性 | 官方 API（prodocs）公开但**可能随版本变更**；SKILL 类方法名以文档为准 | 插件锁后端版本（git tag / npm 版本固定），升级前回归 |
| 校验方法可用性 | `SCH_Drc.check` 等是否在**网页版**开放（vs 桌面版专属）**待验证** | 真机冒烟清单第 1 项；若网页版缺某方法，降级为"编辑器内手动 DRC + 插件引导" |
| 社区维护风险 | easyeda-agent 等为社区项目，可能停更 | 双后端设计（A：easyeda-agent / B：jlcmcp 官方栈），校验能力以官方 API 兜底 |
| 登录态/会话 | 依赖浏览器登录态；**页面不能关**、登录不能过期，否则断连 | 面板状态灯 + 断线重连 + 提示重新登录 |
| 操作范围限制 | 只能操作**当前打开/★ 的文档**，不能跨工程后台改文件 | 产品定位即「只动你打开的这张图」，反而安全 |
| 鉴权边界 | 全链根本机回环；若未来走 remote_relay（easyeda-mcp-pro 实验特性）才有远程会话号概念 | 默认不用 remote_relay |
| 收费/会员 | 网页版在线画图免费；**自动布线（JRouter）、批量 DRC 服务、制造数据导出是否会员制：待验证** | 插件按调用结果提示；onboarding 指南已提示 |
| 本地环境 | Python/Node 版本不符、端口被占、杀软拦 WS | 插件启动前自检 + 明确报错 |
| Windows 支持 | easyeda-agent `install.sh` 是 bash；Windows 需 uv 手动装或 WSL【待验证】 | 插件检测平台给对应指引；备选 jlcmcp（纯 npm）规避 Python 依赖 |
| 浏览器策略 | 页面连出到 127.0.0.1 一般允许（Mixed Content 需 https 页连 ws 亦常见）；部分企业浏览器策略可能拦截 | 面板给出排障步骤 |

---

## 10. 相关参考链接

### 官方
- 官方 SKILL：https://github.com/easyeda/easyeda-api-skill （README.zh-Hans.md 中文版）
- **官方扩展开发技能包：https://github.com/easyeda/extension-dev-skill**（校验蓝本）
  - recipe 原理图 DRC：https://github.com/easyeda/extension-dev-skill/blob/main/recipes/sch_drc_check.md
  - recipe 网表操作：https://github.com/easyeda/extension-dev-skill/blob/main/recipes/sch_netlist_operations.md
  - recipe 原理图制造数据（BOM/网表文件）：https://github.com/easyeda/extension-dev-skill/blob/main/recipes/sch_manufacture_data.md
  - recipe PCB 制造数据：https://github.com/easyeda/extension-dev-skill/blob/main/recipes/pcb_manufacture_data.md
  - recipe 原理图文档操作：https://github.com/easyeda/extension-dev-skill/blob/main/recipes/sch_document_operations.md
  - recipe 获取原理图元件：https://github.com/easyeda/extension-dev-skill/blob/main/recipes/get_sch_components.md
- 官方 Run API Gateway 扩展：https://github.com/easyeda/eext-run-api-gateway
- 官方 API 文档（中）：https://prodocs.easyeda.com/cn/api/ 、 https://prodocs.lceda.cn/cn/api/
  - 扩展 API 参考索引：https://prodocs.easyeda.com/cn/api/reference/pro-api.html
  - 如何开始：https://prodocs.easyeda.com/cn/api/guide/how-to-start.html
  - 如何安装：https://prodocs.easyeda.com/cn/api/guide/how-to-install.html
  - 调用扩展 API：https://prodocs.easyeda.com/cn/api/guide/invoke-apis.html
  - 扩展的获取和使用：https://prodocs.easyeda.com/cn/api/user-guide/using-extension.html
  - **原理图 DRC**：https://prodocs.easyeda.com/cn/api/reference/pro-api.sch_drc.check.html
  - **PCB DRC**：https://prodocs.easyeda.com/cn/api/reference/pro-api.pcb_drc.check.html ；规则配置：https://prodocs.easyeda.com/cn/api/reference/pro-api.pcb_drc.getallruleconfigurations.html
  - **网表**：https://prodocs.easyeda.com/cn/api/reference/pro-api.sch_netlist.getnetlist.html ；setNetlist：https://prodocs.easyeda.com/cn/api/reference/pro-api.sch_netlist.setnetlist.html
  - **网表文件**：https://prodocs.easyeda.com/cn/api/reference/pro-api.sch_manufacturedata.getnetlistfile.html
  - **BOM（原理图侧）**：https://prodocs.easyeda.com/cn/api/reference/pro-api.sch_manufacturedata.getbomfile.html ；**BOM（PCB 侧）**：https://prodocs.easyeda.com/cn/api/reference/pro-api.pcb_manufacturedata.getbomfile.html
  - 自动布线导入：https://prodocs.easyeda.com/cn/api/reference/pro-api.pcb_document.importautoroutejsonfile.html ；JRouter 布线数据：https://prodocs.easyeda.com/cn/api/reference/pro-api.pcb_manufacturedata.getautoroutejsonfileforjrouter.html
  - 桥接注册：https://prodocs.easyeda.com/en/api/reference/pro-api.sys_websocket.register.html

### 社区封装（候选）
- easyeda-agent（推荐）：https://github.com/zhoushoujianwork/easyeda-agent ；连接器扩展：https://jlc-ext.com/item/zhoushoujian/easyeda-agent-connector ；ClawHub 镜像：https://clawhub.ai/zhoushoujianwork/skills/easyeda-agent
- jlcmcp（备选，官方栈 59 工具）：https://github.com/hyl64/jlcmcp ；npm：https://www.npmjs.com/package/@iflow-mcp/hyl64-jlcmcp
- easyeda-mcp-pro：https://github.com/oaslananka/easyeda-mcp-pro ；npm：https://www.npmjs.com/package/easyeda-mcp-pro ；DeepWiki：https://deepwiki.com/oaslananka/easyeda-mcp-pro/
- @vlabsoft/easyeda-pro-mcp：https://www.npmjs.com/package/@vlabsoft/easyeda-pro-mcp ；源码：https://github.com/VLab-Software/easyeda_mcp
- i1619khz/jlceda：https://github.com/i1619khz/jlceda
- Dissipative-ATLAS/jlceda-codex-mcp：https://github.com/Dissipative-ATLAS/jlceda-codex-mcp
- 先行者（DSH×EDA）：https://github.com/chenjiajungithub/easyeda-deepseekharness

### 社区教程（佐证可行性与接入步骤）
- 知乎《揭秘，嘉立创EDA接入AI，自动画原理图》：https://zhuanlan.zhihu.com/p/2076031373421310106
- 技术栈网《AI Agent辅助立创EDA设计——从原理图到PCB》：https://jishuzhan.net/article/2075782173088161793
- 腾讯云开发者《2025年起用龙虾接管了嘉立创EDA…》：https://developer.cloud.tencent.cn/article/2645261
- 今日头条《加个拓展API，PCB设计效率即可飙升？怎么加？一文讲清！》：https://m.toutiao.com/article/7512754824325218867/

### 本仓库既有参考
- 0 基础接入指南初稿：`docs/eda-onboarding-guide.md`（结论与此调研一致，可后续按实测细化第③④步按钮位置）
- 插件 API 规格：`docs/plugin-spec.md`（`ctx.webServer`/`registerUpgrade` 已有 WS 支持范例，插件内嵌 WS 客户端可行）
- 离线格式路线参考（备选/兜底）：`docs/ref/`（.epro2 文件格式 + LCSC 元件 API —— 若实时桥不可用时，可退化为"生成 .epro2 文件让用户导入"）

---

## 11. 轻量验证记录（本轮实际做了什么 / 没做什么）

- **做了**：web_search 检索官方文档（含 `extension-dev-skill` recipes、`SCH_Drc`/`PCB_Drc`/`SCH_Netlist`/`SCH_ManufactureData` 等 API 参考页）、候选仓库、npm、目录站、社区文章并核对；检查了本仓库 `docs/` 既有材料（onboarding 指南、plugin-spec、ref 离线路线）。
- **没做**：未 `npm install`、未 clone、未启动任何服务、未修改 DSH checkout 与任何参考插件（符合任务约束）。
- **环境限制**：本沙箱无法直连 GitHub/npm/官方文档（TLS 凭证缺失 `SEC_E_NO_CREDENTIALS`），故 README/文档正文未能全文拉取 —— 这正是上文大量「待验证」项的来源。

## 12. 核实清单（官方栈 · 2026-08 更新）

> 此前 §12 曾按 easyeda-agent（**已弃用**）列了 10 项；现按 §0.6 官方栈重列。凡「已核实」的结论见 §0.6；「待真机」项需端到端实测。

**已核实（划掉）**：

- [x] 官方桥命令与脚本：`easyeda/easyeda-api-skill` 的 `scripts/bridge-server.mjs`（`npm run server`），监听 127.0.0.1:49620-49629，握手 `service:"easyeda-bridge"`；`GET /health` 探活；`POST /execute {"code":"return await eda.xxx();"}`。
- [x] 官方扩展：**Run API Gateway**（市场 https://jlc-ext.com/item/oshwhub/run-api-gateway ，官方广场 https://jlc-ext.com），需勾「允许外部交互」与「显示在顶部菜单」。
- [x] 网页版扩展安装路径：`pro.lceda.cn/editor` →「高级」→「扩展管理器」（V3：联网可搜索安装/可导入 `.eext`）→「已安装」里开「外部交互」权限与「显示在顶部菜单」→ 刷新/重开页面（官方《扩展的获取和使用》2026-05 更新）。
- [x] 官方 API：`POST /execute` 执行官方 `eda.*` API（类：SCH_Document、SCH_Drc、SCH_Netlist、SCH_ManufactureData、PCB_Document、PCB_Drc、PCB_ManufactureData、LIB_*、DMT_Project 等），参考 prodocs.easyeda.com/cn/api/。
- [x] 本机特殊处理：npm 被 PowerShell ExecutionPolicy 禁（npm.ps1 无法运行）→ 官方桥依赖 `ws` 采用**离线 vendoring**（从 DSH 宿主 node_modules 拷贝）安装，npm 仅兜底（Windows 用 npm.cmd）；安装命令幂等（已装则跳过，不损坏现状）。
- [x] 生命周期/持久性：官方桥一键安装/启动/连接/状态由插件承担；插件加载时若检测到已装则**自动启动并自动连接**。扩展安装+外部交互权限=随账号持久；官方桥=随本机磁盘持久；连接=每次打开编辑器自动重连（需桥在跑，由插件自理）。
- [x] v0 离线生成器仅支持 电阻/LED 符号（`supportedTypes`）；离线生成产物写入 `~/.dsh/eda/output/`。

**待真机（端到端）**：

- [ ] 端到端冒烟（真机）：浏览器打开+登录 → 装官方扩展 Run API Gateway + 勾「外部交互」 → `eda_backend_connect` 启动/连接官方桥 → **`eda_status.connected` 为 `true`（扩展连桥信号）** → `eda_exec` 放元件/连线/网络标签 → `eda_sch_drc`/`eda_get_netlist`/`eda_get_bom` 全链路跑通一遍；记录实际端口、按钮路径、耗时与失败点。
- [ ] 收费/会员边界：自动布线、批量 DRC、制造数据导出在免费账号下是否可用。
- [ ] 生成的标准版 JSON 在**真实嘉立创 EDA 标准版**里导入（无报错）。
- [ ] 网页版（pro.lceda.cn）对 `eda.sch_Drc.check()` 等校验方法的可用性（vs 桌面版专属）。
