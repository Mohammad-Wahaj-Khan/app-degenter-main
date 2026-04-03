
'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

type Range = '1h' | '4h' | '24h';

interface Token {
  id: string; symbol: string; name: string; change: number; // computed from buy/sell
  icon?: string | null; price: number;
  x: number; y: number; vx: number; vy: number; dragging?: boolean;
  radius: number; vol1h: number; vol4h: number; vol24h: number;
}

const API_BASE = 'https://dex-api.cryptocomics.cc';


function pickLimit(w: number) { if (w < 520) return 10; if (w < 1100) return 20; return 35; }

const LOSS_COLOR = '#1a5942';
const RING_PAD = 6;

const clampNum = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clampPos = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** Responsive min/max bubble radii */
const radiusBounds = (stageW: number) => (
  stageW < 520 ? { min: 20, max: 50 } :
  stageW < 1100 ? { min: 24, max: 70 } :
  { min: 28, max: 90 }
);

/** Base radius from volume (log scaled) */
const baseRadiusFromVolume = (vol: number, stageW: number) => {
  const { min, max } = radiusBounds(stageW);
  const v = Math.log10(Math.max(1, vol));        // compress huge vols
  return clampNum(min + v * (max - min) * 0.18, min, max);
};

/** NEW: Boost/shrink radius by signed % change (pos => bigger, neg => smaller) */
const boostRadiusByChange = (r: number, changePct: number, stageW: number) => {
  // Interpret “major negative” to shrink more: map ±12% => ±45% size swing (cap).
  const normalized = clampNum(changePct / 12, -1, 1);  // -1..1
  const factor = clampNum(1 + normalized * 0.45, 0.60, 1.30); // 0.60x..1.30x
  const { min, max } = radiusBounds(stageW);
  return clampNum(r * factor, min, max);
};

/** Font sizes follow radius so text shrinks/grows with bubble */
function fontFor(r: number) {
  const title = clampNum(Math.round(r * 0.32), 11, 44);
  const pct   = clampNum(Math.round(r * 0.26), 10, 28);
  const gap   = clampNum(Math.round(r * 0.10),  6, 14);
  return { title, pct, gap };
}

/* ========= SOFT-BLENDED BLUE ↔ GLASS-BLACK (no visible seam) ========= */
const bubbleBodyGain = `
  /* A. smooth transition from green to black */
  linear-gradient(200deg,
    rgba(0, 92, 97, 0.9) 0%,
    rgba(0, 70, 74, 0.8) 10%,
    rgba(0, 50, 53, 0.7) 20%,
    rgba(0, 30, 32, 0.6) 30%,
    rgba(0, 15, 16, 0.5) 40%,
    rgba(0, 0, 0, 0.8) 60%,
    #000000 100%),

  /* B. green sphere with soft falloff */
  radial-gradient(145% 145% at 22% 18%,
    rgba(0, 79, 83) 0%,
    rgba(0, 67, 71) 30%,
    rgba(0, 52, 54) 50%,
    rgba(0, 38, 40) 60%,
    rgba(0, 0, 0, 0) 100%),

  /* C. soft outer green rim */
  radial-gradient(120% 120% at 18% 14%,
    rgba(143, 233, 255, 0.3) 0%,
    rgba(100, 200, 180, 0.2) 30%,
    rgba(50, 150, 130, 0.1) 50%,
    rgba(0, 0, 0, 0) 70%),

  /* D. subtle vignette */
  radial-gradient(120% 120% at 78% 84%,
    rgba(0, 0, 0, 0.5) 0%,
    rgba(0, 0, 0, 0.2) 50%,
    rgba(0, 0, 0, 0) 80%),

  /* E. refined specular highlights */
  conic-gradient(from 210deg at 72% 70%,
    rgba(255, 255, 255, 0.15),
    rgba(200, 255, 240, 0.1) 20%,
    rgba(150, 220, 210, 0.05) 35%,
    rgba(100, 180, 170, 0) 50%,
    rgba(0, 0, 0, 0) 50%,
    rgba(0, 0, 0, 0) 70%,
    rgba(150, 220, 210, 0.08) 80%,
    rgba(200, 255, 240, 0.12) 90%,
    rgba(255, 255, 255, 0.08) 100%)
`;

