/**
 * Host half of dsh-balance.
 *
 * Resolves the DeepSeek API key through the credential service, reads the
 * platform balance, caches it, and serves it to the Client half over one exact
 * route. The Client half owns rendering; this half owns the secret and the
 * network call, so the key never reaches the browser.
 *
 * Reload discipline: one route per process, and it reads through a module-level
 * reader. Re-applying the plugin (HMR, enable/disable) swaps the reader behind
 * the existing route instead of installing a duplicate — the server rejects a
 * second exact route with the same path.
 */
import { createBalanceReader } from './lib/balance.js'
import { registerRoutes } from './lib/routes.js'

export const name = 'dsh-balance'
export const inject = ['webServer']

/** Reader of the newest activation. */
let current
/** Disposer of the installed route, while one is installed. */
let releaseRoute

/**
 * Register the balance route once and keep it serving the newest reader.
 * @param {import('@deepseek-ai/cordis').Context} ctx - plugin context.
 */
export function apply (ctx) {
  current = createBalanceReader(ctx)
  const read = (request) => current === undefined
    ? Promise.resolve({ ok: false, reason: 'idle' })
    : current.read(request)

  if (releaseRoute === undefined) {
    releaseRoute = registerRoutes(ctx, read)
    ctx.effect(() => () => {
      const release = releaseRoute
      releaseRoute = undefined
      if (typeof release === 'function') release()
    }, 'dsh-balance: balance route')
  }

  ctx.effect(() => () => {
    if (current !== undefined) current.dispose()
    current = undefined
  }, 'dsh-balance: cache lifetime')
}
