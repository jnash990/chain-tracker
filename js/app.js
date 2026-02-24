/**
 * App orchestration - init flow, data fetching, chain management
 */

import * as db from './db.js';
import * as api from './api.js';
import * as ui from './ui.js';

const XANAX_PHRASE = "used one of the faction's Xanax items";
const POINTS_REGEX = /used (\d+) faction points/gi;

let refreshIntervalId = null;
let isRefreshing = false;

/**
 * Extract consumption (xanax, points) from faction news
 * @param {Object[]} newsItems
 * @param {number} chainStart
 * @param {number} chainEnd
 * @param {Set<string>} [processedIds] - Avoid double-counting on refresh
 * @returns {{ xanax: Record<string, number>, points: Record<string, number> }}
 */
function extractConsumption(newsItems, chainStart, chainEnd, processedIds = new Set()) {
  const xanax = {};
  const points = {};

  const addXanax = (name) => {
    if (!name) return;
    xanax[name] = (xanax[name] || 0) + 1;
  };

  const addPoints = (name, amount) => {
    if (!name || !amount) return;
    points[name] = (points[name] || 0) + amount;
  };

  for (const item of newsItems) {
    const ts = item.timestamp ?? item.time ?? item.id;
    if (ts < chainStart) continue;
    if (ts > chainEnd) continue;
    const id = item.id ?? `${ts}-${JSON.stringify(item).slice(0, 50)}`;
    if (processedIds.has(id)) continue;
    processedIds.add(id);

    const text = item.news ?? item.text ?? item.content ?? '';
    const name = item.name ?? extractMemberName(text);

    if (text.includes(XANAX_PHRASE)) {
      addXanax(name);
    }

    let match;
    const regex = new RegExp(POINTS_REGEX.source, 'gi');
    while ((match = regex.exec(text)) !== null) {
      addPoints(name, parseInt(match[1], 10));
    }
  }

  return { xanax, points };
}

/**
 * Extract member name from news text (typically first part before " used ")
 * @param {string} text
 * @returns {string}
 */
function extractMemberName(text) {
  const usedIdx = text.indexOf(' used ');
  if (usedIdx > 0) {
    return text.slice(0, usedIdx).trim();
  }
  const words = text.trim().split(/\s+/);
  return words[0] || 'Unknown';
}

/**
 * Merge consumption into chain, avoiding duplicates via processedIds
 */
function mergeConsumption(chain, xanax, points) {
  const consumption = chain.consumption ?? {};
  for (const [name, count] of Object.entries(xanax)) {
    const cur = consumption[name] ?? { xanax: 0, points: 0 };
    consumption[name] = { ...cur, xanax: (cur.xanax || 0) + count };
  }
  for (const [name, amount] of Object.entries(points)) {
    const cur = consumption[name] ?? { xanax: 0, points: 0 };
    consumption[name] = { ...cur, points: (cur.points || 0) + amount };
  }
  chain.consumption = consumption;
}

/**
 * Update totals from hits and consumption
 */
function updateTotals(chain) {
  let hits = 0, respect = 0, xanax = 0, points = 0;
  for (const m of Object.values(chain.hits ?? {})) {
    hits += m.hits || 0;
    respect += m.respect || 0;
  }
  for (const c of Object.values(chain.consumption ?? {})) {
    xanax += c.xanax || 0;
    points += c.points || 0;
  }
  chain.totals = { hits, respect, xanax, points };
}

/**
 * Fetch all faction news pages until timestamp < chainStart
 */
async function fetchAllFactionNews(apiKey, chainStart, chainEnd, processedIds) {
  const allNews = [];
  let before = null;

  while (true) {
    const data = await api.fetchFactionNews({ apiKey, before });
    const news = data.news ?? data.faction?.news ?? [];
    const items = Array.isArray(news) ? news : Object.values(news);

    let reachedChainStart = false;
    for (const item of items) {
      const ts = item.timestamp ?? item.time ?? (typeof item === 'object' ? item.id : null);
      if (ts != null && ts < chainStart) {
        reachedChainStart = true;
        break;
      }
      allNews.push(item);
    }

    const meta = data._metadata ?? data.metadata ?? {};
    const links = meta.links ?? {};
    const prev = links.prev ?? meta.prev;
    if (!prev || reachedChainStart) break;
    before = typeof prev === 'string' ? prev : prev.url ?? prev.before ?? prev;
  }

  return extractConsumption(allNews, chainStart, chainEnd, processedIds);
}

/**
 * Load and sync chain data
 */
