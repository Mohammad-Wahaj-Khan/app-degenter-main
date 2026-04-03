// app.js — ZIGChain BubbleMap Frontend v3
// Real data from ZIGData (data.js)

// ─── Token Logo System ────────────────────────────────────────────────────────
// Deterministic palette — every ticker gets the same gradient every time
const LOGO_PALETTES = [
    ['#ff00c8', '#7000ff'], ['#f6ad55', '#ed8936'], ['#48bb78', '#38a169'],
    ['#4299e1', '#3182ce'], ['#fc8181', '#e53e3e'], ['#b794f4', '#805ad5'],
    ['#76e4f7', '#0bc5ea'], ['#f6e05e', '#ecc94b'], ['#ff3e8d', '#c53030'],
    ['#a78bfa', '#6d28d9'], ['#34d399', '#059669'], ['#fbbf24', '#d97706'],
];
function logoColors(ticker) {
    let h = 0;
    for (let i = 0; i < ticker.length; i++) h = ticker.charCodeAt(i) + ((h << 5) - h);
    return LOGO_PALETTES[Math.abs(h) % LOGO_PALETTES.length];
}
function tickerColor(ticker) { return logoColors(ticker)[0]; }

// Build an SVG data URI that looks like a real token logo (gradient + letter)
function makeTokenLogo(ticker, size = 40) {
    const [c1, c2] = logoColors(ticker);
    const letter = (ticker || '?').charAt(0).toUpperCase();
    const fontSize = Math.round(size * 0.42);
    const svgId = `g${ticker.replace(/[^a-z0-9]/gi, '')}`;
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="${svgId}" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${c1}"/>
      <stop offset="100%" stop-color="${c2}"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${Math.round(size * 0.28)}" fill="url(#${svgId})"/>
  <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle"
    font-family="Outfit,Inter,sans-serif" font-weight="800" font-size="${fontSize}" fill="rgba(0,0,0,0.75)">${letter}</text>
</svg>`;
    return 'data:image/svg+xml;base64,' + btoa(svg);
}

// Try multiple sources for token logos before falling back to SVG
function getLogoUrls(ticker, denom) {
    const urls = [];
    const lowerTicker = ticker.toLowerCase();

    // 1. Cosmos Chain Registry (covers STZIG, ZIG, and established tokens)
    urls.push(`https://raw.githubusercontent.com/cosmos/chain-registry/master/zigchain/images/${lowerTicker}.png`);
    urls.push(`https://raw.githubusercontent.com/cosmos/chain-registry/master/zigchain/images/${lowerTicker}.svg`);

    // 2. DegenTer S3 Profile Bucket
    // DegenTer hashes the denom or uses an internal ID for its custom uploaded pics.
    // If we have a contract address format, try to use it directly.
    if (denom && denom.includes('.')) {
        const creatorAddr = denom.split('.')[1];
        if (creatorAddr) urls.push(`https://degenter-token-profile.s3.ap-southeast-2.amazonaws.com/tokens/${creatorAddr}.jpg`);
        if (creatorAddr) urls.push(`https://degenter-token-profile.s3.ap-southeast-2.amazonaws.com/tokens/${creatorAddr}.png`);
    }

    // 3. ZIGScan fallback
    if (denom) {
        urls.push(`https://zigscan.org/images/tokens/${encodeURIComponent(denom)}.png`);
    }

    return urls;
}

// Create <img> that tries multiple CDNs, falls back to generated SVG
function tokenLogoEl(ticker, denom, size = 38) {
    const img = document.createElement('img');
    img.width = size;
    img.height = size;
    img.alt = ticker;
    img.style.cssText = `width:${size}px;height:${size}px;border-radius:${Math.round(size * 0.28)}px;object-fit:cover;display:block`;

    const urlsToTry = getLogoUrls(ticker, denom);
    let currentTry = 0;

    const loadNext = () => {
        if (currentTry < urlsToTry.length) {
            img.src = urlsToTry[currentTry];
            currentTry++;
        } else {
            // All remote URLs failed, use generated local SVG
            img.onerror = null;
            img.src = makeTokenLogo(ticker, size);
        }
    };

    img.onerror = loadNext;
    loadNext(); // Kick off the first load

    return img;
}

// Pic-2 palette: teal whales, lavender sharks, blue holders, steel dust
function holderColor(h) {
    if (h.pct >= 5) return '#00c9b1';   // teal — Whale
    if (h.pct >= 1) return '#9b7fe8';   // lavender — Shark
    if (h.isLP) return '#34d399';   // green — LP Pool
    if (h.pct >= 0.1) return '#4a8fd4'; // blue — Holder
    return '#3a5a8a';                   // dark steel — Dust
}
function holderCategory(h) {
    if (h.pct >= 5) return 'Whale';
    if (h.pct >= 1) return 'Shark';
    if (h.isLP) return 'LP Pool';
    if (h.pct >= 0.1) return 'Holder';
    return 'Dust';
}
function fmtNum(n) {
    if (n >= 1e9) return (n / 1e9).toFixed(2) + 'B';
    if (n >= 1e6) return (n / 1e6).toFixed(2) + 'M';
    if (n >= 1e3) return (n / 1e3).toFixed(2) + 'K';
    return Number(n).toFixed(2);
}

function fmtPrice(p) {
    if (p === 0) return '—';
    if (p >= 1) return '$' + p.toFixed(2);
    if (p >= 0.01) return '$' + p.toFixed(4);

    // Convert to string to avoid scientific notation
    const s = Number(p).toLocaleString('fullwide', { useGrouping: false, maximumSignificantDigits: 4 });
    return '$' + s;
}
function shortAddr(addr) {
    if (!addr) return '';
    return addr.length > 22 ? addr.slice(0, 10) + '…' + addr.slice(-6) : addr;
}

// ─── Views ────────────────────────────────────────────────────────────────────
const heroView = document.getElementById('hero-view');
const tokenView = document.getElementById('token-view');
let simulation = null;
let currentData = null;
let _nodeSelection = null;
let _linkSelection = null;
let updateMagicHighlights = null; // forward ref

function showHero() {
    tokenView.classList.add('hidden');
    heroView.classList.remove('hidden');
    ZIGData.stopAutoRefresh();
    if (simulation) { simulation.stop(); simulation = null; }
}

// ─── Loading / Error overlays ─────────────────────────────────────────────────
function showLoader(msg = 'Fetching on-chain data…') {
    let el = document.getElementById('data-loader');
    if (!el) {
        el = document.createElement('div');
        el.id = 'data-loader';
        el.style.cssText = `position:fixed;top:0;left:0;width:100%;height:100%;
            background:rgba(11,4,22,.92);display:flex;flex-direction:column;
            align-items:center;justify-content:center;z-index:9999;backdrop-filter:blur(8px)`;
        el.innerHTML = `
            <div id="loader-close" style="position:absolute;top:2rem;right:2.5rem;color:#7a7a9a;
                font-size:1.8rem;cursor:pointer;font-weight:100;transition:color .2s">&times;</div>
            <div style="width:60px;height:60px;border:3px solid rgba(0,201,177,.2);
                border-top-color:#00c9b1;border-radius:50%;animation:spin .8s linear infinite;margin-bottom:1.5rem"></div>
            <div id="loader-msg" style="color:#fff;font-size:1.1rem;font-weight:700">${msg}</div>
            <div style="color:#7a7a9a;font-size:.85rem;margin-top:.5rem">api.zigchain.com · connection</div>`;

        el.querySelector('#loader-close').onclick = () => {
            hideLoader();
            if (_pendingLoad) { clearTimeout(_pendingLoad); _pendingLoad = null; }
        };

        const s = document.createElement('style');
        s.textContent = '@keyframes spin{to{transform:rotate(360deg)}} #loader-close:hover{color:#fff}';
        document.head.appendChild(s);
        document.body.appendChild(el);
    }
    document.getElementById('loader-msg').textContent = msg;
    el.style.display = 'flex';
}
function hideLoader() {
    const el = document.getElementById('data-loader');
    if (el) el.style.display = 'none';
    if (_pendingLoad) { clearTimeout(_pendingLoad); _pendingLoad = null; }
}
function showError(msg) {
    hideLoader();
    let el = document.getElementById('data-error');
    if (!el) {
        el = document.createElement('div');
        el.id = 'data-error';
        el.style.cssText = `position:fixed;bottom:2rem;right:2rem;background:#1a0b2e;
            border:1px solid #ff5555;border-radius:16px;padding:1rem 1.6rem;
            color:#ff5555;font-weight:700;z-index:9999;max-width:380px`;
        document.body.appendChild(el);
    }
    el.textContent = '⚠ ' + msg;
    el.style.display = 'block';
    setTimeout(() => el.style.display = 'none', 6000);
}

// ─── HOME SCREEN ──────────────────────────────────────────────────────────────
let _homeData = null;
let _activeCat = 'all';
let _homeTimer = null;
let _currentSort = 'default';

function renderHomeGrid(tokens) {
    const grid = document.getElementById('home-grid');
    grid.innerHTML = '';

    // Apply sorting
    let displayTokens = [...(tokens || [])];
    const sortVal = _currentSort || 'default';

    // Sort logic
    if (sortVal === 'mcapDesc') {
        displayTokens.sort((a, b) => (b.mcapUsd || 0) - (a.mcapUsd || 0));
    } else if (sortVal === 'volDesc') {
        displayTokens.sort((a, b) => (b.volUsd || 0) - (a.volUsd || 0));
    } else if (sortVal === 'priceDesc') {
        displayTokens.sort((a, b) => (b.priceUsd || 0) - (a.priceUsd || 0));
    } else if (sortVal === 'holdersDesc') {
        displayTokens.sort((a, b) => (b.holderCount || 0) - (a.holderCount || 0));
    }

    if (!displayTokens || displayTokens.length === 0) {
        grid.innerHTML = '<div class="home-empty">No tokens found for this category.</div>';
        document.getElementById('home-loading').classList.add('hidden');
        grid.classList.remove('hidden');
        return;
    }

    // Keep the natural rank index from the original `tokens` array
    displayTokens.forEach((tok) => {
        const i = tokens.indexOf(tok);
        const color = tickerColor(tok.ticker);
        const holders = tok.holderCount || 0;
        const rank = i + 1;
        const priceStr = fmtPrice(tok.priceUsd);
        const volStr = tok.volUsd > 0 ? '$' + fmtNum(tok.volUsd) : '—';
        const mcapStr = tok.mcapUsd > 0 ? '$' + fmtNum(tok.mcapUsd) : '—';

        const card = document.createElement('div');
        card.className = 'home-card';
        card.dataset.denom = tok.denom;

        // Header — use imageUri from DegenTer if available, else generated logo
        const hdr = document.createElement('div'); hdr.className = 'hc-header';
        const rnk = document.createElement('div'); rnk.className = 'hc-rank'; rnk.textContent = '#' + rank;

        let logo;
        if (tok.imageUri) {
            logo = document.createElement('img');
            logo.src = tok.imageUri;
            logo.width = 38; logo.height = 38;
            logo.alt = tok.ticker;
            logo.style.cssText = `width:38px;height:38px;border-radius:10px;object-fit:cover;display:block`;
            logo.onerror = () => { logo.src = makeTokenLogo(tok.ticker, 38); logo.onerror = null; };
        } else {
            logo = tokenLogoEl(tok.ticker, tok.denom, 38);
        }
        logo.className = 'hc-img';

        const meta = document.createElement('div'); meta.className = 'hc-meta';
        const nameEl = document.createElement('div'); nameEl.className = 'hc-name'; nameEl.textContent = tok.name || tok.ticker;
        if (tok.isNew) {
            const nb = document.createElement('span'); nb.className = 'new-badge'; nb.textContent = 'NEW';
            nameEl.appendChild(nb);
        }
        const tickerEl = document.createElement('div'); tickerEl.className = 'hc-addr'; tickerEl.textContent = tok.ticker;
        meta.append(nameEl, tickerEl);
        hdr.append(rnk, logo, meta);

        // Stats — real market data from DegenTer
        const stats = document.createElement('div'); stats.className = 'hc-stats';
        stats.innerHTML = `
            <div class="hc-stat"><span class="hc-sl">Price</span><span class="hc-sv" style="color:${color}">${priceStr}</span></div>
            <div class="hc-stat"><span class="hc-sl">Vol 24h</span><span class="hc-sv">${volStr}</span></div>
            <div class="hc-stat"><span class="hc-sl">MCap</span><span class="hc-sv">${mcapStr}</span></div>
            <div class="hc-stat"><span class="hc-sl">Holders</span><span class="hc-sv">${holders}</span></div>`;

        // Footer
        const footer = document.createElement('div'); footer.className = 'hc-footer';
        footer.innerHTML = '<span class="hc-chain">DegenTer · ZIGChain</span><span class="hc-cta">View Map →</span>';

        card.append(hdr, stats, footer);
        card.addEventListener('click', () => loadAndShowToken(tok.denom));
        grid.appendChild(card);
    });

    document.getElementById('home-loading').classList.add('hidden');
    grid.classList.remove('hidden');
}

async function loadHomeScreen(forceRefresh = false) {
    if (forceRefresh) {
        delete window._cache?.home_data;
        delete window._cache?.all_tokens;
        delete window._cache?.newest_tokens;
    }

    document.getElementById('home-loading').classList.remove('hidden');
    document.getElementById('home-grid').classList.add('hidden');
    document.getElementById('home-loading-msg').textContent = 'Connecting to ZIGChain…';

    try {
        _homeData = await ZIGData.getHomeScreenData(msg => {
            document.getElementById('home-loading-msg').textContent = msg;
        });

        const badge = document.getElementById('tokenCountBadge');
        if (badge) badge.textContent = `${_homeData.totalTokens} tokens live`;

        const ts = document.getElementById('homeUpdatedAt');
        if (ts) ts.textContent = 'Updated ' + new Date(_homeData.fetchedAt).toLocaleTimeString();

        renderHomeGrid(_homeData[_activeCat]);
    } catch (e) {
        document.getElementById('home-loading-msg').textContent = 'Failed to load data. Retrying…';
        console.error(e);
    }
}

// Tab switching
document.querySelectorAll('.htab').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.htab').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        _activeCat = btn.dataset.cat;

        // Reset sort to default when changing categories
        _currentSort = 'default';
        const labelEl = document.getElementById('sortCurrentLabel');
        if (labelEl) labelEl.textContent = 'Default Rank';
        document.querySelectorAll('.sort-option').forEach(opt => {
            opt.classList.toggle('active', opt.dataset.value === 'default');
        });

        if (_homeData) renderHomeGrid(_homeData[_activeCat]);
    });
});

