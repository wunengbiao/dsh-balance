/**
 * Harness check for the Host wiring without the running app.
 *
 * Simulates a composing context with a credential service and a web server whose
 * register() returns a disposer, then proves three things the live reload taught
 * us to require:
 *   1. one route is installed and reads through to the current reader;
 *   2. disposing and re-applying swaps the implementation behind that route;
 *   3. the route is removed exactly once when its effect is disposed.
 */
import assert from 'node:assert/strict'
import { apply } from '../index.js'

const routes = new Map()
let registered = 0
let removed = 0
const disposers = []
const effects = []

const webServer = {
  register (route) {
    if (routes.has(route.path)) throw new Error('webserver: duplicate exact route "' + route.path + '"')
    registered += 1
    routes.set(route.path, route.handler)
    return () => { removed += 1; routes.delete(route.path) }
  },
}

const credentials = {
  resolve: async (ref) => (ref === 'DEEPSEEK_API_KEY' ? { value: 'sk-test', source: 'store' } : undefined),
}

const ctx = {
  get (name) {
    if (name === 'webServer') return webServer
    if (name === 'credentials') return credentials
    return undefined
  },
  effect (fn) {
    const dispose = fn()
    effects.push(dispose)
    disposers.push(dispose)
    return () => {
      const disposeFn = disposers.pop()
      if (typeof disposeFn === 'function') disposeFn()
    }
  },
}

// The network is stubbed: this checks wiring, not the platform.
globalThis.fetch = async () => ({
  ok: true,
  status: 200,
  json: async () => ({ is_available: true, balance_infos: [{ currency: 'CNY', total_balance: '12.34', granted_balance: '0.00', topped_up_balance: '12.34' }] }),
})

const call = async (url = '/dsh-balance/v1/balance') => {
  const handler = routes.get('/dsh-balance/v1/balance')
  assert.ok(handler, 'the balance route must be installed')
  let body = ''
  const response = {
    headersSent: false,
    writeHead () { this.headersSent = true },
    end (chunk) { body = chunk ?? '' },
  }
  handler({ method: 'GET', url }, response)
  // The route handler is fire-and-forget; let its async body settle.
  for (let tick = 0; tick < 5 && body === ''; tick += 1) await new Promise((resolve) => setTimeout(resolve, 0))
  return JSON.parse(body)
}

apply(ctx)
assert.equal(registered, 1, 'exactly one route is installed on the first apply')
assert.equal(routes.size, 1)

const first = await call()
assert.equal(first.ok, true)
assert.equal(first.configured, true)
assert.equal(first.wallets[0].total, '12.34')
console.log('ok 1 · first activation serves the balance')

// Second activation (what a plugin reload does): no duplicate, same route, fresh reader.
apply(ctx)
assert.equal(registered, 1, 'a reload must not install a second route')
assert.equal(routes.size, 1)
const second = await call('/dsh-balance/v1/balance?refresh=1')
assert.equal(second.ok, true, 'the reloaded reader answers through the existing route')
assert.equal(second.wallets[0].total, '12.34')
console.log('ok 2 · reload swaps the reader behind one route, no duplicate')

// Disposing the activation that installed the route releases it exactly once.
effects[0]()
assert.equal(removed, 1, 'the route disposer runs once')
assert.equal(routes.size, 0)
console.log('ok 3 · the installed route is released on dispose')

// And an activation after disposal re-installs cleanly.
apply(ctx)
assert.equal(registered, 2, 'a later activation installs again after a clean release')
assert.equal((await call()).ok, true)
console.log('ok 4 · activation after dispose re-installs cleanly')
