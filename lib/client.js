/**
 * dsh-lichuang-eda — browser half (DSH 0.1.x / 0.2 desktop adapted).
 *
 * Design read: a technical side-panel for the shell's overlay layer — dark-first,
 * editorial and restrained, wearing the host's own tokens + UI primitives so it
 * reads as native chrome rather than a bolted-on widget.
 *
 * 0.2 adaptation (the "挡到" fix):
 *   - the panel is registered into the `shell.overlay` SLOT (position:absolute,
 *     z-index 30) instead of a fixed body overlay with a 9999 z-index — it no
 *     longer covers the conversation, other panels, or the desktop chrome;
 *   - the entry point is a `conversation.session.header.utilities` pill (0.2's
 *     left sidebar is slot-owned); the 0.1.x sidebar DOM entry is kept as a
 *     compatibility path and the two never fight;
 *   - the panel is drag-resizable (120–760px, persisted) and follows the host
 *     theme through `--dsw-alias-*` tokens.
 *
 * Bundle format: `window.__ModuleLoader__.load({id, factory})` (lazy CJS).
 */
window.__ModuleLoader__.load({
	id: "@windypro-rourou/dsh-eda",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

		const React = require("react");
		const { createElement: h, useEffect, useMemo, useRef, useState } = React;
		const { createRoot } = require("react-dom/client");

		// ── host UI kit (same components the native chrome uses); degrade to our
		//    own token-based markup when a build does not ship it. ────────────────
		let P = null;
		try { P = require("@deepseek-ai/dsh-client-ui-primitives"); } catch (e) { P = null; }
		const dsButton = P && P.Button ? P.Button : null;
		const dsPill = P && P.Pill ? P.Pill : null;
		const dsTooltip = P && P.Tooltip ? P.Tooltip : null;
		const dsIcon = (name) => (P && P[name] ? P[name] : null);

		//#region styles
		/**
		 * Token-first styling: every colour comes from `--dsw-alias-*` with a
		 * dark-first fallback, so the panel inherits light/dark from the shell.
		 * Reused accent = one blue; no gradients, no heavy shadows (taste rule:
		 * restraint over decoration).
		 */
		const STYLE = `
.dsh-eda-root {
  --eda-bg: var(--dsw-alias-bg-layer-1, #151922);
  --eda-bg-base: var(--dsw-alias-bg-base, #0f1115);
  --eda-bg-soft: var(--dsw-alias-bg-layer-2, #1a1f2b);
  --eda-fg: var(--dsw-alias-label-primary, #d7dde6);
  --eda-fg-2: var(--dsw-alias-label-secondary, #b6bdc9);
  --eda-fg-3: var(--dsw-alias-label-tertiary, #8b93a3);
  --eda-line: var(--dsw-alias-border-l1, #262a33);
  --eda-line-soft: var(--dsw-alias-border-l2, rgba(255,255,255,.06));
  --eda-accent: #4c8dff;
  --eda-ok: var(--dsw-alias-state-success-primary, #22c55e);
  --eda-warn: var(--dsw-alias-state-warn-primary, #eab308);
  --eda-err: var(--dsw-alias-state-error-primary, #ef4444);
  --eda-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --eda-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", system-ui, sans-serif;

  position: absolute; top: 0; right: 0; bottom: 0;
  width: var(--eda-w, 400px); max-width: 96vw;
  display: flex; flex-direction: column; min-height: 0;
  background: var(--eda-bg); color: var(--eda-fg);
  border-left: 1px solid var(--eda-line);
  font: 13px/1.55 var(--eda-sans);
  font-variant-numeric: tabular-nums;
  z-index: 30;
  box-shadow: -14px 0 40px rgba(0,0,0,.22);
  animation: edaIn .16s cubic-bezier(.22,.61,.36,1);
}
.dsh-eda-root[hidden] { display: none !important; }
@keyframes edaIn { from { transform: translateX(14px); opacity: 0; } to { transform: none; opacity: 1; } }
@media (prefers-reduced-motion: reduce) { .dsh-eda-root { animation: none; } }

.dsh-eda-grip { position: absolute; left: -3px; top: 0; bottom: 0; width: 7px; cursor: col-resize; z-index: 6; }
.dsh-eda-grip:hover { background: linear-gradient(90deg, transparent, rgba(76,141,255,.35)); }

/* top bar — sticky, quiet, 48px */
.eda-top { flex: none; height: 48px; display: flex; align-items: center; gap: 10px; padding: 0 12px 0 14px;
  border-bottom: 1px solid var(--eda-line); background: var(--eda-bg); }
.eda-mark { flex: none; width: 24px; height: 24px; border-radius: 7px; display: grid; place-items: center;
  color: #fff; background: linear-gradient(160deg, #3b7bf6, #2b5fd0); font-size: 11px; font-weight: 700; letter-spacing: .02em; }
.eda-title { min-width: 0; flex: 1; }
.eda-title b { display: block; font-size: 13px; font-weight: 600; letter-spacing: .01em; }
.eda-title span { display: block; font-size: 10.5px; color: var(--eda-fg-3); font-family: var(--eda-mono); }
.eda-iconbtn { flex: none; width: 26px; height: 26px; display: grid; place-items: center; border-radius: 7px;
  border: 1px solid transparent; background: transparent; color: var(--eda-fg-3); cursor: pointer; font-size: 12px; line-height: 1; }
.eda-iconbtn:hover { color: var(--eda-fg); background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }

.eda-scroll { flex: 1 1 0; min-height: 0; overflow-y: auto; padding: 14px 14px 18px;
  display: flex; flex-direction: column; gap: 12px; scrollbar-width: thin; }
.eda-scroll::-webkit-scrollbar { width: 9px; }
.eda-scroll::-webkit-scrollbar-thumb { background: var(--eda-line); border-radius: 9px; border: 2px solid transparent; background-clip: content-box; }

.eda-card { border: 1px solid var(--eda-line); border-radius: 10px; background: var(--eda-bg-soft); padding: 12px 13px; }
.eda-card-title { font-size: 10.5px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase;
  color: var(--eda-fg-3); margin: 0 0 10px; }
.eda-note { font-size: 11.5px; color: var(--eda-fg-2); margin: 9px 0 0; line-height: 1.6; }
.eda-muted { font-size: 11px; color: var(--eda-fg-3); }
.eda-mono { font-family: var(--eda-mono); }

/* status row */
.eda-state { display: flex; align-items: center; gap: 9px; }
.eda-dot { width: 7px; height: 7px; border-radius: 50%; flex: none; background: var(--eda-fg-3); }
.eda-dot.on { background: var(--eda-ok); box-shadow: 0 0 0 3px rgba(34,197,94,.16); }
.eda-dot.off { background: var(--eda-warn); }
.eda-dot.wait { background: var(--eda-fg-3); animation: edaPulse 1.3s ease-in-out infinite; }
@keyframes edaPulse { 0%,100% { opacity: .4 } 50% { opacity: 1 } }
.eda-state b { font-size: 12.5px; font-weight: 600; }
.eda-state small { font-family: var(--eda-mono); font-size: 10.5px; color: var(--eda-fg-3); margin-left: 7px; }

.eda-actions { display: flex; align-items: center; flex-wrap: wrap; gap: 7px; margin-top: 11px; }
.eda-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px;
  border: 1px solid var(--eda-line); border-radius: 8px; padding: 5px 11px; background: transparent;
  color: var(--eda-fg); font: inherit; font-size: 11.5px; font-weight: 600; cursor: pointer;
  transition: background .12s ease, border-color .12s ease, opacity .12s ease; }
.eda-btn:hover:not(:disabled) { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
.eda-btn:disabled { opacity: .45; cursor: default; }
.eda-btn.primary { background: var(--eda-accent); border-color: transparent; color: #fff; }
.eda-btn.primary:hover:not(:disabled) { background: #3f80f5; }
.eda-btn.big { width: 100%; padding: 8px 12px; font-size: 12.5px; }
.eda-btn.tiny { padding: 2px 8px; font-size: 10.5px; font-weight: 500; }
.eda-link { color: var(--eda-accent); text-decoration: none; font-size: 11.5px; }
.eda-link:hover { text-decoration: underline; }

/* connected CTA */
.eda-cta { display: flex; align-items: center; gap: 10px; margin-top: 11px; padding: 9px 11px;
  border: 1px solid color-mix(in srgb, var(--eda-accent) 34%, transparent); border-radius: 9px;
  background: color-mix(in srgb, var(--eda-accent) 8%, transparent); cursor: pointer; }
.eda-cta:hover { background: color-mix(in srgb, var(--eda-accent) 13%, transparent); }
.eda-cta-t { min-width: 0; flex: 1; }
.eda-cta-t i { display: block; font-style: normal; font-size: 10px; color: var(--eda-fg-3); letter-spacing: .04em; }
.eda-cta-t b { font-size: 12.5px; font-weight: 600; color: var(--eda-accent); }
.eda-cta-c { flex: none; font-size: 10.5px; color: var(--eda-fg-3); }
.eda-cta.ok .eda-cta-c { color: var(--eda-ok); }

/* guide */
.eda-steps { display: flex; flex-direction: column; gap: 10px; }
.eda-step { display: flex; gap: 10px; }
.eda-step-no { flex: none; width: 18px; height: 18px; border-radius: 50%; display: grid; place-items: center;
  font-family: var(--eda-mono); font-size: 10px; color: var(--eda-fg-3); border: 1px solid var(--eda-line); margin-top: 1px; }
.eda-step b { display: block; font-size: 12px; font-weight: 600; }
.eda-step p { margin: 2px 0 0; font-size: 11px; color: var(--eda-fg-3); line-height: 1.55; }

/* timeline */
.eda-tl-head { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
.eda-tl-head .eda-card-title { flex: 1; margin: 0; }
.eda-select { font: inherit; font-size: 10.5px; font-family: var(--eda-mono); color: var(--eda-fg-2);
  background: var(--eda-bg-base); border: 1px solid var(--eda-line); border-radius: 6px; padding: 2px 5px; max-width: 132px; }
.eda-tl { position: relative; margin: 6px 0 0; }
.eda-row { position: relative; display: flex; gap: 10px; padding: 8px 0 8px 2px; cursor: pointer;
  border-bottom: 1px solid var(--eda-line-soft); }
.eda-row:last-child { border-bottom: 0; }
.eda-row:hover { background: color-mix(in srgb, var(--eda-fg) 4%, transparent); }
.eda-row-dot { flex: none; width: 7px; height: 7px; margin-top: 6px; border-radius: 50%; background: var(--eda-fg-3); position: relative; z-index: 1; }
.eda-row.ok .eda-row-dot { background: var(--eda-ok); }
.eda-row.err .eda-row-dot { background: var(--eda-err); }
.eda-row.pend .eda-row-dot { background: var(--eda-warn); animation: edaPulse 1s ease-in-out infinite; }
.eda-row-body { min-width: 0; flex: 1; }
.eda-row-line { display: flex; align-items: baseline; gap: 8px; }
.eda-seq { flex: none; font-family: var(--eda-mono); font-size: 10px; color: var(--eda-fg-3); }
.eda-row-name { flex: 1; min-width: 0; font-size: 12.5px; font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eda-row-meta { flex: none; font-family: var(--eda-mono); font-size: 10px; color: var(--eda-fg-3); }
.eda-row-meta .eda-pend { color: var(--eda-warn); }
.eda-row-code, .eda-row-out { margin-top: 3px; font-family: var(--eda-mono); font-size: 10.5px; color: var(--eda-fg-3);
  overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.eda-row-out.err { color: var(--eda-err); }
.eda-row-full { margin-top: 7px; padding: 8px 9px; border-radius: 8px; background: var(--eda-bg-base);
  border: 1px solid var(--eda-line-soft); font-family: var(--eda-mono); font-size: 10.5px; line-height: 1.6;
  color: var(--eda-fg-2); white-space: pre-wrap; word-break: break-word; max-height: 260px; overflow: auto; }
.eda-row-full i { display: block; font-style: normal; font-size: 9.5px; letter-spacing: .08em; text-transform: uppercase;
  color: var(--eda-fg-3); margin: 6px 0 2px; }
.eda-row-full i:first-child { margin-top: 0; }
.eda-empty { font-size: 11.5px; color: var(--eda-fg-3); line-height: 1.6; }
.eda-hints { margin-top: 9px; display: flex; flex-direction: column; gap: 5px; }
.eda-hint { display: flex; gap: 7px; font-size: 11px; color: var(--eda-fg-2); }
.eda-hint s { text-decoration: none; color: var(--eda-fg-3); }
.eda-tl-foot { margin-top: 7px; font-size: 10.5px; color: var(--eda-fg-3); }

.eda-foot { flex: none; padding: 9px 14px; border-top: 1px solid var(--eda-line);
  font-family: var(--eda-mono); font-size: 10px; color: var(--eda-fg-3); text-align: center; }

/* header pill (0.2 entry point) */
.eda-pill { display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 9px;
  border: 1px solid var(--eda-line); border-radius: 999px; background: transparent; color: inherit;
  font: inherit; font-size: 11.5px; cursor: pointer; transition: background .12s ease; }
.eda-pill:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(128,128,128,.12)); }
.eda-pill[data-active="true"] { border-color: color-mix(in srgb, var(--eda-accent) 46%, transparent);
  background: color-mix(in srgb, var(--eda-accent) 12%, transparent); }
.eda-pill .eda-dot { width: 6px; height: 6px; }
.eda-pill[hidden] { display: none !important; }

/* 0.1.x sidebar entry */
[data-dsh-eda-entry] { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 12px; margin: 2px 0;
  border: 0; border-radius: 8px; background: transparent; color: inherit; font: inherit; cursor: pointer; text-align: left; }
[data-dsh-eda-entry]:hover { background: rgba(128,128,128,.14); }
[data-dsh-eda-entry][data-active] { background: rgba(128,128,128,.22); }
[data-dsh-eda-entry] .eda-entry-label { font-size: 13px; line-height: 1.2; opacity: .92; }
`;
		//#endregion

		const API_BASE = "/api/dsh-eda";
		const LINKS = {
			editor: "https://pro.lceda.cn/editor",
			ext: "https://jlc-ext.com/item/oshwhub/run-api-gateway",
		};
		const CONNECT_STEPS = [
			{ n: 1, t: "一键安装官方桥", d: "官方 easyeda-api-skill → 本机 ~/.dsh/eda/bridge/（离线依赖，无需 npm）。" },
			{ n: 2, t: "启动官方桥", d: "Bridge Server 监听 127.0.0.1:49620-49629，插件自动探测。" },
			{ n: 3, t: "网页版装扩展 Run API Gateway", d: "编辑器 →「高级」→「扩展管理器」→ 安装；再开「外部交互」+「显示在顶部菜单」。" },
			{ n: 4, t: "验证", d: "刷新编辑器页面；状态点变绿 = 已连上你的云画板。" },
		];
		const HINTS = [
			"放置任意大类元件（R/C/L/二极管/LED/MCU…）并框内定位",
			"引脚级连线 + VCC/GND 网络标志",
			"原理图 / PCB 的 DRC、网表、BOM 导出",
			"PCB 元件 / 过孔 / 走线（含底层铜）+ 现场截图",
			"随时「紧急保存」到本地并留动作日志",
		];
		const ICON_EDA = "M3 3.6h7.2l2.8 2.8v6h-10z M10.2 3.6v2.8h2.8 M5 8.4h3 M5 10.4h2";

		//#region store
		/** Tiny external store: panel open/closed, shared by the pill and the overlay. */
		function PanelStore() {
			const listeners = new Set();
			let open = false;
			this.get = () => open;
			this.set = (v) => { const next = !!v; if (next === open) return; open = next; for (const fn of listeners) fn(); };
			this.toggle = () => this.set(!open);
			this.subscribe = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };
		}
		function useStore(store) {
			const [v, setV] = useState(store.get());
			useEffect(() => store.subscribe(() => setV(store.get())), [store]);
			return v;
		}
		//#endregion

		//#region hooks
		function useStatus() {
			const [status, setStatus] = useState(null);
			const [error, setError] = useState(false);
			useEffect(() => {
				let alive = true;
				const load = () => fetch(API_BASE + "/status")
					.then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
					.then((b) => { if (alive) { setStatus(b); setError(false); } })
					.catch(() => { if (alive) { setStatus(null); setError(true); } });
				load();
				const t = setInterval(load, 4000);
				return () => { alive = false; clearInterval(t); };
			}, []);
			return [status, error];
		}

		function useActivity(pinnedSid) {
			const [feed, setFeed] = useState({ activities: [], sessions: [], currentSid: "", error: false });
			useEffect(() => {
				let alive = true;
				const load = () => {
					const q = pinnedSid ? "?sid=" + encodeURIComponent(pinnedSid) : "";
					fetch(API_BASE + "/activity" + q)
						.then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
						.then((b) => {
							if (!alive) return;
							setFeed({
								activities: Array.isArray(b.activities) ? b.activities : [],
								sessions: Array.isArray(b.sessions) ? b.sessions : [],
								currentSid: b.currentSid ?? "",
								error: false,
							});
						})
						.catch(() => { if (alive) setFeed((prev) => ({ ...prev, error: true })); });
				};
				load();
				const t = setInterval(load, 3000);
				return () => { alive = false; clearInterval(t); };
			}, [pinnedSid]);
			return feed;
		}
		//#endregion

		//#region components
		/** Brand mark: host icon when available, else a two-stroke chip glyph. */
		function Mark() {
			const Icon = dsIcon("IconBoardOutline16") || dsIcon("IconComponentOutline16");
			if (Icon) return h("span", { className: "eda-mark" }, h(Icon, null));
			return h("span", { className: "eda-mark" }, "EDA");
		}

		function SendIcon() {
			return h("svg", { width: 13, height: 13, viewBox: "0 0 16 16", fill: "none", stroke: "currentColor", strokeWidth: 1.3, "aria-hidden": "true" },
				h("path", { d: "M2.6 3.4l10.8 4.6-10.8 4.6 1.7-4.6z", strokeLinejoin: "round" }));
		}

		/** Header pill — the 0.2 entry point (slot-owned header utilities). */
		function HeaderPill({ store }) {
			const open = useStore(store);
			const [status] = useStatus();
			const ready = status?.connected === true;
			const cls = "eda-pill";
			const inner = [
				h("span", { className: "eda-dot " + (status === null ? "wait" : ready ? "on" : "off"), key: "d" }),
				h("span", { key: "t" }, "嘉立创 EDA"),
			];
			if (dsButton) {
				return h(dsButton, {
					appearance: "ghost", size: "small", "data-active": open ? "true" : "false",
					onClick: () => store.toggle(), title: "嘉立创 EDA 助手", className: cls,
				}, inner);
			}
			return h("button", {
				type: "button", className: cls, "data-active": open ? "true" : "false",
				onClick: () => store.toggle(), title: "嘉立创 EDA 助手",
			}, inner);
		}

		/**
		 * Connection card: one status line, then the three platform actions, then
		 * (when connected) the copy-the-prompt CTA. Errors stay inline and quiet.
		 */
		function ConnectCard({ status, error, install, bridge, onInstall, onStart }) {
			const ready = status?.connected === true;
			const [copied, setCopied] = useState(false);
			const inst = status?.bridgeInstalled === true;
			const dot = status === null ? (error ? "off" : "wait") : ready ? "on" : "off";
			const label = status === null ? (error ? "状态服务未响应" : "检测中…") : ready ? "已连接" : "未连接";
			const port = ready && status?.port ? "127.0.0.1:" + status.port : "";
			const win = status?.health?.match(/edaWindowCount:(\d+)/)?.[1];
			const copy = () => {
				const text = "嘉立创EDA，启动！帮我画一个 LED 点亮电路";
				try { navigator.clipboard?.writeText(text); } catch (e) { /* clipboard unavailable */ }
				setCopied(true);
				setTimeout(() => setCopied(false), 1600);
			};
			return h("div", { className: "eda-card" },
				h("div", { className: "eda-state" },
					h("span", { className: "eda-dot " + dot }),
					h("b", null, label),
					h("small", null, [port, win !== undefined ? "窗口 " + win : ""].filter(Boolean).join(" · "))),
				h("div", { className: "eda-actions" },
					h("button", {
						className: "eda-btn " + (inst ? "" : "primary"),
						disabled: inst || install?.busy, onClick: onInstall,
						title: inst ? "官方桥已安装（随本机持久）" : "下载官方 easyeda-api-skill 到本机",
					}, inst ? "官方桥已装 ✓" : install?.busy ? "安装中…" : "一键安装官方桥"),
					h("button", { className: "eda-btn", disabled: bridge?.busy, onClick: onStart },
						bridge?.busy ? "启动中…" : "启动桥"),
					h("a", { className: "eda-link", href: LINKS.editor, target: "_blank", rel: "noreferrer" }, "打开编辑器"),
					h("a", { className: "eda-link", href: LINKS.ext, target: "_blank", rel: "noreferrer" }, "扩展直达")),
				ready
					? h("div", { className: "eda-cta" + (copied ? " ok" : ""), onClick: copy,
						title: "点击复制，然后粘贴到对话里发送" },
						h(SendIcon, null),
						h("span", { className: "eda-cta-t" },
							h("i", null, "去对话里说"),
							h("b", null, "「嘉立创EDA，启动！」")),
						h("span", { className: "eda-cta-c" }, copied ? "已复制 ✓" : "复制"))
					: h("p", { className: "eda-note" }, "连上画板后，在对话里描述需求即可实时生成；离线导出仅作兜底。"),
				install?.result ? h("p", { className: "eda-note" }, install.result) : null,
				bridge?.result ? h("p", { className: "eda-note" }, bridge.result) : null);
		}

		function ConnectGuide({ open, setOpen }) {
			if (!open) {
				return h("button", { className: "eda-btn", style: { width: "100%" }, onClick: () => setOpen(true) },
					"连接教程 · 4 步（网页版官方栈）");
			}
			return h("div", { className: "eda-card" },
				h("div", { className: "eda-card-title" }, "连接教程"),
				h("div", { className: "eda-steps" }, CONNECT_STEPS.map((s) =>
					h("div", { className: "eda-step", key: s.n },
						h("span", { className: "eda-step-no" }, String(s.n)),
						h("div", null, h("b", null, s.t), h("p", null, s.d))))),
				h("p", { className: "eda-note" },
					h("a", { className: "eda-link", href: LINKS.editor, target: "_blank", rel: "noreferrer", style: { marginRight: 12 } }, "编辑器"),
					h("a", { className: "eda-link", href: LINKS.ext, target: "_blank", rel: "noreferrer", style: { marginRight: 12 } }, "扩展"),
					h("button", { className: "eda-link", onClick: () => setOpen(false),
						style: { border: 0, background: "transparent", cursor: "pointer", padding: 0, font: "inherit" } }, "收起")));
		}

		/**
		 * Record-style timeline (persisted on disk → never blank). Each step is
		 * numbered, expandable, and revocable while the bridge is connected.
		 */
		function Timeline({ feed, pinned, setSid, connected, onRevoke, busyId, onClear, clearing, note }) {
			const [expanded, setExpanded] = useState(() => new Set());
			const toggle = (id) => setExpanded((prev) => {
				const next = new Set(prev);
				if (next.has(id)) next.delete(id); else next.add(id);
				return next;
			});
			const list = feed.activities;
			const sids = feed.sessions;
			const multi = sids.length > 1;
			return h("div", { className: "eda-card" },
				h("div", { className: "eda-tl-head" },
					h("div", { className: "eda-card-title" }, "Agent · 官方 API"),
					multi
						? h("select", {
							className: "eda-select", value: pinned ?? "", onChange: (e) => setSid(e.target.value),
							title: "切换会话（默认跟随最新）",
						},
							h("option", { value: "" }, "跟随最新"),
							sids.map((s) => h("option", { value: s.sid ?? "", key: (s.sid || "platform") + s.lastTs }, s.label ?? "会话")))
						: null,
					list.length > 0
						? h("button", { className: "eda-btn tiny", disabled: clearing, onClick: onClear, title: "清空时间线（含磁盘历史）" },
							clearing ? "清空…" : "清空")
						: null),
				list.length === 0
					? h("div", null,
						h("div", { className: "eda-empty" }, feed.error
							? "实时活动流未就绪（服务端模块未加载）。"
							: "还没有记录。历史写入本机 activity.jsonl，面板不会空着。可以让 agent："),
						h("div", { className: "eda-hints" }, HINTS.map((t, i) =>
							h("div", { className: "eda-hint", key: i }, h("s", null, "·"), h("span", null, t)))))
					: h("div", null,
						h("div", { className: "eda-tl" }, list.slice(0, 60).map((a, i) => {
							const pend = a.status === "pending";
							const open = expanded.has(a.id);
							const revokable = connected && !pend && Array.isArray(a.revoke?.created) && a.revoke.created.length > 0;
							const time = String(a.ts ?? "").slice(11, 19);
							const meta = pend
								? h("span", { className: "eda-pend" }, "执行中…")
								: [time, a.durationMs ? a.durationMs + "ms" : "", a.tool ?? ""].filter(Boolean).join(" · ");
							return h("div", {
								className: "eda-row " + (pend ? "pend" : a.ok === false ? "err" : a.ok ? "ok" : ""),
								key: a.id ?? i, onClick: () => toggle(a.id),
							},
								h("span", { className: "eda-row-dot" }),
								h("div", { className: "eda-row-body" },
									h("div", { className: "eda-row-line" },
										h("span", { className: "eda-seq" }, "#" + (a.id ?? i)),
										h("span", { className: "eda-row-name" }, a.action ?? a.tool ?? "调用 API"),
										h("span", { className: "eda-row-meta" }, meta),
										revokable
											? h("button", {
												className: "eda-btn tiny", disabled: busyId === a.id,
												onClick: (e) => { e.stopPropagation(); onRevoke(a.id); },
												title: "撤回该步（删除它新建的图元）",
											}, busyId === a.id ? "撤回…" : "撤回")
											: null),
									a.code ? h("div", { className: "eda-row-code" }, a.code) : null,
									!pend && a.ok === false && a.error
										? h("div", { className: "eda-row-out err" }, a.error)
										: !pend && a.result ? h("div", { className: "eda-row-out" }, a.result) : null,
									open ? h("div", { className: "eda-row-full" },
										a.code ? h("div", null, h("i", null, "代码"), a.code) : null,
										a.revoke ? h("div", null, h("i", null, "撤回数据"),
											`新建 ${a.revoke.created.length} 图元` + (a.revoke.deletedCount ? ` · 删除 ${a.revoke.deletedCount}（不可恢复）` : "")) : null,
										a.result ? h("div", null, h("i", null, "结果"), a.result) : null,
										a.error ? h("div", null, h("i", null, "错误"), a.error) : null) : null));
						})),
						h("div", { className: "eda-tl-foot" }, (multi ? "下拉切换会话 · " : "") + "点击条目展开 · 撤回只删该步新建图元")),
				note ? h("p", { className: "eda-note", style: { wordBreak: "break-word" } }, note) : null);
		}

		/** Emergency save: board state (.epro2 + SVG + netlist/BOM) + action log → disk. */
		function SnapshotCard({ connected, state, onSave }) {
			return h("div", { className: "eda-card" },
				h("div", { className: "eda-card-title" }, "紧急保存"),
				h("button", { className: "eda-btn primary big", disabled: state.busy, onClick: onSave },
					state.busy ? "保存中…" : "🛟 保存画板到本地"),
				h("p", { className: "eda-muted", style: { marginTop: 8 } }, connected
					? "专业版 .epro2（可完整恢复）+ 预览 SVG + 网表/BOM。云端没同步上也能找回最后的工程。"
					: "画板未连接：仍会保存 agent 动作日志，每一步留档。"),
				state.out ? h("p", { className: "eda-note", style: { wordBreak: "break-all" } }, state.out) : null);
		}

		/** Panel shell: top bar → scroll body → footer. */
		function EdaPanel({ store }) {
			const [status, error] = useStatus();
			const ready = status?.connected === true;
			const [pinned, setPinned] = useState("");
			const feed = useActivity(pinned);
			const [guide, setGuide] = useState(false);
			const [install, setInstall] = useState({ busy: false, result: null });
			const [bridge, setBridge] = useState({ busy: false, result: null });
			const [save, setSave] = useState({ busy: false, out: null });
			const [revoke, setRevoke] = useState({ busyId: null, out: null });
			const [clearing, setClearing] = useState(false);

			const post = (path) => fetch(API_BASE + path, {
				method: "POST", headers: { "content-type": "application/json" }, body: "{}",
			});

			const doInstall = async () => {
				if (install.busy) return;
				setInstall({ busy: true, result: null });
				try {
					const res = await post("/install");
					if (!res.ok) { setInstall({ busy: false, result: "安装接口未就绪（旧模块），可对 AI 说「连接我的画板」。" }); return; }
					const out = await res.json();
					setInstall({ busy: false, result: out.ok ? "✅ " + (out.script ?? "官方桥已安装") : "❌ " + (out.error ?? "安装失败") });
				} catch (e) { setInstall({ busy: false, result: "请求失败：" + String(e) }); }
			};
			const doStart = async () => {
				if (bridge.busy) return;
				setBridge({ busy: true, result: null });
				try {
					const res = await post("/bridge");
					if (!res.ok) { setBridge({ busy: false, result: "启动接口未就绪（旧模块），可对 AI 说「连接我的画板」。" }); return; }
					const out = await res.json();
					setBridge({ busy: false, result: out.ok ? `已启动（${out.state}）` : `未启动：${out.error || out.note || "请先安装桥接"}` });
				} catch (e) { setBridge({ busy: false, result: "请求失败：" + String(e) }); }
			};
			const doSave = async () => {
				if (save.busy) return;
				setSave({ busy: true, out: null });
				try {
					const res = await post("/snapshot");
					if (!res.ok) { setSave({ busy: false, out: "紧急保存接口未就绪（旧模块），可对 AI 说「紧急保存」。" }); return; }
					const out = await res.json();
					setSave({
						busy: false,
						out: out.ok
							? `✅ ${out.files?.length ?? 0} 个文件 → ${out.dir ?? ""}` + ((out.errors?.length ?? 0) > 0 ? `（${out.errors.length} 项降级）` : "")
							: "❌ " + String(out.error ?? "保存失败"),
					});
				} catch (e) { setSave({ busy: false, out: "请求失败：" + String(e) }); }
			};
			const doRevoke = async (id) => {
				if (revoke.busyId !== null) return;
				setRevoke({ busyId: id, out: null });
				try {
					const res = await fetch(API_BASE + "/activity/revoke?id=" + encodeURIComponent(id), {
						method: "POST", headers: { "content-type": "application/json" }, body: "{}",
					});
					if (!res.ok) { setRevoke({ busyId: null, out: "撤回接口未就绪（旧模块）。" }); return; }
					const out = await res.json();
					setRevoke({ busyId: null, out: out.ok ? "↩️ 已撤回：" + (out.note ?? "") : "⚠️ " + String(out.error ?? "撤回失败") });
				} catch (e) { setRevoke({ busyId: null, out: "请求失败：" + String(e) }); }
			};
			const doClear = async () => {
				if (clearing) return;
				setClearing(true);
				try {
					const res = await post("/activity/clear");
					setRevoke({ busyId: null, out: res.ok ? "🗑️ 时间线已清空" : "清空接口未就绪（旧模块）。" });
				} catch (e) { setRevoke({ busyId: null, out: "请求失败：" + String(e) }); }
				finally { setClearing(false); }
			};

			return h("div", { className: "dsh-eda-root" },
				h("div", { className: "eda-top" },
					h(Mark, null),
					h("div", { className: "eda-title" },
						h("b", null, "嘉立创 EDA"),
						h("span", null, "official bridge · v" + (status?.version ?? "—"))),
					h("button", { className: "eda-iconbtn", onClick: () => store.set(false), title: "关闭面板", "aria-label": "关闭" }, "✕")),
				h("div", { className: "eda-scroll" },
					h(ConnectCard, { status, error, install, bridge, onInstall: doInstall, onStart: doStart }),
					h(ConnectGuide, { open: guide, setOpen: setGuide }),
					h(Timeline, {
						feed, pinned, setSid: setPinned, connected: ready,
						onRevoke: doRevoke, busyId: revoke.busyId, onClear: doClear, clearing,
						note: revoke.out,
					}),
					h(SnapshotCard, { connected: ready, state: save, onSave: doSave })),
				h("div", { className: "eda-foot" }, "对话里生成（官方 eda.* API） · 本地留档（紧急保存）"));
		}

		/** Overlay wrapper: mounted in `shell.overlay`; `hidden` toggles visibility so
		 *  the feed keeps running while the panel is closed (same surface as 0.1.x). */
		function EdaOverlay({ store }) {
			const open = useStore(store);
			const [width, setWidth] = useState(() => {
				try { return Math.min(760, Math.max(120, Number(localStorage.getItem("dsh-eda:width")) || 400)); } catch (e) { return 400; }
			});
			const drag = useRef(null);
			const startDrag = (e) => {
				e.preventDefault();
				const move = (ev) => {
					const next = Math.min(760, Math.max(120, window.innerWidth - ev.clientX));
					drag.current = next;
					setWidth(next);
				};
				const up = () => {
					window.removeEventListener("mousemove", move);
					window.removeEventListener("mouseup", up);
					if (drag.current !== null) { try { localStorage.setItem("dsh-eda:width", String(drag.current)); } catch (err) { /* ignore */ } }
				};
				window.addEventListener("mousemove", move);
				window.addEventListener("mouseup", up);
			};
			return h("div", { className: "dsh-eda-root", hidden: !open, style: { "--eda-w": width + "px" } },
				h("div", { className: "dsh-eda-grip", onMouseDown: startDrag, title: "拖动调整宽度" }),
				h(EdaPanel, { store }));
		}
		//#endregion

		//#region mounts (0.1.x compatibility)
		function sidebarRoot() {
			const column = document.querySelector('[data-pane="sidebar"], [class*="sidebarCol"]');
			if (column === null) return undefined;
			const logoOwner = column.querySelector('[class*="logoRow"]')?.parentElement;
			return logoOwner ?? (column.firstElementChild ?? undefined);
		}
		function newSessionButton(root) {
			const nested = root.querySelector('button[class*="newSession"]');
			if (nested !== null) return nested;
			for (const child of root.children) if (child.tagName === "BUTTON") return child;
			return undefined;
		}
		function createEntry(store) {
			const entry = document.createElement("button");
			entry.type = "button";
			entry.dataset.dshEdaEntry = "";
			entry.setAttribute("aria-label", "嘉立创 EDA 助手");
			entry.setAttribute("title", "嘉立创 EDA 助手（官方画板平台）");
			entry.innerHTML = '<span class="eda-entry-icon"><svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="' + ICON_EDA + '" stroke-linejoin="round" stroke-linecap="round"/></svg></span><span class="eda-entry-label">嘉立创 EDA</span>';
			entry.addEventListener("click", () => store.toggle());
			return entry;
		}
		function mountSidebarEntry(store) {
			const entry = createEntry(store);
			let root;
			let placed = false;
			let rootObserver;
			const place = () => {
				const button = newSessionButton(root);
				if (button === undefined) return false;
				if (entry.parentElement !== root) {
					const row = button.closest('[class*="logoRow"]');
					const base = row !== null && row.parentElement === root ? row : button;
					const family = Array.from(root.children).filter((el) =>
						el instanceof HTMLElement && el.matches("[data-dsh-taskboard-entry], [data-dsh-ssh-entry], [data-dsh-logcat-entry], [data-dsh-eda-entry]"));
					const anchor = family.length > 0 ? family[family.length - 1].nextElementSibling : base.nextElementSibling;
					root.insertBefore(entry, anchor);
				}
				return true;
			};
			const tryPlace = () => {
				if (root !== undefined && (!root.isConnected || (placed && !document.body.contains(entry)))) {
					rootObserver?.disconnect();
					root = undefined;
					placed = false;
				}
				if (placed) return;
				root ??= sidebarRoot();
				if (root === undefined) return;
				placed = place();
				if (placed) {
					rootObserver = new MutationObserver(() => {
						if (root === undefined || !root.isConnected) { placed = false; tryPlace(); return; }
						if (!root.contains(entry)) placed = place();
					});
					rootObserver.observe(root, { childList: true, subtree: true });
				}
			};
			const waitObserver = new MutationObserver(() => tryPlace());
			waitObserver.observe(document.body, { childList: true, subtree: true });
			const sync = () => { if (store.get()) entry.dataset.active = "true"; else delete entry.dataset.active; };
			const unsubscribe = store.subscribe(sync);
			sync();
			tryPlace();
			return () => {
				waitObserver.disconnect();
				rootObserver?.disconnect();
				unsubscribe();
				entry.remove();
			};
		}

		/**
		 * Fallback mount for shells without the slots service (and for the unit
		 * test's DOM stub): a body-level overlay. Still absolute-in-shell friendly:
		 * z-index stays low (40) and the panel keeps its own close affordance.
		 */
		function mountFallback(store) {
			const container = document.createElement("div");
			container.dataset.dshEdaView = "";
			container.className = "dsh-eda-fallback";
			const root = createRoot(container);
			document.body.appendChild(container);
			root.render(h(EdaOverlay, { store }));
			return () => {
				root.unmount();
				container.remove();
			};
		}
		//#endregion

		//#region entry
		const inject = ["slots"];

		/**
		 * Mount the panel: 0.2 registers into `shell.overlay` + a header utility pill;
		 * 0.1.x keeps the sidebar DOM entry. Anything unavailable degrades quietly.
		 * @param ctx - client root context.
		 */
		function apply(ctx) {
			const style = document.createElement("style");
			style.textContent = STYLE + "\n.dsh-eda-fallback { position: fixed; inset: 0; pointer-events: none; z-index: 40; }\n.dsh-eda-fallback > .dsh-eda-root { pointer-events: auto; }";
			style.dataset.dshEdaStyle = "";
			document.head.appendChild(style);

			const store = new PanelStore();
			const disposers = [];
			let slotRegistered = false;

			try {
				const slots = typeof ctx.get === "function" ? ctx.get("slots") : undefined;
				if (slots !== undefined && slots !== null) {
					disposers.push(slots.inject("conversation.session.header.utilities", () => slots.register(
						{ name: "conversation.session.header.utilities", id: "eda-toggle", order: 30 },
						() => h(HeaderPill, { store }),
					)));
					disposers.push(slots.inject("shell.overlay", () => slots.register(
						{ name: "shell.overlay", id: "eda", order: 90 },
						() => h(EdaOverlay, { store }),
					)));
					slotRegistered = true;
				}
			} catch (error) {
				console.warn("[dsh-eda] slot registration failed, falling back to DOM mount", error);
			}

			try {
				disposers.push(mountSidebarEntry(store));
			} catch (error) {
				console.warn("[dsh-eda] sidebar entry failed", error);
			}
			if (!slotRegistered) {
				try {
					disposers.push(mountFallback(store));
				} catch (error) {
					console.warn("[dsh-eda] fallback mount failed", error);
				}
			}

			ctx.effect(() => () => {
				for (const dispose of disposers.splice(0)) dispose();
				style.remove();
			}, "dsh-eda: browser UI");
		}

		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	},
});