// ─── Custom Sort Dropdown Logic ──────────────────────────────────────────────

const sortDropdown = document.getElementById('homeSortDropdown');
const sortTrigger = document.getElementById('sortTrigger');
const sortOptions = document.getElementById('sortOptions');
const sortLabel = document.getElementById('sortCurrentLabel');

sortTrigger?.addEventListener('click', (e) => {
    e.stopPropagation();
    sortDropdown.classList.toggle('open');
});

document.querySelectorAll('.sort-option').forEach(option => {
    option.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = option.dataset.value;
        const text = option.textContent;

        _currentSort = val;
        if (sortLabel) sortLabel.textContent = text;

        // Update active state in UI
        document.querySelectorAll('.sort-option').forEach(opt => opt.classList.remove('active'));
        option.classList.add('active');

        // Close dropdown
        sortDropdown.classList.remove('open');

        // Trigger re-render
        if (_homeData) renderHomeGrid(_homeData[_activeCat]);
    });
});

// Close when clicking outside
document.addEventListener('click', () => {
    sortDropdown?.classList.remove('open');
});

// Manual refresh
document.getElementById('homeRefreshBtn')?.addEventListener('click', () => loadHomeScreen(true));

// Auto home refresh every 5 minutes
function startHomeAutoRefresh() {
    if (_homeTimer) clearInterval(_homeTimer);
    _homeTimer = setInterval(() => loadHomeScreen(true), 5 * 60 * 1000);
}