/* Loss bubble with matching style */
const bubbleBodyLoss = `
  /* A. smooth transition from dark teal to black */
  linear-gradient(200deg,
    #21644a 0%,
    #1a523f 10%,
    #144035 20%,
    #0e2e2a 30%,
    #0a1f1e 40%,
    rgba(0, 0, 0, 0.8) 60%,
    #000000 100%),

  /* B. dark teal sphere with soft falloff */
  radial-gradient(145% 145% at 22% 18%,
    #21644a 0%,
    #1a523f 30%,
    #144035 50%,
    #0e2e2a 60%,
    rgba(0,0,0,0) 100%),

  /* C. soft outer teal rim */
  radial-gradient(120% 120% at 18% 14%,
    rgba(100, 200, 180, 0.3) 0%,
    rgba(70, 160, 140, 0.2) 30%,
    rgba(40, 120, 100, 0.1) 50%,
    rgba(0, 0, 0, 0) 70%),

  /* D. subtle vignette */
  radial-gradient(120% 120% at 78% 84%,
    rgba(0, 0, 0, 0.5) 0%,
    rgba(0, 0, 0, 0.2) 50%,
    rgba(0, 0, 0, 0) 80%),

  /* E. refined specular highlights */
  conic-gradient(from 210deg at 72% 70%,
    rgba(255, 255, 255, 0.15),
    rgba(180, 220, 210, 0.1) 20%,
    rgba(150, 190, 180, 0.05) 35%,
    rgba(100, 160, 150, 0) 50%,
    rgba(0, 0, 0, 0) 50%,
    rgba(0, 0, 0, 0) 70%,
    rgba(150, 190, 180, 0.08) 80%,
    rgba(180, 220, 210, 0.12) 90%,
    rgba(255, 255, 255, 0.08) 100%)
`;

