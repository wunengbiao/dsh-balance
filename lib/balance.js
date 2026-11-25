/**
 * DeepSeek platform balance through the configured API key.
 *
 * The credential service, when composed, is authoritative: its answer — hit or
 * miss — decides whether a key exists. Only a deployment without that service
 * falls back to the launch environment. Results are cached for a short window
 * so a re-rendering sidebar does not re-request on every focus change.
 */

const DEFAULT_BASE_URL = 'https://api.deepseek.com'
const DEFAULT_KEY_ENV = 'DEEPSEEK_API_KEY'
const DEFAULT_TTL_MS = 60_000
const DEFAULT_TIMEOUT_MS = 8_000

/**
 * Per-request tuning, resolved from the launch environment so a stale build
 * does not need a configuration entry for a one-off endpoint change.
 * @returns {{baseUrl: string, keyEnv: string, ttlMs: number, timeoutMs: number}} resolved options.
 */
function options () {
  const baseUrl = (process.env.DSH_BALANCE_BASE_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '')
  const keyEnv = process.env.DSH_BALANCE_API_KEY_ENV ?? DEFAULT_KEY_ENV
  return { baseUrl, keyEnv, ttlMs: DEFAULT_TTL_MS, timeoutMs: DEFAULT_TIMEOUT_MS }
}

/**
 * Read the API key, preferring the credential store over the environment.
 * @param {object} ctx - plugin context; `credentials` is optional.
 * @param {string} keyEnv - credential reference name.
 * @returns {Promise<string | undefined>} the key, or undefined when absent.
 */
async function resolveKey (ctx, keyEnv) {
  const credentials = ctx.get('credentials')
  if (credentials !== undefined) {
    const hit = await credentials.resolve(keyEnv)
    const value = typeof hit?.value === 'string' ? hit.value.trim() : ''
    return value.length === 0 ? undefined : value
  }
  const ambient = process.env[keyEnv]
  return typeof ambient === 'string' && ambient.trim().length > 0 ? ambient.trim() : undefined
}

/**
 * Normalize one wallet entry from the platform payload.
 * @param {unknown} entry - raw `balance_infos` element.
 * @returns {{currency: string, total: string, granted: string, toppedUp: string}} wallet.
 */
function walletOf (entry) {
  const row = typeof entry === 'object' && entry !== null ? entry : {}
  const text = (value) => (typeof value === 'string' ? value : typeof value === 'number' ? String(value) : '0')
  return {
    currency: typeof row.currency === 'string' ? row.currency : 'CNY',
    total: text(row.total_balance),
    granted: text(row.granted_balance),
    toppedUp: text(row.topped_up_balance),
  }
}

/**
 * Create the cached balance reader shared by every request of this process.
 * @param {object} ctx - plugin context.
 * @returns {{read: (request?: {force?: boolean}) => Promise<object>, dispose: () => void}} reader.
 */
export function createBalanceReader (ctx) {
  /** Last successful payload; served while a later read fails. */
  let last
  let inflight

  const read = async ({ force = false } = {}) => {
    const now = Date.now()
    if (!force && last !== undefined && now - last.at < options().ttlMs) return { ...last.value, cached: true }
    if (inflight !== undefined) return inflight

    inflight = (async () => {
      const { baseUrl, keyEnv, timeoutMs } = options()
      let key
      try {
        key = await resolveKey(ctx, keyEnv)
      } catch (error) {
        return failure(error, 'credential', last)
      }
      if (key === undefined) {
        const value = { ok: true, configured: false, keyEnv, isAvailable: false, wallets: [], fetchedAt: new Date().toISOString() }
        last = { at: Date.now(), value }
        return value
      }

      try {
        const response = await fetch(baseUrl + '/user/balance', {
          method: 'GET',
          headers: { authorization: 'Bearer ' + key, accept: 'application/json' },
          signal: AbortSignal.timeout(timeoutMs),
        })
        if (!response.ok) {
          const detail = response.status === 401 ? 'key-rejected' : 'http-' + response.status
          return failure(new Error(detail), 'upstream', last)
        }
        const payload = await response.json()
        const raw = Array.isArray(payload?.balance_infos) ? payload.balance_infos : []
        const wallets = raw.map(walletOf)
        const value = {
          ok: true,
          configured: true,
          keyEnv,
          isAvailable: payload?.is_available !== false,
          wallets,
          fetchedAt: new Date().toISOString(),
        }
        last = { at: Date.now(), value }
        return value
      } catch (error) {
        return failure(error, 'network', last)
      }
    })()

    try {
      return await inflight
    } finally {
      inflight = undefined
    }
  }

  return {
    read,
    dispose () {
      inflight = undefined
      last = undefined
    },
  }
}

/**
 * Build a failed result, carrying the previous value so the card can keep
 * showing a stale amount instead of blinking.
 * @param {unknown} error - cause.
 * @param {string} reason - coarse failure class for the client.
 * @param {{at: number, value: object} | undefined} last - previous success.
 * @returns {object} failure payload.
 */
function failure (error, reason, last) {
  const message = error instanceof Error ? error.message : String(error)
  return {
    ok: false,
    configured: last?.value?.configured ?? undefined,
    reason,
    error: message,
    stale: last?.value,
    fetchedAt: new Date().toISOString(),
  }
}