// ─── Help bypass Logo issues ──────────────────────────────────────────────
function patchTokenLogo(token) {
    if (!token || token.imageUri) return;
    if (!_homeData) return;
    for (const cat in _homeData) {
        if (Array.isArray(_homeData[cat])) {
            const found = _homeData[cat].find(t => t.denom === token.denom);
            if (found && found.imageUri) {
                token.imageUri = found.imageUri;
                return;
            }
        }
    }
}

// ─── TOKEN DETAIL ─────────────────────────────────────────────────────────────
let _pendingLoad = null;

async function loadAndShowToken(input) {
    showLoader('Resolving token…');

    // Set a timeout failsafe (25 seconds)
    if (_pendingLoad) clearTimeout(_pendingLoad);
    _pendingLoad = setTimeout(() => {
        showError('Request timed out. The network might be congested or the API is offline.');
        _pendingLoad = null;
    }, 25000);

    try {
        const result = await ZIGData.loadToken(input);
        if (_pendingLoad === null) return; // already timed out or cancelled
        clearTimeout(_pendingLoad);
        _pendingLoad = null;

        if (result.error) { showError(result.error); return; }

        currentData = result;

        // Patch imageUri from home data if missing (failsafe)
        patchTokenLogo(result.token);

        heroView.classList.add('hidden');
        tokenView.classList.remove('hidden');

        renderTokenHeader(result.token);
        renderAddressList(result.holders, result.token);
        renderInfoPanel(result);
        lucide.createIcons();

        setTimeout(() => {
            try {
                initNetworkMap(result.holders, result.token);
            } catch (e) {
                console.error("Map Init Error:", e);
                showError("Error rendering visualization");
            } finally {
                hideLoader();
            }
        }, 60);

        ZIGData.startAutoRefresh(result.token.denom);
        ZIGData.onDataRefresh(async () => {
            showLoader('Auto-refreshing…');
            try {
                const ref = await ZIGData.loadToken(result.token.denom);
                if (!ref.error) {
                    currentData = ref;
                    patchTokenLogo(ref.token);
                    renderTokenHeader(ref.token);
                    renderAddressList(ref.holders, ref.token);
                    renderInfoPanel(ref);
                    // Don't re-init map to preserve user's node dragging layout, just update if needed
                }
            } finally {
                hideLoader();
            }
        });
    } catch (err) {
        console.error("loadAndShowToken caught error:", err);
        showError("An unexpected error occurred building the map.");
    } finally {
        // Ensure loader is hidden even if an error occurs before setTimeout or onDataRefresh
        // Note: hideLoader is also called in setTimeout's finally and onDataRefresh's finally
        // This outer finally ensures it's hidden if an error prevents those from being reached.
        // However, the user's instruction only puts hideLoader in the inner blocks.
        // I will follow the user's instruction exactly, which means no outer hideLoader here.
        // The user's provided code snippet for the outer catch block *does* include hideLoader().
        hideLoader();
    }
}

