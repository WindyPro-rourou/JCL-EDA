/**
 * dsh-lichuang-eda · client bundle RUNTIME test.
 *
 * Loads lib/client.js in Node with DOM/hook stubs, mounts it (apply), then
 * DEEP-RENDERS the panel component tree by invoking every function component
 * with the executed createElement — so a `ReferenceError` like the one at
 * EdaPanel (ready is not defined) can never ship again.
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
  const el = () => ({
    className: '', dataset: {}, style: {}, hidden: false, children: [], innerHTML: '',
    setAttribute() {}, addEventListener() {}, appendChild() {}, remove() {},
    isConnected: true, closest() { return null }, querySelector() { return null }, matches() { return false },
  })
  const documentStub = {
    createElement: el, head: { appendChild() {}, removeChild() {} }, body: { appendChild() {}, removeChild() {}, contains: () => true },
    querySelector: () => null, querySelectorAll: () => [],
  }
  globalThis.MutationObserver ||= class { observe() {} disconnect() {} }
  const react = { createElement: h, useEffect, useState }
  const reactDom = { createRoot: () => ({ render(el) { lastRoot = el }, unmount() {} }) }

  let loaded = null
  let lastRoot = null
  const windowStub = { __ModuleLoader__: { load: (def) => { loaded = def } } }
  const requireStub = (id) => (id === 'react' ? react : (id === 'react-dom/client' ? reactDom : (() => {})))

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
  const { exports, documentStub } = makeEnv()
  assert.equal(typeof exports.apply, 'function')
  assert.deepEqual(exports.inject, ['slots'])
  const ctx = { effect: (fn) => { const d = fn(); if (typeof d === 'function') d() } }
  assert.doesNotThrow(() => exports.apply(ctx))
})

test('client bundle: deep-render EdaPanel (all components) — no ReferenceError inside JSX', () => {
  const env = makeEnv()
  const ctx = { effect: (fn) => { const d = fn(); if (typeof d === 'function') d() } }
  env.exports.apply(ctx)
  assert.ok(env.lastRoot, 'panel must have been rendered')
  assert.doesNotThrow(() => renderElement(env.lastRoot), 'component tree must render without throwing')
})
