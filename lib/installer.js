/**
 * dsh-lichuang-eda — one-click installer for the OFFICIAL EasyEDA bridge.
 *
 * Vendors the official `easyeda/easyeda-api-skill` (Skill easyeda-api,
 * author JLCEDA, MIT) into the DSH data dir's eda/bridge/: downloads the
 * source archive, extracts it, vendors `ws` (its only dependency), and leaves
 * the official Bridge Server at <dir>/scripts/bridge-server.mjs.
 *
 * Portable-DSH aware: the DSH data home is NOT always `~/.dsh` (portable
 * installs use `<exeRoot>/data/dsh-home`). We probe a candidate list and use
 * the first location that actually holds a complete bridge; new installs go
 * to the first existing candidate dir. Downloads fall back to the system
 * `curl.exe` (with auto-detected proxy) when Node `fetch` cannot reach GitHub.
 *
 * No third-party backend (easyeda-agent etc.) is involved.
 */

import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import { existsSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { spawn, execFile, execFileSync } from 'node:child_process'

export const DEFAULT_VERSION = 'main' // branch of the official skill repo
export const OFFICIAL_REPO = 'easyeda/easyeda-api-skill'
export const OFFICIAL_EXT_URL = 'https://jlc-ext.com/item/oshwhub/run-api-gateway' // 官方扩展 Run API Gateway

/** Candidate DSH data homes (portable installs + classic ~/.dsh). */
export function dshHomeCandidates() {
  const list = []
  for (const key of ['DSH_HOME', 'DSH_DATA_HOME', 'DSH_PROFILE_HOME']) {
    const v = process.env[key]
    if (v && typeof v === 'string') list.push(v)
  }
  // Portable layout: walk up from the running node binary looking for <root>/data/dsh-home
  try {
    let dir = dirname(process.execPath)
    for (let i = 0; i < 8; i++) {
      const cand = join(dir, 'data', 'dsh-home')
      if (existsSync(join(cand, 'settings.yaml')) || existsSync(join(cand, 'profiles'))) { list.push(cand); break }
      const up = dirname(dir)
      if (up === dir) break
      dir = up
    }
  } catch { /* ignore */ }
  list.push(join(homedir(), '.dsh')) // classic location, always last
  return [...new Set(list.filter((x) => typeof x === 'string' && x.length > 0))]
}

/** Candidate bridge directories, in probe order. */
export function bridgeDirs() {
  return dshHomeCandidates().map((home) => join(home, 'eda', 'bridge'))
}

function isCompleteBridge(dir) {
  return existsSync(join(dir, 'package.json'))
    && existsSync(join(dir, 'scripts', 'bridge-server.mjs'))
    && existsSync(join(dir, 'node_modules', 'ws'))
}

export function bridgeDir() {
  const dirs = bridgeDirs()
  // 1) first COMPLETE install; 2) first dir that exists at all; 3) classic ~/.dsh
  for (const d of dirs) if (isCompleteBridge(d)) return d
  for (const d of dirs) if (existsSync(d)) return d
  return dirs[dirs.length - 1] ?? join(homedir(), '.dsh', 'eda', 'bridge')
}

/** Absolute path of the official bridge server script (first complete install). */
export function bridgeScriptPath() {
  for (const d of bridgeDirs()) if (isCompleteBridge(d)) return join(d, 'scripts', 'bridge-server.mjs')
  return join(bridgeDir(), 'scripts', 'bridge-server.mjs')
}

/** True when a complete official bridge exists in ANY candidate location. */
export function isBridgeInstalled() {
  return bridgeDirs().some(isCompleteBridge)
}

const archiveUrl = (version) => `https://github.com/${OFFICIAL_REPO}/archive/refs/heads/${version}.tar.gz`

function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { ...opts, windowsHide: true })
    const err = []
    child.stderr?.on('data', (d) => err.push(String(d)))
    child.on('exit', (code) => {
      if (code === 0) resolve({ ok: true })
      else reject(new Error(`${cmd} ${args.join(' ')} 退出码 ${code}：${err.join('').slice(-300)}`))
    })
    child.on('error', reject)
  })
}