/* ================================================== */
export default function BubbleMap() {
  const [range] = useState<Range>('24h');
  const [loading, setLoading] = useState(true);
  const [tokens, setTokens] = useState<Token[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const tokensRef = useRef<Token[]>([]);
  const rafRef = useRef<number | null>(null);
  const bubbleRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const setBubbleRef = (id: string) => (el: HTMLDivElement | null) => { if (el) bubbleRefs.current[id] = el; else delete bubbleRefs.current[id]; };
  const [stage, setStage] = useState({ w: 0, h: 0 });

  useLayoutEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      setStage({ w: width, h: height });
      for (const t of tokensRef.current) {
        const eff = t.radius + RING_PAD;
        t.x = clampPos(t.x, eff, width - eff);
        t.y = clampPos(t.y, eff, height - eff);
        const el = bubbleRefs.current[t.id];
        if (el) {
          el.style.transform = `translate(${t.x - t.radius}px, ${t.y - t.radius}px)`;
          el.style.width = `${t.radius * 2}px`;
          el.style.height = `${t.radius * 2}px`;
        }
      }
      setTokens([...tokensRef.current]);
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  /* fetch & seed */
  useEffect(() => {
    (async () => {
      try {
        const wStage = containerRef.current?.clientWidth ?? 1000;
        const limit = pickLimit(wStage);

        const res = await fetch(`${API_BASE}/api/v1/pools?limit=${Math.max(200, limit * 3)}`, { headers: { Accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        const pools = (json?.pools || []) as any[];

        // rank by volume (kept)
        const sorted = pools
          .map(p => ({ p, v24: (p.vol24_buy_zig || 0) + (p.vol24_sell_zig || 0) }))
          .filter(x => x.p.primary_denom)
          .sort((a,b) => b.v24 - a.v24)
          .slice(0, limit)
          .map(x => x.p);

        const W = containerRef.current?.clientWidth ?? 1000;
        const H = containerRef.current?.clientHeight ?? 550;
        const cx = W/2, cy = H/2;

        const initial: Token[] = sorted.map((p: any, i: number) => {
          const symbol = p.meta_symbol || (p.primary_denom?.split('.').pop() ?? p.primary_denom);
          const name = p.meta_name || symbol;

          const buy1h = p.vol1h_buy_zig || 0;
          const sell1h = p.vol1h_sell_zig || 0;
          const buy4h = p.vol4h_buy_zig || 0;
          const sell4h = p.vol4h_sell_zig || 0;
          const buy24 = p.vol24_buy_zig || 0;
          const sell24 = p.vol24_sell_zig || 0;

          const vol1h = buy1h + sell1h;
          const vol4h = buy4h + sell4h;
          const vol24 = buy24 + sell24;

          // Net-buy percentage for 24h (positive => buys dominate; negative => sells)
          const change = vol24 > 0 ? ((buy24 - sell24) / vol24) * 100 : 0;

          // initial polar layout
          const angle = (i / Math.max(6, sorted.length)) * Math.PI * 2;
          const dist = Math.min(W, H) * 0.25 + (i % 8) * 14;
          let x = cx + Math.cos(angle) * dist;
          let y = cy + Math.sin(angle) * dist;

          // SIZE = base(volume) then boosted/shrunk by signed % change
          const rBase = baseRadiusFromVolume(vol24 || vol4h || vol1h, W);
          const r = boostRadiusByChange(rBase, change, W);

          const eff = r + RING_PAD;
          x = clampPos(x, eff, W - eff);
          y = clampPos(y, eff, H - eff);

          return {
            id: p.pair_contract, symbol, name, change, icon: p.image_uri, price: 0,
            x, y, vx: (Math.random() - 0.5) * 1.1, vy: (Math.random() - 0.5) * 1.1,
            radius: r, vol1h, vol4h, vol24h: vol24,
          };
        });

        separateAll(initial, W, H);
        tokensRef.current = initial;
        setTokens(initial);
        setStage({ w: W, h: H });
      } catch (e) {
        console.error('bubble fetch error', e);
      } finally { setLoading(false); }
    })();
  }, []);

  useEffect(() => { if (tokensRef.current.length) setLoading(false); }, [tokensRef.current.length]);

  /* physics loop (unchanged) */
  useEffect(() => {
    if (loading) return;
    const step = () => {
      const W = stage.w || containerRef.current?.clientWidth || 1000;
      const H = stage.h || containerRef.current?.clientHeight || 550;
      const arr = tokensRef.current;

      for (const t of arr) {
        if (!t.dragging) {
          t.vx += (Math.random() - 0.5) * 0.03;
          t.vy += (Math.random() - 0.5) * 0.03;
          t.vx = Math.max(-2.0, Math.min(2.0, t.vx * 0.997));
          t.vy = Math.max(-2.0, Math.min(2.0, t.vy * 0.997));
          t.x += t.vx; t.y += t.vy;
        }
        const eff = t.radius + RING_PAD;
        if (t.x - eff < 0) { t.x = eff; t.vx = Math.abs(t.vx); }
        else if (t.x + eff > W) { t.x = W - eff; t.vx = -Math.abs(t.vx); }
        if (t.y - eff < 0) { t.y = eff; t.vy = Math.abs(t.vy); }
        else if (t.y + eff > H) { t.y = H - eff; t.vy = -Math.abs(t.vy); }
      }

      for (let p = 0; p < 3; p++) separateAll(arr, W, H);

      for (const t of arr) {
        const el = bubbleRefs.current[t.id];
        if (!el) continue;
        el.style.transform = `translate(${t.x - t.radius}px, ${t.y - t.radius}px)`;
        el.style.width = `${t.radius * 2}px`;
        el.style.height = `${t.radius * 2}px`;
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [loading, stage.w, stage.h]);

  /* drag */
  const dragRef = useRef<{ id: string | null; pointerId: number | null; offX: number; offY: number; lastX: number; lastY: number }>(
    { id: null, pointerId: null, offX: 0, offY: 0, lastX: 0, lastY: 0 }
  );

  const onPointerDown = (e: React.PointerEvent, t: Token) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left; const py = e.clientY - rect.top;
    dragRef.current = { id: t.id, pointerId: e.pointerId, offX: px - t.x, offY: py - t.y, lastX: px, lastY: py };
    const it = tokensRef.current.find((x) => x.id === t.id);
    if (it) { it.dragging = true; it.vx = 0; it.vy = 0; }
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag.id || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const px = e.clientX - rect.left; const py = e.clientY - rect.top;
    const it = tokensRef.current.find((x) => x.id === drag.id); if (!it) return;

    const W = stage.w || rect.width; const H = stage.h || rect.height;
    const eff = it.radius + RING_PAD;
    it.x = clampPos(px - drag.offX, eff, W - eff);
    it.y = clampPos(py - drag.offY, eff, H - eff);
    it.vx = (px - drag.lastX) * 0.35; it.vy = (py - drag.lastY) * 0.35;

    separateAgainst(it, tokensRef.current, W, H);
    const el = bubbleRefs.current[it.id]; if (el) el.style.transform = `translate(${it.x - it.radius}px, ${it.y - it.radius}px)`;
    drag.lastX = px; drag.lastY = py;
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const drag = dragRef.current; if (!drag.id) return;
    const it = tokensRef.current.find((x) => x.id === drag.id); if (it) it.dragging = false;
    dragRef.current = { id: null, pointerId: null, offX: 0, offY: 0, lastX: 0, lastY: 0 };
    try { (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId); } catch {}
  };

  const onImgError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    (e.target as HTMLImageElement).src = "/zigicon.png";
  };

  return (
    <div className="rounded-2xl overflow-hidden bg-black/30">
      {/* Glassy black stage with vignette & top-left gleam */}
      <div
        ref={containerRef}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="bubble-stage relative w-full h-[550px] overflow-hidden rounded-2xl"
      >


        {loading ? (
          <div className="absolute inset-0 grid place-items-center text-neutral-300 text-sm">Loading…</div>
        ) : (
          tokens.map((t) => {
            const gain = t.change >= 0;
            const { title, pct, gap } = fontFor(t.radius);
            const diameter = t.radius * 2;
            const rimGlow = gain
              ? `0 0 ${Math.round(t.radius * 0.10)}px rgba(85,213,255,0.30),
                 inset 0 0 ${Math.round(t.radius * 0.12)}px rgba(143,233,255,0.18)`
              : `0 0 0 ${Math.max(2, Math.round(t.radius * 0.06))}px rgba(0,0,0,0.35)`;

            return (
              <div
                key={t.id}
                ref={setBubbleRef(t.id)}
                onPointerDown={(e) => onPointerDown(e, t)}
                className="absolute will-change-transform touch-none cursor-grab active:cursor-grabbing rounded-full select-none"
                style={{
                  width: `${diameter}px`,
                  height: `${diameter}px`,
                  transform: `translate(${t.x - t.radius}px, ${t.y - t.radius}px)`,
                  backgroundImage: gain ? bubbleBodyGain : bubbleBodyLoss,
                  backgroundColor: '#000',
                  boxShadow: rimGlow,
                }}
              >
                {t.icon && (
                  <img
                    src={t.icon}
                    onError={onImgError}
                    alt=""
                    style={{
                      position: 'absolute',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      top: Math.round(t.radius * 0.20),
                      width: Math.round(t.radius * 0.36),
                      height: Math.round(t.radius * 0.36),
                      borderRadius: '9999px',
                      boxShadow: '0 0 0 2px rgba(0,0,0,0.55)',
                      background: '#000',
                    }}
                  />
                )}
                <div
                  style={{
                    position: 'absolute', inset: 0, display: 'flex',
                    alignItems: 'center', justifyContent: 'center',
                    textAlign: 'center', color: '#fff', lineHeight: 1.05, padding: '0 3px',
                  }}
                >
                  <div style={{ maxWidth: '100%' }}>
                    <div style={{
                      fontSize: `${title}px`,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      textShadow: '0 1px 2px rgba(0,0,0,0.6)', letterSpacing: '0.3px',
                    }}>
                      {t.symbol.toUpperCase()}
                    </div>
                    <div style={{ height: `${gap}px` }} />
                    <div style={{
                      fontWeight: 700, fontSize: `${pct}px`,
                      color: gain ? '#19ff6a' : '#ff5b5b',
                      textShadow: '0 1px 2px rgba(0,0,0,0.65)', whiteSpace: 'nowrap',
                    }}>
                      {gain ? '+' : ''}{t.change.toFixed(2)}%
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ---------- collision helpers ---------- */
function separateAll(arr: Token[], w: number, h: number) {
  for (let pass = 0; pass < 4; pass++) {
    for (let i = 0; i < arr.length; i++) {
      for (let j = i + 1; j < arr.length; j++) resolvePair(arr[i], arr[j], w, h, RING_PAD);
    }
  }
}
function separateAgainst(target: Token, arr: Token[], w: number, h: number) {
  for (const o of arr) { if (o === target) continue; resolvePair(target, o, w, h, RING_PAD); }
}
function resolvePair(a: Token, b: Token, w: number, h: number, pad = 8) {
  const ra = a.radius + pad, rb = b.radius + pad;
  const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), min = ra + rb;
  if (d < min && d > 0.0001) {
    const nx = dx / d, ny = dy / d, overlap = (min - d) / 2;
    a.x -= nx * overlap; a.y -= ny * overlap; b.x += nx * overlap; b.y += ny * overlap;
    a.x = clampPos(a.x, a.radius + pad, w - (a.radius + pad));
    a.y = clampPos(a.y, a.radius + pad, h - (a.radius + pad));
    b.x = clampPos(b.x, b.radius + pad, w - (b.radius + pad));
    b.y = clampPos(b.y, b.radius + pad, h - (b.radius + pad));
  }
}