function renderTokenHeader(token) {
    const ic = document.getElementById('thIcon');
    ic.innerHTML = '';
    ic.style.background = 'transparent';

    if (token.imageUri) {
        const logo = document.createElement('img');
        logo.src = token.imageUri;
        logo.style.cssText = `width:100%;height:100%;border-radius:12px;object-fit:cover;display:block`;
        logo.onerror = () => { logo.src = makeTokenLogo(token.ticker, 44); logo.onerror = null; };
        ic.appendChild(logo);
    } else {
        ic.appendChild(tokenLogoEl(token.ticker, token.denom, 44));
    }

    document.getElementById('thName').textContent = token.ticker;
    document.getElementById('thTicker').textContent = shortAddr(token.denom);
    document.getElementById('thDate').textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    document.getElementById('thHolders').textContent = `${token.holderCount} Holders`;
}

function renderInfoPanel(result) {
    const panel = document.getElementById('info-panel');
    if (!panel) return;
    const { token, holders, distribution, fetchedAt } = result;
    const top5 = holders.slice(0, 5).reduce((s, h) => s + h.pct, 0).toFixed(2);
    panel.innerHTML = `
        <div class="ip-section">
            <div class="ip-title">Token Info</div>
            <div class="ip-row"><span>Ticker</span><b>${token.ticker}</b></div>
            <div class="ip-row"><span>Total Supply</span><b>${fmtNum(token.totalSupply)}</b></div>
            <div class="ip-row"><span>Holders</span><b>${token.holderCount}</b></div>
            <div class="ip-row"><span>Creator</span><b class="mono">${shortAddr(token.creator)}</b></div>
        </div>
        <div class="ip-section">
            <div class="ip-title">Distribution</div>
            <div class="ip-row"><span><span class="dot-whale">●</span> Whales (≥5%)</span><b>${distribution.whales}</b></div>
            <div class="ip-row"><span><span class="dot-shark">●</span> Sharks (1-5%)</span><b>${distribution.medium}</b></div>
            <div class="ip-row"><span><span class="dot-holder">●</span> Holders</span><b>${distribution.small}</b></div>
            <div class="ip-row"><span><span class="dot-dust">●</span> Dust</span><b>${distribution.dust}</b></div>
        </div>
        <div class="ip-section">
            <div class="ip-title">Concentration</div>
            <div class="ip-row"><span>Top 5 wallets</span><b>${top5}%</b></div>
            <div class="ip-row"><span>Top holder</span><b>${holders[0]?.pct?.toFixed(2) || 0}%</b></div>
        </div>
        <div class="ip-section">
            <div class="ip-title">Data Source</div>
            <div class="ip-row"><span>api.zigchain.com</span><span class="live-badge">LIVE</span></div>
            <div class="ip-row"><span>Updated</span><span>${new Date(fetchedAt).toLocaleTimeString()}</span></div>
        </div>`;
}