async function extractTarGz(archive, destTmp) {
  // bsdtar (Windows 10+) / GNU tar (macOS/Linux) both handle .tar.gz.
  await fsp.mkdir(destTmp, { recursive: true })
  try {
    await run('tar', ['-xf', archive, '-C', destTmp], { stdio: ['ignore', 'ignore', 'pipe'] })
  } catch (error) {
    throw new Error('解压失败（需要 tar；Windows 10 1803+ 自带 bsdtar）：' + (error instanceof Error ? error.message : String(error)))
  }
}

/** Recursive copy (used to vendor `ws` — the bridge's only runtime dep). */
async function copyDir(src, dst) {
  const entries = await fsp.readdir(src, { withFileTypes: true })
  await fsp.mkdir(dst, { recursive: true })
  for (const e of entries) {
    const s = join(src, e.name)
    const d = join(dst, e.name)
    if (e.isDirectory()) await copyDir(s, d)
    else await fsp.copyFile(s, d)
  }
}

/**
 * Locate an existing `ws` package on this machine (the DSH host ships it) so
 * we can vendor it WITHOUT npm — offline copy is faster and never touches the
 * registry. Searches every candidate DSH home's profiles + the running
 * DSH resources tree.
 */
export async function findExistingWs() {
  const candidates = []
  for (const home of dshHomeCandidates()) {
    const profiles = join(home, 'profiles')
    try {
      for (const p of await fsp.readdir(profiles)) {
        candidates.push(join(profiles, p, 'node_modules', 'ws'))
      }
    } catch { /* profiles dir missing */ }
  }
  // Portable DSH resources tree (walk up from the running binary)
  try {
    let dir = dirname(process.execPath)
    for (let i = 0; i < 8; i++) {
      candidates.push(join(dir, 'node_modules', 'ws'))
      candidates.push(join(dir, 'dsh', 'node_modules', 'ws'))
      const up = dirname(dir)
      if (up === dir) break
      dir = up
    }
  } catch { /* ignore */ }
  for (const c of candidates) {
    try {
      await fsp.access(join(c, 'package.json'))
      return c
    } catch { /* keep looking */ }
  }
  return null
}

async function ensureWs(dir) {
  // 1) offline vendor from the host's `ws` (no npm, no registry, no PS policy).
  const src = await findExistingWs()
  if (src !== null) {
    const dst = join(dir, 'node_modules', 'ws')
    await copyDir(src, dst)
    await fsp.writeFile(join(dir, 'node_modules', 'ws', '.vendored-by-dsh'), 'yes\n', 'utf8')
    return { method: 'vendored', src }
  }
  // 2) fallback: npm (Windows resolves npm.cmd; the .ps1 shim is disabled by policy).
  const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm'
  await run(npmCmd, ['install', '--prefix', dir, '--no-fund', '--no-audit'], { stdio: ['ignore', 'ignore', 'pipe'] })
  return { method: 'npm', src: npmCmd }
}

