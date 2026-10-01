/**
 * dsh-lichuang-eda · client bundle RUNTIME test (0.1.x + 0.2 shells).
 *
 * Loads lib/client.js with DOM/hook stubs, mounts it (apply), then DEEP-RENDERS
 * the component tree by invoking every function component with the executed
 * createElement — so a ReferenceError inside a panel component can never ship.
 *
 * Two paths are covered:
 *   1. no slots service  → DOM fallback mount (0.1.x / degraded shells);
 *   2. slots service      → `shell.overlay` + header-utility registrations (0.2),
 *      both captured and deep-rendered.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const BUNDLE = fileURLToPath(new URL('../lib/client.js', import.meta.url))

function makeEnv() {
  // Executed createElement: builds a plain tree { type, props, children }.
  const h = (type, props, ...children) => ({ type, props: props || {}, children })
  // Hook stubs (values only; no reactivity needed for a render smoke test).
  const useState = (init) => [typeof init === 'function' ? init() : init, () => {}]
  const useEffect = () => {}
  const useRef = (init) => ({ current: init ?? null })
  const useMemo = (fn) => fn()
  const el = () => ({
    className: '', dataset: {}, style: {}, hidden: false, children: [], innerHTML: '',
    setAttribute() {}, addEventListener() {}, appendChild() {}, remove() {},
    isConnected: true, closest() { return null }, querySelector() { return null }, matches() { return false },
  })
  const documentStub = {
    createElement: el, head: { appendChild() {}, removeChild() {} },
    body: { appendChild() {}, removeChild() {}, contains: () => true },
    querySelector: () => null, querySelectorAll: () => [],
  }
  globalThis.MutationObserver ||= class { observe() {} disconnect() {} }
  const react = { createElement: h, useEffect, useState, useRef, useMemo }
  let lastRoot = null
  const reactDom = { createRoot: () => ({ render(node) { lastRoot = node }, unmount() {} }) }

  let loaded = null
  const windowStub = { __ModuleLoader__: { load: (def) => { loaded = def } } }
  const requireStub = (id) => {
    if (id === 'react') return react
    if (id === 'react-dom/client') return reactDom
    if (id === '@deepseek-ai/dsh-client-ui-primitives') throw new Error('not shipped in this build')
    return () => {}
  }

  const fn = new Function('window', 'document', 'require', 'console', readFileSync(BUNDLE, 'utf8'))
  fn(windowStub, documentStub, requireStub, console)
  assert.ok(loaded, 'bundle must call window.__ModuleLoader__.load')
  const exports = loaded.factory(requireStub)
  return { exports, documentStub, get lastRoot() { return lastRoot } }
}

/** Recursively invoke function components (a mini renderer) — throws on any
 *  ReferenceError/undefined call inside a component body. */
function renderElement(node, depth = 0) {
  if (node === null || node === undefined) return
  if (Array.isArray(node)) { for (const n of node) renderElement(n, depth + 1); return }
  if (typeof node !== 'object') return // strings/numbers
  const { type, props, children } = node
  if (typeof type === 'function') {
    const out = type(props)
    if (Array.isArray(out)) for (const n of out) renderElement(n, depth + 1)
    else renderElement(out, depth + 1)
    return
  }
  for (const c of children) renderElement(c, depth + 1)
}

test('client bundle: factory + apply mount without throwing, exports shape correct', () => {
  const { exports } = makeEnv()
  assert.equal(typeof exports.apply, 'function')
  assert.deepEqual(exports.inject, ['slots'])
  const ctx = { effect: (fn) => { const d = fn(); if (typeof d === 'function') d() } }
  assert.doesNotThrow(() => exports.apply(ctx))
})

test('client bundle: DOM fallback mount (no slots) deep-renders without throwing', () => {
  const env = makeEnv()
  const ctx = { effect: (fn) => { const d = fn(); if (typeof d === 'function') d() } }
  env.exports.apply(ctx)
  assert.ok(env.lastRoot, 'fallback mount must render the panel root')
  assert.doesNotThrow(() => renderElement(env.lastRoot), 'component tree must render without throwing')
})

test('client bundle 0.2: registers into shell.overlay + header utilities, both deep-render', () => {
  const env = makeEnv()
  const registered = []
  const slots = {
    inject: (_slot, cb) => { cb(); return () => {} },
    register: (meta, Comp) => { registered.push({ meta, Comp }); return () => {} },
  }
  const ctx = {
    get: (name) => (name === 'slots' ? slots : undefined),
    effect: (fn) => { const d = fn(); if (typeof d === 'function') d() },
  }
  env.exports.apply(ctx)
  const ids = registered.map((r) => r.meta.id)
  assert.ok(ids.includes('eda'), 'panel must register into shell.overlay')
  assert.ok(ids.includes('eda-toggle'), 'entry must register into header utilities')
  for (const r of registered) {
    assert.equal(r.meta.name.includes('.') || r.meta.name === 'shell.overlay', true, `slot name: ${r.meta.name}`)
    assert.doesNotThrow(() => renderElement(r.Comp({})), `${r.meta.id} component must render`)
  }
})

test('client bundle: panel styles use host tokens + overlay-safe positioning (no fixed 9999 overlay)', () => {
  const src = readFileSync(BUNDLE, 'utf8')
  assert.match(src, /--dsw-alias-bg-layer-1/, 'must wear host tokens')
  assert.match(src, /position:\s*absolute/, 'panel must be absolutely positioned inside the shell overlay')
  assert.doesNotMatch(src, /z-index:\s*9999/, 'must not use the old 9999 fixed overlay z-index')
  assert.match(src, /dsh-client-ui-primitives/, 'must try the host UI kit first')
})