function renderAddressList(holders, token) {
    const list = document.getElementById('address-list');
    list.innerHTML = '';
    document.getElementById('apShareLabel').textContent = `Share of ${token.ticker}`;

    holders.forEach(h => {
        const share = h.pct < 0.01 ? '< 0.01%' : h.pct.toFixed(2) + '%';
        const color = holderColor(h);
        const row = document.createElement('div');
        row.className = 'ap-row';
        row.dataset.rank = h.rank;
        row.innerHTML = `
            <div class="ap-left">
                <span class="ap-rank">#${h.rank}</span>
                <span class="ap-dot" style="background:${color};box-shadow:0 0 6px ${color}80"></span>
                <div class="ap-addr-wrap">
                    <span class="ap-addr">${shortAddr(h.address)}</span>
                    <span class="ap-cat">${holderCategory(h)}</span>
                </div>
            </div>
            <div class="ap-right">
                <span class="ap-share ${h.pct >= 5 ? 'big' : h.pct >= 1 ? 'mid' : 'small'}">${share}</span>
                <span class="ap-bal">${fmtNum(h.balance)}</span>
            </div>`;
        row.addEventListener('click', () => highlightNode(h.rank));
        list.appendChild(row);
    });

    document.getElementById('apSearch').addEventListener('input', e => {
        const q = e.target.value.toLowerCase();
        list.querySelectorAll('.ap-row').forEach(r => {
            r.style.display = r.querySelector('.ap-addr').textContent.toLowerCase().includes(q) ? '' : 'none';
        });
    });
}

// ─── Network Map ──────────────────────────────────────────────────────────────
_nodeSelection = null;

function highlightNode(rank, triggerMagic = true) {
    if (!_nodeSelection) return;

    // Find the node data
    const targetNode = _nodeSelection.data().find(d => d.rank === rank);

    _nodeSelection.transition().duration(200)
        .attr('stroke-width', d => d.rank === rank ? 4 : (d.isToken ? 2.5 : (d.pct >= 5 ? 1.8 : 1.2)))
        .attr('stroke-opacity', d => d.rank === rank ? 1 : (d.isToken ? 0.70 : 0.50))
        .attr('r', d => d.rank === rank ? d._r + 5 : d._r);

    document.querySelectorAll('.ap-row').forEach(r => {
        r.classList.toggle('highlighted', parseInt(r.dataset.rank) === rank);
    });

    const row = document.querySelector(`.ap-row[data-rank="${rank}"]`);
    if (row) row.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Enable "Magic Nodes" highlighting via function ref if it exists
    if (triggerMagic && typeof updateMagicHighlights === 'function') {
        updateMagicHighlights(targetNode);
    }
}

