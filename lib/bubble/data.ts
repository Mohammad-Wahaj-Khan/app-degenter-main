const ZIGCHAIN_API = 'https://api.zigchain.com';
const FALLBACK_API = 'https://public-zigchain-lcd.numia.xyz';
const DEGENTER_API = 'https://dev-api.degenter.io';
const REFRESH_MS = 10 * 60 * 1000;
const HOME_REFRESH = 5 * 60 * 1000;

type CacheEntry<T> = { data: T; ts: number; maxAge?: number };
const cache = new Map<string, CacheEntry<any>>();

function setCache<T>(key: string, data: T, maxAge?: number) {
  cache.set(key, { data, ts: Date.now(), maxAge });
}

function getCache<T>(key: string): T | null {
  const entry = cache.get(key);
  if (!entry) return null;
  const maxAge = entry.maxAge ?? REFRESH_MS;
  if (Date.now() - entry.ts < maxAge) return entry.data as T;
  cache.delete(key);
  return null;
}

async function apiFetch<T>(path: string, params: Record<string, any> = {}): Promise<T | null> {
  const qs = new URLSearchParams(
    Object.entries(params)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  ).toString();

  const buildUrl = (base: string) => {
    if (!qs) return `${base}${path}`;
    return `${base}${path}?${qs}`;
  };

  try {
    const res = await fetch(buildUrl(ZIGCHAIN_API), { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch (firstError) {
    try {
      const res = await fetch(buildUrl(FALLBACK_API), { headers: { Accept: 'application/json' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as T;
    } catch (secondError) {
      console.warn('[ZIGData] fetch failed', path, secondError instanceof Error ? secondError.message : secondError);
      return null;
    }
  }
}

function parseDenom(denom: string) {
  const parts = denom.split('.');
  if (parts.length < 3 || parts[0] !== 'coin') return null;
  return { creator: parts[1], ticker: parts[2].toUpperCase(), raw: denom };
}

function isJunkToken(denom: string, ticker?: string) {
  if (!ticker) return true;
  if (denom.includes('oroswaplptoken')) return true;
  if (denom.startsWith('zp')) return true;
  if (denom.startsWith('ibc/')) return true;
  if (denom === 'uzig') return true;
  if (ticker.startsWith('QUOTE') || ticker.startsWith('PANDA')) return true;
  if (ticker.length > 20) return true;
  return false;
}

export interface BubbleToken {
  denom: string;
  ticker: string;
  name?: string;
  creator?: string;
  totalSupply?: number;
  holderCount?: number;
  imageUri?: string | null;
  priceUsd?: number;
  priceNative?: number;
  mcapUsd?: number;
  mcapNative?: number;
  volUsd?: number;
  volNative?: number;
  tx?: number;
  createdAt?: string;
  isNew?: boolean;
  fetchedAt?: string;
}

export interface HolderEntry {
  rank: number;
  address: string;
  balance: number;
  pct: number;
  type: 'whale' | 'shark' | 'holder' | 'dust';
  isLP: boolean;
}

export interface TokenDetail {
  token: {
    denom: string;
    ticker: string;
    creator: string;
    totalSupply: number;
    totalSupplyRaw: bigint;
    holderCount: number;
    imageUri?: string | null;
  };
  holders: HolderEntry[];
  distribution: { whales: number; medium: number; small: number; dust: number };
  transactions: any[];
  fetchedAt: string;
}

async function getDegenterTokens(): Promise<BubbleToken[]> {
  const cacheKey = 'degenter_tokens';
  const cached = getCache<BubbleToken[]>(cacheKey);
  if (cached) return cached;

  try {
    const PAGE = 100;
    const tokens: BubbleToken[] = [];
    let offset = 0;
    let total = 0;

    do {
      const response = await fetch(
        `${DEGENTER_API}/tokens?limit=${PAGE}&offset=${offset}&sort=mcap&dir=DESC`,
        { headers: { Accept: 'application/json' }, cache: 'no-store' }
      );

      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = await response.json();
      if (!json.success || !Array.isArray(json.data)) throw new Error('Bad response shape');

      tokens.push(...json.data.map((token: any) => ({
        denom: token.denom,
        ticker: (token.symbol || '').trim(),
        name: token.name,
        creator: token.denom?.split('.')[1] || '',
        totalSupply: Math.round(token.fdvNative || 0),
        holderCount: token.holders || 0,
        imageUri: token.imageUri || null,
        priceUsd: token.priceUsd || 0,
        priceNative: token.priceNative || 0,
        mcapUsd: token.mcapUsd || 0,
        volUsd: token.volUsd || 0,
        tx: token.tx || 0,
        createdAt: token.createdAt || null,
        fetchedAt: new Date().toISOString(),
      } as BubbleToken)));

      total = parseInt(json.meta?.total || json.data.length, 10) || tokens.length;
      offset += PAGE;
    } while (offset < total);

    const filtered = tokens.filter((token) => token.denom && !isJunkToken(token.denom, token.ticker));
    setCache(cacheKey, filtered, HOME_REFRESH);
    return filtered;
  } catch (error) {
    console.warn('[ZIGData] DegenTer fetch failed', error);
    return [];
  }
}

async function getNewestTokens(limit = 12): Promise<BubbleToken[]> {
  const cacheKey = 'newest_tokens';
  const cached = getCache<BubbleToken[]>(cacheKey);
  if (cached) return cached;

  const tokens = await getDegenterTokens();
  const sorted = [...tokens]
    .filter((token) => token.createdAt)
    .sort((a, b) => (new Date(b.createdAt || '').getTime() - new Date(a.createdAt || '').getTime()))
    .slice(0, limit)
    .map((token) => ({ ...token, isNew: true }));

  setCache(cacheKey, sorted, HOME_REFRESH);
  return sorted;
}

async function getHolderCount(denom: string): Promise<number> {
  const cacheKey = `hcount_${denom}`;
  const cached = getCache<number>(cacheKey);
  if (cached !== null) return cached;

  const data = await apiFetch<{ pagination?: { total?: string }; denom_owners?: any[] }>(
    '/cosmos/bank/v1beta1/denom_owners_by_query',
    { denom, 'pagination.limit': 1, 'pagination.count_total': 'true' }
  );
  const total = parseInt(data?.pagination?.total || '0', 10) || (data?.denom_owners?.length || 0);
  setCache(cacheKey, total, HOME_REFRESH);
  return total;
}

export async function getHomeScreenData(onProgress?: (msg: string) => void) {
  const cacheKey = 'home_data';
  const cached = getCache<Record<string, BubbleToken[]>>(cacheKey);
  if (cached) return cached;

  onProgress?.('Connecting to DegenTer…');
  const tokens = await getDegenterTokens();
  if (!tokens.length) {
    onProgress?.('DegenTer unavailable, falling back to ZIGChain…');
    const empty = { hot: [], trending: [], new: [], topVolume: [], topGainers: [], mostActive: [], totalTokens: 0, fetchedAt: new Date().toISOString() } as any;
    setCache(cacheKey, empty, HOME_REFRESH);
    return empty;
  }

  onProgress?.(`Loaded ${tokens.length} tokens from DegenTer. Ranking…`);
  const all = [...tokens].sort((a, b) => (b.holderCount || 0) - (a.holderCount || 0));
  const trending = [...tokens].sort((a, b) => (b.tx || 0) - (a.tx || 0)).slice(0, 20);
  const newest = await getNewestTokens(12);
  const topVolume = [...tokens].sort((a, b) => (b.volUsd || 0) - (a.volUsd || 0)).slice(0, 12);
  const topGainers = [...tokens]
    .filter((token) => (token.priceUsd ?? 0) > 0)
    .sort((a, b) => (b.priceUsd || 0) - (a.priceUsd || 0))
    .slice(0, 12);
  const mostActive = [...tokens].sort((a, b) => (b.tx || 0) - (a.tx || 0)).slice(0, 12);

  const result = {
    all,
    trending,
    new: newest,
    topVolume,
    topGainers,
    mostActive,
    totalTokens: tokens.length,
    fetchedAt: new Date().toISOString(),
  } as const;

  setCache(cacheKey, result, HOME_REFRESH);
  return result;
}

async function getTokenHolders(denom: string): Promise<HolderEntry[] | null> {
  const cacheKey = `holders_${denom}`;
  const cached = getCache<HolderEntry[]>(cacheKey);
  if (cached) return cached;

  const holders: { address: string; balance: bigint }[] = [];
  let nextKey: string | null = null;

  const creatorAddress = denom.split('.')?.[1] || '';
  do {
    const params: Record<string, any> = { denom, 'pagination.limit': 200 };
    if (nextKey) params['pagination.key'] = nextKey;

    const data = await apiFetch<{ denom_owners?: { address: string; balance: { amount: string } }[]; pagination?: { next_key?: string } }>(
      '/cosmos/bank/v1beta1/denom_owners_by_query',
      params
    );

    if (!data?.denom_owners) break;
    data.denom_owners.forEach((owner) => {
      holders.push({ address: owner.address, balance: BigInt(owner.balance.amount) });
    });
    nextKey = data.pagination?.next_key || null;
  } while (nextKey);

  if (!holders.length) return null;

  holders.sort((a, b) => (b.balance > a.balance ? 1 : -1));
  const total = holders.reduce((sum, entry) => sum + entry.balance, 0n);

    const annotated = holders.map((entry, index) => {
    const pct = total > 0n ? Number((entry.balance * 10000n) / total) / 100 : 0;
    let type: HolderEntry['type'] = 'holder';
    if (pct >= 5) type = 'whale';
    else if (pct >= 1) type = 'shark';
    else if (pct < 0.1) type = 'dust';

      return {
        rank: index + 1,
        address: entry.address,
        balance: Number(entry.balance) / 1e6,
        pct,
        type,
        isLP: entry.address === creatorAddress,
      } satisfies HolderEntry;
  });

  setCache(cacheKey, annotated, REFRESH_MS);
  return annotated;
}

function computeDistribution(holders: HolderEntry[]) {
  return holders.reduce(
    (acc, holder) => {
      if (holder.pct >= 5) acc.whales++;
      else if (holder.pct >= 1) acc.medium++;
      else if (holder.pct >= 0.1) acc.small++;
      else acc.dust++;
      return acc;
    },
    { whales: 0, medium: 0, small: 0, dust: 0 }
  );
}

async function resolveToken(input: string): Promise<BubbleToken | null> {
  const sanitized = input.trim();
  if (!sanitized) return null;

  const tokens = await getDegenterTokens();
  const match = tokens.find((token) => token.denom === sanitized || token.ticker?.toLowerCase() === sanitized.toLowerCase());
  if (match) return match;

  if (sanitized.startsWith('coin.')) {
    const parsed = parseDenom(sanitized);
    if (parsed) {
      return { denom: sanitized, ticker: parsed.ticker, creator: parsed.creator } as BubbleToken;
    }
  }

  if (sanitized.startsWith('zig')) {
    const found = tokens.find((token) => token.creator === sanitized || token.denom.includes(sanitized));
    if (found) return found;

    const balances = await apiFetch<{ balances?: { denom: string }[] }>(`/cosmos/bank/v1beta1/balances/${sanitized}`);
    const first = balances?.balances?.find((b) => b.denom.startsWith('coin.'));
    if (first) {
      const info = parseDenom(first.denom);
      if (info) return { denom: first.denom, ticker: info.ticker, creator: info.creator } as BubbleToken;
    }
  }

  return null;
}

export async function loadToken(input: string): Promise<TokenDetail | { error: string }> {
  const resolved = await resolveToken(input);
  if (!resolved) {
    return { error: 'Token not found. Paste the full denom (coin.zig1…) or creator address.' } as any;
  }

  const [holders, txData] = await Promise.all([
    getTokenHolders(resolved.denom),
    apiFetch<{ txs?: any[] }>('/cosmos/tx/v1beta1/txs', {
      events: `coin_received.amount='${resolved.denom}'`,
      'pagination.limit': 20,
      order_by: 'ORDER_BY_DESC',
    }),
  ]);

  if (!holders) {
    return { error: 'No holder data found for this token.' } as any;
  }

  const totalSupplyRaw = BigInt(resolved.totalSupply || 0);
  const detail: TokenDetail = {
    token: {
      denom: resolved.denom,
      ticker: resolved.ticker?.toUpperCase() || '?',
      creator: resolved.creator || '',
      totalSupply: Number(totalSupplyRaw) / 1e6,
      totalSupplyRaw,
      holderCount: holders.length,
      imageUri: resolved.imageUri || null,
    },
    holders,
    distribution: computeDistribution(holders),
    transactions: txData?.txs || [],
    fetchedAt: new Date().toISOString(),
  };

  return detail;
}