async function loadAndSyncChain(apiKey, currentChain) {
  const chainId = currentChain.id ?? currentChain.chain_id ?? currentChain.chainId;
  const start = currentChain.start ?? currentChain.chain_start;
  const isActive = currentChain.current != null || currentChain.end == null;
  const end = isActive ? Math.floor(Date.now() / 1000) : (currentChain.end ?? Math.floor(Date.now() / 1000));

  let chain = await db.getChain(chainId);
  const isNew = !chain;

  if (isNew) {
    chain = {
      chainId,
      start,
      end: isActive ? null : end,
      status: isActive ? 'active' : 'finished',
      hits: {},
      consumption: {},
      totals: { hits: 0, respect: 0, xanax: 0, points: 0 },
      processedNewsIds: [],
    };
  }

  const processedIds = new Set(chain.processedNewsIds ?? []);

  const [reportData, consumption] = await Promise.all([
    api.fetchChainReport(chainId, apiKey),
    fetchAllFactionNews(apiKey, start, end, processedIds),
  ]);

  const report = reportData.chainreport ?? reportData;
  const attackers = report.attackers ?? report.attacker ?? [];

  const hits = {};
  for (const a of attackers) {
    const id = String(a.id ?? a.user_id ?? a.attacker_id);
    hits[id] = {
      hits: a.attacks?.total ?? a.attacks ?? a.hits ?? 0,
      respect: a.respect?.total ?? a.respect ?? 0,
      name: a.name ?? a.username ?? id,
    };
  }
  chain.hits = hits;
  mergeConsumption(chain, consumption.xanax, consumption.points);
  chain.processedNewsIds = Array.from(processedIds);
  chain.end = currentChain.current ? null : (report.end ?? end);
  chain.status = chain.end ? 'finished' : 'active';
  updateTotals(chain);

  await db.setConfig('lastSyncTimestamp', Math.floor(Date.now() / 1000));
  await db.saveChain(chain);

  return chain;
}

/**
 * Main init - run on page load
 */
export async function init() {
  ui.setCallbacks({
    onApiKeySubmit: saveApiKey,
    onSelectChain: selectChain,
  });

  try {
    await db.initDB();
    const apiKey = await db.getConfig('apiKey');

    if (!apiKey) {
      ui.showApiKeyForm();
      return;
    }

    ui.showLoading();

    const currentChain = await api.fetchCurrentChain(apiKey);

    if (!currentChain || (!currentChain.current && !currentChain.id)) {
      const apiChainsData = await api.fetchFactionChains(apiKey);
      const apiChains = apiChainsData.chains ?? [];
      const cachedChains = await db.getAllChains();
      ui.showNoActiveChain(apiChains, cachedChains, apiKey, onFetchChainFromApi);
      return;
    }

    const chain = await loadAndSyncChain(apiKey, currentChain);
    ui.showDashboard(chain, apiKey);
    startAutoRefresh(apiKey, chain);
  } catch (err) {
    ui.showError(err.message || 'Failed to load');
    if (err.removeKey) {
      await db.setConfig('apiKey', null);
    }
    ui.showApiKeyForm();
  }
}

/**
 * Start auto-refresh (every 2 minutes, only when visible)
 */
function startAutoRefresh(apiKey, chain) {
  if (chain.status !== 'active') return;
  if (refreshIntervalId) return;

  refreshIntervalId = setInterval(async () => {
    if (document.visibilityState !== 'visible') return;
    if (isRefreshing) return;

    isRefreshing = true;
    try {
      const currentChain = await api.fetchCurrentChain(apiKey);
      if (!currentChain?.current && !currentChain?.id) {
        chain.status = 'finished';
        chain.end = chain.end ?? Math.floor(Date.now() / 1000);
        await db.saveChain(chain);
        stopAutoRefresh();
        ui.showDashboard(chain, apiKey);
        return;
      }

      const updated = await loadAndSyncChain(apiKey, currentChain);
      ui.showDashboard(updated, apiKey);
    } catch {
      // Silent fail on refresh
    } finally {
      isRefreshing = false;
    }
  }, 120000);
}

function stopAutoRefresh() {
  if (refreshIntervalId) {
    clearInterval(refreshIntervalId);
    refreshIntervalId = null;
  }
}

/**
 * Save API key and re-init
 */
export async function saveApiKey(key) {
  await db.setConfig('apiKey', key.trim());
  ui.clearError();
  await init();
}

/**
 * Handle API key form submit
 */
export function onApiKeySubmit(key) {
  saveApiKey(key);
}

/**
 * Select a historical chain to view (from IndexedDB cache)
 */
export async function selectChain(chainId) {
  const chain = await db.getChain(chainId);
  if (chain) {
    ui.showDashboard(chain, null);
  }
}

/**
 * Fetch chain from API and show dashboard (when user picks from chains list)
 */
async function onFetchChainFromApi(apiKey, chainFromApi) {
  ui.showLoading();
  try {
    const chainData = {
      id: chainFromApi.id ?? chainFromApi.chain,
      chain_id: chainFromApi.id ?? chainFromApi.chain,
      start: chainFromApi.start,
      end: chainFromApi.end,
      current: null,
    };
    const chain = await loadAndSyncChain(apiKey, chainData);
    ui.showDashboard(chain, apiKey);
  } catch (err) {
    ui.showError(err.message || 'Failed to load chain');
    if (err.removeKey) {
      await db.setConfig('apiKey', null);
      ui.showApiKeyForm();
      return;
    }
    const apiChainsData = await api.fetchFactionChains(apiKey);
    const apiChains = apiChainsData.chains ?? [];
    const cachedChains = await db.getAllChains();
    ui.showNoActiveChain(apiChains, cachedChains, apiKey, onFetchChainFromApi);
  }
}
