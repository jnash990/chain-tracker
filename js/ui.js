/**
 * UI layer - render API key form, dashboard, table, badges
 */

const container = document.getElementById('app');
let apiKeySubmitCallback = null;
let selectChainCallback = null;

export function setCallbacks({ onApiKeySubmit, onSelectChain, onLoadMoreChains }) {
  apiKeySubmitCallback = onApiKeySubmit;
  selectChainCallback = onSelectChain;
  onLoadMoreChainsCallback = onLoadMoreChains;
}
let onLoadMoreChainsCallback = null;
const apiKeySection = document.getElementById('api-key-section');
const apiKeyForm = document.getElementById('api-key-form');
const apiKeyInput = document.getElementById('api-key-input');
const errorEl = document.getElementById('error');
const loadingEl = document.getElementById('loading');
const dashboardEl = document.getElementById('dashboard');
const noChainEl = document.getElementById('no-chain');

function showSection(id) {
  [apiKeySection, loadingEl, dashboardEl, noChainEl].forEach((el) => {
    if (el) el.classList.add('hidden');
  });
  const el = document.getElementById(id);
  if (el) el.classList.remove('hidden');
}

function formatNum(n) {
  return Number(n).toLocaleString();
}

function buildMemberRows(chain, membersMap = {}) {
  const hits = chain.hits ?? {};
  const consumption = chain.consumption ?? {};
  const members = new Map();

  for (const [id, data] of Object.entries(hits)) {
    const name = data.name ?? membersMap[id] ?? id;
    members.set(id, {
      id,
      name,
      hits: data.hits ?? 0,
      respect: data.respect ?? 0,
      xanax: 0,
      points: 0,
    });
  }

  for (const [id, data] of Object.entries(consumption)) {
    const name = data.name ?? membersMap[id] ?? id;
    const m = members.get(id) ?? { id, name, hits: 0, respect: 0, xanax: 0, points: 0 };
    m.xanax = (m.xanax || 0) + (data.xanax ?? 0);
    m.points = (m.points || 0) + (data.points ?? 0);
    m.name = name || m.name;
    members.set(id, m);
  }

  return Array.from(members.values());
}

/**
 * Render sortable member table
 */
function renderTable(chain, sortKey = 'hits', sortDir = 'desc', membersMap = {}) {
  const rows = buildMemberRows(chain, membersMap);
  const sorted = [...rows].sort((a, b) => {
    let va = a[sortKey] ?? 0;
    let vb = b[sortKey] ?? 0;
    if (sortKey === 'rph') {
      va = (a.hits && a.respect) ? a.respect / a.hits : 0;
      vb = (b.hits && b.respect) ? b.respect / b.hits : 0;
    }
    if (typeof va === 'string') return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
    return sortDir === 'asc' ? va - vb : vb - va;
  });

  const topHits = sorted.slice(0, 3).map((r) => r.hits);
  const topHitsSet = new Set(topHits);
  const sortIndicator = (key) => {
    if (sortKey !== key) return '';
    return sortDir === 'desc' ? ' \u2193' : ' \u2191';
  };

  let html = `
    <div class="overflow-x-auto">
      <table class="min-w-full divide-y divide-gray-200">
        <thead class="bg-gray-50">
          <tr>
            <th scope="col" class="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" data-sort="name">Member${sortIndicator('name')}</th>
            <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" data-sort="hits">Hits${sortIndicator('hits')}</th>
            <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" data-sort="respect">Respect${sortIndicator('respect')}</th>
            <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" data-sort="rph">Respect/Hit${sortIndicator('rph')}</th>
            <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" data-sort="xanax">Xanax${sortIndicator('xanax')}</th>
            <th scope="col" class="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100" data-sort="points">Points${sortIndicator('points')}</th>
          </tr>
        </thead>
        <tbody class="bg-white divide-y divide-gray-200">
  `;

  if (sorted.length === 0) {
    html += `
      <tr>
        <td colspan="6" class="px-6 py-8 text-center text-gray-500 text-sm">No member data yet. Chain report will populate as attacks are recorded.</td>
      </tr>
    `;
  } else {
    for (const m of sorted) {
      const rph = m.hits ? (m.respect / m.hits).toFixed(2) : '—';
      const isTop = topHitsSet.has(m.hits) && m.hits > 0;
      const rowClass = isTop ? 'bg-amber-50' : '';
      html += `
        <tr class="${rowClass} hover:bg-gray-50">
          <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${escapeHtml(m.name)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">${formatNum(m.hits)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">${formatNum(m.respect)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">${rph}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">${formatNum(m.xanax)}</td>
          <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-600 text-right">${formatNum(m.points)}</td>
        </tr>
      `;
    }
  }

  html += '</tbody></table></div>';

  const wrap = document.getElementById('member-table-wrap');
  if (wrap) {
    wrap.innerHTML = html;
    wrap.querySelectorAll('[data-sort]').forEach((th) => {
        th.addEventListener('click', () => {
        const key = th.dataset.sort;
        const nextDir = sortKey === key && sortDir === 'desc' ? 'asc' : 'desc';
        renderTable(chain, key, nextDir, membersMap);
      });
    });
  }
}

function escapeHtml(s) {
  const div = document.createElement('div');
  div.textContent = s;
  return div.innerHTML;
}

export function showApiKeyForm() {
  showSection('api-key-section');
  if (apiKeyInput) apiKeyInput.value = '';
  if (apiKeyForm) {
    apiKeyForm.onsubmit = (e) => {
      e.preventDefault();
      const key = apiKeyInput?.value?.trim();
      if (key && apiKeySubmitCallback) apiKeySubmitCallback(key);
    };
  }
}

