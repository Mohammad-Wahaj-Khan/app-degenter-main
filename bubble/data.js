/**
 * data.js — ZIGChain Real-Time Data Layer v2
 * 
 * Primary source: api.zigchain.com (Cosmos REST, no CORS issues)
 * Fallback:       public-zigchain-lcd.numia.xyz
 *
 * Token ranking signals (all from on-chain):
 *   holderCount  — /denom_owners_by_query (pagination.count_total)
 *   totalSupply  — from supply list
 *   distributed  — holderCount / totalSupply (concentration metric)
 *   isNew        — appears near end when sorted reverse
 */

const ZIGCHAIN_API = 'https://api.zigchain.com';
const FALLBACK_API = 'https://public-zigchain-lcd.numia.xyz';
const DEGENTER_API = 'https://dev-api.degenter.io';
const REFRESH_MS = 10 * 60 * 1000; // 10 minutes
const HOME_REFRESH = 5 * 60 * 1000; // 5 minutes for home screen

// ─── Internal cache ────────────────────────────────────────────────────────
const _cache = {};
window._cache = _cache; // expose for refresh clearing

function setCache(key, data, maxAge) { _cache[key] = { data, ts: Date.now(), maxAge }; }
function getCache(key) {
    const c = _cache[key];
    if (!c) return null;
    const age = (c.maxAge !== undefined) ? c.maxAge : REFRESH_MS;
    if ((Date.now() - c.ts) < age) return c.data;
    return null;
}

