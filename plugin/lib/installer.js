/**
 * dsh-lichuang-eda — one-click installer for the OFFICIAL EasyEDA bridge.
 *
 * Vendors the official `easyeda/easyeda-api-skill` (Skill easyeda-api,
 * author JLCEDA, MIT) into ~/.dsh/eda/bridge/: downloads the source archive,
 * extracts it, runs `npm install` (its only dependency is ws), and leaves the
 * official Bridge Server at <dir>/scripts/bridge-server.mjs.
 *
 * No third-party backend (easyeda-agent etc.) is involved.
 */

import { createHash } from 'node:crypto'
import { promises as fsp } from 'node:fs'
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawn } from 'node:child_process'

export const DEFAULT_VERSION = 'main' // branch of the official skill repo
export const OFFICIAL_REPO = 'easyeda/easyeda-api-skill'
export const OFFICIAL_EXT_URL = 'https://jlc-ext.com/item/oshwhub/run-api-gateway' // 官方扩展 Run API Gateway

export function bridgeDir() { return join(homedir(), '.dsh', 'eda', 'bridge') }

/** Absolute path of the official bridge server script. */
export function bridgeScriptPath() {
  return join(bridgeDir(), 'scripts', 'bridge-server.mjs')
}

/** True when the official bridge was installed by this plugin. */
export function isBridgeInstalled() {
  return existsSync(join(bridgeDir(), 'package.json')) && existsSync(join(bridgeDir(), 'scripts', 'bridge-server.mjs')) && existsSync(join(bridgeDir(), 'node_modules', 'ws'))
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
 * Locate an existing `ws` package on this machine (the DSH host ships it via
 * dsh-logcat's dependency) so we can vendor it WITHOUT npm — this machine has
 * PowerShell ExecutionPolicy blocking `npm.ps1`, and offline copy is faster
 * and never touches the registry.
 */
export async function findExistingWs() {
  const profiles = join(homedir(), '.dsh', 'profiles')
  const candidates = []
  try {
    for (const p of await fsp.readdir(profiles)) {
      candidates.push(join(profiles, p, 'node_modules', 'ws'))
    }
  } catch { /* profiles dir missing */ }
  // also the running web profile's hoisted location
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

/**
 * Download + install the official bridge (easyeda-api-skill).
 * @param {object} opts { version=DEFAULT_VERSION }
 * @returns {Promise<{ok:true,dir,script,version,extUrl,wsMethod}>}
 */
export async function installOfficialBridge(opts = {}) {
  const version = opts.version ?? DEFAULT_VERSION
  const dir = bridgeDir()

  // Already installed: never touch it (idempotent — keeps the vendored ws and
  // the live bridge state intact if the user clicks install again).
  if (isBridgeInstalled()) {
    return { ok: true, dir, script: bridgeScriptPath(), version, extUrl: OFFICIAL_EXT_URL, already: true }
  }

  await fsp.mkdir(dir, { recursive: true })

  const url = archiveUrl(version)
  const res = await fetch(url, { signal: AbortSignal.timeout(120000), redirect: 'follow' })
  if (!res.ok) throw new Error(`下载官方桥失败：HTTP ${res.status} ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())

  const tmpRoot = join(homedir(), '.dsh', 'eda', '.tmp-bridge')
  await fsp.rm(tmpRoot, { recursive: true, force: true })
  const archive = join(tmpRoot, 'bridge.tar.gz')
  await fsp.mkdir(tmpRoot, { recursive: true })
  await fsp.writeFile(archive, buf)
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

  const script = bridgeScriptPath()
  if (!existsSync(script)) throw new Error('官方桥脚本缺失：' + script)
  const ok = isBridgeInstalled()
  if (!ok) throw new Error('官方桥依赖（ws）未就绪：npm 被禁或 ws 不可用。请检查 ExecutionPolicy 或网络。')
  return { ok: true, dir, script, version, extUrl: OFFICIAL_EXT_URL, wsMethod: ok ? 'vendored-or-npm' : 'none' }
}

export function sha256Hex(buf) {
  return createHash('sha256').update(buf).digest('hex')
}