export function showLoading() {
  showSection('loading');
}

export function showError(msg) {
  if (errorEl) {
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
  }
}

export function clearError() {
  if (errorEl) {
    errorEl.textContent = '';
    errorEl.classList.add('hidden');
  }
}

function formatDate(ts) {
  if (!ts) return '—';
  try {
    return new Date(ts * 1000).toLocaleString();
  } catch {
    return String(ts);
  }
}

export function showNoActiveChain(apiChains, cachedChains, apiKey, metadata, onFetchChainFromApi, onLoadMoreChains, accumulatedApiChains = null) {
  showSection('no-chain');
  const list = document.getElementById('historical-chains');
  if (!list) return;

  const chainsToShow = accumulatedApiChains ?? apiChains ?? [];
  const sortedCached = (cachedChains ?? [])
    .sort((a, b) => (b.chainId ?? 0) - (a.chainId ?? 0))
    .slice(0, 10);
  const sortedApiChains = [...chainsToShow].sort((a, b) => (b.id ?? b.chain ?? 0) - (a.id ?? a.chain ?? 0));

  const links = metadata?._metadata?.links ?? metadata?.links ?? {};
  const nextLink = links.next ?? metadata?.next;
  const hasMore = Boolean(nextLink);

  if (sortedCached.length === 0 && sortedApiChains.length === 0) {
    list.innerHTML = '<p class="text-gray-500 text-sm">No chains found.</p>';
    return;
  }

  let html = '';

  if (sortedCached.length > 0) {
    html += '<p class="text-xs text-gray-500 uppercase font-medium mb-2">Previously loaded (cached)</p>';
    html += sortedCached
      .map(
        (c) =>
          `<button type="button" class="block w-full text-left px-4 py-2 rounded hover:bg-gray-100 text-sm mb-1" data-cached-chain data-chain-id="${c.chainId}">Chain #${c.chainId} — ${formatNum(c.totals?.hits ?? 0)} hits</button>`
      )
      .join('');
  }

  if (sortedApiChains.length > 0) {
    html += '<p class="text-xs text-gray-500 uppercase font-medium mb-2 mt-4">Fetch from API</p>';
    html += sortedApiChains
      .map(
        (c) => {
          const id = c.id ?? c.chain;
          const start = formatDate(c.start);
          const end = formatDate(c.end);
          return `<button type="button" class="block w-full text-left px-4 py-2 rounded hover:bg-gray-100 text-sm mb-1" data-api-chain data-chain-id="${id}" data-chain-start="${c.start ?? ''}" data-chain-end="${c.end ?? ''}">Chain #${id} — ${start} to ${end}</button>`;
        }
      )
      .join('');
    if (hasMore && onLoadMoreChainsCallback) {
      html += `<button type="button" class="mt-2 px-4 py-2 text-sm text-blue-600 hover:text-blue-800 font-medium" data-load-more>Load more chains</button>`;
    }
  }

  list.innerHTML = html || '<p class="text-gray-500 text-sm">No chains found.</p>';

  list.querySelectorAll('[data-api-chain]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const chainData = {
        id: Number(btn.dataset.chainId),
        chain: Number(btn.dataset.chainId),
        start: Number(btn.dataset.chainStart) || undefined,
        end: Number(btn.dataset.chainEnd) || undefined,
      };
      if (onFetchChainFromApi) onFetchChainFromApi(apiKey, chainData);
    });
  });

  list.querySelectorAll('[data-cached-chain]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (selectChainCallback) selectChainCallback(Number(btn.dataset.chainId));
    });
  });

  const loadMoreBtn = list.querySelector('[data-load-more]');
  if (loadMoreBtn && onLoadMoreChainsCallback) {
    loadMoreBtn.addEventListener('click', () => {
      const nextUrl = typeof nextLink === 'string' ? nextLink : nextLink?.url ?? nextLink?.href ?? nextLink;
      onLoadMoreChainsCallback(apiKey, { nextLink: nextUrl, metadata }, sortedApiChains);
    });
  }
}

export function showDashboard(chain, apiKey, membersMap = {}) {
  showSection('dashboard');

  const badge = document.getElementById('status-badge');
  if (badge) {
    badge.textContent = chain.status === 'active' ? 'Active' : 'Finished';
    badge.className =
      chain.status === 'active'
        ? 'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800'
        : 'inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800';
  }

  const totals = chain.totals ?? {};
  const totalsEl = document.getElementById('totals');
  if (totalsEl) {
    totalsEl.innerHTML = `
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div class="bg-gray-50 rounded-lg p-4">
          <div class="text-xs text-gray-500 uppercase">Hits</div>
          <div class="text-xl font-semibold">${formatNum(totals.hits ?? 0)}</div>
        </div>
        <div class="bg-gray-50 rounded-lg p-4">
          <div class="text-xs text-gray-500 uppercase">Respect</div>
          <div class="text-xl font-semibold">${formatNum(totals.respect ?? 0)}</div>
        </div>
        <div class="bg-gray-50 rounded-lg p-4">
          <div class="text-xs text-gray-500 uppercase">Xanax Used</div>
          <div class="text-xl font-semibold">${formatNum(totals.xanax ?? 0)}</div>
        </div>
        <div class="bg-gray-50 rounded-lg p-4">
          <div class="text-xs text-gray-500 uppercase">Points Used</div>
          <div class="text-xl font-semibold">${formatNum(totals.points ?? 0)}</div>
        </div>
      </div>
    `;
  }

  renderTable(chain, 'hits', 'desc', membersMap ?? {});
}