// ─── Generic fetch with fallback ──────────────────────────────────────────
async function apiFetch(path, params = {}) {
    const qs = new URLSearchParams(params).toString();
    const url = `${ZIGCHAIN_API}${path}${qs ? '?' + qs : ''}`;
    try {
        const res = await fetch(url, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch {
        try {
            const url2 = `${FALLBACK_API}${path}${qs ? '?' + qs : ''}`;
            const res2 = await fetch(url2, { headers: { Accept: 'application/json' } });
            return await res2.json();
        } catch (e2) {
            console.warn('[ZIGData] fetch failed:', path, e2.message);
            return null;
        }
    }
}

// ─── Denom helpers ────────────────────────────────────────────────────────
function parseDenom(denom) {
    const parts = denom.split('.');
    if (parts.length < 3 || parts[0] !== 'coin') return null;
    return { creator: parts[1], ticker: parts[2].toUpperCase(), raw: denom };
}

function isJunkToken(denom, ticker) {
    if (!ticker) return true;
    if (denom.includes('oroswaplptoken')) return true;
    if (denom.startsWith('zp')) return true;
    if (denom.startsWith('ibc/')) return true;
    if (denom === 'uzig') return true;
    if (ticker.startsWith('QUOTE')) return true;
    if (ticker.startsWith('PANDA')) return true;
    // Very long gibberish tickers
    if (ticker.length > 20) return true;
    return false;
}

// ─── Fetch all ZIGChain tokens (509 on-chain) ─────────────────────────────
async function getAllTokens() {
    const ck = 'all_tokens';
    const cached = getCache(ck);
    if (cached) return cached;

    let tokens = [];
    let nextKey = null;

    do {
        const params = { 'pagination.limit': 200 };
        if (nextKey) params['pagination.key'] = nextKey;
        const data = await apiFetch('/cosmos/bank/v1beta1/supply', params);
        if (!data?.supply) break;

        for (const s of data.supply) {
            const info = parseDenom(s.denom);
            if (!info) continue;
            if (isJunkToken(s.denom, info.ticker)) continue;

            tokens.push({
                denom: s.denom,
                ticker: info.ticker,
                creator: info.creator,
                totalSupply: s.amount,
                holderCount: 0,      // filled in later
                fetchedAt: null
            });
        }
        nextKey = data.pagination?.next_key || null;
    } while (nextKey);

    setCache(ck, tokens, 30 * 60 * 1000);
    return tokens;
}

// ─── Fetch token list from DegenTer API ───────────────────────────────────
async function getDegenterTokens() {
    const ck = 'degenter_tokens';
    const cached = getCache(ck);
    if (cached) return cached;

    try {
        const PAGE = 100;
        let allData = [];
        let offset = 0;
        let total = null;

        do {
            const res = await fetch(`${DEGENTER_API}/tokens?limit=${PAGE}&offset=${offset}&sort=mcap&dir=DESC`, { headers: { Accept: 'application/json' } });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const json = await res.json();
            if (!json.success || !Array.isArray(json.data)) throw new Error('Bad response shape');
            allData = allData.concat(json.data);
            total = parseInt(json.meta?.total || json.data.length, 10);
            offset += PAGE;
        } while (offset < total);

        // Normalize to the shape our app expects
        const tokens = allData.map(t => ({
            denom: t.denom,
            ticker: (t.symbol || '').trim(),
            name: t.name,
            creator: t.denom.split('.')[1] || '',
            totalSupply: Math.round((t.fdvNative || 0)),
            holderCount: t.holders || 0,
            imageUri: t.imageUri || null,
            priceUsd: t.priceUsd || 0,
            priceNative: t.priceNative || 0,
            mcapUsd: t.mcapUsd || 0,
            volUsd: t.volUsd || 0,
            volNative: t.volNative || 0,
            tx: t.tx || 0,
            createdAt: t.createdAt || null,
            fetchedAt: new Date().toISOString()
        }));

        setCache(ck, tokens, HOME_REFRESH);
        return tokens;
    } catch (e) {
        console.warn('[ZIGData] DegenTer fetch failed:', e.message);
        return [];
    }
}

// ─── Get newest tokens (from DegenTer, sorted by createdAt desc) ────────────
async function getNewestTokens(limit = 12) {
    const ck = 'newest_tokens';
    const cached = getCache(ck);
    if (cached) return cached;

    const tokens = await getDegenterTokens();
    const sorted = [...tokens]
        .filter(t => t.createdAt)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
        .slice(0, limit)
        .map(t => ({ ...t, isNew: true }));

    setCache(ck, sorted, HOME_REFRESH);
    return sorted;
}

// ─── Get holder count for a specific denom (fast — just pagination total) ──
async function getHolderCount(denom) {
    const ck = `hcount_${denom}`;
    const cached = getCache(ck);
    if (cached !== null) return cached;

    const data = await apiFetch('/cosmos/bank/v1beta1/denom_owners_by_query', {
        denom,
        'pagination.limit': 1,
        'pagination.count_total': 'true'
    });

    // total comes back as string if count_total=true
    const count = parseInt(data?.pagination?.total || data?.denom_owners?.length || 0, 10);
    setCache(ck, count, HOME_REFRESH);
    return count;
}

// ─── Get holder count for a batch of tokens in parallel ───────────────────
async function enrichWithHolderCounts(tokens) {
    const CONCURRENCY = 8;
    const enriched = [...tokens];

    for (let i = 0; i < enriched.length; i += CONCURRENCY) {
        const batch = enriched.slice(i, i + CONCURRENCY);
        await Promise.all(batch.map(async tok => {
            tok.holderCount = await getHolderCount(tok.denom);
        }));
    }

    return enriched;
}

// ─── Home Screen Data: powered by DegenTer API ────────────────────────────
async function getHomeScreenData(onProgress) {
    const ck = 'home_data';
    const cached = getCache(ck);
    if (cached) return cached;

    onProgress?.('Connecting to DegenTer…');
    const tokens = await getDegenterTokens();

    if (!tokens.length) {
        onProgress?.('DegenTer unavailable, falling back to ZIGChain…');
        // Fallback: return empty categories so the app doesn't crash
        return { hot: [], trending: [], new: [], topVolume: [], topGainers: [], mostActive: [], totalTokens: 0, fetchedAt: new Date().toISOString() };
    }

    onProgress?.(`Loaded ${tokens.length} tokens from DegenTer. Ranking…`);

    // All Tokens: sorted by holders initially
    const all = [...tokens].sort((a, b) => b.holderCount - a.holderCount);

    // Trending: highest transaction count
    const trending = [...tokens].sort((a, b) => (b.tx || 0) - (a.tx || 0)).slice(0, 20);

    // New listings: most recently created
    const newest = await getNewestTokens(12);

    // Top Volume: highest volUsd
    const topVolume = [...tokens].sort((a, b) => b.volUsd - a.volUsd).slice(0, 12);

    // Top Gainers: highest priceUsd (proxy — real gain% needs historic data)
    const topGainers = [...tokens].filter(t => t.priceUsd > 0).sort((a, b) => b.priceUsd - a.priceUsd).slice(0, 12);

    // Most Active: highest tx count
    const mostActive = [...tokens].sort((a, b) => (b.tx || 0) - (a.tx || 0)).slice(0, 12);

    const result = {
        all, trending, new: newest,
        topVolume, topGainers, mostActive,
        totalTokens: tokens.length,
        fetchedAt: new Date().toISOString()
    };

    setCache(ck, result, HOME_REFRESH);
    return result;
}

// ─── Token detail (full load) ─────────────────────────────────────────────
function parseDenomStr(denom) {
    const parts = denom.split('.');
    if (parts.length < 3 || parts[0] !== 'coin') return null;
    return { creator: parts[1], ticker: parts[2].toUpperCase(), raw: denom };
}

async function resolveToken(input) {
    input = input.trim();

    // 1. Try DegenTer tokens first (has imageUri and extra metadata)
    const degTokens = await getDegenterTokens();
    const dtMatch = degTokens.find(t =>
        t.denom === input ||
        t.creator === input ||
        t.ticker?.toLowerCase() === input.toLowerCase()
    );
    if (dtMatch) return dtMatch;

    // 2. Fallback to basic denom parsing
    if (input.startsWith('coin.')) {
        const info = parseDenomStr(input);
        return info ? { denom: input, ticker: info.ticker, creator: info.creator } : null;
    }

    // 3. Chain-specific searches
    if (input.startsWith('zig')) {
        const tokens = await getAllTokens();
        const match = tokens.find(t => t.creator === input || t.denom.includes(input));
        if (match) return match;

        const balData = await apiFetch(`/cosmos/bank/v1beta1/balances/${input}`);
        if (balData?.balances) {
            const first = balData.balances.find(b => b.denom.startsWith('coin.'));
            if (first) { const i = parseDenomStr(first.denom); return { denom: first.denom, ticker: i?.ticker, creator: i?.creator }; }
        }
    }

    // Search DegenTer by ticker/symbol first
    const dtByTicker = degTokens.find(t => t.ticker?.toLowerCase() === input.toLowerCase());
    if (dtByTicker) return dtByTicker;

    const tokens = await getAllTokens();
    return tokens.find(t => t.ticker.toLowerCase() === input.toLowerCase()) || null;
}

async function getTokenHolders(denom) {
    const ck = `holders_${denom}`;
    const cached = getCache(ck);
    if (cached) return cached;

    const holders = [];
    let nextKey = null;
    do {
        const params = { denom, 'pagination.limit': 200 };
        if (nextKey) params['pagination.key'] = nextKey;
        const data = await apiFetch('/cosmos/bank/v1beta1/denom_owners_by_query', params);
        if (!data?.denom_owners) break;
        for (const o of data.denom_owners) {
            holders.push({ address: o.address, rawBalance: BigInt(o.balance.amount) });
        }
        nextKey = data.pagination?.next_key || null;
    } while (nextKey);

    if (!holders.length) return null;
    holders.sort((a, b) => (b.rawBalance > a.rawBalance ? 1 : -1));
    const total = holders.reduce((s, h) => s + h.rawBalance, 0n);
    const annotated = holders.map((h, i) => ({
        rank: i + 1, address: h.address, rawBalance: h.rawBalance,
        balance: Number(h.rawBalance) / 1e6,
        pct: total > 0n ? Number((h.rawBalance * 10000n) / total) / 100 : 0
    }));
    setCache(ck, annotated, REFRESH_MS);
    return annotated;
}

async function getRecentTxs(denom, limit = 20) {
    const ck = `txs_${denom}`;
    const cached = getCache(ck);
    if (cached) return cached;
    try {
        const data = await apiFetch('/cosmos/tx/v1beta1/txs', {
            events: `coin_received.amount='${denom}'`,
            'pagination.limit': limit,
            'order_by': 'ORDER_BY_DESC'
        });
        if (!data) return [];
        const txs = (data?.txs || []).map(tx => ({
            hash: tx.txhash, height: tx.height, timestamp: tx.timestamp,
            messages: tx.tx?.body?.messages?.map(m => ({
                type: m['@type']?.split('.').pop() || 'Unknown',
                from: m.from_address || m.sender || '',
                to: m.to_address || m.receiver || ''
            })) || []
        }));
        if (txs.length > 0) setCache(ck, txs, 5 * 60 * 1000);
        return txs;
    } catch (e) {
        console.warn('[ZIGData] getRecentTxs failed:', e.message);
        return [];
    }
}

function computeDistribution(holders) {
    const d = { whales: 0, medium: 0, small: 0, dust: 0 };
    for (const h of holders) {
        if (h.pct >= 5) d.whales++;
        else if (h.pct >= 1) d.medium++;
        else if (h.pct >= 0.1) d.small++;
        else d.dust++;
    }
    return d;
}

async function loadToken(input) {
    const token = await resolveToken(input);
    if (!token) return { error: 'Token not found. Paste the full denom (coin.zig1…) or creator address.' };

    let holders, txs, supplyData;
    try {
        [holders, txs, supplyData] = await Promise.all([
            getTokenHolders(token.denom).catch(e => { console.error('holders err', e); return null; }),
            getRecentTxs(token.denom).catch(() => []),
            apiFetch('/cosmos/bank/v1beta1/supply', { denom: token.denom }).catch(() => null)
        ]);
    } catch (e) {
        console.error("Token load Promise.all failed:", e);
        return { error: 'Network error analyzing token. Please try again.' };
    }

    if (!holders) return { error: 'No holder data found for this token.' };

    const totalSupplyRaw = BigInt(supplyData?.supply?.[0]?.amount || token.totalSupply || 0);
    const distribution = computeDistribution(holders);
    const labelled = holders.map(h => ({
        ...h,
        type: h.pct >= 5 ? 'whale' : h.pct >= 1 ? 'shark' : 'holder',
        isLP: h.address === token.creator
    }));

    return {
        token: {
            denom: token.denom, ticker: token.ticker?.toUpperCase() || '?',
            creator: token.creator,
            totalSupply: Number(totalSupplyRaw) / 1e6,
            totalSupplyRaw, holderCount: holders.length,
            imageUri: token.imageUri || null
        },
        holders: labelled, transactions: txs,
        distribution, fetchedAt: new Date().toISOString()
    };
}

// ─── Auto-refresh ─────────────────────────────────────────────────────────
let _refreshCallbacks = [];
let _refreshInterval = null;

function onDataRefresh(cb) { _refreshCallbacks.push(cb); }
function startAutoRefresh(denom) {
    if (_refreshInterval) clearInterval(_refreshInterval);
    _refreshInterval = setInterval(() => {
        delete _cache[`holders_${denom}`];
        delete _cache[`txs_${denom}`];
        _refreshCallbacks.forEach(cb => cb());
    }, REFRESH_MS);
}
function stopAutoRefresh() {
    if (_refreshInterval) { clearInterval(_refreshInterval); _refreshInterval = null; }
    _refreshCallbacks = [];
}

// ─── Export ───────────────────────────────────────────────────────────────
window.ZIGData = {
    loadToken, resolveToken, getAllTokens, getHomeScreenData,
    getTokenHolders, getRecentTxs, getHolderCount,
    computeDistribution, startAutoRefresh, stopAutoRefresh, onDataRefresh,
    parseDenom: parseDenomStr, getNewestTokens, getDegenterTokens
};
