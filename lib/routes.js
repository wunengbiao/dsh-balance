/**
 * One exact JSON route for the balance card.
 *
 * The handler never throws at the caller: a missing key is a normal answer
 * (`configured: false`), and an upstream failure keeps the last known value so
 * the card can show a stale amount with a warning instead of an empty space.
 */

/** Public API prefix used by the Client half. */
export const API_PREFIX = '/dsh-balance'
/**
 * Balance read route. The protocol version is part of the path so a route left
 * behind by an earlier plugin generation can never collide with this one.
 */
export const BALANCE_ROUTE = API_PREFIX + '/v1/balance'

/**
 * Register the balance route on the composed web server. The handler reads the
 * balance through `read`, so a plugin reload swaps the implementation behind a
 * single installed route instead of leaving a stale closure behind.
 * @param {object} ctx - plugin context.
 * @param {(request: {force: boolean}) => Promise<object>} read - current balance read.
 * @returns {() => void} disposer (the effect owner removes the route).
 */
export function registerRoutes (ctx, read) {
  const webServer = ctx.get('webServer')
  if (webServer === undefined) return () => {}
  const dispose = webServer.register({
    kind: 'exact',
    path: BALANCE_ROUTE,
    handler: (request, response) => { void respond(request, response, read) },
  })
  return typeof dispose === 'function' ? dispose : () => {}
}

/**
 * Serve one balance read.
 * @param {import('node:http').IncomingMessage} request - incoming request.
 * @param {import('node:http').ServerResponse} response - outgoing response.
 * @param {(request: {force: boolean}) => Promise<object>} read - current balance read.
 */
async function respond (request, response, read) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    send(response, 405, { error: 'method not allowed' }, { allow: 'GET, HEAD' })
    return
  }
  let force = false
  try {
    const url = new URL(request.url ?? BALANCE_ROUTE, 'http://localhost')
    force = url.searchParams.get('refresh') === '1'
  } catch {
    force = false
  }
  let payload
  try {
    payload = await read({ force })
  } catch (error) {
    payload = { ok: false, reason: 'read', error: error instanceof Error ? error.message : String(error) }
  }
  send(response, 200, payload)
}

/**
 * Write one no-store JSON response.
 * @param {import('node:http').ServerResponse} response - outgoing response.
 * @param {number} status - HTTP status.
 * @param {object} payload - JSON body.
 * @param {Record<string, string>} [headers] - extra headers.
 */
function send (response, status, payload, headers = {}) {
  if (response.headersSent) return
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    ...headers,
  })
  response.end(JSON.stringify(payload))
}