function initNetworkMap(holders, token) {
    const container = document.getElementById('bubble-map');
    container.innerHTML = '';
    const W = container.clientWidth || 900;
    const H = container.clientHeight || 600;
    const maxPct = holders[0]?.pct || 1;

    // Build nodes: regular holders + 1 central token node
    const nodes = holders.map(h => ({
        ...h, id: h.address,
        _r: Math.max(6, Math.min(55, Math.sqrt(h.pct / maxPct) * 52 + 4))
    }));

    const centerId = 'TOKEN_CENTER';
    nodes.push({
        id: centerId,
        isToken: true,
        _r: 75,
        x: W / 2,
        y: H / 2
    });

    const links = [];
    const whales = nodes.filter(n => !n.isToken && n.pct >= 5);
    const sharks = nodes.filter(n => !n.isToken && n.pct >= 1 && n.pct < 5);
    const others = nodes.filter(n => !n.isToken && n.pct < 1);

    // Whales connect directly to Center Token
    whales.forEach(w => links.push({ source: w.id, target: centerId }));

    // Sharks connect to Center or a random Whale
    sharks.forEach(s => {
        if (whales.length > 0 && Math.random() > 0.4) {
            links.push({ source: s.id, target: whales[Math.floor(Math.random() * whales.length)].id });
        } else {
            links.push({ source: s.id, target: centerId });
        }
    });

    // Others connect to Sharks, Whales, or Center
    others.forEach(o => {
        if (sharks.length > 0 && Math.random() > 0.5) {
            links.push({ source: o.id, target: sharks[Math.floor(Math.random() * sharks.length)].id });
        } else if (whales.length > 0 && Math.random() > 0.6) {
            links.push({ source: o.id, target: whales[Math.floor(Math.random() * whales.length)].id });
        } else {
            links.push({ source: o.id, target: centerId });
        }
    });

    const svg = d3.select(container).append('svg').attr('width', '100%').attr('height', '100%').attr('viewBox', `0 0 ${W} ${H}`);
    const defs = svg.append('defs');

    // ── Shared glow filter ──
    const filt = defs.append('filter').attr('id', 'ng').attr('x', '-40%').attr('y', '-40%').attr('width', '180%').attr('height', '180%');
    filt.append('feGaussianBlur').attr('in', 'SourceGraphic').attr('stdDeviation', '3').attr('result', 'blur');
    const feMerge = filt.append('feMerge');
    feMerge.append('feMergeNode').attr('in', 'blur');
    feMerge.append('feMergeNode').attr('in', 'SourceGraphic');

    // ── Soap bubble gradients per category ──
    // iridescent rim: transparent dark center → colored edge
    const BUBBLE_RIMS = {
        'token': { inner: '#40d0f0', outer: '#6040c0' },
        '00c9b1': { inner: '#20e8d0', outer: '#4060e0' },
        '9b7fe8': { inner: '#a080ff', outer: '#4020c0' },
        '34d399': { inner: '#40e8a0', outer: '#2040a0' },
        '4a8fd4': { inner: '#60a8ff', outer: '#2050c0' },
        '3a5a8a': { inner: '#4080b0', outer: '#102040' },
    };

    function mkSoapGrads(key, rim) {
        const bg = defs.append('radialGradient').attr('id', `bub_${key}`)
            .attr('cx', '50%').attr('cy', '50%').attr('r', '50%');
        bg.append('stop').attr('offset', '0%').attr('stop-color', '#060e1e').attr('stop-opacity', '0.05');
        bg.append('stop').attr('offset', '65%').attr('stop-color', '#060e1e').attr('stop-opacity', '0.08');
        bg.append('stop').attr('offset', '83%').attr('stop-color', rim.inner).attr('stop-opacity', '0.28');
        bg.append('stop').attr('offset', '94%').attr('stop-color', rim.outer).attr('stop-opacity', '0.60');
        bg.append('stop').attr('offset', '100%').attr('stop-color', rim.outer).attr('stop-opacity', '0.80');

        // Main top-left crescent highlight (subtle)
        const h1 = defs.append('radialGradient').attr('id', `bub_h1_${key}`)
            .attr('cx', '37%').attr('cy', '26%').attr('r', '43%').attr('fx', '33%').attr('fy', '22%');
        h1.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(255,255,255,0.45)');
        h1.append('stop').attr('offset', '30%').attr('stop-color', 'rgba(255,255,255,0.20)');
        h1.append('stop').attr('offset', '65%').attr('stop-color', 'rgba(255,255,255,0.05)');
        h1.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(255,255,255,0)');

        // Small secondary glare (upper-right)
        const h2 = defs.append('radialGradient').attr('id', `bub_h2_${key}`)
            .attr('cx', '63%').attr('cy', '20%').attr('r', '13%');
        h2.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(255,255,255,0.25)');
        h2.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(255,255,255,0)');
    }
    Object.entries(BUBBLE_RIMS).forEach(([k, r]) => mkSoapGrads(k, r));

    // Bottom inner reflection
    const reflG = defs.append('radialGradient').attr('id', 'bub_refl').attr('cx', '50%').attr('cy', '82%').attr('r', '28%');
    reflG.append('stop').attr('offset', '0%').attr('stop-color', 'rgba(255,255,255,0.16)');
    reflG.append('stop').attr('offset', '100%').attr('stop-color', 'rgba(255,255,255,0)');


    const g = svg.append('g');
    const zoom = d3.zoom().scaleExtent([0.05, 12]).on('zoom', e => g.attr('transform', e.transform));
    svg.call(zoom);
    d3.select('#zoomIn').on('click', () => svg.transition().duration(300).call(zoom.scaleBy, 1.3));
    d3.select('#zoomOut').on('click', () => svg.transition().duration(300).call(zoom.scaleBy, 0.7));
    d3.select('#resetView').on('click', () => svg.transition().duration(500).call(zoom.transform, d3.zoomIdentity));

    // ── Links: crisp, high-visibility ──
    const link = g.append('g').selectAll('line').data(links).join('line')
        .attr('class', 'map-link')
        .attr('stroke', d => (d.target.id === centerId || d.source.id === centerId) ? 'rgba(140,230,255,0.45)' : 'rgba(110,190,255,0.22)')
        .attr('stroke-width', d => (d.target.id === centerId || d.source.id === centerId) ? 2.2 : 1.2)
        .style('pointer-events', 'none');

    _linkSelection = link;

    const nodeGroup = g.append('g').selectAll('g.node').data(nodes).join('g')
        .attr('class', 'node')
        .style('cursor', 'pointer')
        .style('will-change', 'transform')
        .call(d3.drag()
            .on('start', (e, d) => {
                if (!e.active) simulation.alphaTarget(0.3).restart();
                nodes.forEach(n => { if (n.id !== d.id && n.fx !== undefined) { n.fx = null; n.fy = null; } });
                d.fx = d.x; d.fy = d.y;
            })
            .on('drag', (e, d) => { d.fx = e.x; d.fy = e.y; })
            .on('end', (e, d) => {
                if (!e.active) simulation.alphaTarget(0);
                d.fx = null; d.fy = null;
            }));

    function bubKey(d) { return d.isToken ? 'token' : holderColor(d).replace('#', ''); }

    // Layer 1: Dark transparent body + iridescent rim
    const circles = nodeGroup.append('circle')
        .attr('r', d => d._r)
        .attr('fill', d => `url(#bub_${bubKey(d)})`)
        .attr('stroke', d => (BUBBLE_RIMS[bubKey(d)] || BUBBLE_RIMS['4a8fd4']).inner)
        .attr('stroke-width', d => d.isToken ? 2.5 : (d.pct >= 5 ? 1.8 : 1.2))
        .attr('stroke-opacity', d => d.isToken ? 0.70 : 0.50)
        .attr('filter', d => (d.isToken || d.pct >= 1) ? 'url(#ng)' : null);

    // Layer 2: Large top-left crescent highlight
    nodeGroup.append('circle')
        .attr('r', d => d._r * 0.82)
        .attr('fill', d => `url(#bub_h1_${bubKey(d)})`)
        .attr('cx', d => -d._r * 0.11)
        .attr('cy', d => -d._r * 0.14)
        .style('pointer-events', 'none');

    // Layer 3: Small secondary glare
    nodeGroup.append('circle')
        .attr('r', d => d._r * 0.82)
        .attr('fill', d => `url(#bub_h2_${bubKey(d)})`)
        .style('pointer-events', 'none');

    // Layer 4: Bottom inner reflection
    nodeGroup.append('circle')
        .attr('r', d => d._r)
        .attr('fill', 'url(#bub_refl)')
        .style('pointer-events', 'none');

    // Token label (Image or soft blue-white text fallback)
    const tokenNodes = nodeGroup.filter(d => d.isToken);
    if (token.imageUri) {
        // Use foreignObject to bypass SVG <image> ORB restrictions
        tokenNodes.append('foreignObject')
            .attr('x', d => -d._r * 0.85)
            .attr('y', d => -d._r * 0.85)
            .attr('width', d => d._r * 1.7)
            .attr('height', d => d._r * 1.7)
            .style('pointer-events', 'none')
            .append('xhtml:img')
            .attr('src', token.imageUri)
            .style('width', '100%')
            .style('height', '100%')
            .style('border-radius', '50%')
            .style('object-fit', 'cover')
            .style('opacity', '1')
            .attr('onerror', `this.src="${makeTokenLogo(token.ticker, 60)}"`);
    } else {
        tokenNodes.append('text')
            .text(token.ticker.charAt(0).toUpperCase())
            .attr('text-anchor', 'middle')
            .attr('dominant-baseline', 'central')
            .style('font-family', 'Outfit, sans-serif')
            .style('font-weight', '800')
            .style('font-size', '54px')
            .style('fill', 'rgba(160,220,255,0.55)')
            .style('pointer-events', 'none');
    }

    // Connect node clicks to Address List & Magic Highlights
    nodeGroup.on('click', (event, d) => {
        event.stopPropagation();
        if (d.isToken) {
            // Reset everything if clicking the center token
            updateMagicHighlights(null);
            return;
        }

        // 1. Sync Address List
        highlightNode(d.rank, false); // don't recursively call map highlight

        // 2. Trigger Magic Nodes
        updateMagicHighlights(d);
    });


    // Tooltips
    circles.on('mouseover', (event, d) => {
        if (d.isToken) return;
        const tt = document.getElementById('tooltip');
        tt.classList.remove('hidden');
        const share = d.pct < 0.01 ? '< 0.01%' : d.pct.toFixed(4) + '%';
        tt.innerHTML = `
                <div style="font-weight:800;color:${holderColor(d)};margin-bottom:8px">${shortAddr(d.address)}</div>
                <div style="display:grid;grid-template-columns:auto auto;gap:4px 16px;font-size:.82rem">
                    <span style="color:#7a7a9a">Rank</span><b>#${d.rank}</b>
                    <span style="color:#7a7a9a">Balance</span><b>${fmtNum(d.balance)} ${token.ticker}</b>
                    <span style="color:#7a7a9a">Share</span><b>${share}</b>
                    <span style="color:#7a7a9a">Type</span><b style="color:${holderColor(d)}">${holderCategory(d)}</b>
                </div>`;
        d3.select(event.currentTarget).transition().duration(120).attr('r', d._r + 5).attr('stroke-opacity', 1);
    })
        .on('mousemove', event => {
            const tt = document.getElementById('tooltip');
            tt.style.left = (event.offsetX + 18) + 'px';
            tt.style.top = (event.offsetY + 14) + 'px';
        })
        .on('mouseout', (event, d) => {
            if (d.isToken) return;
            document.getElementById('tooltip').classList.add('hidden');
            d3.select(event.currentTarget).transition().duration(120).attr('r', d._r).attr('stroke-opacity', 1);
        })
        .on('click', (event, d) => { if (!d.isToken) highlightNode(d.rank); });

    _nodeSelection = circles; // for highlightNode function to work

    // Add global click to reset magic
    svg.on('click', () => updateMagicHighlights(null));

    let _lastMagicTarget = null;

    // Assign to top-level forward ref
    updateMagicHighlights = function (target) {
        if (!target || _lastMagicTarget === target.id) {
            _lastMagicTarget = null;
            // Reset visuals to default
            link.transition().duration(300)
                .attr('stroke', d => (d.target.id === centerId || d.source.id === centerId) ? 'rgba(140,230,255,0.45)' : 'rgba(110,190,255,0.22)')
                .attr('stroke-width', d => (d.target.id === centerId || d.source.id === centerId) ? 2.2 : 1.2)
                .style('opacity', 1);

            nodeGroup.transition().duration(300).style('opacity', 1);
            circles.transition().duration(300)
                .attr('stroke-width', d => d.isToken ? 2.5 : (d.pct >= 5 ? 1.8 : 1.2))
                .attr('stroke-opacity', d => d.isToken ? 0.7 : 0.5);
            return;
        }

        _lastMagicTarget = target.id;
        const neighbors = new Set();
        neighbors.add(target.id);

        // Find neighbors and related links
        links.forEach(l => {
            if (l.source.id === target.id) neighbors.add(l.target.id);
            if (l.target.id === target.id) neighbors.add(l.source.id);
        });

        // Highlight Links
        link.transition().duration(250)
            .attr('stroke', l => {
                const connected = l.source.id === target.id || l.target.id === target.id;
                if (!connected) return 'rgba(100,200,255,0.05)';
                // Direct connections get "Magic" colors
                if (l.target.id === centerId || l.source.id === centerId) return '#00f7ff'; // Main hub
                return '#ff00d4'; // Peer to Peer or Shark
            })
            .attr('stroke-width', l => (l.source.id === target.id || l.target.id === target.id) ? 3.5 : 0.8)
            .style('opacity', l => (l.source.id === target.id || l.target.id === target.id) ? 1 : 0.1);

        // Highlight Nodes
        nodeGroup.transition().duration(250)
            .style('opacity', n => neighbors.has(n.id) ? 1 : 0.15);

        circles.transition().duration(250)
            .attr('stroke-width', n => n.id === target.id ? 5 : neighbors.has(n.id) ? 3 : 1)
            .attr('stroke', n => n.id === target.id ? '#00f7ff' : neighbors.has(n.id) ? '#ff00d4' : (BUBBLE_RIMS[bubKey(n)] || BUBBLE_RIMS['4a8fd4']).inner)
            .attr('stroke-opacity', n => neighbors.has(n.id) ? 1 : 0.3);
    }
    simulation = d3.forceSimulation(nodes)
        .alphaDecay(0.05) // Let it settle faster
        .alphaMin(0.001)  // Stop calculating when movement is negligible
        .force('link', d3.forceLink(links).id(d => d.id).distance(d => (d.source?.isToken || d.target?.isToken) ? 140 : 60))
        .force('charge', d3.forceManyBody().strength(d => d.isToken ? -1000 : (d.pct >= 5 ? -300 : -60)))
        .force('x', d3.forceX(W / 2).strength(d => d.isToken ? 0.08 : 0.015))
        .force('y', d3.forceY(H / 2).strength(d => d.isToken ? 0.08 : 0.015))
        .force('collide', d3.forceCollide().radius(d => d._r + 5).iterations(4))
        .on('tick', () => {
            link.attr('x1', d => d.source.x).attr('y1', d => d.source.y)
                .attr('x2', d => {
                    // Pull arrow back to edge of the target circle
                    const dx = d.target.x - d.source.x;
                    const dy = d.target.y - d.source.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist === 0) return d.target.x;
                    const r = d.target._r + 3; // +3 for gap
                    return d.target.x - (dx * r / dist);
                })
                .attr('y2', d => {
                    const dx = d.target.x - d.source.x;
                    const dy = d.target.y - d.source.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist === 0) return d.target.y;
                    const r = d.target._r + 3;
                    return d.target.y - (dy * r / dist);
                });
            // Optimization: avoid triggering continuous browser layout reflows
            nodeGroup.attr('transform', d => `translate(${d.x},${d.y})`);
        })
        .on('end', () => {
            // Let nodes sleep fully to rest CPU
            nodes.forEach(n => { n.fx = n.x; n.fy = n.y; });
        });
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
document.getElementById('backBtn').addEventListener('click', showHero);

document.getElementById('hero-search').addEventListener('keypress', e => {
    if (e.key === 'Enter') {
        const v = e.target.value.trim();
        if (v) loadAndShowToken(v);
    }
});

document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});

document.getElementById('refreshBtn')?.addEventListener('click', async () => {
    if (!currentData) return;
    showLoader('Refreshing…');
    const fresh = await ZIGData.loadToken(currentData.token.denom);
    if (!fresh.error) {
        currentData = fresh;
        renderAddressList(fresh.holders, fresh.token);
        renderInfoPanel(fresh);
        initNetworkMap(fresh.holders, fresh.token);
    }
    hideLoader();
});

// ─── Boot ──────────────────────────────────────────────────────────────────────
(async () => {
    await loadHomeScreen();
    startHomeAutoRefresh();
})();
