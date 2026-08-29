/**
 * dsh-lichuang-eda — browser half. Runs inside the dsh web GUI.
 *
 * 平台仪表盘 + 监看器（生成在对话里由 agent 驱动官方 eda.* API 完成）：
 *   - header（品牌 + 状态版本）
 *   - 连接卡：状态 + 一键动作（装/启/打开编辑器/扩展直达）
 *   - 连接教程（可折叠，默认收起，精简步骤）
 *   - 活动监视（主体）：当前会话 agent 对官方 API 的实时调用流（动作/耗时/结果）
 *   - 离线导出（底部小结）：仅兜底，导出可导入的标准版 JSON
 *
 * Bundle format: `window.__ModuleLoader__.load({id, factory})` (lazy CJS) —
 * the only client bundle format the web shell materializes. The apply/inject
 * export shape and ctx.effect disposer follow the DSH client-bundle contract.
 */
window.__ModuleLoader__.load({
	id: "@windypro-rourou/dsh-eda",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;

		const { createElement: h, useEffect, useState } = require("react");
		const { createRoot } = require("react-dom/client");

		//#region styles
		const STYLE = `
[data-dsh-eda-entry] {
  display: flex; align-items: center; gap: 8px; width: 100%;
  padding: 9px 12px; margin: 2px 0; border: 0; border-radius: 8px;
  background: transparent; color: inherit; font: inherit; cursor: pointer; text-align: left;
}
[data-dsh-eda-entry]:hover { background: rgba(128,128,128,.14); }
[data-dsh-eda-entry][data-active] { background: rgba(128,128,128,.22); }
[data-dsh-eda-entry] .eda-entry-icon { display: inline-flex; align-items: center; justify-content: center; width: 16px; height: 16px; flex: none; }
[data-dsh-eda-entry] .eda-entry-label { font-size: 13px; line-height: 1.2; opacity: .92; }

.dsh-eda-view { position: fixed; top: 0; right: 0; bottom: 0; width: min(420px, 94vw); z-index: 9999; }
.dsh-eda-view[hidden] { display: none !important; }
.dsh-eda-panel {
  position: absolute; inset: 0; background: light-dark(#fbfbfc, #121417);
  color: light-dark(#1c1f24, #e3e6ea);
  border-left: 1px solid light-dark(rgba(0,0,0,.09), rgba(255,255,255,.10));
  font: 13px/1.6 -apple-system, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;
  color-scheme: light dark;
  display: flex; flex-direction: column;
}
.eda-panel { display: flex; flex-direction: column; height: 100%; min-height: 0; }

.eda-head {
  flex: none; display: flex; align-items: center; gap: 10px;
  padding: 13px 16px; border-bottom: 1px solid light-dark(rgba(0,0,0,.08), rgba(255,255,255,.09));
}
.eda-head .eda-mark { width: 26px; height: 26px; border-radius: 6px; flex: none; background: #2563eb; color: #fff; display: grid; place-items: center; font-size: 12px; font-weight: 700; }
.eda-head .eda-tt { min-width: 0; flex: 1; }
.eda-head h1 { font-size: 14px; font-weight: 700; margin: 0; line-height: 1.3; }
.eda-head .eda-sub { font-size: 11px; opacity: .55; margin: 0; }
.eda-close { border: 0; background: transparent; color: inherit; cursor: pointer; font-size: 15px; line-height: 1; padding: 5px 8px; border-radius: 6px; opacity: .6; }
.eda-close:hover { opacity: 1; background: light-dark(rgba(0,0,0,.06), rgba(255,255,255,.08)); }

.eda-scroll { flex: 1 1 0; min-height: 0; overflow-y: auto; padding: 13px 16px 18px; display: flex; flex-direction: column; gap: 12px; }

.eda-card { border: 1px solid light-dark(rgba(0,0,0,.09), rgba(255,255,255,.10)); border-radius: 10px; padding: 12px 14px; background: light-dark(#ffffff, #17191d); }
.eda-card-title { font-size: 12px; font-weight: 600; opacity: .75; margin: 0 0 8px; }

.eda-note { font-size: 11.5px; opacity: .62; margin: 8px 0 0; line-height: 1.6; }
.eda-muted { font-size: 11px; opacity: .5; }

.eda-status { display: flex; align-items: center; gap: 8px; }
.eda-status .eda-dot { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.eda-status .eda-dot.on { background: #16a34a; }
.eda-status .eda-dot.off { background: #d97706; }
.eda-status .eda-dot.wait { background: #9ca3af; animation: edaPulse 1.2s ease-in-out infinite; }
.eda-status .eda-txt { font-size: 13px; font-weight: 600; }
.eda-status .eda-txt small { font-weight: 400; opacity: .55; margin-left: 6px; }
@keyframes edaPulse { 0%,100% { opacity: .45; } 50% { opacity: 1; } }

.eda-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
.eda-btn {
  display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid transparent; border-radius: 8px; padding: 6px 12px;
  font: inherit; font-size: 12px; font-weight: 600; cursor: pointer;
  transition: background .12s ease, border-color .12s ease;
}
.eda-btn.primary { background: #2563eb; color: #fff; }
.eda-btn.primary:hover { background: #1d4ed8; }
.eda-btn.primary:disabled { opacity: .5; cursor: default; }
.eda-btn.ghost { background: transparent; border-color: light-dark(rgba(0,0,0,.14), rgba(255,255,255,.16)); color: inherit; }
.eda-btn.ghost:hover { background: light-dark(rgba(0,0,0,.04), rgba(255,255,255,.06)); }
.eda-btn.ghost:disabled { opacity: .45; cursor: default; }
.eda-btn.big { width: 100%; padding: 8px 13px; font-size: 13px; }
.eda-link { color: #2563eb; text-decoration: none; font-size: 12px; }
.eda-link:hover { text-decoration: underline; }

/* connect wizard (collapsed by default, compact) */
.eda-steps { display: flex; flex-direction: column; gap: 9px; margin-top: 2px; }
.eda-step { display: flex; gap: 9px; }
.eda-step .eda-step-no { width: 19px; height: 19px; flex: none; border-radius: 50%; display: grid; place-items: center; font-size: 10.5px; font-weight: 700; background: light-dark(#eef2f7, #24272c); opacity: .85; }
.eda-step .eda-step-body { min-width: 0; flex: 1; }
.eda-step .eda-step-name { font-size: 12.5px; font-weight: 600; }
.eda-step .eda-step-hint { font-size: 11px; opacity: .58; margin-top: 1px; line-height: 1.5; }
.eda-step .eda-step-action { margin-top: 5px; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.eda-step .eda-step-result { font-size: 11.5px; opacity: .7; }

/* activity monitor (main) */
.eda-act { display: flex; flex-direction: column; gap: 0; }
.eda-act-item { display: flex; gap: 9px; padding: 9px 0; border-bottom: 1px solid light-dark(rgba(0,0,0,.05), rgba(255,255,255,.06)); cursor: pointer; }
.eda-act-item:hover { background: light-dark(rgba(0,0,0,.03), rgba(255,255,255,.03)); }
.eda-act-item:last-child { border-bottom: 0; }
.eda-act-item .eda-act-dot { flex: none; margin-top: 5px; width: 7px; height: 7px; border-radius: 50%; background: #9ca3af; }
.eda-act-item.ok .eda-act-dot { background: #16a34a; }
.eda-act-item.err .eda-act-dot { background: #dc2626; }
.eda-act-item.pend .eda-act-dot { background: #f59e0b; animation: edaPulse 1s ease-in-out infinite; }
.eda-act-item .eda-act-body { min-width: 0; flex: 1; }
.eda-act-item .eda-act-line { display: flex; align-items: baseline; gap: 8px; }
.eda-act-item .eda-act-seq { font-family: ui-monospace, Consolas, monospace; font-size: 10px; opacity: .45; flex: none; }
.eda-act-item .eda-act-name { font-size: 12.5px; font-weight: 600; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eda-act-item .eda-act-meta { font-size: 10.5px; opacity: .5; }
.eda-revoke { padding: 2px 8px !important; font-size: 10px !important; }
.eda-hints { display: flex; flex-direction: column; gap: 5px; margin-top: 2px; }
.eda-hint { font-size: 11px; opacity: .68; }
.eda-act-item .eda-act-meta .eda-pend { color: #f59e0b; opacity: 1; font-weight: 600; }
.eda-act-item .eda-act-code { font-family: ui-monospace, Consolas, monospace; font-size: 10.5px; opacity: .55; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eda-act-item .eda-act-out { font-size: 11px; opacity: .65; margin-top: 2px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eda-act-item .eda-act-out.err { color: #dc2626; opacity: .9; }
.eda-act-item .eda-act-full {
  white-space: pre-wrap; word-break: break-all; font-family: ui-monospace, Consolas, monospace;
  font-size: 10.5px; line-height: 1.55; opacity: .8; margin-top: 5px; padding: 7px 9px;
  background: light-dark(rgba(0,0,0,.045), rgba(255,255,255,.05)); border-radius: 7px;
  max-height: 240px; overflow: auto;
}
.eda-act-item .eda-act-full .eda-act-full-label { font-family: inherit; font-size: 10px; opacity: .5; margin: 0 0 2px; }
.eda-act-empty { font-size: 11.5px; opacity: .5; padding: 6px 0; }

/* activity header row: title + session switcher */
.eda-act-head { display: flex; align-items: center; gap: 8px; }
.eda-act-head .eda-card-title { flex: 1; margin: 0; }
.eda-sess {
  font: inherit; font-size: 10.5px; border: 1px solid light-dark(rgba(0,0,0,.14), rgba(255,255,255,.16));
  border-radius: 6px; background: transparent; color: inherit; padding: 2px 6px; max-width: 130px; cursor: pointer;
}
.eda-act-hint { font-size: 10.5px; opacity: .5; margin: 6px 0 0; }

/* 醒目对话入口 (connected CTA) */
.eda-cta {
  display: flex; align-items: center; gap: 10px; margin-top: 10px; padding: 9px 12px;
  border: 1px solid rgba(37,99,235,.35); border-radius: 10px; cursor: pointer;
  background: linear-gradient(180deg, rgba(37,99,235,.10), rgba(37,99,235,.03));
}
.eda-cta:hover { background: rgba(37,99,235,.14); }
.eda-cta .eda-cta-bubble { font-size: 16px; flex: none; }
.eda-cta .eda-cta-text { min-width: 0; flex: 1; }
.eda-cta .eda-cta-title { font-size: 10.5px; opacity: .6; }
.eda-cta .eda-cta-phrase { font-family: inherit; font-size: 12.5px; font-weight: 700; color: #2563eb; }
.eda-cta .eda-cta-copy { flex: none; font-size: 10.5px; opacity: .55; }
.eda-cta.ok .eda-cta-copy { color: #16a34a; opacity: 1; }

/* offline export (footer, small) */
.eda-prompt textarea {
  width: 100%; box-sizing: border-box; resize: vertical; min-height: 56px; border-radius: 8px;
  border: 1px solid light-dark(rgba(0,0,0,.14), rgba(255,255,255,.16));
  background: light-dark(#fafafa, #121317); color: inherit; font: inherit; font-size: 12px; line-height: 1.6;
  padding: 8px 10px; outline: none;
}
.eda-prompt textarea:focus { border-color: #2563eb; }
.eda-prompt textarea::placeholder { opacity: .45; }
.eda-chips { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.eda-chip { border: 1px solid light-dark(rgba(0,0,0,.11), rgba(255,255,255,.13)); border-radius: 999px; padding: 3px 9px; font-size: 11px; cursor: pointer; color: inherit; background: transparent; }
.eda-chip:hover { border-color: rgba(37,99,235,.55); }

.eda-foot { font-size: 11px; opacity: .5; text-align: center; margin: 2px 0 0; }
`;
		//#endregion

		const API_BASE = "/api/dsh-eda";
		const LINKS = {
			editor: "https://pro.lceda.cn/editor",
			ext: "https://jlc-ext.com/item/oshwhub/run-api-gateway",
			skill: "https://github.com/easyeda/easyeda-api-skill",
		};

		//#region data
		const CONNECT_STEPS = [
			{ id: 0, name: "一键安装官方桥", hint: "官方 easyeda-api-skill → ~/.dsh/eda/bridge/（离线依赖，无需 npm）。" },
			{ id: 1, name: "启动官方桥", hint: "Bridge Server 监听 127.0.0.1:49620-49629，自动探测。" },
			{ id: 2, name: "网页版装扩展 Run API Gateway", hint: "pro.lceda.cn/editor →「高级」→「扩展管理器」→ 搜索安装；「已安装」里开「外部交互」+「显示在顶部菜单」。" },
			{ id: 3, name: "验证", hint: "刷新编辑器页面；面板状态变绿 = 已连上你的云画板。" },
		];
		//#endregion

		//#region hooks
		function useStatus() {
			const [status, setStatus] = useState(null);
			const [error, setError] = useState(false);
			useEffect(() => {
				let alive = true;
				const load = () => {
					fetch(API_BASE + "/status")
						.then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
						.then((b) => { if (alive) { setStatus(b); setError(false); } })
						.catch(() => { if (alive) { setStatus(null); setError(true); } });
				};
				load();
				const t = setInterval(load, 4000);
				return () => { alive = false; clearInterval(t); };
			}, []);
			return [status, error];
		}

		/**
		 * Poll the agent-activity feed (what the conversation's agent is doing
		 * through the official API right now). `pinnedSid` = '' means "follow
		 * the freshest session" (the panel's default for 仅当前会话).
		 */
		function useActivity() {
			const [feed, setFeed] = useState({ activities: [], sessions: [], currentSid: '', error: false });
			const [pinnedSid, setPinnedSid] = useState("");
			useEffect(() => {
				let alive = true;
				const load = () => {
					const q = pinnedSid ? "?sid=" + encodeURIComponent(pinnedSid) : "";
					fetch(API_BASE + "/activity" + q)
						.then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
						.then((b) => {
							if (!alive) return;
							setFeed({ activities: Array.isArray(b.activities) ? b.activities : [], sessions: Array.isArray(b.sessions) ? b.sessions : [], currentSid: b.currentSid ?? "", error: false });
						})
						.catch(() => { if (alive) setFeed((prev) => ({ ...prev, error: true })); });
				};
				load();
				const t = setInterval(load, 3000);
				return () => { alive = false; clearInterval(t); };
			}, [pinnedSid]);
			return { ...feed, setSid: setPinnedSid, pinned: pinnedSid };
		}
		//#endregion

		//#region components
		/** Compact connection card: state + one-click platform actions + dialog CTA. */
		function ConnectCard({ status, error, onInstall, onStartBridge, installState, bridgeState }) {
			const ready = status?.connected === true;
			const [copied, setCopied] = useState(false);
			const dot = status === null ? (error ? "off" : "wait") : (ready ? "on" : "off");
			const state = status === null ? (error ? "状态服务未响应" : "检测中…") : (ready ? "已连接 · " + (status.port ? "127.0.0.1:" + status.port : "") : "未连接");
			const win = status?.health?.match(/edaWindowCount:(\d+)/)?.[1] ?? null;
			const inst = status?.bridgeInstalled === true;
			const copyPrompt = () => {
				const text = "嘉立创EDA，启动！帮我画一个 LED 点亮电路";
				try { navigator.clipboard?.writeText(text); } catch { /* clipboard may be unavailable */ }
				setCopied(true);
				setTimeout(() => setCopied(false), 1600);
			};
			return h("div", { className: "eda-card" },
				h("div", { className: "eda-status" },
					h("span", { className: "eda-dot " + dot }),
					h("div", { className: "eda-txt" }, state, win !== null ? h("small", null, "窗口 " + win) : null)),
				h("div", { className: "eda-actions" },
					h("button", {
						className: "eda-btn " + (inst ? "ghost" : "primary"),
						disabled: inst || installState?.busy,
						onClick: onInstall,
						title: inst ? "官方桥已安装（随本机持久）" : "",
					}, inst ? "官方桥已安装 ✓" : (installState?.busy ? "安装中…" : "一键安装官方桥")),
					h("button", { className: "eda-btn ghost", disabled: bridgeState?.busy, onClick: onStartBridge }, bridgeState?.busy ? "启动中…" : "启动官方桥"),
					h("a", { className: "eda-link", href: LINKS.editor, target: "_blank", rel: "noreferrer" }, "打开编辑器"),
					h("a", { className: "eda-link", href: LINKS.ext, target: "_blank", rel: "noreferrer" }, "扩展直达")),
				ready
					? h("div", { className: "eda-cta" + (copied ? " ok" : ""), onClick: copyPrompt, title: "点击复制到剪贴板，然后在对话里发送" },
						h("span", { className: "eda-cta-bubble" }, "💬"),
						h("div", { className: "eda-cta-text" },
							h("div", { className: "eda-cta-title" }, "去对话里说："),
							h("span", { className: "eda-cta-phrase" }, "「嘉立创EDA，启动！」")),
						h("span", { className: "eda-cta-copy" }, copied ? "已复制 ✓" : "点击复制"))
					: h("p", { className: "eda-note", style: { margin: "8px 0 0" } }, "连接好画板后，在对话里描述需求即可实时生成；下方「导出离线版」仅作兜底。"),
				installState?.result ? h("p", { className: "eda-note" }, installState.result) : null,
				bridgeState?.result ? h("p", { className: "eda-note" }, bridgeState.result) : null,
			);
		}

		/** Collapsible connect guide (compact). */
		function ConnectWizard({ open, setOpen }) {
			if (!open) {
				return h("button", { className: "eda-btn ghost", style: { width: "100%" }, onClick: () => setOpen(true) }, "连接教程（4 步 · 网页版）");
			}
			return h("div", { className: "eda-card" },
				h("div", { className: "eda-card-title" }, "连接教程（官方栈 · 网页版）"),
				h("div", { className: "eda-steps" }, CONNECT_STEPS.map((s) =>
					h("div", { className: "eda-step", key: s.id },
						h("div", { className: "eda-step-no" }, String(s.id + 1)),
						h("div", { className: "eda-step-body" },
							h("div", { className: "eda-step-name" }, s.name),
							h("div", { className: "eda-step-hint" }, s.hint))))),
				h("p", { className: "eda-note", style: { margin: "10px 0 0" } },
					[LINKS.editor, LINKS.ext].map((l) => h("a", { className: "eda-link", href: l, target: "_blank", rel: "noreferrer", key: l, style: { marginRight: 12 } }, l)),
					h("button", { className: "eda-link", onClick: () => setOpen(false), style: { border: 0, background: "transparent", cursor: "pointer", padding: 0 } }, "收起")));
		}

		/**
		 * The monitor: RECORD-STYLE timeline (参考 DSH 轨迹) — every step is
		 * numbered (persisted on disk, so it is never empty), each entry can be
		 * 撤回 (deletes the primitives that step created) or expanded; the card
		 * has 清空记录. When nothing has happened yet, a static capability
		 * preview keeps the panel informative (not blank).
		 */
		function ActivityMonitor({ activities, sessions, currentSid, setSid, pinned, error, connected, onRevoke, busyId, onClear, clearing }) {
			const [expanded, setExpanded] = useState(() => new Set());
			const toggle = (id) => {
				setExpanded((prev) => {
					const next = new Set(prev);
					if (next.has(id)) next.delete(id); else next.add(id);
					return next;
				});
			};
			const list = Array.isArray(activities) ? activities : [];
			const sids = Array.isArray(sessions) ? sessions : [];
			const hasMulti = sids.length > 1;
			return h("div", { className: "eda-card" },
				h("div", { className: "eda-act-head" },
					h("div", { className: "eda-card-title" }, "Agent 正在使用官方 API"),
					hasMulti
						? h("select", {
							className: "eda-sess",
							value: pinned ?? "",
							onChange: (e) => setSid(e.target.value),
							title: "切换会话（默认跟随最新）",
						},
							h("option", { value: "" }, "跟随最新会话"),
							sids.map((s) => h("option", { value: s.sid ?? "", key: (s.sid || "(platform)") + s.lastTs }, s.label ?? "会话")))
						: (currentSid && list.length > 0 ? h("span", { className: "eda-sess", style: { cursor: "default" } }, "当前会话") : null),
					list.length > 0
						? h("button", { className: "eda-btn ghost", style: { padding: "3px 9px", fontSize: "10.5px" }, disabled: clearing, onClick: onClear, title: "清空时间线（含磁盘历史）" }, clearing ? "清空中…" : "清空记录")
						: null),
				list.length === 0
					? h("div", null,
						h("div", { className: "eda-act-empty" }, error
							? "实时活动流暂不可用（服务端新模块待重启后启用）；重启后这里会持续记录 agent 的每一步。"
							: "还没有记录——历史会保存在 ~/.dsh/eda/activity.jsonl，面板永不空白。你可以让 agent："),
						h("div", { className: "eda-hints" },
							["放置任意大类元件（R/C/L/二极管/LED/MCU…）并框内定位", "引脚级连线 + VCC/GND 网络标志", "原理图/PCB 的 DRC、网表、BOM 导出", "PCB 元件/过孔/走线 + 现场截图", "随时「紧急保存」到本地并留动作日志"]
								.map((t, i) => h("div", { className: "eda-hint", key: i }, "• " + t))))
					: h("div", null,
						h("div", { className: "eda-act" }, list.slice(0, 50).map((a, i) => {
							const isPend = a.status === 'pending';
							const isOpen = expanded.has(a.id);
							const t = (a.ts ?? "").slice(11, 19);
							const revokable = connected && !isPend && Array.isArray(a.revoke?.created) && a.revoke.created.length > 0;
							return h("div", {
								className: "eda-act-item " + (isPend ? "pend" : (a.ok === false ? "err" : (a.ok ? "ok" : ""))),
								key: a.id ?? i,
								onClick: () => toggle(a.id),
							},
								h("span", { className: "eda-act-dot" }),
								h("div", { className: "eda-act-body" },
									h("div", { className: "eda-act-line" },
										h("span", { className: "eda-act-seq" }, "#" + (a.id ?? i)),
										h("span", { className: "eda-act-name" }, a.action ?? a.tool ?? "调用 API"),
										h("span", { className: "eda-act-meta" }, isPend
											? h("span", { className: "eda-pend" }, "执行中…")
											: (t + (a.durationMs ? " · " + a.durationMs + "ms" : "") + " · " + (a.tool ?? ""))),
										revokable
											? h("button", {
												className: "eda-btn ghost eda-revoke",
												disabled: busyId === a.id,
												onClick: (e) => { e.stopPropagation(); onRevoke(a.id); },
												title: "撤回该步（删除它新建的图元）",
											}, busyId === a.id ? "撤回中…" : "撤回")
											: null),
									a.code ? h("div", { className: "eda-act-code" }, a.code) : null,
									!isPend && a.ok === false && a.error ? h("div", { className: "eda-act-out err" }, a.error)
										: (!isPend && a.result ? h("div", { className: "eda-act-out" }, a.result) : null),
									isOpen ? h("div", { className: "eda-act-full" },
										(a.code ? h("div", null, h("div", { className: "eda-act-full-label" }, "代码"), a.code) : null),
										(a.revoke ? h("div", null, h("div", { className: "eda-act-full-label" }, "撤回数据"), `该步新建 ${a.revoke.created.length} 个图元` + (a.revoke.deletedCount ? `，删除 ${a.revoke.deletedCount} 个（不可恢复）` : "")) : null),
										(a.result ? h("div", null, h("div", { className: "eda-act-full-label" }, "结果"), a.result) : null),
										(a.error ? h("div", null, h("div", { className: "eda-act-full-label" }, "错误"), a.error) : null)) : null));
						})),
						h("div", { className: "eda-act-hint" }, (hasMulti ? "下拉切换会话 · " : "") + "点击条目查看完整内容 · 撤回仅删除该步新建图元")));
		}

		/**
		 * 紧急保存: pull the board state (官方 API .epro2 + SVG 预览 + 网表/BOM)
		 * AND the agent action log to local disk — a safety net if the cloud sync
		 * ever fails. Works (log-only) even when the bridge is disconnected.
		 */
		function SnapshotCard({ connected, busy, onSave, lastOut }) {
			return h("div", { className: "eda-card" },
				h("div", { className: "eda-card-title" }, "紧急保存（画板断连也不丢工程）"),
				h("button", { className: "eda-btn primary big", disabled: busy, onClick: onSave },
					busy ? "保存中…" : "🛟 紧急保存"),
				lastOut ? h("p", { className: "eda-note", style: { margin: "8px 0 0", wordBreak: "break-all" } }, lastOut) : null,
				h("p", { className: "eda-muted", style: { margin: "8px 0 0" } },
					connected
						? "把 agent 在画板上做的东西抓到本地：专业版 .epro2 完整恢复 + 通用预览 SVG + 网表/BOM。云端没同步上，也能找回最后的工程。"
						: "画板未连接：仍会保存 agent 动作日志（每一步留档）。"));
		}
		//#endregion

		//#region panel
		function EdaPanel({ controller }) {
			const [status, error] = useStatus();
			const ready = status?.connected === true;
			const activity = useActivity();
			const [wizardOpen, setWizardOpen] = useState(false);
			const [saveState, setSaveState] = useState({ busy: false, out: null });
			const [installState, setInstallState] = useState({ busy: false, result: null });
			const [bridgeState, setBridgeState] = useState({ busy: false, result: null });
			const [revokeState, setRevokeState] = useState({ busyId: null, out: null });
			const [clearing, setClearing] = useState(false);

			const doRevoke = async (id) => {
				if (revokeState.busyId !== null) return;
				setRevokeState({ busyId: id, out: null });
				try {
					const res = await fetch(API_BASE + "/activity/revoke?id=" + encodeURIComponent(id), { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
					if (!res.ok) { setRevokeState({ busyId: null, out: "撤回接口待重启后生效（当前旧模块）。" }); return; }
					const out = await res.json();
					setRevokeState({ busyId: null, out: out.ok ? `↩️ 已撤回：${out.note ?? ""}` : "⚠️ " + String(out.error ?? "撤回失败") });
				} catch (err) { setRevokeState({ busyId: null, out: "请求失败：" + String(err) }); }
			};
			const doClear = async () => {
				if (clearing) return;
				setClearing(true);
				try {
					const res = await fetch(API_BASE + "/activity/clear", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
					if (!res.ok) { setRevokeState({ busyId: null, out: "清空接口待重启后生效（当前旧模块）。" }); return; }
					setRevokeState({ busyId: null, out: "🗑️ 时间线已清空" });
				} catch (err) { setRevokeState({ busyId: null, out: "请求失败：" + String(err) }); }
				finally { setClearing(false); }
			};

			const doInstall = async () => {
				if (installState.busy) return;
				setInstallState({ busy: true, result: null });
				try {
					const res = await fetch(API_BASE + "/install", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
					if (!res.ok) { setInstallState({ busy: false, result: "官方桥已就绪 / 安装接口在下次重启后生效（当前旧模块）。官方桥源码：" + LINKS.skill }); return; }
					const out = await res.json();
					setInstallState({ busy: false, result: out.ok ? "✅ " + (out.script ?? "官方桥已安装") : "❌ " + (out.error ?? "安装失败") });
				} catch (err) { setInstallState({ busy: false, result: "请求失败：" + String(err) }); }
			};

			const doStartBridge = async () => {
				if (bridgeState.busy) return;
				setBridgeState({ busy: true, result: null });
				try {
					const res = await fetch(API_BASE + "/bridge", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
					if (!res.ok) { setBridgeState({ busy: false, result: "启动接口在下次重启后生效（当前旧模块）；可对 AI 说「连接我的画板」。" }); return; }
					const out = await res.json();
					setBridgeState({ busy: false, result: out.ok ? `已启动（${out.state}）` : `未启动：${out.error || out.note || "请先安装桥接"}` });
				} catch (err) { setBridgeState({ busy: false, result: "请求失败：" + String(err) }); }
			};

			const doSave = async () => {
				if (saveState.busy) return;
				setSaveState({ busy: true, out: null });
				try {
					const res = await fetch(API_BASE + "/snapshot", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
					if (!res.ok) { setSaveState({ busy: false, out: "紧急保存接口在下次重启后生效（当前旧模块）；也可对 AI 说「紧急保存」。" }); return; }
					const out = await res.json();
					if (!out.ok) setSaveState({ busy: false, out: "❌ " + String(out.error ?? "保存失败") });
					else setSaveState({ busy: false, out: `✅ 已保存 ${out.files?.length ?? 0} 个文件 → ${out.dir ?? ""}${(out.errors?.length ?? 0) > 0 ? `（${out.errors.length} 项降级：${out.errors.slice(0, 2).join("；")}）` : ""}` });
				} catch (err) { setSaveState({ busy: false, out: "请求失败：" + String(err) }); }
			};

			return h("div", { className: "eda-panel" },
				h("div", { className: "eda-head" },
					h("div", { className: "eda-mark" }, "E"),
					h("div", { className: "eda-tt" },
						h("h1", null, "嘉立创 EDA"),
						h("p", { className: "eda-sub" }, "平台仪表盘 · v" + (status?.version ?? "0.1.0"))),
					h("button", { className: "eda-close", onClick: () => controller.toggle(), "aria-label": "关闭" }, "✕")),
				h("div", { className: "eda-scroll" },
					h(ConnectCard, { status, error, onInstall: doInstall, onStartBridge: doStartBridge, installState, bridgeState }),
					h(ConnectWizard, { open: wizardOpen, setOpen: setWizardOpen }),
					h(ActivityMonitor, { activities: activity.activities, sessions: activity.sessions, currentSid: activity.currentSid, setSid: activity.setSid, pinned: activity.pinned, error: activity.error, connected: ready, onRevoke: doRevoke, busyId: revokeState.busyId, onClear: doClear, clearing }),
					(revokeState.out || saveState.out) ? h("p", { className: "eda-note", style: { margin: "0", wordBreak: "break-all" } }, revokeState.out ?? saveState.out) : null,
					h(SnapshotCard, { connected: ready, busy: saveState.busy, onSave: doSave, lastOut: saveState.out }),
					h("p", { className: "eda-foot" }, "云端实时 = 对话里生成（官方 eda.* API） · 紧急保存 = 本地留档")));
		}
		//#endregion

		//#region mounts
		const ICON = '<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M3.5 2.5h6l3 3v8h-9z" stroke-linejoin="round"/><path d="M9.5 2.5v3h3M6 8h4M6 10.5h2.5" stroke-linecap="round"/></svg>';

		function sidebarRoot() {
			const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');
			if (column === null) return undefined;
			const logoOwner = column.querySelector('[class*="logoRow"]')?.parentElement;
			return logoOwner ?? (column.firstElementChild ?? undefined);
		}

		function newSessionButton(root) {
			const nested = root.querySelector('button[class*="newSession"]');
			if (nested !== null) return nested;
			for (const child of root.children) {
				if (child.tagName === "BUTTON") return child;
			}
			return undefined;
		}

		function createEntry(controller) {
			const entry = document.createElement("button");
			entry.type = "button";
			entry.dataset.dshEdaEntry = "";
			entry.setAttribute("aria-label", "嘉立创 EDA 助手");
			entry.setAttribute("title", "嘉立创 EDA 助手（官方画板平台监控）");
			entry.innerHTML = '<span class="eda-entry-icon">' + ICON + '</span><span class="eda-entry-label">嘉立创 EDA</span>';
			entry.addEventListener("click", () => { controller.toggle(); });
			return entry;
		}

		function placeEntry(root, entry) {
			const button = newSessionButton(root);
			if (button === undefined) return false;
			if (entry.parentElement !== root) {
				const row = button.closest('[class*="logoRow"]');
				const base = (row !== null && row.parentElement === root) ? row : button;
				const family = Array.from(root.children).filter(
					(el) => el instanceof HTMLElement && el.matches("[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-logcat-entry], [data-dsh-eda-entry]"),
				);
				const anchor = family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling;
				root.insertBefore(entry, anchor);
			}
			return true;
		}

		function mountSidebarEntry(controller) {
			const entry = createEntry(controller);
			let root;
			let placed = false;
			let rootObserver;

			const tryPlace = () => {
				if (root !== undefined && !root.isConnected) {
					rootObserver?.disconnect();
					root = undefined;
					placed = false;
				}
				if (placed) {
					if (document.body.contains(entry)) return;
					rootObserver?.disconnect();
					root = undefined;
					placed = false;
				}
				root ??= sidebarRoot();
				if (root === undefined) return;
				placed = placeEntry(root, entry);
				if (placed) {
					rootObserver = new MutationObserver(() => {
						if (root === undefined || !root.isConnected) { placed = false; tryPlace(); return; }
						if (!root.contains(entry)) placed = placeEntry(root, entry);
					});
					rootObserver.observe(root, { childList: true, subtree: true });
				}
			};

			const waitObserver = new MutationObserver(() => { tryPlace(); });
			waitObserver.observe(document.body, { childList: true, subtree: true });

			const syncActive = () => {
				if (controller.getSnapshot().panelOpen) entry.dataset.active = "true";
				else delete entry.dataset.active;
			};
			const unsubscribe = controller.subscribe(syncActive);
			syncActive();
			tryPlace();

			return () => {
				waitObserver.disconnect();
				rootObserver?.disconnect();
				unsubscribe();
				entry.remove();
			};
		}

		function mountPanel(controller) {
			let root;
			let container;
			const ensure = () => {
				if (container !== undefined && container.isConnected) return;
				root?.unmount();
				root = undefined;
				container?.remove();
				container = document.createElement("div");
				container.dataset.dshEdaView = "";
				container.className = "dsh-eda-view";
				container.hidden = true; // side-drawer: hidden until the sidebar entry is clicked
				const panel = document.createElement("div");
				panel.className = "dsh-eda-panel";
				container.appendChild(panel);
				document.body.appendChild(container);
				root = createRoot(panel);
				root.render(h(EdaPanel, { controller }));
			};

			ensure();

			const applyOpen = () => {
				if (container !== undefined) container.hidden = !controller.getSnapshot().panelOpen;
			};
			const unsubscribe = controller.subscribe(applyOpen);
			applyOpen();

			return () => {
				unsubscribe();
				root?.unmount();
				root = undefined;
				container?.remove();
				container = undefined;
			};
		}
		//#endregion

		//#region controller
		/** Minimal open/close controller: panelOpen + a tiny subscribe store. */
		function PanelController() {
			let panelOpen = false;
			const listeners = new Set();
			this.toggle = () => { panelOpen = !panelOpen; for (const fn of listeners) fn(); };
			this.getSnapshot = () => ({ panelOpen });
			this.subscribe = (fn) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
		}
		//#endregion

		//#region entry
		/** Required services (fiber inject waiting — the runtime must be up first). */
		const inject = ["slots"];

		/**
		 * Mount the 嘉立创 EDA 助手 panel.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			const style = document.createElement("style");
			style.textContent = STYLE;
			style.dataset.dshEdaStyle = "";
			document.head.appendChild(style);

			const controller = new PanelController();
			const disposers = [];
			try {
				disposers.push(mountSidebarEntry(controller));
				disposers.push(mountPanel(controller));
			} catch (error) {
				console.warn("[dsh-eda] mount failed:", error);
			}
			ctx.effect(() => () => {
				for (const dispose of disposers.splice(0)) dispose();
				style.remove();
			}, "dsh-eda: ui mounts");
		}
		//#endregion

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