/** Auto-detect a local HTTP proxy (env → git config → WinINET registry). */
function detectProxy() {
  const env = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.https_proxy || process.env.http_proxy
  if (env) return env
  try {
    const fromGit = execFileSync('git', ['config', '--get', 'http.proxy'], { encoding: 'utf8', timeout: 5000 }).trim()
    if (fromGit) return fromGit
  } catch { /* not configured */ }
  try {
    const val = execFileSync('reg', ['query', 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings', '/v', 'ProxyServer'], { encoding: 'utf8', timeout: 5000 }).toString()
    const m = /ProxyServer\s+REG_SZ\s+(\S+)/.exec(val)
    if (m) return m[1].includes('://') ? m[1] : `http://${m[1]}`
  } catch { /* no proxy */ }
  return null
}

/**
 * Download `url` to `dest`: try Node fetch first, then the system curl.exe
 * (direct, then via auto-detected proxy) — GitHub is unreachable by plain
 * fetch on many CN networks.
 */
async function downloadFile(url, dest) {
  const attempts = []
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(60000), redirect: 'follow' })
    if (res.ok) {
      await fsp.writeFile(dest, Buffer.from(await res.arrayBuffer()))
      return { ok: true, via: 'fetch' }
    }
    attempts.push(`fetch HTTP ${res.status}`)
  } catch (e) {
    attempts.push('fetch: ' + String(e && e.cause?.code || e && e.message || e).slice(0, 80))
  }
  if (process.platform !== 'win32') throw new Error('下载失败：' + attempts.join('; '))
  const curl = join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'curl.exe')
  if (!existsSync(curl)) throw new Error('下载失败：' + attempts.join('; '))
  const proxy = detectProxy()
  for (const via of (proxy ? ['proxy', 'direct'] : ['direct'])) {
    const args = ['-sL', '--max-time', '120', '-o', dest]
    if (via === 'proxy') args.push('-x', proxy)
    args.push(url)
    try {
      await new Promise((resolve, reject) => {
        execFile(curl, args, { windowsHide: true, timeout: 150000, maxBuffer: 64 * 1024 * 1024 }, (err, _so, se) => {
          if (err) reject(new Error(String(se || err.message).slice(0, 160)))
          else resolve()
        })
      })
      const st = await fsp.stat(dest).catch(() => null)
      if (st && st.size > 4096) return { ok: true, via: 'curl-' + via }
      attempts.push(`curl-${via}: 文件过小或为空`)
    } catch (e) {
      attempts.push(`curl-${via}: ` + String(e && e.message || e).slice(0, 100))
    }
  }
  throw new Error(`下载官方桥失败（已尝试 ${attempts.join('；')}）。GitHub 直连不可达时可开启系统代理后重试。`)
}

/**
 * Download + install the official bridge (easyeda-api-skill).
 * @param {object} opts { version=DEFAULT_VERSION, dir? }
 * @returns {Promise<{ok:true,dir,script,version,extUrl,wsMethod?}>}
 */
export async function installOfficialBridge(opts = {}) {
  const version = opts.version ?? DEFAULT_VERSION
  const dir = opts.dir ?? bridgeDir()

  // Already installed (anywhere): never touch it (idempotent — keeps the
  // vendored ws and the live bridge state intact if the user clicks again).
  if (isBridgeInstalled()) {
    return { ok: true, dir, script: bridgeScriptPath(), version, extUrl: OFFICIAL_EXT_URL, already: true }
  }

  await fsp.mkdir(dir, { recursive: true })

  const url = archiveUrl(version)
  const tmpRoot = join(tmpdir(), 'dsh-eda-bridge-' + Date.now())
  await fsp.rm(tmpRoot, { recursive: true, force: true })
  const archive = join(tmpRoot, 'bridge.tar.gz')
  await fsp.mkdir(tmpRoot, { recursive: true })
  const dl = await downloadFile(url, archive)

  const extracted = join(tmpRoot, 'src')
  await extractTarGz(archive, extracted)

  // Archive layout: <repo>-main/… — move its contents into place.
  const entries = await fsp.readdir(extracted)
  const inner = entries.length === 1 ? join(extracted, entries[0]) : extracted
  for (const name of await fsp.readdir(inner)) {
    await fsp.rm(join(dir, name), { recursive: true, force: true })
    await fsp.rename(join(inner, name), join(dir, name))
  }
  await fsp.rm(tmpRoot, { recursive: true, force: true })

  // Install the only runtime dependency (ws): offline vendor preferred.
  await ensureWs(dir)

  const script = join(dir, 'scripts', 'bridge-server.mjs')
  if (!existsSync(script)) throw new Error('官方桥脚本缺失：' + script)
  if (!existsSync(join(dir, 'node_modules', 'ws'))) {
    throw new Error('官方桥依赖（ws）未就绪：本机找不到可复用的 ws，npm 也不可用。')
  }
  return { ok: true, dir, script, version, extUrl: OFFICIAL_EXT_URL, wsMethod: 'vendored-or-npm', via: dl.via }
}

export function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex')
}
