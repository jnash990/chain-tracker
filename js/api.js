/**
 * Rate-limited Torn API v2 layer
 * Max 50 requests per minute (rolling 60-second window)
 */

const RATE_LIMIT = 50;
const WINDOW_MS = 60000;
const RETRY_DELAY_MS = 5000;

const timestamps = [];

/**
 * Wait until a timestamp expires (becomes older than 60s)
 * @param {number} ts
 * @returns {Promise<void>}
 */
function waitUntilExpired(ts) {
  const elapsed = Date.now() - ts;
  const remaining = WINDOW_MS - elapsed;
  if (remaining <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, remaining));
}

/**
 * Purge timestamps older than 60 seconds
 */
function purgeOldTimestamps() {
  const cutoff = Date.now() - WINDOW_MS;
  while (timestamps.length > 0 && timestamps[0] < cutoff) {
    timestamps.shift();
  }
}

/**
 * Wait until we can make a request (under rate limit)
 * @returns {Promise<void>}
 */
async function waitForRateLimit() {
  purgeOldTimestamps();
  while (timestamps.length >= RATE_LIMIT) {
    await waitUntilExpired(timestamps[0]);
    purgeOldTimestamps();
  }
}

/**
 * Centralized rate-limited fetch
 * On Torn error 5 or HTTP 429: wait 5s, retry once
 * @param {string} url
 * @param {boolean} [retried=false]
 * @returns {Promise<Object>}
 */
export async function fetchWithRateLimit(url, retried = false) {
  await waitForRateLimit();
  timestamps.push(Date.now());

  const response = await fetch(url);
  const data = await response.json().catch(() => ({}));

  // Torn API error code 5 = Too many requests
  const tornError5 = data.error && data.error.code === 5;
  const http429 = response.status === 429;

  if ((tornError5 || http429) && !retried) {
    await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    return fetchWithRateLimit(url, true);
  }

  if (data.error) {
    const err = new Error(data.error.error || 'API error');
    err.code = data.error.code;
    // Torn: remove disabled/invalid keys to avoid IP bans (api.html)
    err.removeKey = [2, 12, 13, 18].includes(data.error.code);
    throw err;
  }

  return data;
}

const BASE = 'https://api.torn.com/v2';

/**
 * Fetch current chain status
 * @param {string} apiKey
 * @returns {Promise<Object|null>} chain data or null if no active chain
 */
export async function fetchCurrentChain(apiKey) {
  const url = `${BASE}/faction/chain?key=${apiKey}`;
  const data = await fetchWithRateLimit(url);
  const chain = data.chain ?? null;
  return chain;
}

/**
 * Fetch list of previous chains (for when no active chain)
 * @param {string} apiKey
 * @returns {Promise<Object>} { chains: [{ id, chain, respect, start, end }, ...] }
 */
export async function fetchFactionChains(apiKey) {
  const url = `${BASE}/faction/chains?limit=100&key=${apiKey}`;
  return fetchWithRateLimit(url);
}

/**
 * Fetch chain report (per-member hits and respect)
 * @param {number} chainId
 * @param {string} apiKey
 * @returns {Promise<Object>}
 */
export async function fetchChainReport(chainId, apiKey) {
  const url = `${BASE}/faction/${chainId}/chainreport?key=${apiKey}`;
  return fetchWithRateLimit(url);
}

/**
 * Fetch faction news (armory actions for xanax/points)
 * @param {Object} options
 * @param {string} options.apiKey
 * @param {string} [options.before] - Cursor for pagination (_metadata.links.prev)
 * @returns {Promise<Object>}
 */
export async function fetchFactionNews({ apiKey, before }) {
  let url;
  if (before && before.startsWith('http')) {
    const u = new URL(before);
    u.searchParams.set('key', apiKey);
    url = u.toString();
  } else {
    url = `${BASE}/faction/news?cat=armoryAction&stripTags=true&sort=desc&limit=100&key=${apiKey}`;
    if (before) {
      url += `&before=${encodeURIComponent(before)}`;
    }
  }
  return fetchWithRateLimit(url);
}
